pub mod config;
pub mod executor;
pub mod lifecycle;
pub mod types;

pub use config::HookConfig;
pub use executor::HookExecutor;
pub use types::{EventContext, Hook, HookEvent, HookEventType, HookExecutionResult};

use anyhow::Result;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Notify, RwLock};

const REGISTRY_WAIT: Duration = Duration::from_secs(10);
const HOOKS_NOT_LOADED: &str =
    "Hooks could not be loaded, so tools and messages are held. Restart the app.";
const HOOKS_STILL_LOADING: &str =
    "Hooks are still loading, so this was held. Try again in a moment.";

pub struct HookRegistry {
    executor: Arc<HookExecutor>,
    config_path: PathBuf,
    /// Set while hooks.yaml holds guards nobody has approved and there is no
    /// approved set to run in their place: the gated actions are refused
    /// with this message rather than let through unguarded.
    gate_refusal: RwLock<Option<String>>,
}

impl HookRegistry {
    pub fn new() -> Result<Self> {
        Ok(Self::with_config_path(HookConfig::default_config_path()?))
    }

    pub(crate) fn with_config_path(config_path: PathBuf) -> Self {
        Self {
            executor: Arc::new(HookExecutor::new()),
            config_path,
            gate_refusal: RwLock::new(None),
        }
    }

    pub async fn set_gate_refusal(&self, refusal: Option<String>) {
        *self.gate_refusal.write().await = refusal;
    }

    pub async fn gate_refusal(&self) -> Option<String> {
        self.gate_refusal.read().await.clone()
    }

    /// Runs the hooks of a gating event to completion, each within its own
    /// timeout, and returns why the action is refused, or `None` to proceed.
    pub async fn gate(&self, event: HookEvent) -> Option<String> {
        if let Some(refusal) = self.gate_refusal().await {
            return Some(refusal);
        }
        blocked_reason(&self.executor.execute_hooks(event).await)
    }

    pub fn emit_event(&self, event: HookEvent) {
        let executor = self.executor.clone();
        tokio::spawn(async move {
            let results = executor.execute_hooks(event).await;
            for result in results {
                if !result.success {
                    tracing::warn!("Hook '{}' failed: {:?}", result.hook_name, result.error);
                }
            }
        });
    }

    pub async fn emit_event_sync(&self, event: HookEvent) -> Vec<HookExecutionResult> {
        self.executor.execute_hooks(event).await
    }

    pub async fn list_hooks(&self) -> Vec<Hook> {
        self.executor.list_hooks().await
    }

    /// Writes `hooks` to hooks.yaml and returns the text written. The file
    /// is rebuilt from the hooks given, never merged with what is on disk,
    /// so a hook added to the file behind the app's back cannot ride along
    /// with a change the user made in Settings.
    fn save(&self, hooks: &[Hook]) -> Result<String> {
        HookConfig {
            hooks: hooks.to_vec(),
        }
        .save_to_file(&self.config_path)
    }

    /// Makes `edit` if the armed hooks are still `basis`, the set the
    /// user's decision was made against, and refuses otherwise: a yes given
    /// to one set must not be spent on another.
    ///
    /// The change is written first and armed second, so when the write fails
    /// the error comes back and what was armed stays armed. `approved` is
    /// handed the text written while the armed set is still locked, so the
    /// approval on record is always the one for the file on disk: recorded
    /// after the lock, two changes could store their texts in the wrong
    /// order and re-arm at the next launch a hook that was removed.
    pub async fn apply<A>(&self, basis: &[Hook], edit: &HookEdit, approved: A) -> Result<String>
    where
        A: FnOnce(&str),
    {
        self.executor
            .commit(
                |armed| {
                    unchanged_since_decided(armed, basis)?;
                    edit.applied_to(armed)
                },
                |next| {
                    let yaml = self.save(next)?;
                    approved(&yaml);
                    Ok(yaml)
                },
            )
            .await
    }

    /// Arms the hooks hooks.yaml holds, which the user has just approved,
    /// under the same two rules as [`Self::apply`]. Nothing is written: the
    /// file is where these came from.
    pub async fn arm_file<A>(&self, basis: &[Hook], hooks: Vec<Hook>, approved: A) -> Result<()>
    where
        A: FnOnce(),
    {
        self.executor
            .commit(
                |armed| {
                    unchanged_since_decided(armed, basis)?;
                    Ok(hooks)
                },
                |_| {
                    approved();
                    Ok(())
                },
            )
            .await
    }

    pub fn executor(&self) -> Arc<HookExecutor> {
        self.executor.clone()
    }
}

impl Default for HookRegistry {
    fn default() -> Self {
        Self::new().unwrap_or_else(|e| {
            tracing::warn!(
                "Failed to create hook registry with default path: {}. Using fallback.",
                e
            );
            // Fallback: use a temp directory path that may not persist across sessions,
            // but allows the registry to function without panicking
            Self::with_config_path(std::env::temp_dir().join("agiworkforce-hooks.yaml"))
        })
    }
}

/// Settings is never given the values of a hook's environment, so an edit
/// from it cannot carry them: the armed hook's are kept.
fn with_armed_environment(mut hook: Hook, armed: &[Hook]) -> Hook {
    if let Some(held) = armed.iter().find(|held| held.name == hook.name) {
        hook.env = held.env.clone();
    }
    hook
}

pub const CHANGED_WHILE_DECIDING: &str =
    "The hooks changed while you were deciding, so nothing was changed. Look at them again and retry.";

fn unchanged_since_decided(armed: &[Hook], basis: &[Hook]) -> Result<()> {
    if armed == basis {
        Ok(())
    } else {
        Err(anyhow::anyhow!(CHANGED_WHILE_DECIDING))
    }
}

/// A change to the armed hooks, as Settings asks for it.
#[derive(Debug, Clone)]
pub enum HookEdit {
    Add(Hook),
    Remove(String),
    Toggle { name: String, enabled: bool },
    Update(Hook),
    Replace(Vec<Hook>),
}

impl HookEdit {
    /// The hooks that would be armed after this change, or why it cannot be
    /// made. The user is asked about exactly this set, and it is exactly
    /// what gets armed.
    pub fn applied_to(&self, armed: &[Hook]) -> Result<Vec<Hook>> {
        match self {
            Self::Add(hook) => executor::with_added(armed, hook.clone()),
            Self::Remove(name) => executor::without(armed, name),
            Self::Toggle { name, enabled } => executor::with_toggled(armed, name, *enabled),
            Self::Update(hook) => {
                executor::with_updated(armed, with_armed_environment(hook.clone(), armed))
            }
            Self::Replace(hooks) => Ok(hooks.clone()),
        }
    }
}

pub struct GlobalHookRegistry {
    registry: RwLock<Option<Arc<HookRegistry>>>,
    loading: AtomicBool,
    load_failed: AtomicBool,
    loaded: Notify,
}

impl Default for GlobalHookRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl GlobalHookRegistry {
    pub const fn new() -> Self {
        Self {
            registry: RwLock::const_new(None),
            loading: AtomicBool::new(false),
            load_failed: AtomicBool::new(false),
            loaded: Notify::const_new(),
        }
    }

    /// Said before the launch task that builds the registry is spawned, so a
    /// tool or prompt that arrives first waits for it.
    pub fn loading_started(&self) {
        self.loading.store(true, Ordering::SeqCst);
    }

    /// Said when that task ends with no registry to show for it.
    pub fn loading_failed(&self) {
        self.load_failed.store(true, Ordering::SeqCst);
        self.loading.store(false, Ordering::SeqCst);
        self.loaded.notify_waiters();
    }

    pub async fn set(&self, registry: Arc<HookRegistry>) {
        *self.registry.write().await = Some(registry);
        self.loading.store(false, Ordering::SeqCst);
        self.loaded.notify_waiters();
    }

    /// The registry a gating event is judged by. A launch that has set out
    /// to build one is waited for, for as long as `patience`, so nothing
    /// passes ungated in the moment before it exists; a launch that built
    /// none, or has not finished in time, refuses. `Ok(None)` is left for a
    /// process in which no launch ever started, such as a unit test.
    pub async fn for_gate(
        &self,
        patience: Duration,
    ) -> std::result::Result<Option<Arc<HookRegistry>>, String> {
        let waited = tokio::time::timeout(patience, async {
            loop {
                let loaded = self.loaded.notified();
                tokio::pin!(loaded);
                loaded.as_mut().enable();
                if let Some(registry) = self.get().await {
                    return Some(registry);
                }
                if !self.loading.load(Ordering::SeqCst) {
                    return None;
                }
                loaded.await;
            }
        })
        .await;

        match waited {
            Ok(Some(registry)) => Ok(Some(registry)),
            Ok(None) if self.load_failed.load(Ordering::SeqCst) => {
                Err(HOOKS_NOT_LOADED.to_string())
            }
            Ok(None) => Ok(None),
            Err(_) => Err(HOOKS_STILL_LOADING.to_string()),
        }
    }

    pub async fn get(&self) -> Option<Arc<HookRegistry>> {
        self.registry.read().await.clone()
    }

    pub async fn emit(&self, event: HookEvent) {
        if let Some(registry) = self.get().await {
            registry.emit_event(event);
        }
    }

    pub async fn emit_sync(&self, event: HookEvent) -> Vec<HookExecutionResult> {
        if let Some(registry) = self.get().await {
            registry.emit_event_sync(event).await
        } else {
            Vec::new()
        }
    }
}

static GLOBAL_HOOKS: GlobalHookRegistry = GlobalHookRegistry::new();

pub fn global_hooks() -> &'static GlobalHookRegistry {
    &GLOBAL_HOOKS
}

pub async fn emit_event(event: HookEvent) {
    GLOBAL_HOOKS.emit(event).await;
}

pub async fn emit_event_sync(event: HookEvent) -> Vec<HookExecutionResult> {
    GLOBAL_HOOKS.emit_sync(event).await
}

fn blocked_reason(results: &[HookExecutionResult]) -> Option<String> {
    let reasons: Vec<&str> = results
        .iter()
        .filter(|result| result.blocked)
        .map(|result| {
            result
                .block_reason
                .as_deref()
                .unwrap_or("a hook blocked the action")
        })
        .collect();
    (!reasons.is_empty()).then(|| reasons.join("; "))
}

pub async fn gating_registry() -> std::result::Result<Option<Arc<HookRegistry>>, String> {
    GLOBAL_HOOKS.for_gate(REGISTRY_WAIT).await
}

/// `PreToolUse` and `UserPromptSubmit` go through here; every other event is
/// fired and not waited for.
pub async fn gate_event(event: HookEvent) -> Option<String> {
    match gating_registry().await {
        Ok(Some(registry)) => registry.gate(event).await,
        Ok(None) => None,
        Err(refusal) => Some(refusal),
    }
}

/// The `PreToolUse` gate for a tool or shell command that runs outside the
/// two model tool loops. `Err` carries the refusal to show or return.
pub async fn gate_tool_use(
    tool_name: &str,
    parameters: std::collections::HashMap<String, serde_json::Value>,
) -> std::result::Result<(), String> {
    let call_id = uuid::Uuid::new_v4().to_string();
    match gate_event(HookEvent::pre_tool_use(
        call_id.clone(),
        tool_name.to_string(),
        call_id,
        parameters,
    ))
    .await
    {
        Some(reason) => Err(format!("A PreToolUse hook blocked this tool: {reason}")),
        None => Ok(()),
    }
}

pub const PROMPT_REFUSAL_PREFIX: &str = "A hook blocked this message: ";

/// What the person who wrote a refused prompt is shown.
pub fn prompt_refusal(reason: &str) -> String {
    format!("{PROMPT_REFUSAL_PREFIX}{reason}")
}

/// The `UserPromptSubmit` gate for text a person wrote that reaches a model
/// outside chat. `source` names where it came from; see
/// [`lifecycle::standalone_prompt_submitted`].
pub async fn gate_user_prompt(source: &str, prompt: &str) -> std::result::Result<(), String> {
    match lifecycle::standalone_prompt_submitted(source, prompt).await {
        Some(reason) => Err(prompt_refusal(&reason)),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_refused_prompt_is_told_to_its_writer_with_the_reason_the_hook_gave() {
        assert_eq!(
            prompt_refusal("no secrets in prompts"),
            "A hook blocked this message: no secrets in prompts"
        );
    }

    fn result(blocked: bool, reason: Option<&str>) -> HookExecutionResult {
        HookExecutionResult {
            hook_name: "guard".to_string(),
            event_type: HookEventType::PreToolUse,
            success: !blocked,
            exit_code: Some(if blocked { 2 } else { 0 }),
            stdout: String::new(),
            stderr: String::new(),
            execution_time_ms: 1,
            error: None,
            blocked,
            block_reason: reason.map(str::to_string),
        }
    }

    /// Makes a change against the hooks armed right now, with nobody to
    /// tell about the text written.
    async fn apply_now(registry: &HookRegistry, edit: HookEdit) -> Result<String> {
        let basis = registry.list_hooks().await;
        registry.apply(&basis, &edit, |_| {}).await
    }

    fn hook(name: &str, command: &str) -> Hook {
        Hook {
            name: name.to_string(),
            events: vec![HookEventType::PreToolUse],
            priority: 50,
            command: command.to_string(),
            enabled: true,
            timeout_secs: 30,
            env: std::collections::HashMap::new(),
            working_dir: None,
            continue_on_error: true,
        }
    }

    #[test]
    fn no_hook_and_no_refusal_both_let_the_action_proceed() {
        assert_eq!(blocked_reason(&[]), None);
        assert_eq!(blocked_reason(&[result(false, None)]), None);
    }

    #[test]
    fn every_refusal_reaches_the_model() {
        let reason = blocked_reason(&[
            result(true, Some("no writes to main")),
            result(false, None),
            result(true, None),
        ]);
        assert_eq!(
            reason.as_deref(),
            Some("no writes to main; a hook blocked the action")
        );
    }

    #[tokio::test]
    async fn a_registry_told_to_refuse_refuses_every_gated_action_without_running_a_hook() {
        let registry = HookRegistry::with_config_path(std::env::temp_dir().join("unused.yaml"));
        let event = || {
            HookEvent::pre_tool_use(
                "s".to_string(),
                "file_write".to_string(),
                "c".to_string(),
                std::collections::HashMap::new(),
            )
        };
        assert_eq!(registry.gate(event()).await, None);

        registry
            .set_gate_refusal(Some("Hooks are waiting for your approval".to_string()))
            .await;
        assert_eq!(
            registry.gate(event()).await.as_deref(),
            Some("Hooks are waiting for your approval")
        );

        registry.set_gate_refusal(None).await;
        assert_eq!(registry.gate(event()).await, None);
    }

    fn unused_registry() -> Arc<HookRegistry> {
        Arc::new(HookRegistry::with_config_path(
            std::env::temp_dir().join("unused.yaml"),
        ))
    }

    #[tokio::test]
    async fn a_gate_reached_before_the_launch_registry_exists_waits_for_it() {
        let global = Arc::new(GlobalHookRegistry::new());
        global.loading_started();

        let waiter = {
            let global = global.clone();
            tokio::spawn(async move { global.for_gate(Duration::from_secs(30)).await })
        };
        tokio::task::yield_now().await;
        assert!(
            !waiter.is_finished(),
            "nothing may pass while the registry is still being built"
        );

        global.set(unused_registry()).await;

        assert!(matches!(waiter.await.unwrap(), Ok(Some(_))));
    }

    #[tokio::test]
    async fn a_launch_that_built_no_registry_refuses_the_gated_actions() {
        let global = GlobalHookRegistry::new();
        global.loading_started();
        global.loading_failed();

        let refusal = global.for_gate(Duration::from_secs(30)).await.err();

        assert_eq!(refusal.as_deref(), Some(HOOKS_NOT_LOADED));
    }

    #[tokio::test]
    async fn a_registry_that_takes_too_long_refuses_rather_than_lets_through() {
        let global = GlobalHookRegistry::new();
        global.loading_started();

        let refusal = global.for_gate(Duration::from_millis(20)).await.err();

        assert_eq!(refusal.as_deref(), Some(HOOKS_STILL_LOADING));
    }

    #[tokio::test]
    async fn where_no_launch_ever_started_there_is_nothing_to_wait_for() {
        let global = GlobalHookRegistry::new();

        assert!(matches!(
            global.for_gate(Duration::from_secs(30)).await,
            Ok(None)
        ));
    }

    #[tokio::test]
    async fn a_registry_built_later_from_settings_ends_the_refusal() {
        let global = GlobalHookRegistry::new();
        global.loading_started();
        global.loading_failed();

        global.set(unused_registry()).await;

        assert!(matches!(
            global.for_gate(Duration::from_secs(30)).await,
            Ok(Some(_))
        ));
    }

    #[tokio::test]
    async fn the_file_is_rebuilt_from_the_armed_hooks_not_merged_with_the_disk() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("hooks.yaml");
        std::fs::write(
            &path,
            "hooks:\n  - name: planted\n    events: [PreToolUse]\n    command: echo planted\n",
        )
        .unwrap();
        let registry = HookRegistry::with_config_path(path.clone());

        let written = apply_now(&registry, HookEdit::Add(hook("mine", "echo mine")))
            .await
            .unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), written);
        let on_disk = HookConfig::from_yaml(&written).unwrap();
        assert_eq!(
            on_disk
                .hooks
                .iter()
                .map(|hook| hook.name.as_str())
                .collect::<Vec<_>>(),
            vec!["mine"]
        );
    }

    #[tokio::test]
    async fn an_update_that_is_refused_leaves_the_old_guard_armed() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("hooks.yaml");
        let registry = HookRegistry::with_config_path(path.clone());
        let written = apply_now(&registry, HookEdit::Add(hook("guard", "check-branch")))
            .await
            .unwrap();

        let refused = apply_now(&registry, HookEdit::Update(hook("guard", "rm -rf /"))).await;
        let unknown = apply_now(&registry, HookEdit::Update(hook("absent", "true"))).await;

        assert!(refused.is_err(), "the pattern check must refuse the update");
        assert!(unknown.is_err());
        let armed = registry.list_hooks().await;
        assert_eq!(armed.len(), 1);
        assert_eq!(armed[0].command, "check-branch");
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            written,
            "a refused update must not rewrite hooks.yaml"
        );
    }

    fn unwritable(folder: &tempfile::TempDir) -> HookRegistry {
        let in_the_way = folder.path().join("not-a-folder");
        std::fs::write(&in_the_way, "a file where the folder should be").unwrap();
        HookRegistry::with_config_path(in_the_way.join("hooks.yaml"))
    }

    #[tokio::test]
    async fn a_change_that_cannot_be_written_leaves_what_is_armed_untouched() {
        let folder = tempfile::tempdir().unwrap();
        let registry = unwritable(&folder);
        let mut second = hook("second", "echo second");
        second.enabled = false;
        registry
            .executor()
            .load_hooks(vec![hook("guard", "check-branch"), second])
            .await;
        let before = serde_json::to_value(registry.list_hooks().await).unwrap();

        let failures = [
            apply_now(&registry, HookEdit::Add(hook("new", "echo new")))
                .await
                .is_err(),
            apply_now(&registry, HookEdit::Remove("guard".to_string()))
                .await
                .is_err(),
            apply_now(
                &registry,
                HookEdit::Toggle {
                    name: "guard".to_string(),
                    enabled: false,
                },
            )
            .await
            .is_err(),
            apply_now(
                &registry,
                HookEdit::Toggle {
                    name: "second".to_string(),
                    enabled: true,
                },
            )
            .await
            .is_err(),
            apply_now(&registry, HookEdit::Update(hook("guard", "true")))
                .await
                .is_err(),
            apply_now(&registry, HookEdit::Replace(Vec::new()))
                .await
                .is_err(),
        ];

        assert_eq!(failures, [true; 6], "every write must have failed");
        assert_eq!(
            serde_json::to_value(registry.list_hooks().await).unwrap(),
            before,
            "a guard must not be removed, switched off or rewritten in memory by a change that never reached hooks.yaml"
        );
    }

    #[tokio::test]
    async fn the_file_is_replaced_whole_and_no_temporary_file_is_left_behind() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("hooks.yaml");
        std::fs::write(&path, "hooks: []\n").unwrap();
        let registry = HookRegistry::with_config_path(path.clone());

        let written = apply_now(&registry, HookEdit::Add(hook("a", "echo a")))
            .await
            .unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), written);
        let left: Vec<String> = std::fs::read_dir(folder.path())
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(left, vec!["hooks.yaml"]);
    }

    #[tokio::test]
    async fn a_yes_given_to_one_set_of_hooks_is_not_spent_on_another() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("hooks.yaml");
        let registry = HookRegistry::with_config_path(path.clone());
        apply_now(&registry, HookEdit::Add(hook("guard", "check-branch")))
            .await
            .unwrap();
        let decided_against = registry.list_hooks().await;
        let written = apply_now(&registry, HookEdit::Add(hook("later", "echo later")))
            .await
            .unwrap();

        let told = std::cell::Cell::new(false);
        let stale = registry
            .apply(
                &decided_against,
                &HookEdit::Remove("guard".to_string()),
                |_| told.set(true),
            )
            .await
            .expect_err("the armed set is no longer the one the dialog described");
        let stale_file = registry
            .arm_file(&decided_against, Vec::new(), || told.set(true))
            .await
            .expect_err("nor is it for a reload");

        assert_eq!(stale.to_string(), CHANGED_WHILE_DECIDING);
        assert_eq!(stale_file.to_string(), CHANGED_WHILE_DECIDING);
        assert!(!told.get(), "nothing was approved, so nothing is recorded");
        assert_eq!(registry.list_hooks().await.len(), 2);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), written);
    }

    /// The approval is recorded while the armed set is still locked, so of
    /// two changes the one that armed last is also the one recorded last.
    #[tokio::test]
    async fn the_approval_on_record_is_always_the_one_for_the_file_on_disk() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("hooks.yaml");
        let registry = Arc::new(HookRegistry::with_config_path(path.clone()));
        let recorded = Arc::new(std::sync::Mutex::new(String::new()));

        let mut changes = Vec::new();
        for index in 0..24 {
            let registry = registry.clone();
            let recorded = recorded.clone();
            changes.push(tokio::spawn(async move {
                loop {
                    let basis = registry.list_hooks().await;
                    let edit = HookEdit::Add(hook(&format!("hook-{index}"), "true"));
                    let made = registry
                        .apply(&basis, &edit, |yaml| {
                            *recorded.lock().unwrap() = yaml.to_string();
                        })
                        .await;
                    match made {
                        Ok(_) => break,
                        Err(error) => assert_eq!(error.to_string(), CHANGED_WHILE_DECIDING),
                    }
                }
            }));
        }
        for change in changes {
            change.await.unwrap();
        }

        let on_disk = std::fs::read_to_string(&path).unwrap();
        assert_eq!(*recorded.lock().unwrap(), on_disk);
        assert_eq!(HookConfig::from_yaml(&on_disk).unwrap().hooks.len(), 24);
        assert_eq!(registry.list_hooks().await.len(), 24);
    }

    #[tokio::test]
    async fn an_update_swaps_the_hook_in_place_and_keeps_the_others() {
        let folder = tempfile::tempdir().unwrap();
        let registry = HookRegistry::with_config_path(folder.path().join("hooks.yaml"));
        apply_now(&registry, HookEdit::Add(hook("a", "echo a")))
            .await
            .unwrap();
        apply_now(&registry, HookEdit::Add(hook("b", "echo b")))
            .await
            .unwrap();

        apply_now(&registry, HookEdit::Update(hook("a", "echo changed")))
            .await
            .unwrap();

        let mut commands: Vec<String> = registry
            .list_hooks()
            .await
            .into_iter()
            .map(|hook| hook.command)
            .collect();
        commands.sort();
        assert_eq!(commands, vec!["echo b", "echo changed"]);
    }

    #[tokio::test]
    async fn an_edit_from_settings_keeps_the_environment_the_armed_hook_has() {
        let folder = tempfile::tempdir().unwrap();
        let registry = HookRegistry::with_config_path(folder.path().join("hooks.yaml"));
        let mut armed = hook("a", "echo a");
        armed
            .env
            .insert("API_TOKEN".to_string(), "kept".to_string());
        apply_now(&registry, HookEdit::Add(armed)).await.unwrap();

        let mut edited = hook("a", "echo changed");
        edited
            .env
            .insert("API_TOKEN".to_string(), "from the page".to_string());
        apply_now(&registry, HookEdit::Update(edited))
            .await
            .unwrap();

        let hooks = registry.list_hooks().await;
        assert_eq!(hooks[0].command, "echo changed");
        assert_eq!(
            hooks[0].env.get("API_TOKEN").map(String::as_str),
            Some("kept")
        );
    }

    #[tokio::test]
    async fn each_change_returns_the_text_now_on_disk() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("hooks.yaml");
        let registry = HookRegistry::with_config_path(path.clone());

        apply_now(&registry, HookEdit::Add(hook("a", "echo a")))
            .await
            .unwrap();
        let toggled = apply_now(
            &registry,
            HookEdit::Toggle {
                name: "a".to_string(),
                enabled: false,
            },
        )
        .await
        .unwrap();
        assert!(!HookConfig::from_yaml(&toggled).unwrap().hooks[0].enabled);

        let updated = apply_now(&registry, HookEdit::Update(hook("a", "echo b")))
            .await
            .unwrap();
        assert_eq!(
            HookConfig::from_yaml(&updated).unwrap().hooks[0].command,
            "echo b"
        );

        let removed = apply_now(&registry, HookEdit::Remove("a".to_string()))
            .await
            .unwrap();
        assert!(HookConfig::from_yaml(&removed).unwrap().hooks.is_empty());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), removed);

        let replaced = apply_now(&registry, HookEdit::Replace(vec![hook("c", "echo c")]))
            .await
            .unwrap();
        assert_eq!(HookConfig::from_yaml(&replaced).unwrap().hooks[0].name, "c");
    }
}
