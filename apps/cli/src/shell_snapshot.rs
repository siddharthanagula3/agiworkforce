use anyhow::Result;
use regex::Regex;
use std::borrow::Cow;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock, RwLock};
use std::time::Duration;

const REDACTED: &str = "REDACTED";
const CAPTURE_TIMEOUT: Duration = Duration::from_secs(10);
const RUNNABLE_SHELL_PREFIXES: [&str; 3] = ["/bin/", "/usr/", "/opt/"];

const ZSH_CAPTURE: &str = r#"{
  print -r -- 'unalias -m "*" 2>/dev/null'
  for __agi_name in ${(ok)functions}; do
    [[ $__agi_name == _* ]] || typeset -f -- $__agi_name
  done
  for __agi_option in $(setopt); do
    case $__agi_option in
      interactive|monitor|zle|shinstdin|login|privileged|restricted|singlecommand) ;;
      *) print -r -- "setopt $__agi_option 2>/dev/null" ;;
    esac
  done
  alias -L
  print -r -- "export PATH=${(q)PATH}"
} >| "$1"
print -rl -- ${(ok)functions:#_*} ${(k)aliases} >| "$2"
print -rn -- "$PATH" >| "$3""#;

const BASH_CAPTURE: &str = r#"{
  printf '%s\n' 'unalias -a 2>/dev/null' 'shopt -s expand_aliases'
  while read -r __agi_line; do
    __agi_name=${__agi_line##* }
    case $__agi_name in
      _*) ;;
      *) declare -f -- "$__agi_name" ;;
    esac
  done < <(declare -F)
  while read -r __agi_line; do
    printf '%s 2>/dev/null\n' "$__agi_line"
  done < <(shopt -p)
  alias -p
  printf 'export PATH=%q\n' "$PATH"
} >| "$1"
{ compgen -A function | grep -v '^_'; compgen -a; } >| "$2"
printf '%s' "$PATH" >| "$3""#;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ShellKind {
    Zsh,
    Bash,
}

impl ShellKind {
    fn name(self) -> &'static str {
        match self {
            ShellKind::Zsh => "zsh",
            ShellKind::Bash => "bash",
        }
    }

    fn capture_script(self) -> &'static str {
        match self {
            ShellKind::Zsh => ZSH_CAPTURE,
            ShellKind::Bash => BASH_CAPTURE,
        }
    }

    fn without_startup_files(self) -> &'static [&'static str] {
        match self {
            ShellKind::Zsh => &["-f"],
            ShellKind::Bash => &["--noprofile", "--norc"],
        }
    }
}

struct AppliedSnapshot {
    shell: PathBuf,
    kind: ShellKind,
    file: PathBuf,
    names: HashSet<String>,
    path: Option<String>,
}

static CAPTURE_STARTED: OnceLock<()> = OnceLock::new();
static ACTIVE: RwLock<Option<Arc<AppliedSnapshot>>> = RwLock::new(None);

fn active() -> Option<Arc<AppliedSnapshot>> {
    let active = ACTIVE.read().ok()?.clone()?;
    active.file.is_file().then_some(active)
}

fn user_shell() -> Option<(PathBuf, ShellKind)> {
    if !cfg!(unix) {
        return None;
    }
    let shell = PathBuf::from(std::env::var_os("SHELL")?);
    let kind = match shell.file_name()?.to_str()? {
        "zsh" => ShellKind::Zsh,
        "bash" => ShellKind::Bash,
        _ => return None,
    };
    let runnable = shell.is_absolute()
        && RUNNABLE_SHELL_PREFIXES
            .iter()
            .any(|prefix| shell.to_string_lossy().starts_with(prefix))
        && shell.is_file();
    runnable.then_some((shell, kind))
}

pub(crate) fn shell_invocation(command: &str) -> Option<(String, Vec<String>)> {
    let snapshot = active()?;
    let mut args: Vec<String> = snapshot
        .kind
        .without_startup_files()
        .iter()
        .map(|arg| arg.to_string())
        .collect();
    args.push("-c".to_string());
    args.push(format!(
        ". {} >/dev/null 2>&1; eval {}",
        crate::sandbox::shell_quote(&snapshot.file.to_string_lossy()),
        crate::sandbox::shell_quote(command)
    ));
    Some((snapshot.shell.to_string_lossy().into_owned(), args))
}

pub(crate) fn program_invocation(program: String, args: Vec<String>) -> (String, Vec<String>) {
    let Some(path) = active().and_then(|snapshot| snapshot.path.clone()) else {
        return (program, args);
    };
    if std::env::var("PATH").is_ok_and(|current| current == path) {
        return (program, args);
    }
    let mut wrapped = vec![format!("PATH={path}"), program];
    wrapped.extend(args);
    ("/usr/bin/env".to_string(), wrapped)
}

pub(crate) fn defines(program: &str) -> bool {
    active().is_some_and(|snapshot| snapshot.names.contains(program))
}

pub(crate) fn applied_file() -> Option<PathBuf> {
    active().map(|snapshot| snapshot.file.clone())
}

pub struct ShellSnapshot;

impl ShellSnapshot {
    pub fn capture(home: &Path, session_id: &str) {
        if cfg!(test) || CAPTURE_STARTED.set(()).is_err() {
            return;
        }
        let Some((shell, kind)) = user_shell() else {
            return;
        };
        let home = home.to_path_buf();
        let session_id = session_id.to_string();
        std::thread::spawn(move || {
            match Self::capture_inner(&home, &session_id, shell, kind) {
                Ok(Some(snapshot)) => {
                    if let Ok(mut active) = ACTIVE.write() {
                        *active = Some(Arc::new(snapshot));
                    }
                }
                Ok(None) => tracing::warn!(
                    "your shell setup could not be captured; commands run without your aliases and functions"
                ),
                Err(error) => tracing::warn!(
                    %error,
                    "your shell setup could not be captured; commands run without your aliases and functions"
                ),
            }
        });
    }

    fn capture_inner(
        home: &Path,
        session_id: &str,
        shell: PathBuf,
        kind: ShellKind,
    ) -> Result<Option<AppliedSnapshot>> {
        let snapshot_dir = home.join("shell_snapshots");
        std::fs::create_dir_all(&snapshot_dir)?;
        let script = tempfile::NamedTempFile::new_in(&snapshot_dir)?;
        let names = tempfile::NamedTempFile::new_in(&snapshot_dir)?;
        let path = tempfile::NamedTempFile::new_in(&snapshot_dir)?;
        let mut command = std::process::Command::new(&shell);
        command
            .arg("-i")
            .arg("-c")
            .arg(kind.capture_script())
            .arg(kind.name())
            .arg(script.path())
            .arg(names.path())
            .arg(path.path())
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        #[cfg(unix)]
        std::os::unix::process::CommandExt::process_group(&mut command, 0);
        let mut child = command.spawn()?;
        let deadline = std::time::Instant::now() + CAPTURE_TIMEOUT;
        while child.try_wait()?.is_none() {
            if std::time::Instant::now() >= deadline {
                #[cfg(unix)]
                if let Ok(process_id) = i32::try_from(child.id()) {
                    let _ = nix::sys::signal::killpg(
                        nix::unistd::Pid::from_raw(process_id),
                        nix::sys::signal::Signal::SIGKILL,
                    );
                }
                let _ = child.kill();
                let _ = child.wait();
                anyhow::bail!(
                    "{} took longer than {} seconds to start",
                    shell.display(),
                    CAPTURE_TIMEOUT.as_secs()
                );
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        let captured = std::fs::read_to_string(script.path())?;
        if captured.trim().is_empty() {
            return Ok(None);
        }
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs();
        let file = snapshot_dir.join(format!("{session_id}.{timestamp}.{}.sh", kind.name()));
        Self::write_private(&file, Self::redact_script(&captured).as_bytes())?;
        let names = std::fs::read_to_string(names.path())?
            .lines()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(str::to_string)
            .collect();
        let path = std::fs::read_to_string(path.path())
            .ok()
            .filter(|path| !path.trim().is_empty());
        Ok(Some(AppliedSnapshot {
            shell,
            kind,
            file,
            names,
            path,
        }))
    }

    fn redact_script(script: &str) -> String {
        static ASSIGNMENT: OnceLock<Regex> = OnceLock::new();
        static NESTED_ASSIGNMENT: OnceLock<Regex> = OnceLock::new();
        let assignment = ASSIGNMENT.get_or_init(|| {
            Regex::new(r#"([A-Za-z_][A-Za-z0-9_]*)=('[^']*'|"[^"]*"|[^\s;&|)'"]*)"#)
                .expect("assignment pattern")
        });
        let nested = NESTED_ASSIGNMENT.get_or_init(|| {
            Regex::new(r#"([A-Za-z_][A-Za-z0-9_]*)=([^\s;&|)'"]+)"#).expect("nested pattern")
        });
        let redact = |pattern: &Regex, text: &str| {
            pattern
                .replace_all(text, |captures: &regex::Captures<'_>| {
                    let value = &captures[2];
                    match Self::redact_env_value(&captures[1], value) {
                        Cow::Borrowed(kept) if kept == value => captures[0].to_string(),
                        redacted => format!("{}={redacted}", &captures[1]),
                    }
                })
                .into_owned()
        };
        let mut redacted = String::with_capacity(script.len());
        for line in script.split_inclusive('\n') {
            let line = redact(nested, &redact(assignment, line));
            redacted.push_str(&Self::redact_url_userinfo(&line));
        }
        redacted
    }

    fn redact_env_value<'a>(key: &str, value: &'a str) -> Cow<'a, str> {
        if Self::is_secret_env_key(key) {
            return Cow::Borrowed(REDACTED);
        }
        Self::redact_url_userinfo(value)
    }

    /// True for env keys whose value is likely a credential and must never be
    /// persisted to disk.
    fn is_secret_env_key(key: &str) -> bool {
        let k = key.to_ascii_uppercase();
        const NEEDLES: &[&str] = &[
            "KEY",
            "TOKEN",
            "SECRET",
            "PASSWORD",
            "PASSWD",
            "PASSPHRASE",
            "CREDENTIAL",
            "AUTH",
            "SESSION",
            "COOKIE",
            "PRIVATE",
            "CONNECTION",
        ];
        // Matched per name segment, not as substrings: `PAT` occurs inside
        // `PATH`, `URL` inside `CURL_*`, `URI` inside `SECURITY_*`, and
        // redacting those would gut the snapshot without protecting anything.
        const SEGMENT_NEEDLES: &[&str] = &["URL", "URI", "DSN", "ENDPOINT", "PAT"];
        NEEDLES.iter().any(|needle| k.contains(needle))
            || k.split(|c: char| !c.is_ascii_alphanumeric())
                .any(|segment| SEGMENT_NEEDLES.contains(&segment))
    }

    /// Delimiters that cannot appear unencoded in an authority. `,` and `;`
    /// matter because a list of URLs in one variable would otherwise let the
    /// first authority swallow the next URL's scheme, leaving it unredacted.
    fn ends_authority(c: char) -> bool {
        c.is_whitespace()
            || matches!(
                c,
                '/' | '?' | '#' | ',' | ';' | '"' | '\'' | '<' | '>' | '\\' | '|'
            )
    }

    /// Strip the userinfo of any `scheme://user:pass@host` occurrence, so a
    /// credential embedded in a connection string is never persisted even when
    /// the variable name looks harmless (`DATABASE_URL`, `SENTRY_DSN`, ...).
    fn redact_url_userinfo(value: &str) -> Cow<'_, str> {
        let mut out = String::new();
        let mut cursor = 0usize;
        let mut redacted_any = false;
        while let Some(offset) = value[cursor..].find("://") {
            let authority_start = cursor + offset + 3;
            let authority_end = value[authority_start..]
                .find(Self::ends_authority)
                .map_or(value.len(), |i| authority_start + i);
            let authority = &value[authority_start..authority_end];
            match authority.rfind('@') {
                Some(at) => {
                    out.push_str(&value[cursor..authority_start]);
                    out.push_str(REDACTED);
                    out.push_str(&authority[at..]);
                    redacted_any = true;
                }
                None => out.push_str(&value[cursor..authority_end]),
            }
            cursor = authority_end;
        }
        if !redacted_any {
            return Cow::Borrowed(value);
        }
        out.push_str(&value[cursor..]);
        Cow::Owned(out)
    }

    /// Write a file with owner-only (0600) permissions on Unix; best-effort
    /// elsewhere.
    fn write_private(path: &Path, bytes: &[u8]) -> Result<()> {
        #[cfg(unix)]
        {
            use std::io::Write;
            use std::os::unix::fs::OpenOptionsExt;
            let mut f = std::fs::OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .mode(0o600)
                .open(path)?;
            f.write_all(bytes)?;
            Ok(())
        }
        #[cfg(not(unix))]
        {
            std::fs::write(path, bytes)?;
            Ok(())
        }
    }

    /// Remove snapshots older than 3 days.
    /// Best-effort: errors are silently ignored.
    pub fn cleanup_stale(home: &Path) {
        let _ = Self::cleanup_stale_inner(home);
    }

    fn cleanup_stale_inner(home: &Path) -> Result<()> {
        let snapshot_dir = home.join("shell_snapshots");
        if !snapshot_dir.exists() {
            return Ok(());
        }

        let three_days_ago = std::time::SystemTime::now()
            .checked_sub(std::time::Duration::from_secs(3 * 24 * 60 * 60))
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);

        for entry in std::fs::read_dir(&snapshot_dir)? {
            let entry = entry?;
            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    if modified < three_days_ago {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn render(pairs: &[(&str, &str)]) -> String {
        ShellSnapshot::redact_script(
            &pairs
                .iter()
                .map(|(k, v)| format!("{k}={v}\n"))
                .collect::<String>(),
        )
    }

    #[test]
    fn redacts_password_embedded_in_connection_string() {
        let body = render(&[(
            "DATABASE_URL",
            "postgres://EXAMPLE_USER:EXAMPLE_FAKE_PASS@db.example.invalid:5432/app",
        )]);
        assert!(
            !body.contains("EXAMPLE_FAKE_PASS"),
            "body leaked password: {body}"
        );
        assert!(
            !body.contains("EXAMPLE_USER"),
            "body leaked username: {body}"
        );
    }

    #[test]
    fn redacts_userinfo_in_a_value_under_a_harmless_key() {
        let redacted = ShellSnapshot::redact_env_value(
            "SERVICE_ADDR",
            "amqp://rabbit:hunter2@broker.internal:5672/vhost",
        );
        assert_eq!(redacted, "amqp://REDACTED@broker.internal:5672/vhost");
    }

    #[test]
    fn redacts_every_url_in_a_multi_value_variable() {
        let redacted = ShellSnapshot::redact_env_value(
            "PROXY_LIST",
            "http://u1:p1@a.example:8080,http://u2:p2@b.example:8080",
        );
        assert_eq!(
            redacted,
            "http://REDACTED@a.example:8080,http://REDACTED@b.example:8080"
        );
    }

    #[test]
    fn redacts_dsn_and_uri_keys_entirely() {
        for key in ["SENTRY_DSN", "MONGODB_URI", "REDIS_URL", "GITHUB_PAT"] {
            assert!(
                ShellSnapshot::is_secret_env_key(key),
                "{key} should be treated as secret"
            );
        }
    }

    #[test]
    fn keeps_existing_key_needles() {
        for key in ["ANTHROPIC_API_KEY", "AWS_SESSION_TOKEN", "DB_PASSWORD"] {
            assert_eq!(ShellSnapshot::redact_env_value(key, "raw"), REDACTED);
        }
    }

    #[test]
    fn does_not_redact_benign_keys_or_values() {
        for key in ["PATH", "CURL_CA_BUNDLE", "SECURITY_MODE", "HOME", "LANG"] {
            assert!(
                !ShellSnapshot::is_secret_env_key(key),
                "{key} should not be redacted"
            );
        }
        assert_eq!(
            ShellSnapshot::redact_env_value("HOMEBREW_MIRROR", "https://mirror.example/brew"),
            "https://mirror.example/brew"
        );
    }

    #[test]
    fn handles_malformed_and_multibyte_values() {
        for value in [
            "://",
            "://@",
            "x://@host",
            "scheme://ü:pö@hößt/påth",
            "no scheme here @ all",
            "",
        ] {
            let redacted = ShellSnapshot::redact_env_value("ANY", value);
            assert!(!redacted.contains("pö"), "leaked userinfo from {value}");
        }
    }

    #[test]
    fn keeps_benign_assignments_in_order() {
        let body = render(&[("B_VAR", "2"), ("A_VAR", "1")]);
        assert_eq!(body, "B_VAR=2\nA_VAR=1\n");
    }
}
