//! Centralized blocklist of dangerous environment variables.
//!
//! BATCH-5 (audit 2026-05-19): three separate `BLOCKED_ENV_VARS` lists used to
//! live in:
//!   - `sys/commands/code_execution.rs:14` (9 vars)
//!   - `core/agi/sandbox.rs:282` (28 vars)
//!   - `core/mcp/transport.rs:441` (22 vars)
//!
//! They drifted: the MCP transport list was the most complete (added LD_AUDIT,
//! NODE_EXTRA_CA_CERTS, ELECTRON_RUN_AS_NODE, JAVA_TOOL_OPTIONS, ZDOTDIR,
//! RUST_LOG) while the code-execution list was the thinnest (missing every
//! language-specific injector and BASH_FUNC_*). A user who pivoted through
//! `execute_code` could bypass restrictions enforced for `terminal_execute`.
//!
//! This module is now the single source of truth — a strict superset of every
//! prior list so consolidation never weakens security. Each consumer calls
//! [`is_blocked_env_var`] (for inline filter loops) or
//! [`filter_blocked_env_vars`] (for `Option<HashMap>` shapes).

use std::collections::HashMap;

/// Environment variables that must never be set on child processes spawned by
/// the desktop app. Covers:
///
/// - Library injection (LD_PRELOAD, LD_LIBRARY_PATH, LD_AUDIT, DYLD_*)
/// - Language-specific code injection (PYTHONPATH, NODE_OPTIONS, RUBYOPT,
///   PERL5OPT, JAVA_TOOL_OPTIONS, _JAVA_OPTIONS)
/// - Shell startup hijack (BASH_ENV, ENV, ZDOTDIR, PROMPT_COMMAND)
/// - Identity / path spoofing (USER, LOGNAME, HOME, PATH, SHELL, TMPDIR)
/// - Debug / info disclosure (RUST_LOG, NODE_DEBUG)
/// - Electron-specific (ELECTRON_RUN_AS_NODE)
///
/// Compared against caller-supplied keys via [`str::eq_ignore_ascii_case`] so
/// case variants like `ld_preload` are also blocked.
///
/// **Do not add a new blocklist anywhere else in the workspace** — extend this
/// constant instead. The clippy check enforced by `check-wiring.sh` (planned)
/// asserts exactly one definition exists.
pub const BLOCKED_ENV_VARS: &[&str] = &[
    // Identity / location spoofing
    "PATH",
    "HOME",
    "SHELL",
    "USER",
    "LOGNAME",
    "TMPDIR",
    "TEMP",
    "TMP",
    // Linux/glibc library injection
    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    "LD_AUDIT",
    // macOS dyld library injection
    "DYLD_INSERT_LIBRARIES",
    "DYLD_LIBRARY_PATH",
    "DYLD_FRAMEWORK_PATH",
    // Node.js / Electron
    "NODE_OPTIONS",
    "NODE_PATH",
    "NODE_EXTRA_CA_CERTS",
    "NODE_DEBUG",
    "ELECTRON_RUN_AS_NODE",
    // Python
    "PYTHONPATH",
    "PYTHONSTARTUP",
    "PYTHONHOME",
    // Ruby
    "RUBYOPT",
    "RUBYLIB",
    // Perl
    "PERL5OPT",
    "PERL5LIB",
    "PERLLIB",
    // JVM
    "JAVA_TOOL_OPTIONS",
    "_JAVA_OPTIONS",
    // Shell startup / behavior modification
    "BASH_ENV",
    "ENV",
    "CDPATH",
    "GLOBIGNORE",
    "PROMPT_COMMAND",
    "PS1",
    "PS2",
    "PS4",
    "IFS",
    "ZDOTDIR",
    // Debug / info disclosure
    "RUST_LOG",
];

/// Returns `true` if `key` is on [`BLOCKED_ENV_VARS`] or matches a blocklisted
/// prefix pattern. Case-insensitive (ASCII).
///
/// The one prefix-matched pattern is `BASH_FUNC_*` — bash's exported-function
/// mechanism, where the *value* contains arbitrary shell code that bash will
/// evaluate at child startup. Any env var name beginning with `BASH_FUNC_`
/// (case-insensitive) is rejected regardless of suffix.
pub fn is_blocked_env_var(key: &str) -> bool {
    let upper = key.to_ascii_uppercase();
    if upper.starts_with("BASH_FUNC_") {
        return true;
    }
    BLOCKED_ENV_VARS
        .iter()
        .any(|blocked| blocked.eq_ignore_ascii_case(key))
}

/// Convenience wrapper that filters an `Option<HashMap<String, String>>`,
/// removing every key flagged by [`is_blocked_env_var`]. Matches the signature
/// previously exposed by `sys/commands/code_execution::filter_blocked_env_vars`.
pub fn filter_blocked_env_vars(
    env_vars: Option<HashMap<String, String>>,
) -> Option<HashMap<String, String>> {
    env_vars.map(|vars| {
        vars.into_iter()
            .filter(|(key, _)| !is_blocked_env_var(key))
            .collect()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_canonical_library_injection_vars() {
        assert!(is_blocked_env_var("LD_PRELOAD"));
        assert!(is_blocked_env_var("LD_LIBRARY_PATH"));
        assert!(is_blocked_env_var("LD_AUDIT"));
        assert!(is_blocked_env_var("DYLD_INSERT_LIBRARIES"));
        assert!(is_blocked_env_var("DYLD_LIBRARY_PATH"));
        assert!(is_blocked_env_var("DYLD_FRAMEWORK_PATH"));
    }

    #[test]
    fn case_insensitive_match() {
        assert!(is_blocked_env_var("ld_preload"));
        assert!(is_blocked_env_var("Ld_PreLoad"));
        assert!(is_blocked_env_var("path"));
    }

    #[test]
    fn blocks_node_python_ruby_perl_jvm_options() {
        assert!(is_blocked_env_var("NODE_OPTIONS"));
        assert!(is_blocked_env_var("NODE_EXTRA_CA_CERTS"));
        assert!(is_blocked_env_var("ELECTRON_RUN_AS_NODE"));
        assert!(is_blocked_env_var("PYTHONPATH"));
        assert!(is_blocked_env_var("PYTHONSTARTUP"));
        assert!(is_blocked_env_var("RUBYOPT"));
        assert!(is_blocked_env_var("PERL5OPT"));
        assert!(is_blocked_env_var("JAVA_TOOL_OPTIONS"));
        assert!(is_blocked_env_var("_JAVA_OPTIONS"));
    }

    #[test]
    fn blocks_shell_startup_and_behavior_vars() {
        assert!(is_blocked_env_var("BASH_ENV"));
        assert!(is_blocked_env_var("ENV"));
        assert!(is_blocked_env_var("ZDOTDIR"));
        assert!(is_blocked_env_var("PROMPT_COMMAND"));
        assert!(is_blocked_env_var("CDPATH"));
        assert!(is_blocked_env_var("IFS"));
    }

    #[test]
    fn blocks_identity_spoofing_vars() {
        assert!(is_blocked_env_var("PATH"));
        assert!(is_blocked_env_var("HOME"));
        assert!(is_blocked_env_var("SHELL"));
        assert!(is_blocked_env_var("USER"));
        assert!(is_blocked_env_var("LOGNAME"));
    }

    #[test]
    fn blocks_bash_func_prefix_pattern() {
        assert!(is_blocked_env_var("BASH_FUNC_evil%%"));
        assert!(is_blocked_env_var("BASH_FUNC_x"));
        assert!(is_blocked_env_var("bash_func_lower"));
        // Exact match BASH_FUNC_ with empty suffix
        assert!(is_blocked_env_var("BASH_FUNC_"));
    }

    #[test]
    fn allows_safe_user_supplied_vars() {
        assert!(!is_blocked_env_var("MY_API_KEY"));
        assert!(!is_blocked_env_var("PROJECT_ID"));
        assert!(!is_blocked_env_var("WORK_DIR"));
        assert!(!is_blocked_env_var("DEBUG_LEVEL"));
        assert!(!is_blocked_env_var("ANTHROPIC_API_KEY"));
        assert!(!is_blocked_env_var("OPENAI_API_KEY"));
    }

    #[test]
    fn filter_removes_blocked_preserves_safe() {
        let mut input = HashMap::new();
        input.insert("LD_PRELOAD".to_string(), "/tmp/evil.so".to_string());
        input.insert("MY_API_KEY".to_string(), "secret".to_string());
        input.insert("BASH_FUNC_x".to_string(), "() { id; }".to_string());
        input.insert("NODE_OPTIONS".to_string(), "--inspect".to_string());

        let out = filter_blocked_env_vars(Some(input)).expect("Some in -> Some out");
        assert!(!out.contains_key("LD_PRELOAD"));
        assert!(!out.contains_key("BASH_FUNC_x"));
        assert!(!out.contains_key("NODE_OPTIONS"));
        assert_eq!(out.get("MY_API_KEY").map(|s| s.as_str()), Some("secret"));
    }

    #[test]
    fn filter_passes_through_none() {
        assert!(filter_blocked_env_vars(None).is_none());
    }

    /// Regression guard: ensure the centralized list is a strict superset of
    /// every prior duplicate by spot-checking known-was-only-in-X entries.
    #[test]
    fn covers_union_of_prior_duplicate_lists() {
        // Was only in transport.rs:
        assert!(is_blocked_env_var("LD_AUDIT"));
        assert!(is_blocked_env_var("NODE_EXTRA_CA_CERTS"));
        assert!(is_blocked_env_var("NODE_DEBUG"));
        assert!(is_blocked_env_var("ELECTRON_RUN_AS_NODE"));
        assert!(is_blocked_env_var("JAVA_TOOL_OPTIONS"));
        assert!(is_blocked_env_var("_JAVA_OPTIONS"));
        assert!(is_blocked_env_var("ZDOTDIR"));
        assert!(is_blocked_env_var("RUST_LOG"));
        // Was only in sandbox.rs:
        assert!(is_blocked_env_var("TMPDIR"));
        assert!(is_blocked_env_var("TEMP"));
        assert!(is_blocked_env_var("TMP"));
        assert!(is_blocked_env_var("PYTHONHOME"));
        assert!(is_blocked_env_var("NODE_PATH"));
        assert!(is_blocked_env_var("RUBYLIB"));
        assert!(is_blocked_env_var("PERL5LIB"));
        assert!(is_blocked_env_var("PERLLIB"));
        assert!(is_blocked_env_var("CDPATH"));
        assert!(is_blocked_env_var("GLOBIGNORE"));
        assert!(is_blocked_env_var("PROMPT_COMMAND"));
        assert!(is_blocked_env_var("PS1"));
        assert!(is_blocked_env_var("PS2"));
        assert!(is_blocked_env_var("PS4"));
        assert!(is_blocked_env_var("IFS"));
        // Was only in code_execution.rs:
        assert!(is_blocked_env_var("USER"));
        assert!(is_blocked_env_var("LOGNAME"));
        assert!(is_blocked_env_var("SHELL"));
    }
}
