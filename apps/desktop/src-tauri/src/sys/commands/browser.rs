use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::State;

static BROWSER_ALREADY_TILED: AtomicBool = AtomicBool::new(false);

use crate::automation::browser::playwright_bridge::{BrowserOptions, BrowserType, CdpEndpoint};
use crate::automation::browser::{BrowserState, TabInfo};

/// Reject agent-driven navigation to a broker, bank, or wallet host.
///
/// `is_always_blocked_host` existed with the host list but had no call site, so
/// the sensitive-site policy was enforced for native app switching
/// (`is_always_blocked_bundle`) and silently skipped whenever the agent reached
/// the same institution through a browser tab instead.
///
/// A URL that does not parse, or parses without a host, is allowed through to
/// the existing navigation error handling, this guard only ever denies, it is
/// not the scheme validator.
///
/// The policy itself now lives in `computer_use::ensure_navigation_url_allowed`
/// so the CDP, Playwright and extension navigation implementations enforce the
/// same list; this stays as the command-layer entry point that fails before a
/// tab is even resolved.
fn ensure_navigation_host_allowed(url: &str) -> Result<(), String> {
    crate::automation::computer_use::ensure_navigation_url_allowed(url)
}

// =============================================================================
// BROWSER STATE WRAPPER WITH GRACEFUL DEGRADATION
// =============================================================================

/// Error message returned when browser automation is unavailable
const BROWSER_UNAVAILABLE_ERROR: &str =
    "Browser automation is not available. The browser subsystem failed to initialize. \
     Please restart the application or check system requirements (Playwright/Chromium).";

#[derive(Debug, PartialEq, Eq)]
enum TabResolution {
    Existing(String),
    CreateNew,
}

fn parse_browser_type(browser_type: Option<&str>) -> Result<BrowserType, String> {
    match browser_type
        .unwrap_or("chromium")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "chromium" | "chrome" => Ok(BrowserType::Chromium),
        value => Err(format!("Unsupported browser type: {}", value)),
    }
}

const BROWSER_LAUNCH_TIMEOUT_MS: u64 = 30_000;

/// The window chooses the browser and whether it is shown, and nothing else.
/// Launch flags, a profile folder and a proxy are not taken from it: any of
/// them would let a script in the window start a browser on the user's own
/// profile, through a proxy of its choosing, or with a flag that runs a
/// program.
fn build_browser_launch_config(
    browser_type: Option<&str>,
    headless: Option<bool>,
) -> Result<(BrowserType, BrowserOptions), String> {
    Ok((
        parse_browser_type(browser_type)?,
        BrowserOptions {
            headless: headless.unwrap_or(false),
            user_data_dir: None,
            args: Vec::new(),
            viewport: None,
            timeout: Some(BROWSER_LAUNCH_TIMEOUT_MS),
            proxy: None,
        },
    ))
}

/// The Browser switch in Settings, Capabilities, asked by every command here
/// that starts, steers or looks at the controlled browser. The window cannot
/// turn the switch on by itself: `set_capability` asks in a native dialog.
async fn ensure_browser_switch_on(app: &tauri::AppHandle) -> Result<(), String> {
    match crate::sys::commands::capabilities::capability_refusal(app, "browser_navigate").await {
        Some(off) => Err(off),
        None => Ok(()),
    }
}

fn resolve_browser_tab_selection(
    requested_tab_id: Option<&str>,
    tabs: &[TabInfo],
    allow_create: bool,
) -> Result<TabResolution, String> {
    if let Some(tab_id) = requested_tab_id {
        if tabs.iter().any(|tab| tab.id == tab_id) {
            return Ok(TabResolution::Existing(tab_id.to_string()));
        }

        return Err(format!("Tab not found: {}", tab_id));
    }

    if let Some(tab) = tabs.first() {
        return Ok(TabResolution::Existing(tab.id.clone()));
    }

    if allow_create {
        Ok(TabResolution::CreateNew)
    } else {
        Err("No browser tabs available. Please open a tab first.".to_string())
    }
}

/// Wrapper for browser automation state with graceful degradation support.
pub struct BrowserStateWrapper {
    /// The browser state, None if initialization failed
    inner: Option<BrowserState>,
    /// The error that occurred during initialization, if any
    init_error: Option<String>,
}

impl BrowserStateWrapper {
    /// Creates a new browser state wrapper with full functionality.
    /// SEV-DESK-02: requires an `AppHandle` so the underlying `ExtensionBridge`
    /// can prompt the user before executing arbitrary JS, navigating, or
    /// reading/writing cookies and localStorage. Tests may pass `None`.
    pub async fn new(app_handle: Option<tauri::AppHandle>) -> Result<Self, String> {
        match BrowserState::new(app_handle).await {
            Ok(state) => {
                tracing::info!("BrowserState initialized successfully");
                Ok(Self {
                    inner: Some(state),
                    init_error: None,
                })
            }
            Err(e) => {
                let error_msg = e.to_string();
                tracing::error!("BrowserState initialization failed: {}", error_msg);
                Err(error_msg)
            }
        }
    }

    /// Creates a degraded browser state wrapper when initialization fails.
    pub fn new_degraded(error: String) -> Self {
        tracing::warn!(
            "BrowserStateWrapper created in DEGRADED mode. Browser automation unavailable. \
             Original error: {}",
            error
        );
        Self {
            inner: None,
            init_error: Some(error),
        }
    }

    /// Returns whether browser automation is available.
    pub fn is_available(&self) -> bool {
        self.inner.is_some()
    }

    /// Returns the initialization error, if any.
    pub fn init_error(&self) -> Option<&str> {
        self.init_error.as_deref()
    }

    /// Gets a reference to the inner BrowserState.
    pub fn get(&self) -> Result<&BrowserState, String> {
        self.inner.as_ref().ok_or_else(|| {
            if let Some(ref err) = self.init_error {
                format!("{} Original error: {}", BROWSER_UNAVAILABLE_ERROR, err)
            } else {
                BROWSER_UNAVAILABLE_ERROR.to_string()
            }
        })
    }

    /// Gets CDP client for a specific tab, or falls back to active tab if not specified.
    pub async fn get_client_for_tab(
        &self,
        tab_id: Option<String>,
    ) -> Result<(Arc<crate::automation::browser::CdpClient>, String), String> {
        if let Some(id) = tab_id {
            let client = self.get_cdp_client_for_tab(&id).await?;
            Ok((client, id))
        } else {
            self.get_active_client().await
        }
    }

    /// Returns the error message for when browser is unavailable.
    pub fn get_error_message(&self) -> String {
        if let Some(ref err) = self.init_error {
            format!("{} Original error: {}", BROWSER_UNAVAILABLE_ERROR, err)
        } else {
            BROWSER_UNAVAILABLE_ERROR.to_string()
        }
    }

    /// Gets the tab manager, returning an error if browser is unavailable.
    pub fn get_tab_manager(
        &self,
    ) -> Result<&std::sync::Arc<tokio::sync::Mutex<crate::automation::browser::TabManager>>, String>
    {
        self.get().map(|state| &state.tab_manager)
    }

    /// Gets the CDP client for a specific tab, returning an error if browser is unavailable.
    pub async fn get_cdp_client_for_tab(
        &self,
        tab_id: &str,
    ) -> Result<std::sync::Arc<crate::automation::browser::CdpClient>, String> {
        let state = self.get()?;
        state
            .get_cdp_client(tab_id)
            .await
            .map_err(|e| format!("Failed to get CDP client: {}", e))
    }

    /// Helper to get CDP client for the active tab
    pub async fn get_active_client(
        &self,
    ) -> Result<(Arc<crate::automation::browser::CdpClient>, String), String> {
        let tab_manager = self.get_tab_manager()?;
        let active_tab = tab_manager
            .lock()
            .await
            .get_active_tab()
            .await
            .map_err(|e| e.to_string())?;

        if let Some(tab) = active_tab {
            let client = self.get_cdp_client_for_tab(&tab.id).await?;
            Ok((client, tab.id))
        } else {
            Err("No active browser tab found. Please open a tab first.".to_string())
        }
    }

    /// Gets the extension bridge, returning an error if browser state is unavailable.
    ///
    /// The `ExtensionBridge` communicates with the browser extension through the
    /// realtime WebSocket transport. Use this when CDP is unavailable or when
    /// you need to dispatch actions through the installed extension content script
    /// rather than a remote-debugging port.
    pub fn get_extension_bridge(
        &self,
    ) -> Result<
        &std::sync::Arc<tokio::sync::Mutex<crate::automation::browser::ExtensionBridge>>,
        String,
    > {
        self.get().map(|state| &state.extension)
    }

    async fn get_cdp_endpoint(&self) -> Result<CdpEndpoint, String> {
        let state = self.get()?;
        let bridge = state.playwright.lock().await;
        Ok(bridge.endpoint())
    }

    /// Make sure a browser with Chrome DevTools enabled is running before a
    /// caller tries to talk to it.
    ///
    /// `PlaywrightBridge::launch_browser`, and with it the whole
    /// platform-specific executable discovery, had no production caller: the
    /// only route to it was the `browser_launch` command, which nothing in the
    /// desktop UI invoked. Every agent browser tool went straight to
    /// `create_target`, so on a machine where no browser had been started by
    /// hand the user got a bare "Failed to connect to Chrome DevTools" and no
    /// way to fix it. This is the wiring: the first tab request starts the
    /// runtime, reusing an already-running one when the port answers.
    pub async fn ensure_browser_runtime(&self) -> Result<(), String> {
        let state = self.get()?;
        let bridge = state.playwright.lock().await;

        if bridge.endpoint().browser_ws_endpoint().await.is_ok() {
            return Ok(());
        }

        tracing::info!(
            "No Chrome DevTools endpoint on port {}; starting the browser-control runtime",
            bridge.cdp_port()
        );

        bridge
            .launch_browser(BrowserType::Chromium, BrowserOptions::default())
            .await
            .map(|handle| {
                tracing::info!("Browser-control runtime started ({})", handle.id);
            })
            .map_err(|error| format!("Could not start the browser-control runtime: {}", error))
    }

    pub async fn create_cdp_tab(&self, url: &str) -> Result<String, String> {
        ensure_navigation_host_allowed(url)?;
        let state = self.get()?;
        self.ensure_browser_runtime().await?;
        let endpoint = self.get_cdp_endpoint().await?;
        let target = endpoint
            .create_target(url)
            .await
            .map_err(|e| format!("Failed to create browser target: {}", e))?;

        state
            .tab_manager
            .lock()
            .await
            .register_tab(&target.id, url)
            .await
            .map_err(|e| e.to_string())?;

        Ok(target.id)
    }

    pub async fn resolve_cdp_tab(
        &self,
        requested_tab_id: Option<&str>,
        allow_create: bool,
        create_url: Option<&str>,
    ) -> Result<String, String> {
        let tab_manager = self.get_tab_manager()?;
        let tabs = tab_manager
            .lock()
            .await
            .list_tabs()
            .await
            .map_err(|e| e.to_string())?;

        match resolve_browser_tab_selection(requested_tab_id, &tabs, allow_create)? {
            TabResolution::Existing(tab_id) => Ok(tab_id),
            TabResolution::CreateNew => {
                self.create_cdp_tab(create_url.unwrap_or("about:blank"))
                    .await
            }
        }
    }
}

// Browser Automation Commands

#[tauri::command]
pub async fn browser_init(state: State<'_, BrowserStateWrapper>) -> Result<(), String> {
    if state.is_available() {
        Ok(())
    } else {
        Err(state.get_error_message())
    }
}

#[tauri::command]
pub async fn browser_check_status(state: State<'_, BrowserStateWrapper>) -> Result<Value, String> {
    Ok(serde_json::json!({
        "available": state.is_available(),
        "error": state.init_error(),
    }))
}

#[tauri::command]
pub async fn browser_launch(
    app: tauri::AppHandle,
    state: State<'_, BrowserStateWrapper>,
    browser_type: Option<String>,
    headless: Option<bool>,
) -> Result<String, String> {
    ensure_browser_switch_on(&app).await?;
    let browser_state = state.get()?;
    let (browser_type, browser_options) =
        build_browser_launch_config(browser_type.as_deref(), headless)?;

    let handle = browser_state
        .playwright
        .lock()
        .await
        .launch_browser(browser_type, browser_options)
        .await
        .map_err(|e| e.to_string())?;

    Ok(handle.id)
}

#[tauri::command]
pub async fn browser_open_tab(
    app: tauri::AppHandle,
    state: State<'_, BrowserStateWrapper>,
    url: Option<String>,
) -> Result<String, String> {
    ensure_browser_switch_on(&app).await?;
    let target_url = url.unwrap_or_else(|| "about:blank".to_string());
    state.create_cdp_tab(&target_url).await
}

#[tauri::command]
pub async fn browser_close(
    state: State<'_, BrowserStateWrapper>,
    browser_id: String,
) -> Result<(), String> {
    if browser_id.trim().is_empty() {
        return Err("Browser id is required".to_string());
    }

    let browser_state = state.get()?;
    browser_state
        .playwright
        .lock()
        .await
        .close_browser_by_id(&browser_id)
        .await
        .map_err(|e| e.to_string())?;

    BROWSER_ALREADY_TILED.store(false, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub async fn browser_navigate(
    app: tauri::AppHandle,
    state: State<'_, BrowserStateWrapper>,
    url: String,
    tab_id: Option<String>,
) -> Result<(), String> {
    ensure_browser_switch_on(&app).await?;
    ensure_navigation_host_allowed(&url)?;

    let target_tab_id = state
        .resolve_cdp_tab(tab_id.as_deref(), true, Some(&url))
        .await?;

    let client = state.get_cdp_client_for_tab(&target_tab_id).await?;
    client.navigate(&url).await.map_err(|e| e.to_string())?;

    // Auto-tile only on first navigation (avoid re-snapping on every link click).
    // Only set the flag AFTER success so a failure does not prevent retries.
    if !BROWSER_ALREADY_TILED.load(Ordering::Relaxed) {
        if let Err(e) = crate::auto_tile_for_browser(&app) {
            tracing::warn!("auto_tile_for_browser failed (non-fatal): {}", e);
        } else {
            BROWSER_ALREADY_TILED.store(true, Ordering::Relaxed);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn browser_go_back(
    app: tauri::AppHandle,
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<(), String> {
    ensure_browser_switch_on(&app).await?;
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    client
        .evaluate("window.history.back()")
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn browser_go_forward(
    app: tauri::AppHandle,
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<(), String> {
    ensure_browser_switch_on(&app).await?;
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    client
        .evaluate("window.history.forward()")
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn browser_reload(
    app: tauri::AppHandle,
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<(), String> {
    ensure_browser_switch_on(&app).await?;
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    client
        .evaluate("window.location.reload()")
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn browser_get_url(
    app: tauri::AppHandle,
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<String, String> {
    ensure_browser_switch_on(&app).await?;
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    client.get_url().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_get_title(
    app: tauri::AppHandle,
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<String, String> {
    ensure_browser_switch_on(&app).await?;
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    client.get_title().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_get_screenshot_stream(
    app: tauri::AppHandle,
    state: State<'_, BrowserStateWrapper>,
    tab_id: Option<String>,
) -> Result<String, String> {
    ensure_browser_switch_on(&app).await?;
    let (client, _) = state.get_client_for_tab(tab_id).await?;
    let bytes = client
        .capture_screenshot(false)
        .await
        .map_err(|e| e.to_string())?;
    use base64::{engine::general_purpose::STANDARD, Engine};
    Ok(STANDARD.encode(bytes))
}

/// AUDIT-FIX: CI-3, system-default-browser navigation gated by HITL.
///
/// Opens an http(s) URL in the user's default browser after explicit
/// confirmation via `request_confirmation_simple`. Rejects non-http(s)
/// schemes to block `file://`, `javascript:`, and other vectors that
/// prompt-injected agents could use to read local files or execute JS.
///
/// AUDIT-FIX: BUG_002, delegate to the `open` crate so Windows uses
/// `ShellExecuteW` instead of `cmd /C start`. The previous implementation
/// shell-injected on URLs whose query string contained `&` (and other cmd
/// metacharacters), because cmd.exe re-parses its command line after Rust's
/// argv quoting. ShellExecuteW takes the URL as a single wide-string and
/// performs no shell interpretation.
pub async fn open_url(url: String, reason: String, app: tauri::AppHandle) -> Result<(), String> {
    let lower = url.to_ascii_lowercase();
    if !lower.starts_with("https://") && !lower.starts_with("http://") {
        return Err(format!("Refusing to open non-http(s) URL: {url}"));
    }
    if !crate::sys::commands::tool_confirmation::request_confirmation_simple(
        &app,
        "open_url",
        &serde_json::json!({ "url": url, "reason": reason }),
    )
    .await?
    {
        return Err("User denied open_url".to_string());
    }
    open::that(&url).map_err(|e| format!("Failed to open URL: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn navigation_guard_blocks_sensitive_hosts_and_their_subdomains() {
        for url in [
            "https://chase.com/login",
            "https://www.chase.com/login",
            "https://accounts.coinbase.com/signin",
            "http://robinhood.com",
        ] {
            assert!(
                ensure_navigation_host_allowed(url).is_err(),
                "expected {url} to be blocked"
            );
        }
    }

    #[test]
    fn navigation_guard_allows_ordinary_hosts_and_defers_unparseable_urls() {
        for url in [
            "https://example.com/docs",
            "https://nodejs.org",
            // Lookalikes must not match: the check is exact-or-parent-domain,
            // not a substring search.
            "https://notchase.com",
            "https://chase.com.evil.test",
        ] {
            assert!(
                ensure_navigation_host_allowed(url).is_ok(),
                "expected {url} to be allowed"
            );
        }
        // Not this guard's job to validate schemes or syntax.
        assert!(ensure_navigation_host_allowed("not a url").is_ok());
    }

    #[test]
    fn parse_browser_type_accepts_only_the_browser_the_bridge_can_drive() {
        assert!(matches!(
            parse_browser_type(Some("Chromium")),
            Ok(BrowserType::Chromium)
        ));
        assert!(matches!(
            parse_browser_type(None),
            Ok(BrowserType::Chromium)
        ));
        assert_eq!(
            parse_browser_type(Some("Firefox")).unwrap_err(),
            "Unsupported browser type: firefox"
        );
        assert_eq!(
            parse_browser_type(Some("Webkit")).unwrap_err(),
            "Unsupported browser type: webkit"
        );
    }

    /// Everything here is callable by whatever runs in the window, so the
    /// launch takes nothing a script could turn against the user.
    #[test]
    fn a_launch_takes_no_flags_profile_or_proxy_from_the_window() {
        let (browser_type, options) =
            build_browser_launch_config(Some("Chromium"), Some(true)).expect("launch config");

        assert!(matches!(browser_type, BrowserType::Chromium));
        assert!(options.headless);
        assert!(options.args.is_empty());
        assert_eq!(options.user_data_dir, None);
        assert_eq!(options.proxy, None);
        assert_eq!(options.timeout, Some(BROWSER_LAUNCH_TIMEOUT_MS));

        let source = include_str!("browser.rs");
        let launch = source
            .split("pub async fn browser_launch(")
            .nth(1)
            .and_then(|rest| rest.split(") -> Result<String, String>").next())
            .expect("browser_launch signature");
        for refused in ["args", "user_data_dir", "proxy", "options", "profile_name"] {
            assert!(!launch.contains(refused), "browser_launch takes {refused}");
        }
    }

    /// Each command that starts, steers or looks at the browser asks the
    /// Browser switch before it does anything else.
    #[test]
    fn every_acting_command_asks_the_browser_switch_first() {
        let source = include_str!("browser.rs");
        let commands: Vec<&str> = source
            .split("#[tauri::command]\npub async fn ")
            .skip(1)
            .collect();
        let names: Vec<&str> = commands
            .iter()
            .filter_map(|command| command.split('(').next())
            .collect();
        assert_eq!(
            names,
            [
                "browser_init",
                "browser_check_status",
                "browser_launch",
                "browser_open_tab",
                "browser_close",
                "browser_navigate",
                "browser_go_back",
                "browser_go_forward",
                "browser_reload",
                "browser_get_url",
                "browser_get_title",
                "browser_get_screenshot_stream",
            ],
            "a command added here needs a place in this test"
        );

        let answers_without_acting = ["browser_init", "browser_check_status", "browser_close"];
        for command in commands {
            let name = command.split('(').next().unwrap_or_default();
            if answers_without_acting.contains(&name) {
                continue;
            }
            let body = command
                .split_once(" {\n")
                .map(|(_, body)| body)
                .unwrap_or_default();
            assert!(
                body.trim_start()
                    .starts_with("ensure_browser_switch_on(&app).await?;"),
                "{name} must ask the Browser switch before anything else"
            );
        }
    }

    #[test]
    fn resolve_browser_tab_selection_creates_when_empty_and_allowed() {
        let selection = resolve_browser_tab_selection(None, &[], true).expect("selection");
        assert_eq!(selection, TabResolution::CreateNew);
    }

    #[test]
    fn resolve_browser_tab_selection_returns_existing_tab() {
        let tabs = vec![TabInfo {
            id: "tab-1".to_string(),
            url: "https://example.com".to_string(),
            title: "Example".to_string(),
            favicon: None,
            loading: false,
            created_at: 1,
        }];

        let selection = resolve_browser_tab_selection(None, &tabs, true).expect("selection");
        assert_eq!(selection, TabResolution::Existing("tab-1".to_string()));
    }
}
