use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tungstenite::connect;
use tungstenite::Message;
use url::Url;

use crate::sys::error::{Error, Result};

/// Represents a Chrome DevTools Protocol target (browser page/tab).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CdpTarget {
    pub id: String,
    #[serde(rename = "type")]
    pub target_type: String,
    pub url: String,
    pub title: String,
    #[serde(rename = "webSocketDebuggerUrl")]
    pub ws_debugger_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct CdpVersionInfo {
    #[serde(rename = "webSocketDebuggerUrl")]
    web_socket_debugger_url: Option<String>,
}

/// Atomic counter for generating unique CDP command IDs.
static CDP_COMMAND_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BrowserType {
    Chromium,
    Firefox,
    Webkit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserOptions {
    pub headless: bool,
    pub user_data_dir: Option<String>,
    pub args: Vec<String>,
    pub viewport: Option<Viewport>,
    pub timeout: Option<u64>,
    pub proxy: Option<String>,
}

impl Default for BrowserOptions {
    fn default() -> Self {
        Self {
            headless: false,
            user_data_dir: None,
            args: vec![],
            viewport: Some(Viewport::default()),
            timeout: Some(30000),
            proxy: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Viewport {
    pub width: u32,
    pub height: u32,
}

impl Default for Viewport {
    fn default() -> Self {
        Self {
            width: 1280,
            height: 720,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserHandle {
    pub id: String,
    pub browser_type: BrowserType,
    pub ws_endpoint: String,
}

#[derive(Debug, Clone)]
pub struct CdpEndpoint {
    port: u16,
}

impl CdpEndpoint {
    pub fn new(port: u16) -> Self {
        Self { port }
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn http_base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    pub fn direct_page_ws_url(&self, tab_id: &str) -> String {
        format!("ws://127.0.0.1:{}/devtools/page/{}", self.port, tab_id)
    }

    fn http_client(&self) -> Result<reqwest::Client> {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|e| Error::Other(format!("Failed to create CDP HTTP client: {}", e)))
    }

    pub async fn list_targets(&self) -> Result<Vec<CdpTarget>> {
        let targets_url = format!("{}/json", self.http_base_url());

        tracing::debug!("Fetching CDP targets from {}", targets_url);

        let targets: Vec<CdpTarget> = self
            .http_client()?
            .get(&targets_url)
            .send()
            .await
            .map_err(|e| {
                Error::Other(format!(
                    "Failed to connect to Chrome DevTools at {}. Is Chrome running with --remote-debugging-port={}? Error: {}",
                    targets_url, self.port, e
                ))
            })?
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse CDP targets response: {}", e)))?;

        tracing::debug!("Found {} CDP targets", targets.len());
        Ok(targets)
    }

    pub async fn browser_ws_endpoint(&self) -> Result<String> {
        let version_url = format!("{}/json/version", self.http_base_url());
        let version: CdpVersionInfo = self
            .http_client()?
            .get(&version_url)
            .send()
            .await
            .map_err(|e| {
                Error::Other(format!(
                    "Failed to connect to Chrome DevTools version endpoint at {}: {}",
                    version_url, e
                ))
            })?
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse CDP version response: {}", e)))?;

        version.web_socket_debugger_url.ok_or_else(|| {
            Error::Other(format!(
                "CDP version endpoint at {} did not return webSocketDebuggerUrl",
                version_url
            ))
        })
    }

    pub async fn wait_for_browser_ws_endpoint(&self, timeout: Duration) -> Result<String> {
        let deadline = tokio::time::Instant::now() + timeout;

        loop {
            match self.browser_ws_endpoint().await {
                Ok(endpoint) => return Ok(endpoint),
                Err(error) => {
                    if tokio::time::Instant::now() >= deadline {
                        return Err(error);
                    }
                }
            }

            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    }

    /// Wait until nothing answers the DevTools version endpoint any more.
    ///
    /// Closing a browser kills the process, but the port is not guaranteed to
    /// be free the instant `wait()` returns. Without this, a close immediately
    /// followed by a relaunch could see the *dying* instance still answering,
    /// hand back a handle bound to it, and leave the freshly spawned process
    /// orphaned — the "close, then relaunch" half of the browser-control
    /// lifecycle. Returns `false` if the endpoint is still answering when the
    /// deadline passes; the caller decides how loud that is.
    pub async fn wait_for_shutdown(&self, timeout: Duration) -> bool {
        let deadline = tokio::time::Instant::now() + timeout;

        loop {
            if self.browser_ws_endpoint().await.is_err() {
                return true;
            }

            if tokio::time::Instant::now() >= deadline {
                return false;
            }

            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }

    pub async fn create_target(&self, url: &str) -> Result<CdpTarget> {
        let create_url = format!(
            "{}/json/new?{}",
            self.http_base_url(),
            urlencoding::encode(url)
        );
        let client = self.http_client()?;

        let response = match client.put(&create_url).send().await {
            Ok(response) => response,
            Err(error) => {
                tracing::warn!(
                    "CDP target creation via PUT failed at {}: {}. Retrying with GET.",
                    create_url,
                    error
                );
                client
                    .get(&create_url)
                    .send()
                    .await
                    .map_err(|retry_error| {
                        Error::Other(format!(
                            "Failed to create browser target at {}: {}",
                            create_url, retry_error
                        ))
                    })?
            }
        };

        response
            .error_for_status()
            .map_err(|e| Error::Other(format!("CDP target creation failed: {}", e)))?
            .json()
            .await
            .map_err(|e| Error::Other(format!("Failed to parse CDP target response: {}", e)))
    }

    pub async fn close_target(&self, target_id: &str) -> Result<()> {
        let close_url = format!(
            "{}/json/close/{}",
            self.http_base_url(),
            urlencoding::encode(target_id)
        );

        self.http_client()?
            .get(&close_url)
            .send()
            .await
            .map_err(|e| Error::Other(format!("Failed to close browser target: {}", e)))?
            .error_for_status()
            .map_err(|e| Error::Other(format!("CDP target close failed: {}", e)))?;

        Ok(())
    }

    pub async fn resolve_page_ws_endpoint(&self, tab_id: &str) -> Result<String> {
        let fallback = self.direct_page_ws_url(tab_id);

        match self.list_targets().await {
            Ok(targets) => {
                if let Some(endpoint) = targets
                    .into_iter()
                    .find(|target| target.id == tab_id)
                    .and_then(|target| target.ws_debugger_url)
                {
                    return Ok(endpoint);
                }

                Ok(fallback)
            }
            Err(error) => {
                tracing::warn!(
                    "Failed to resolve CDP target metadata for tab {} on port {}: {}. Falling back to the direct websocket URL.",
                    tab_id,
                    self.port,
                    error
                );
                Ok(fallback)
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct PlaywrightConfig {
    pub node_path: String,
    pub playwright_path: String,
    pub ws_port: u16,
}

impl Default for PlaywrightConfig {
    fn default() -> Self {
        // BUG-10 fix: allow CDP port to be overridden via CDP_PORT env var
        let ws_port = std::env::var("CDP_PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(9222);
        Self {
            node_path: "node".to_string(),
            playwright_path: "npx playwright".to_string(),
            ws_port,
        }
    }
}

/// Operator override for the executable the browser-control runtime launches.
///
/// Set it to the absolute path of the browser *binary* (on macOS that is the
/// file inside `Contents/MacOS`, not the `.app` bundle directory). It is read
/// by [`executable_override`] and takes precedence over install-location
/// discovery for both Chromium and Firefox.
const BROWSER_EXECUTABLE_ENV: &str = "AGIWORKFORCE_BROWSER_EXECUTABLE";

/// How long a freshly spawned browser gets to open its DevTools port.
///
/// The wait is bounded and additionally short-circuits the moment the child
/// process exits, so a failed launch reports in well under this budget instead
/// of spinning.
const LAUNCH_CDP_TIMEOUT: Duration = Duration::from_secs(20);

/// How long a closed browser gets to stop answering on the DevTools port
/// before the next launch is allowed to probe it.
const CLOSE_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);

/// Read whatever the exited child wrote to stderr, capped so a chatty browser
/// cannot blow up the error message. Only called after the process has exited,
/// so the read cannot block on a live pipe.
fn drain_child_stderr(child: &mut Child) -> String {
    use std::io::Read;

    const MAX_BYTES: usize = 2000;

    let Some(mut stderr) = child.stderr.take() else {
        return "<not captured>".to_string();
    };

    let mut buffer = Vec::new();
    if stderr.read_to_end(&mut buffer).is_err() {
        return "<unreadable>".to_string();
    }

    if buffer.is_empty() {
        return "<empty>".to_string();
    }

    buffer.truncate(MAX_BYTES);
    String::from_utf8_lossy(&buffer).trim().to_string()
}

/// Profile directory used when the caller does not name one.
///
/// Chrome (and every Chromium fork) refuses to open a second instance against
/// a user-data directory that is already in use: the newly spawned process
/// forwards its command line to the running instance and exits immediately.
/// With no `--user-data-dir` that is the *default* profile, so on the very
/// common stock-macOS setup — the user's own Chrome already open — the
/// browser-control runtime spawned a process that died instantly and the
/// DevTools port never opened. Automation therefore gets its own profile
/// directory, which also keeps agent browsing out of the user's logged-in
/// session.
fn default_automation_profile_dir() -> Result<String> {
    let base = dirs::data_dir().ok_or_else(|| {
        Error::Other(
            "Failed to resolve the application data directory for the browser automation profile."
                .to_string(),
        )
    })?;

    Ok(base
        .join("agiworkforce")
        .join("browser-profiles")
        .join("automation")
        .to_string_lossy()
        .into_owned())
}

/// Read and validate [`BROWSER_EXECUTABLE_ENV`].
///
/// Returns `Ok(None)` when the variable is unset or empty (discovery then
/// runs normally). A variable that is set but unusable is a configuration
/// mistake, so it fails loudly with a message that says how to fix it rather
/// than silently falling back to a different browser than the operator asked
/// for.
fn executable_override() -> Result<Option<String>> {
    match std::env::var(BROWSER_EXECUTABLE_ENV) {
        Ok(value) => validate_executable_override(&value),
        // NotPresent, or non-UTF-8 which we cannot use as a path here anyway.
        Err(_) => Ok(None),
    }
}

/// The pure half of [`executable_override`], split out so the validation rules
/// can be tested without mutating this process's environment.
fn validate_executable_override(raw: &str) -> Result<Option<String>> {
    let configured = raw.trim();
    if configured.is_empty() {
        return Ok(None);
    }

    if configured.contains('\0') {
        return Err(Error::Other(format!(
            "{BROWSER_EXECUTABLE_ENV} contains a null byte and cannot be used as a path."
        )));
    }

    let path = std::path::Path::new(configured);
    if !path.is_absolute() {
        return Err(Error::Other(format!(
            "{BROWSER_EXECUTABLE_ENV} must be an absolute path to a browser executable, got \"{configured}\"."
        )));
    }

    let metadata = std::fs::metadata(path).map_err(|error| {
        Error::Other(format!(
            "{BROWSER_EXECUTABLE_ENV} points at \"{configured}\", which cannot be read: {error}"
        ))
    })?;

    if !metadata.is_file() {
        return Err(Error::Other(format!(
            "{BROWSER_EXECUTABLE_ENV} points at \"{configured}\", which is not a file. On macOS point it at the binary inside the bundle, e.g. \"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome\"."
        )));
    }

    Ok(Some(configured.to_string()))
}

/// Locate `name` on `PATH`, returning the absolute path of the first match.
///
/// On Windows the bare name and the `.exe` form are both tried so a caller can
/// pass either spelling.
fn find_on_path(name: &str) -> Option<String> {
    let search_path = std::env::var_os("PATH")?;

    for dir in std::env::split_paths(&search_path) {
        let direct = dir.join(name);
        if direct.is_file() {
            return Some(direct.to_string_lossy().into_owned());
        }

        if cfg!(windows) && !name.to_ascii_lowercase().ends_with(".exe") {
            let with_ext = dir.join(format!("{name}.exe"));
            if with_ext.is_file() {
                return Some(with_ext.to_string_lossy().into_owned());
            }
        }
    }

    None
}

/// Resolve a browser executable from known install locations, then `PATH`.
///
/// Discovery order is: absolute `install_paths` in the order given, then each
/// name in `path_names` looked up on `PATH`. When nothing is installed this
/// returns a typed error naming every location that was probed and the
/// override env var — the launcher used to hand a bare name to `spawn` and
/// surface the kernel's bare "No such file or directory" instead.
fn resolve_browser_executable(
    install_paths: &[String],
    path_names: &[&str],
    browser_label: &str,
) -> Result<String> {
    if let Some(found) = install_paths
        .iter()
        .find(|path| std::path::Path::new(path).is_file())
    {
        return Ok(found.clone());
    }

    for name in path_names {
        if let Some(found) = find_on_path(name) {
            return Ok(found);
        }
    }

    Err(Error::Other(format!(
        "No {browser_label} installation found. Looked for [{}] on disk and for [{}] on PATH. Install one of them, or set {BROWSER_EXECUTABLE_ENV} to the absolute path of the browser executable.",
        install_paths.join(", "),
        path_names.join(", "),
    )))
}

/// Locate a Chromium-based browser for the current platform.
///
/// The non-Windows arms used to return the bare literal `"chromium"`, which
/// does not exist on a stock macOS install (Chrome ships inside an `.app`
/// bundle), so every browser-control session failed on a normal Mac. Each
/// platform now probes its real install locations before falling back to a
/// `PATH` lookup, and reports a diagnostic instead of a bare spawn failure
/// when nothing is installed.
fn discover_chromium() -> Result<String> {
    #[cfg(windows)]
    {
        // Build the user-profile Chrome path by resolving LOCALAPPDATA at runtime;
        // %USERNAME% is not expanded by Path::exists(), so we use the env var instead.
        let user_installs = std::env::var("LOCALAPPDATA")
            .map(|local| {
                let root = std::path::PathBuf::from(local);
                vec![
                    root.join(r"Google\Chrome\Application\chrome.exe")
                        .to_string_lossy()
                        .into_owned(),
                    root.join(r"Microsoft\Edge\Application\msedge.exe")
                        .to_string_lossy()
                        .into_owned(),
                    root.join(r"BraveSoftware\Brave-Browser\Application\brave.exe")
                        .to_string_lossy()
                        .into_owned(),
                ]
            })
            .unwrap_or_default();

        let candidates: Vec<String> = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
        ]
        .iter()
        .map(|p| (*p).to_string())
        .chain(user_installs)
        .collect();

        resolve_browser_executable(
            &candidates,
            &["chrome", "msedge", "brave", "chromium"],
            "Chromium-based browser",
        )
    }

    #[cfg(target_os = "macos")]
    {
        let home_app = std::env::var("HOME")
            .map(|home| {
                format!("{home}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
            })
            .ok();

        let candidates: Vec<String> = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        ]
        .iter()
        .map(|p| (*p).to_string())
        .chain(home_app)
        .collect();

        resolve_browser_executable(
            &candidates,
            &["google-chrome", "chromium", "chrome"],
            "Chromium-based browser",
        )
    }

    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        let candidates: Vec<String> = [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/snap/bin/chromium",
            "/usr/bin/microsoft-edge",
            "/usr/local/bin/chromium",
        ]
        .iter()
        .map(|p| (*p).to_string())
        .collect();

        resolve_browser_executable(
            &candidates,
            &[
                "google-chrome",
                "google-chrome-stable",
                "chromium",
                "chromium-browser",
                "microsoft-edge",
            ],
            "Chromium-based browser",
        )
    }
}

/// Locate Firefox for the current platform.
///
/// Same defect class as [`discover_chromium`]: this arm used to return the
/// bare literal `"firefox"`, which is not on `PATH` on a stock macOS or
/// Windows install.
fn discover_firefox() -> Result<String> {
    #[cfg(windows)]
    let candidates: Vec<String> = [
        r"C:\Program Files\Mozilla Firefox\firefox.exe",
        r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe",
    ]
    .iter()
    .map(|p| (*p).to_string())
    .collect();

    #[cfg(target_os = "macos")]
    let candidates: Vec<String> = ["/Applications/Firefox.app/Contents/MacOS/firefox"]
        .iter()
        .map(|p| (*p).to_string())
        .chain(
            std::env::var("HOME")
                .map(|home| format!("{home}/Applications/Firefox.app/Contents/MacOS/firefox"))
                .ok(),
        )
        .collect();

    #[cfg(all(not(windows), not(target_os = "macos")))]
    let candidates: Vec<String> = [
        "/usr/bin/firefox",
        "/usr/bin/firefox-esr",
        "/snap/bin/firefox",
        "/usr/local/bin/firefox",
    ]
    .iter()
    .map(|p| (*p).to_string())
    .collect();

    resolve_browser_executable(&candidates, &["firefox", "firefox-esr"], "Firefox")
}

pub struct PlaywrightBridge {
    config: PlaywrightConfig,
    process: Arc<Mutex<Option<Child>>>,
    browsers: Arc<Mutex<HashMap<String, BrowserHandle>>>,
    /// `Some(child)` for a browser this process started, `None` for one that
    /// was already running on the DevTools port and got adopted on reconnect.
    /// The distinction decides how the browser is closed: a child we own is
    /// killed, an adopted one is asked to close over CDP.
    browser_processes: Arc<Mutex<HashMap<String, Option<Child>>>>,
}

impl PlaywrightBridge {
    pub async fn new() -> Result<Self> {
        Ok(Self {
            config: PlaywrightConfig::default(),
            process: Arc::new(Mutex::new(None)),
            browsers: Arc::new(Mutex::new(HashMap::new())),
            browser_processes: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub async fn with_config(config: PlaywrightConfig) -> Result<Self> {
        Ok(Self {
            config,
            process: Arc::new(Mutex::new(None)),

            browsers: Arc::new(Mutex::new(HashMap::new())),
            browser_processes: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub fn endpoint(&self) -> CdpEndpoint {
        CdpEndpoint::new(self.config.ws_port)
    }

    pub fn cdp_port(&self) -> u16 {
        self.config.ws_port
    }

    pub async fn start_server(&self) -> Result<()> {
        if self.endpoint().browser_ws_endpoint().await.is_ok() {
            tracing::info!(
                "CDP endpoint already available on port {}; reusing running browser automation process",
                self.config.ws_port
            );
            return Ok(());
        }

        Err(Error::Other(
            "Embedded Playwright server startup is not implemented in the desktop runtime. Use launch_browser() to start a browser process with CDP enabled.".to_string(),
        ))
    }

    pub async fn stop_server(&self) -> Result<()> {
        let mut process_guard = self.process.lock().await;

        if let Some(mut child) = process_guard.take() {
            tracing::info!("Stopping Playwright server");
            child
                .kill()
                .map_err(|e| Error::Other(format!("Failed to kill Playwright process: {}", e)))?;
            child
                .wait()
                .map_err(|e| Error::Other(format!("Failed to wait for process: {}", e)))?;
            tracing::info!("Playwright server stopped");
        }

        Ok(())
    }

    /// Spawn `exe` and wait for it to open the configured DevTools port.
    ///
    /// Two failure modes are distinguished, because they need different fixes
    /// and the old code reported neither:
    ///
    /// * the process exits before DevTools opens — the usual cause on a stock
    ///   machine (an already-running instance took over the command line, a
    ///   quarantined or unsigned binary, a bad `--user-data-dir`). The wait
    ///   short-circuits the moment `try_wait` reports an exit and the child's
    ///   own stderr is included, instead of burning the whole timeout and
    ///   throwing the output away.
    /// * the process is alive but never opens the port — reported after a
    ///   bounded wait, with the child cleaned up so nothing is left running.
    ///
    /// Neither path can spin: every loop iteration re-checks the deadline.
    async fn spawn_and_await_cdp(
        &self,
        exe: &str,
        args: &[String],
        timeout: Duration,
    ) -> Result<(Child, String)> {
        let port = self.config.ws_port;

        let mut child = Command::new(exe)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| {
                Error::Other(format!(
                    "Failed to start the browser executable \"{exe}\": {error}. Set {BROWSER_EXECUTABLE_ENV} to the absolute path of a browser binary to override discovery."
                ))
            })?;

        let endpoint = self.endpoint();
        let deadline = tokio::time::Instant::now() + timeout;

        loop {
            match endpoint.browser_ws_endpoint().await {
                Ok(ws_endpoint) => return Ok((child, ws_endpoint)),
                Err(probe_error) => {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            let stderr = drain_child_stderr(&mut child);
                            let _ = child.wait();
                            return Err(Error::Other(format!(
                                "The browser executable \"{exe}\" exited ({status}) before Chrome DevTools opened on port {port}. \
                                 This usually means another instance of the same browser was already running and took over the \
                                 launch, or the profile directory could not be used. Browser output: {stderr}"
                            )));
                        }
                        Ok(None) => {}
                        Err(error) => {
                            tracing::warn!(
                                "Could not check the browser process state while waiting for CDP on port {}: {}",
                                port,
                                error
                            );
                        }
                    }

                    if tokio::time::Instant::now() >= deadline {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(Error::Other(format!(
                            "The browser executable \"{exe}\" started but Chrome DevTools never became reachable on port {port} within {}s: {probe_error}",
                            timeout.as_secs()
                        )));
                    }
                }
            }

            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    }

    pub async fn launch_browser(
        &self,
        browser_type: BrowserType,
        options: BrowserOptions,
    ) -> Result<BrowserHandle> {
        tracing::info!("Launching {:?} browser", browser_type);

        let browser_id = uuid::Uuid::new_v4().to_string();

        // Reconnect before relaunch. A browser started by an earlier app run is
        // still listening on the DevTools port, and spawning a second instance
        // against the same profile only makes the new process hand off its
        // command line and exit. Adopting the running one is what "reconnect"
        // means for this runtime.
        let (child, ws_endpoint) = match self.endpoint().browser_ws_endpoint().await {
            Ok(existing) => {
                tracing::info!(
                    "Chrome DevTools already reachable on port {}; adopting the running browser instead of spawning another",
                    self.config.ws_port
                );
                (None, existing)
            }
            Err(_) => {
                let (exe, args) = self.build_browser_command(&browser_type, &options)?;
                let (child, ws_endpoint) = self
                    .spawn_and_await_cdp(&exe, &args, LAUNCH_CDP_TIMEOUT)
                    .await?;
                (Some(child), ws_endpoint)
            }
        };

        let handle = BrowserHandle {
            id: browser_id.clone(),
            browser_type: browser_type.clone(),
            ws_endpoint: ws_endpoint.clone(),
        };

        // Acquire both locks in consistent order: browsers -> processes
        // This matches close_browser_by_id to prevent deadlocks
        let mut browsers = self.browsers.lock().await;
        let mut processes = self.browser_processes.lock().await;
        browsers.insert(browser_id.clone(), handle.clone());
        processes.insert(browser_id.clone(), child);

        tracing::info!("Browser launched with ID: {}", browser_id);
        Ok(handle)
    }

    pub async fn close_browser(&self, handle: BrowserHandle) -> Result<()> {
        self.close_browser_by_id(&handle.id).await
    }

    pub async fn close_browser_by_id(&self, id: &str) -> Result<()> {
        tracing::info!("Closing browser: {}", id);

        let mut stopped = false;
        let mut adopted_ws_endpoint = None;

        {
            // Acquire both locks in consistent order: browsers -> processes
            let mut browsers = self.browsers.lock().await;
            let mut processes = self.browser_processes.lock().await;

            if let Some(handle) = browsers.remove(id) {
                match processes.remove(id) {
                    Some(Some(mut child)) => {
                        tracing::info!("Killing browser process for {}", id);
                        let _ = child.kill();
                        let _ = child.wait();
                        stopped = true;
                    }
                    // Adopted on reconnect: there is no child to kill, so ask
                    // the browser itself to close over CDP.
                    Some(None) => {
                        adopted_ws_endpoint = Some(handle.ws_endpoint.clone());
                    }
                    None => {
                        tracing::warn!("Browser process not found for {}", id);
                    }
                }
            } else {
                // It might be already closed or doesn't exist
                tracing::warn!("Browser {} not found to close", id);
            }
        }

        if let Some(ws_endpoint) = adopted_ws_endpoint {
            stopped = true;
            // `Browser.close` tears the socket down as it runs, so a transport
            // error here is expected and is not proof the browser survived —
            // the shutdown probe below is what decides that.
            if let Err(error) = self
                .send_cdp_command(&ws_endpoint, "Browser.close", serde_json::json!({}))
                .await
            {
                tracing::debug!(
                    "CDP Browser.close on port {} returned an error (usually the socket closing): {}",
                    self.config.ws_port,
                    error
                );
            }
        }

        // Do not report the browser closed while its DevTools port is still
        // answering: the next launch would attach to the dying instance and
        // strand the process it just spawned.
        if stopped && !self.endpoint().wait_for_shutdown(CLOSE_SHUTDOWN_TIMEOUT).await {
            tracing::warn!(
                "Browser {} was killed but Chrome DevTools is still answering on port {}. A relaunch may attach to the previous instance.",
                id,
                self.config.ws_port
            );
        }

        Ok(())
    }

    pub async fn list_browsers(&self) -> Result<Vec<BrowserHandle>> {
        let browsers = self.browsers.lock().await;
        Ok(browsers.values().cloned().collect())
    }

    fn build_browser_args(&self, options: &BrowserOptions) -> Result<Vec<String>> {
        let mut args = vec![
            format!("--remote-debugging-port={}", self.config.ws_port),
            "--no-first-run".to_string(),
            "--no-default-browser-check".to_string(),
        ];

        if options.headless {
            args.push("--headless=new".to_string());
        }

        // Always pass a profile directory. See `default_automation_profile_dir`:
        // without one the spawned process hands off to an already-running
        // Chrome and exits before the DevTools port is ever opened.
        let user_data_dir = match options.user_data_dir.clone() {
            Some(dir) => dir,
            None => default_automation_profile_dir()?,
        };
        args.push(format!("--user-data-dir={}", user_data_dir));

        if let Some(ref proxy) = options.proxy {
            args.push(format!("--proxy-server={}", proxy));
        }

        // Sanitize user-provided browser args: only allow known-safe flags to prevent
        // arbitrary command injection via malicious args (e.g., --remote-debugging-pipe,
        // --disable-web-security, --load-extension, etc.)
        let allowed_prefixes: &[&str] = &[
            "--window-size=",
            "--window-position=",
            "--disable-extensions",
            "--disable-gpu",
            "--disable-software-rasterizer",
            "--disable-dev-shm-usage",
            "--disable-background-networking",
            "--disable-default-apps",
            "--disable-sync",
            "--disable-translate",
            "--disable-popup-blocking",
            // SECURITY: "--no-sandbox" intentionally removed from the allowlist — it lets a
            // caller disable the Chrome renderer sandbox (audit: systemic-tauri-ipc-shell-injection).
            // The desktop app runs as the user (not root), so the sandbox works without it.
            "--mute-audio",
            "--incognito",
            "--start-maximized",
            "--start-fullscreen",
            "--lang=",
            "--force-device-scale-factor=",
            "--auto-open-devtools-for-tabs",
        ];

        for arg in &options.args {
            let is_allowed = allowed_prefixes
                .iter()
                .any(|prefix| arg.starts_with(prefix));
            if is_allowed {
                args.push(arg.clone());
            } else {
                tracing::warn!(
                    "Rejected disallowed browser argument: '{}'. Only whitelisted flags are permitted.",
                    arg
                );
            }
        }

        Ok(args)
    }

    fn build_browser_command(
        &self,
        browser_type: &BrowserType,
        options: &BrowserOptions,
    ) -> Result<(String, Vec<String>)> {
        let args = self.build_browser_args(options)?;

        let exe = match browser_type {
            BrowserType::Chromium => match executable_override()? {
                Some(configured) => {
                    tracing::info!(
                        "Using browser executable from {}: {}",
                        BROWSER_EXECUTABLE_ENV,
                        configured
                    );
                    configured
                }
                None => discover_chromium()?,
            },
            BrowserType::Firefox => match executable_override()? {
                Some(configured) => {
                    tracing::info!(
                        "Using browser executable from {}: {}",
                        BROWSER_EXECUTABLE_ENV,
                        configured
                    );
                    configured
                }
                None => discover_firefox()?,
            },
            BrowserType::Webkit => {
                return Err(Error::Other(
                    "WebKit browser not yet supported on this platform".to_string(),
                ))
            }
        };

        Ok((exe, args))
    }

    pub async fn connect_to_browser(&self, ws_endpoint: &str) -> Result<()> {
        let url = Url::parse(ws_endpoint)
            .map_err(|e| Error::Other(format!("Invalid WebSocket URL: {}", e)))?;

        tracing::info!("Connecting to browser at {}", ws_endpoint);

        match connect(url) {
            Ok(_) => {
                tracing::info!("Successfully connected to browser");
                Ok(())
            }
            Err(e) => {
                tracing::error!("Failed to connect to browser: {}", e);
                Err(Error::Other(format!(
                    "Failed to connect to browser at {}: {}",
                    ws_endpoint, e
                )))
            }
        }
    }

    // ---------------------------------------------------------------
    // Chrome DevTools Protocol (CDP) commands
    // ---------------------------------------------------------------

    /// Fetch the list of available CDP targets (pages/tabs) from the running Chrome instance.
    ///
    /// Sends an HTTP GET to `http://127.0.0.1:<port>/json` and deserializes the
    /// response into a vector of `CdpTarget`.
    // Used by: CDP browser automation API — navigate/click/type/screenshot/evaluate
    #[allow(dead_code)]
    pub async fn list_targets(&self) -> Result<Vec<CdpTarget>> {
        self.endpoint().list_targets().await
    }

    /// Open a WebSocket to the given CDP target URL, send a single JSON-RPC
    /// command, and return the response.
    ///
    /// The connection is opened, one message is sent, responses are read until
    /// the one with the matching `id` is found, and then the socket is closed.
    /// Because `tungstenite` is synchronous, this is wrapped in
    /// `tokio::task::spawn_blocking`. A 30-second timeout prevents hanging if
    /// Chrome stops responding.
    // Used by: CDP browser automation API — internal transport for all CDP methods
    #[allow(dead_code)]
    async fn send_cdp_command(
        &self,
        ws_url: &str,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value> {
        let cmd_id = CDP_COMMAND_ID.fetch_add(1, Ordering::Relaxed);

        let payload = serde_json::json!({
            "id": cmd_id,
            "method": method,
            "params": params,
        });

        let ws_url_owned = ws_url.to_string();
        let method_owned = method.to_string();
        let method_for_timeout = method.to_string();
        let payload_str = serde_json::to_string(&payload)
            .map_err(|e| Error::Other(format!("Failed to serialize CDP command: {}", e)))?;

        tracing::debug!(
            "Sending CDP command id={} method={} to {}",
            cmd_id,
            method,
            ws_url
        );

        let result = tokio::time::timeout(
            Duration::from_secs(30),
            tokio::task::spawn_blocking(
                move || -> std::result::Result<serde_json::Value, String> {
                    let url = Url::parse(&ws_url_owned)
                        .map_err(|e| format!("Invalid WebSocket URL '{}': {}", ws_url_owned, e))?;

                    let (mut socket, _response) = connect(url).map_err(|e| {
                        format!("Failed to connect WebSocket to '{}': {}", ws_url_owned, e)
                    })?;

                    // Set a read timeout so that socket.read() does not block
                    // indefinitely if Chrome becomes unresponsive. Without this,
                    // the tokio::time::timeout above would fire but the blocking
                    // task would continue, leaking a thread.
                    {
                        let read_timeout = Some(Duration::from_secs(10));
                        match socket.get_mut() {
                            tungstenite::stream::MaybeTlsStream::Plain(tcp) => {
                                let _ = tcp.set_read_timeout(read_timeout);
                            }
                            _ => {
                                // TLS or other stream variants -- best-effort, skip.
                            }
                        }
                    }

                    socket.send(Message::Text(payload_str)).map_err(|e| {
                        format!("Failed to send CDP command '{}': {}", method_owned, e)
                    })?;

                    // Read messages until we find the response with our command id.
                    loop {
                        let msg = socket.read().map_err(|e| {
                            format!("Failed to read CDP response for '{}': {}", method_owned, e)
                        })?;

                        match msg {
                            Message::Text(text) => {
                                let parsed: serde_json::Value = serde_json::from_str(&text)
                                    .map_err(|e| {
                                        format!("Failed to parse CDP response JSON: {}", e)
                                    })?;

                                // Check if this response matches our command id.
                                if let Some(resp_id) = parsed.get("id").and_then(|v| v.as_u64()) {
                                    if resp_id == cmd_id {
                                        // Check for CDP-level errors.
                                        if let Some(error_obj) = parsed.get("error") {
                                            let error_msg = error_obj
                                                .get("message")
                                                .and_then(|m| m.as_str())
                                                .unwrap_or("Unknown CDP error");
                                            let _ = socket.close(None);
                                            return Err(format!(
                                                "CDP error for '{}': {}",
                                                method_owned, error_msg
                                            ));
                                        }

                                        let _ = socket.close(None);
                                        return Ok(parsed);
                                    }
                                }
                                // Not our response (could be an event); keep reading.
                            }
                            Message::Close(_) => {
                                return Err(format!(
                                    "WebSocket closed before receiving response for '{}'",
                                    method_owned
                                ));
                            }
                            // Binary, Ping, Pong, Frame — skip them.
                            _ => {}
                        }
                    }
                },
            ),
        )
        .await
        .map_err(|_| {
            Error::Other(format!(
                "CDP command '{}' timed out after 30s",
                method_for_timeout
            ))
        })?
        .map_err(|e| Error::Other(format!("CDP command task panicked: {}", e)))?
        .map_err(Error::Other)?;

        Ok(result)
    }

    /// Helper: find the first `"page"` target with a valid `webSocketDebuggerUrl`.
    // Used by: CDP browser automation API — page targeting for navigate/click/type/etc.
    #[allow(dead_code)]
    async fn first_page_ws_url(&self) -> Result<String> {
        let targets = self.list_targets().await?;
        for target in &targets {
            if target.target_type == "page" {
                if let Some(ref ws_url) = target.ws_debugger_url {
                    return Ok(ws_url.clone());
                }
            }
        }
        Err(Error::Other(
            "No browser pages available. Launch a browser first.".to_string(),
        ))
    }

    /// Navigate the first available browser page to the given URL.
    ///
    /// Uses the CDP `Page.navigate` method.
    // Used by: CDP browser automation API
    #[allow(dead_code)]
    pub async fn navigate(&self, url: &str) -> Result<()> {
        // Same policy as `CdpClient::navigate`: `core::agent::executor` drives
        // this bridge directly and only validated the scheme, so the
        // always-blocked financial-host list has to be checked here too.
        crate::automation::computer_use::ensure_navigation_url_allowed(url)
            .map_err(Error::Other)?;

        let ws_url = self.first_page_ws_url().await?;
        let params = serde_json::json!({ "url": url });

        tracing::info!("CDP navigate to '{}'", url);
        let response = self
            .send_cdp_command(&ws_url, "Page.navigate", params)
            .await?;

        // Check if navigation returned an error message in the result.
        if let Some(result) = response.get("result") {
            if let Some(error_text) = result.get("errorText").and_then(|v| v.as_str()) {
                if !error_text.is_empty() {
                    return Err(Error::Other(format!(
                        "Navigation to '{}' failed: {}",
                        url, error_text
                    )));
                }
            }
        }

        Ok(())
    }

    /// Click on the element matching the given CSS selector on the first available page.
    ///
    /// Uses `Runtime.evaluate` to execute `document.querySelector(selector).click()`.
    // Used by: CDP browser automation API
    #[allow(dead_code)]
    pub async fn click_selector(&self, selector: &str) -> Result<()> {
        let js = format!(
            r#"(function() {{
                var el = document.querySelector('{}');
                if (!el) throw new Error('Element not found: {}');
                el.click();
                return true;
            }})()"#,
            escape_js_string(selector),
            escape_js_string(selector),
        );

        tracing::info!("CDP click_selector '{}'", selector);
        let ws_url = self.first_page_ws_url().await?;
        let params = serde_json::json!({
            "expression": js,
            "returnByValue": true,
        });
        let response = self
            .send_cdp_command(&ws_url, "Runtime.evaluate", params)
            .await?;

        check_runtime_exception(&response, "click_selector")?;
        Ok(())
    }

    /// Type text into the element matching the given CSS selector on the first available page.
    ///
    /// Focuses the element, sets its value, and dispatches `input` and `change` events.
    // Used by: CDP browser automation API
    #[allow(dead_code)]
    pub async fn type_text(&self, selector: &str, text: &str) -> Result<()> {
        let js = format!(
            r#"(function() {{
                var el = document.querySelector('{}');
                if (!el) throw new Error('Element not found: {}');
                el.focus();
                el.value = '{}';
                el.dispatchEvent(new Event('input', {{bubbles: true}}));
                el.dispatchEvent(new Event('change', {{bubbles: true}}));
                return true;
            }})()"#,
            escape_js_string(selector),
            escape_js_string(selector),
            escape_js_string(text),
        );

        tracing::info!("CDP type_text into '{}'", selector);
        let ws_url = self.first_page_ws_url().await?;
        let params = serde_json::json!({
            "expression": js,
            "returnByValue": true,
        });
        let response = self
            .send_cdp_command(&ws_url, "Runtime.evaluate", params)
            .await?;

        check_runtime_exception(&response, "type_text")?;
        Ok(())
    }

    /// Take a screenshot of the first available page and return it as a base64-encoded PNG string.
    ///
    /// Uses the CDP `Page.captureScreenshot` method.
    // Used by: CDP browser automation API
    #[allow(dead_code)]
    pub async fn screenshot_base64(&self) -> Result<String> {
        let ws_url = self.first_page_ws_url().await?;
        let params = serde_json::json!({ "format": "png" });

        tracing::info!("CDP screenshot_base64");
        let response = self
            .send_cdp_command(&ws_url, "Page.captureScreenshot", params)
            .await?;

        let data = response
            .get("result")
            .and_then(|r| r.get("data"))
            .and_then(|d| d.as_str())
            .ok_or_else(|| {
                Error::Other(
                    "Page.captureScreenshot did not return expected 'result.data' field"
                        .to_string(),
                )
            })?;

        Ok(data.to_string())
    }

    /// Execute a JavaScript expression in the first available page and return the result.
    ///
    /// Uses the CDP `Runtime.evaluate` method with `returnByValue: true`.
    // Used by: CDP browser automation API
    #[allow(dead_code)]
    pub async fn evaluate_js(&self, expression: &str) -> Result<serde_json::Value> {
        let ws_url = self.first_page_ws_url().await?;
        let params = serde_json::json!({
            "expression": expression,
            "returnByValue": true,
        });

        tracing::info!("CDP evaluate_js");
        let response = self
            .send_cdp_command(&ws_url, "Runtime.evaluate", params)
            .await?;

        check_runtime_exception(&response, "evaluate_js")?;

        // Extract the actual result value from the CDP response envelope.
        let result_value = response
            .get("result")
            .and_then(|r| r.get("result"))
            .and_then(|r| r.get("value"))
            .cloned()
            .unwrap_or(serde_json::Value::Null);

        Ok(result_value)
    }
}

/// Escape special characters in a string intended for insertion into a
/// JavaScript single-quoted string literal.
// Used by: CDP browser automation API — click_selector and type_text
#[allow(dead_code)]
fn escape_js_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
        .replace('\0', "\\0")
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029")
}

/// Check the CDP `Runtime.evaluate` response for an exception description and
/// return an error if one is present.
// Used by: CDP browser automation API — click_selector, type_text, evaluate_js
#[allow(dead_code)]
fn check_runtime_exception(response: &serde_json::Value, context: &str) -> Result<()> {
    if let Some(result) = response.get("result") {
        if let Some(exception) = result.get("exceptionDetails") {
            let desc = exception
                .get("exception")
                .and_then(|ex| ex.get("description"))
                .and_then(|d| d.as_str())
                .or_else(|| exception.get("text").and_then(|t| t.as_str()))
                .unwrap_or("Unknown JavaScript exception");
            return Err(Error::Other(format!(
                "JavaScript exception in {}: {}",
                context, desc
            )));
        }
    }
    Ok(())
}

impl Drop for PlaywrightBridge {
    fn drop(&mut self) {
        tracing::info!("Playwright bridge dropped, cleaning up");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_playwright_bridge_creation() {
        let bridge = PlaywrightBridge::new().await;
        assert!(bridge.is_ok());
    }

    #[tokio::test]
    async fn test_browser_options_default() {
        let options = BrowserOptions::default();
        assert!(!options.headless);
        assert!(options.viewport.is_some());
    }

    #[tokio::test]
    async fn test_browser_command_building() {
        let bridge = PlaywrightBridge::new().await.unwrap();
        let options = BrowserOptions::default();
        match bridge.build_browser_command(&BrowserType::Chromium, &options) {
            // Discovery must hand back a real executable, never a bare name.
            Ok((exe, _args)) => assert!(
                std::path::Path::new(&exe).is_file(),
                "resolved browser executable does not exist: {exe}"
            ),
            // No browser installed on this host: the failure has to explain itself.
            Err(error) => {
                let message = error.to_string();
                assert!(
                    message.contains(BROWSER_EXECUTABLE_ENV),
                    "diagnostic does not mention the override env var: {message}"
                );
            }
        }
    }

    #[test]
    fn resolve_browser_executable_prefers_an_install_path_then_path_lookup() {
        // `sh` exists at a fixed location on unix and on PATH everywhere the
        // desktop app builds, so it stands in for a browser binary here.
        let install = if cfg!(windows) {
            r"C:\Windows\System32\cmd.exe".to_string()
        } else {
            "/bin/sh".to_string()
        };
        let path_name = if cfg!(windows) { "cmd" } else { "sh" };
        let missing = "/definitely/not/installed/chrome".to_string();

        assert_eq!(
            resolve_browser_executable(
                &[missing.clone(), install.clone()],
                &[path_name],
                "test browser"
            )
            .unwrap(),
            install
        );

        // No install path matches, so it has to fall through to PATH.
        let from_path =
            resolve_browser_executable(std::slice::from_ref(&missing), &[path_name], "test browser")
                .unwrap();
        assert!(std::path::Path::new(&from_path).is_file());
    }

    #[test]
    fn resolve_browser_executable_reports_every_probe_when_nothing_is_installed() {
        let error = resolve_browser_executable(
            &["/definitely/not/installed/chrome".to_string()],
            &["definitely-not-a-real-browser-binary"],
            "Chromium-based browser",
        )
        .expect_err("must not resolve a browser that is not installed");

        let message = error.to_string();
        assert!(message.contains("/definitely/not/installed/chrome"), "{message}");
        assert!(message.contains("definitely-not-a-real-browser-binary"), "{message}");
        assert!(message.contains(BROWSER_EXECUTABLE_ENV), "{message}");
    }

    #[test]
    fn executable_override_ignores_unset_and_blank_values() {
        assert_eq!(validate_executable_override("").unwrap(), None);
        assert_eq!(validate_executable_override("   ").unwrap(), None);
    }

    #[test]
    fn executable_override_accepts_an_absolute_existing_binary() {
        let binary = if cfg!(windows) {
            r"C:\Windows\System32\cmd.exe"
        } else {
            "/bin/sh"
        };
        assert_eq!(
            validate_executable_override(&format!("  {binary}  ")).unwrap(),
            Some(binary.to_string())
        );
    }

    #[test]
    fn executable_override_rejects_relative_missing_and_directory_paths() {
        for bad in [
            "chrome",
            "./chrome",
            "/definitely/not/installed/chrome",
            // The real macOS mistake: pointing at the .app bundle directory
            // instead of the binary inside Contents/MacOS.
            "/Applications",
        ] {
            let message = validate_executable_override(bad)
                .expect_err(&format!("must reject {bad}"))
                .to_string();
            assert!(
                message.contains(BROWSER_EXECUTABLE_ENV),
                "diagnostic for {bad} does not name the env var: {message}"
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn macos_chromium_resolution_is_not_the_bare_literal_when_chrome_is_installed() {
        // Regression: the non-Windows arm returned "chromium" unconditionally,
        // so a stock Mac with Chrome in /Applications still failed to launch.
        let bundled =
            std::path::Path::new("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
        if !bundled.exists() {
            return; // No Chrome on this machine; nothing to assert.
        }
        let bridge = PlaywrightBridge::new().await.unwrap();
        let (exe, _args) = bridge
            .build_browser_command(&BrowserType::Chromium, &BrowserOptions::default())
            .unwrap();
        assert_eq!(exe, bundled.to_string_lossy());
    }

    /// Reserve a port the OS says is free, then release it so the test can use
    /// it as a DevTools port nothing is listening on.
    fn free_local_port() -> u16 {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind ephemeral port");
        let port = listener.local_addr().expect("read local addr").port();
        drop(listener);
        port
    }

    async fn bridge_on_free_port() -> PlaywrightBridge {
        PlaywrightBridge::with_config(PlaywrightConfig {
            ws_port: free_local_port(),
            ..PlaywrightConfig::default()
        })
        .await
        .expect("bridge construction")
    }

    #[tokio::test]
    async fn launch_args_always_carry_a_dedicated_profile_directory() {
        // Regression: with no --user-data-dir, Chrome hands the command line to
        // an already-running instance and exits, so the DevTools port never
        // opens. That is the ordinary state of a stock Mac with Chrome open.
        let bridge = PlaywrightBridge::new().await.unwrap();
        let args = bridge
            .build_browser_args(&BrowserOptions::default())
            .expect("default options must produce launch args");

        let profile_arg = args
            .iter()
            .find(|arg| arg.starts_with("--user-data-dir="))
            .unwrap_or_else(|| {
                panic!("launch args must pin a profile directory, got: {args:?}")
            });
        assert!(
            profile_arg.contains("agiworkforce"),
            "automation profile must live under the app data directory, got: {profile_arg}"
        );
    }

    #[tokio::test]
    async fn launch_args_keep_an_explicitly_requested_profile_directory() {
        let bridge = PlaywrightBridge::new().await.unwrap();
        let args = bridge
            .build_browser_args(&BrowserOptions {
                user_data_dir: Some("/tmp/agiworkforce-test-profile".to_string()),
                ..BrowserOptions::default()
            })
            .expect("explicit profile must produce launch args");

        assert!(
            args.contains(&"--user-data-dir=/tmp/agiworkforce-test-profile".to_string()),
            "explicit profile directory was dropped: {args:?}"
        );
        assert_eq!(
            args.iter()
                .filter(|arg| arg.starts_with("--user-data-dir="))
                .count(),
            1,
            "exactly one profile directory may be passed: {args:?}"
        );
    }

    #[tokio::test]
    async fn spawn_reports_a_browser_that_dies_before_devtools_opens() {
        // Stands in for the real stock-machine failure: the spawned browser
        // hands off to a running instance and exits immediately. The launcher
        // must say so straight away instead of waiting out the whole timeout
        // and reporting a bare connection error.
        let bridge = bridge_on_free_port().await;
        let (exe, args) = if cfg!(windows) {
            (
                r"C:\Windows\System32\cmd.exe".to_string(),
                vec!["/c".to_string(), "exit 3".to_string()],
            )
        } else {
            (
                "/bin/sh".to_string(),
                vec!["-c".to_string(), "echo browser-said-no 1>&2; exit 3".to_string()],
            )
        };

        let started = std::time::Instant::now();
        let error = bridge
            .spawn_and_await_cdp(&exe, &args, Duration::from_secs(6))
            .await
            .expect_err("a process that exits immediately must not look like a launched browser")
            .to_string();
        let elapsed = started.elapsed();

        assert!(
            error.contains("exited"),
            "error must name the early exit: {error}"
        );
        assert!(
            elapsed < Duration::from_secs(4),
            "early exit must be reported without waiting out the timeout, took {elapsed:?}"
        );
        #[cfg(not(windows))]
        assert!(
            error.contains("browser-said-no"),
            "error must carry the browser's own stderr: {error}"
        );
    }

    #[tokio::test]
    async fn spawn_gives_up_on_a_live_process_that_never_opens_devtools() {
        // The other half of "never spin indefinitely": the process stays alive
        // but the port never opens, so the bounded wait has to end and the
        // child must not be left running.
        let bridge = bridge_on_free_port().await;
        let (exe, args) = if cfg!(windows) {
            (
                r"C:\Windows\System32\cmd.exe".to_string(),
                vec!["/c".to_string(), "ping -n 60 127.0.0.1 > NUL".to_string()],
            )
        } else {
            (
                "/bin/sh".to_string(),
                vec!["-c".to_string(), "sleep 60".to_string()],
            )
        };

        let started = std::time::Instant::now();
        let error = bridge
            .spawn_and_await_cdp(&exe, &args, Duration::from_secs(1))
            .await
            .expect_err("a process that never opens the port must not look like a launched browser")
            .to_string();

        assert!(
            error.contains("never became reachable"),
            "error must explain the port never opened: {error}"
        );
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "the wait must honour its own deadline"
        );
    }

    /// Stand-in for a browser that is already listening on the DevTools port:
    /// answers `/json/version` with a `webSocketDebuggerUrl` and nothing else.
    fn spawn_fake_cdp_version_endpoint(ws_url: &'static str) -> u16 {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind fake CDP endpoint");
        let port = listener.local_addr().expect("read local addr").port();

        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader, Write};

            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                let Ok(peek) = stream.try_clone() else { continue };
                let mut reader = BufReader::new(peek);

                // Read the request head so the client is not left writing into
                // a socket nobody drains.
                let mut line = String::new();
                loop {
                    line.clear();
                    match reader.read_line(&mut line) {
                        Ok(0) => break,
                        Ok(_) if line.trim().is_empty() => break,
                        Ok(_) => {}
                        Err(_) => break,
                    }
                }

                let body = format!("{{\"webSocketDebuggerUrl\":\"{ws_url}\"}}");
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();
            }
        });

        port
    }

    #[tokio::test]
    async fn launch_adopts_a_browser_that_is_already_serving_devtools() {
        // "Reconnect" in the browser-control lifecycle: a runtime left by an
        // earlier app run still owns the port and the automation profile.
        // Spawning a second instance against that profile only makes the new
        // process hand off its command line and die, so the running one has to
        // be adopted — without consulting executable discovery at all.
        let port = spawn_fake_cdp_version_endpoint("ws://127.0.0.1:1/devtools/browser/adopted");
        let bridge = PlaywrightBridge::with_config(PlaywrightConfig {
            ws_port: port,
            ..PlaywrightConfig::default()
        })
        .await
        .expect("bridge construction");

        let handle = bridge
            .launch_browser(BrowserType::Chromium, BrowserOptions::default())
            .await
            .expect("a running DevTools endpoint must be adopted, not relaunched");

        assert_eq!(handle.ws_endpoint, "ws://127.0.0.1:1/devtools/browser/adopted");

        let processes = bridge.browser_processes.lock().await;
        assert!(
            matches!(processes.get(&handle.id), Some(None)),
            "adopting a running browser must not register a child process to kill"
        );
    }

    #[tokio::test]
    async fn wait_for_shutdown_returns_immediately_when_nothing_is_listening() {
        let endpoint = CdpEndpoint::new(free_local_port());
        let started = std::time::Instant::now();
        assert!(
            endpoint.wait_for_shutdown(Duration::from_secs(5)).await,
            "an unused port must count as shut down"
        );
        assert!(
            started.elapsed() < Duration::from_secs(3),
            "shutdown detection must not wait out its timeout"
        );
    }

    #[test]
    fn test_cdp_endpoint_uses_configured_port() {
        let endpoint = CdpEndpoint::new(13377);
        assert_eq!(endpoint.port(), 13377);
        assert_eq!(endpoint.http_base_url(), "http://127.0.0.1:13377");
        assert_eq!(
            endpoint.direct_page_ws_url("tab-123"),
            "ws://127.0.0.1:13377/devtools/page/tab-123"
        );
    }
}
