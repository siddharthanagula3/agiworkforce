use crate::sys::commands::settings::{persist_settings_snapshot, SettingsState};
use crate::sys::native_confirm::NativeConfirm;
use once_cell::sync::OnceCell;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

/// A capability the person can turn off in Settings, Capabilities.
pub struct CapabilityDefinition {
    pub name: &'static str,
    pub label: &'static str,
    /// What the assistant does with it, then what stops while it is off.
    pub description: &'static str,
    /// Whether its tools can change this computer or send something out of
    /// it. These are the ones held off when the saved switches cannot be read.
    pub acts: bool,
}

/// A capability with no saved choice is on.
pub const CAPABILITY_DEFAULT_ENABLED: bool = true;

/// Every capability toggle, in the order Settings shows them. This is the one
/// list: `tool_switch` may only name a capability that is here, the settings
/// tab renders from `list_capabilities`, and a test holds both.
pub static CAPABILITIES: [CapabilityDefinition; 9] = [
    CapabilityDefinition {
        name: "fileOperations",
        label: "Files",
        description: "Read, search, write, edit and delete files in the folders you allow, and undo its own edits. Off: its file tools are withheld.",
        acts: true,
    },
    CapabilityDefinition {
        name: "documentCreation",
        label: "Documents",
        description: "Read, search and create PDF, Word and Excel documents. Off: its document tools are withheld.",
        acts: true,
    },
    CapabilityDefinition {
        name: "terminalAccess",
        label: "Terminal",
        description: "Run shell commands and project tests, asking before each one. Off: its terminal and test tools are withheld.",
        acts: true,
    },
    CapabilityDefinition {
        name: "codeExecution",
        label: "Code execution",
        description: "Run code it writes inside a sandbox with no network access. Off: the sandboxed code runner is withheld.",
        acts: true,
    },
    CapabilityDefinition {
        name: "gitIntegration",
        label: "Git",
        description: "Run git commands, manage worktrees and create GitHub repositories. Off: its git and worktree tools are withheld.",
        acts: true,
    },
    CapabilityDefinition {
        name: "webSearch",
        label: "Web search and web requests",
        description: "Search the web, fetch pages and call web APIs. Off: its web search and web request tools are withheld.",
        acts: true,
    },
    CapabilityDefinition {
        name: "browserAutomation",
        label: "Browser",
        description: "Open pages, click, type and read content in the browser it controls. Off: its browser tools are withheld.",
        acts: true,
    },
    CapabilityDefinition {
        name: "computerUse",
        label: "Computer control",
        description: "Click, type, scroll and switch windows in apps on this computer. Off: its mouse, keyboard and window tools are withheld.",
        acts: true,
    },
    CapabilityDefinition {
        name: "screenshotOcr",
        label: "Screenshots and text recognition",
        description: "Capture the screen and read text out of images. Off: its screenshot and text recognition tools are withheld; Computer control still looks at the screen while it works.",
        acts: false,
    },
];

/// The name people see for a capability, or the key itself for one this build
/// does not know.
pub fn capability_label(name: &str) -> &str {
    CAPABILITIES
        .iter()
        .find(|capability| capability.name == name)
        .map_or(name, |capability| capability.label)
}

/// What the settings file said about the capability switches when the app
/// started.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SavedSwitches {
    /// No settings file yet: every capability is at its default.
    Defaults,
    Saved(HashMap<String, bool>),
    /// The file is there and the switches in it cannot be read.
    Unreadable(String),
}

const SWITCHES_KEY: &str = "featureFlags";

/// The switches in a settings document, read on their own so they can still
/// be honoured when the rest of the document does not parse.
pub(crate) fn saved_switches_from_json(json: &str) -> SavedSwitches {
    let document: serde_json::Value = match serde_json::from_str(json) {
        Ok(document) => document,
        Err(error) => return SavedSwitches::Unreadable(format!("the settings file: {error}")),
    };
    match document.get(SWITCHES_KEY) {
        None | Some(serde_json::Value::Null) => SavedSwitches::Saved(HashMap::new()),
        Some(switches) => match serde_json::from_value(switches.clone()) {
            Ok(switches) => SavedSwitches::Saved(switches),
            Err(error) => SavedSwitches::Unreadable(format!("the saved switches: {error}")),
        },
    }
}

#[derive(Default)]
struct Switches {
    values: HashMap<String, bool>,
    /// Capabilities kept off because the saved switches could not be read.
    /// Only the person's own choice for one releases it. Each is also
    /// recorded as off in the settings the app holds, so the file that
    /// replaces the unreadable one says off and the next launch starts off.
    held_off: HashSet<&'static str>,
}

impl Switches {
    fn refusal(&self, capability: &str) -> Option<String> {
        if self.is_enabled(capability) {
            return None;
        }
        let label = capability_label(capability);
        Some(if self.held_off.contains(capability) {
            format!(
                "{label} is off because the saved tool switches could not be read when the app started. Turn it on in Settings, Capabilities to use this tool."
            )
        } else {
            format!(
                "{label} is turned off in Settings, Capabilities. Turn it on there to use this tool."
            )
        })
    }

    fn is_enabled(&self, capability: &str) -> bool {
        !self.held_off.contains(capability)
            && self
                .values
                .get(capability)
                .copied()
                .unwrap_or(CAPABILITY_DEFAULT_ENABLED)
    }
}

/// The capability switches the backend enforces. A capability with no saved
/// choice is on.
#[derive(Clone)]
pub struct CapabilityState {
    inner: Arc<RwLock<Switches>>,
}

impl CapabilityState {
    pub fn new() -> Self {
        Self::from_saved(SavedSwitches::Defaults)
    }

    /// The state the app starts in. Saved switches are enforced as saved. When
    /// they cannot be read, every capability that acts is held off rather than
    /// left on: a person who turned the terminal off must not find it on again
    /// because a file was damaged.
    pub fn from_saved(saved: SavedSwitches) -> Self {
        let switches = match saved {
            SavedSwitches::Defaults => Switches::default(),
            SavedSwitches::Saved(values) => Switches {
                values,
                held_off: HashSet::new(),
            },
            SavedSwitches::Unreadable(reason) => {
                tracing::error!(
                    "[Capabilities] The saved switches could not be read ({reason}). Tools that act on this computer are off until they are turned on in Settings, Capabilities."
                );
                Switches {
                    values: held_switch_values(),
                    held_off: acting_capabilities().collect(),
                }
            }
        };
        Self {
            inner: Arc::new(RwLock::new(switches)),
        }
    }

    pub async fn is_enabled(&self, capability: &str) -> bool {
        self.inner.read().await.is_enabled(capability)
    }

    /// Why a tool under `capability` is refused, or `None` when it may run.
    pub async fn refusal(&self, capability: &str) -> Option<String> {
        self.inner.read().await.refusal(capability)
    }

    /// The one question every path that runs or offers a tool asks: a chat
    /// turn, a goal run, an agent task, the tool list a model is shown. `None`
    /// lets the tool through; a tool no capability governs is never refused.
    pub async fn tool_refusal(&self, tool_name: &str) -> Option<String> {
        self.refusal(tool_to_capability(tool_name)?).await
    }

    /// [`Self::tool_refusal`] for a caller that cannot wait, such as the
    /// unattended approval gate. The lock is held only for a map read or
    /// write, so a miss means a switch is being changed at this instant; the
    /// tool is refused rather than run unchecked.
    pub fn tool_refusal_now(&self, tool_name: &str) -> Option<String> {
        let capability = tool_to_capability(tool_name)?;
        match self.inner.try_read() {
            Ok(switches) => switches.refusal(capability),
            Err(_) => Some(format!(
                "{} is being changed in Settings, Capabilities right now. Try again.",
                capability_label(capability)
            )),
        }
    }

    /// The person's own choice for one capability. This is the only way a
    /// switch changes after the app has started, and the only release of a
    /// held one.
    async fn set(&self, capability: &str, enabled: bool) {
        let mut switches = self.inner.write().await;
        switches.held_off.remove(capability);
        switches.values.insert(capability.to_string(), enabled);
    }

    async fn held_off(&self) -> HashSet<&'static str> {
        self.inner.read().await.held_off.clone()
    }
}

impl Default for CapabilityState {
    fn default() -> Self {
        Self::new()
    }
}

fn acting_capabilities() -> impl Iterator<Item = &'static str> {
    CAPABILITIES
        .iter()
        .filter(|capability| capability.acts)
        .map(|capability| capability.name)
}

/// The switches recorded when the saved ones cannot be read: off for every
/// capability that acts.
pub(crate) fn held_switch_values() -> HashMap<String, bool> {
    acting_capabilities()
        .map(|name| (name.to_string(), false))
        .collect()
}

/// [`CapabilityState::tool_refusal`] from an app handle. An app that manages
/// no capability state has no switch to be off.
pub async fn capability_refusal<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    tool_name: &str,
) -> Option<String> {
    use tauri::Manager;

    let state = app_handle.try_state::<CapabilityState>()?;
    state.tool_refusal(tool_name).await
}

/// [`capability_refusal`] for a caller that cannot wait.
pub fn capability_refusal_now<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    tool_name: &str,
) -> Option<String> {
    use tauri::Manager;

    app_handle
        .try_state::<CapabilityState>()?
        .tool_refusal_now(tool_name)
}

/// How a tool answers to the capability toggles.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolSwitch {
    /// Refused while this capability is off.
    Capability(&'static str),
    /// No capability governs it; the text says what does.
    AlwaysOn(&'static str),
}

const WORKS_INSIDE_THE_CONVERSATION: &str =
    "it reads or writes only the conversation itself: a plan, a question, an artifact, a tool list";
const READS_THIS_APPS_OWN_HISTORY: &str =
    "it reads this app's own chat history inside the running chat's execution boundary";
const GOVERNED_BY_MEMORY_SETTINGS: &str = "memory has its own settings and its own store";
const GOVERNED_BY_THE_SCHEDULER: &str =
    "it only lists or changes this app's own schedule, and creating or cancelling asks first";
const ACTS_THROUGH_A_CONNECTED_ACCOUNT: &str =
    "it reaches only an account the person connected, and asks before each call";
const METERED_AND_ASKS_FIRST: &str =
    "it is metered by the plan and asks before each call; no capability toggle is shown for it";
const GOVERNED_BY_THE_MODELS_VISION: &str =
    "it looks at an image the person attached and is offered only to a model that reads images";
const RUNS_BEHIND_THE_SAME_GATES: &str =
    "another app asks for a chat, a skill or an agent run; whatever that then does meets each switch itself";
const STARTS_AN_APPROVED_AGENT: &str =
    "starting one asks first, and the agent's own steps pass every gate again";

/// The one place a tool is tied to a capability. Every tool the registry
/// holds is either under a capability or named always-on with the reason; a
/// test fails when one is neither, so a new tool cannot slip past a toggle by
/// being left out. `None` is a name this app has no tool for.
pub fn tool_switch(tool_name: &str) -> Option<ToolSwitch> {
    use ToolSwitch::{AlwaysOn, Capability};

    Some(match tool_name {
        "file_read" | "file_read_binary" | "file_read_range" | "file_write" | "file_delete"
        | "file_list" | "multi_edit" | "apply_patch" | "edit_exact_replace" | "grep_search"
        | "glob_search" | "code_search" => Capability("fileOperations"),
        name if name.starts_with("undo_")
            || name.starts_with("coding_checkpoint_")
            || name.starts_with("mcp__filesystem__") =>
        {
            Capability("fileOperations")
        }

        name if name.starts_with("document_") => Capability("documentCreation"),

        name if name.starts_with("browser_") => Capability("browserAutomation"),

        "ui_click" | "ui_type" | "ui_toggle" | "ui_focus_window" | "ui_scroll"
        | "ui_read_value" | "computer_use" => Capability("computerUse"),

        "ui_screenshot" | "image_ocr" => Capability("screenshotOcr"),

        "terminal_execute" | "test_run" | "agi_bash" => Capability("terminalAccess"),

        "code_execute" => Capability("codeExecution"),

        "search_web" | "web_search" | "physical_scrape" | "api_call" | "api_download"
        | "api_upload" | "agi_research" => Capability("webSearch"),

        "github_create_repo" => Capability("gitIntegration"),
        name if name.starts_with("git_") || name.starts_with("worktree_") => {
            Capability("gitIntegration")
        }

        "todo_write" | "question" | "tool_search" | "create_artifact" | "code_analyze"
        | "skill" => AlwaysOn(WORKS_INSIDE_THE_CONVERSATION),
        "conversation_search" | "recent_chats" => AlwaysOn(READS_THIS_APPS_OWN_HISTORY),
        name if name.starts_with("memory_") => AlwaysOn(GOVERNED_BY_MEMORY_SETTINGS),
        "schedule_reminder"
        | "schedule_recurring_task"
        | "cancel_scheduled_task"
        | "list_scheduled_tasks" => AlwaysOn(GOVERNED_BY_THE_SCHEDULER),
        "cloud_upload" | "cloud_download" => AlwaysOn(ACTS_THROUGH_A_CONNECTED_ACCOUNT),
        "image_generate" | "video_generate" => AlwaysOn(METERED_AND_ASKS_FIRST),
        "image_analyze" => AlwaysOn(GOVERNED_BY_THE_MODELS_VISION),
        name if name.starts_with("background_agent_") => AlwaysOn(STARTS_AN_APPROVED_AGENT),
        "agi_chat" | "agi_execute_skill" | "agi_run_task" => AlwaysOn(RUNS_BEHIND_THE_SAME_GATES),

        _ => return None,
    })
}

/// The capability that turns a tool off, if one does.
pub fn tool_to_capability(tool_name: &str) -> Option<&'static str> {
    match tool_switch(tool_name) {
        Some(ToolSwitch::Capability(capability)) => Some(capability),
        Some(ToolSwitch::AlwaysOn(_)) | None => None,
    }
}

/// One row of Settings, Capabilities.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityInfo {
    pub name: &'static str,
    pub label: &'static str,
    pub description: &'static str,
    pub default_enabled: bool,
    /// How many of this app's built-in tools the capability turns off.
    pub tool_count: usize,
    /// Off because the saved switches could not be read, until the person
    /// chooses for it.
    pub held_off: bool,
}

fn capability_infos(tool_ids: &[String], held_off: &HashSet<&'static str>) -> Vec<CapabilityInfo> {
    CAPABILITIES
        .iter()
        .map(|capability| CapabilityInfo {
            name: capability.name,
            label: capability.label,
            description: capability.description,
            default_enabled: CAPABILITY_DEFAULT_ENABLED,
            tool_count: tool_ids
                .iter()
                .filter(|id| tool_to_capability(id) == Some(capability.name))
                .count(),
            held_off: held_off.contains(capability.name),
        })
        .collect()
}

static REGISTRY_TOOL_IDS: OnceCell<Vec<String>> = OnceCell::new();

/// The built-in tool ids, read from the registry once: the set is fixed for
/// the life of the process.
fn cached_registry_tool_ids() -> Result<&'static [String], String> {
    REGISTRY_TOOL_IDS
        .get_or_try_init(registry_tool_ids)
        .map(Vec::as_slice)
}

fn registry_tool_ids() -> Result<Vec<String>, String> {
    let registry = crate::core::agi::tools::ToolRegistry::new()
        .map_err(|error| format!("Failed to read the tool registry: {error}"))?;
    registry
        .register_all_tools()
        .map_err(|error| format!("Failed to read the tool registry: {error}"))?;
    Ok(registry
        .list_tools()
        .into_iter()
        .map(|tool| tool.id)
        .collect())
}

/// The capabilities Settings can turn off, with the default and the number of
/// built-in tools each governs. The renderer keeps no list of its own.
#[tauri::command]
pub async fn list_capabilities(
    state: State<'_, CapabilityState>,
) -> Result<Vec<CapabilityInfo>, String> {
    Ok(capability_infos(
        cached_registry_tool_ids()?,
        &state.held_off().await,
    ))
}

/// The question asked before a capability is turned on. It is asked in a
/// native dialog because the settings page renders model output: a switch the
/// person turned off must not come back on from anything the page can do.
fn turn_on_question(capability: &CapabilityDefinition) -> NativeConfirm {
    let allows = capability
        .description
        .split(" Off: ")
        .next()
        .unwrap_or(capability.description);
    NativeConfirm {
        title: format!("Turn on {}?", capability.label),
        body: format!(
            "{} is off. Turning it on lets the assistant do this in every chat, task and background agent on this computer:\n\n{}",
            capability.label, allows
        ),
        confirm_label: format!("Turn On {}", capability.label),
    }
}

/// One turn-on question at a time, and a wait after a no that grows while
/// the noes keep coming.
static TURN_ON_DECISIONS: crate::sys::native_confirm::ConfirmGate =
    crate::sys::native_confirm::ConfirmGate::new();

/// Turns one capability on or off and answers whether it changed. Turning one
/// off needs nothing more. Turning one on is decided by the person in a
/// native dialog; a declined dialog answers `false` and changes nothing. The
/// change is saved to the settings file first and then enforced, so a failed
/// save changes nothing. A tool call already running is not interrupted; the
/// next call is judged by the new value.
#[tauri::command]
pub async fn set_capability(
    name: String,
    enabled: bool,
    app_handle: tauri::AppHandle,
    settings_state: State<'_, SettingsState>,
    state: State<'_, CapabilityState>,
) -> Result<bool, String> {
    let capability = CAPABILITIES
        .iter()
        .find(|capability| capability.name == name)
        .ok_or_else(|| format!("Unknown capability: {name}"))?;

    if enabled {
        if state.is_enabled(capability.name).await {
            return Ok(true);
        }
        let turned_on = TURN_ON_DECISIONS
            .confirm(&app_handle, capability.name, turn_on_question(capability))
            .await
            .map_err(|held| held.message())?;
        if !turned_on {
            return Ok(false);
        }
    }

    let mut current = settings_state.settings.lock().await;
    let mut updated = current.clone();
    updated
        .feature_flags
        .insert(capability.name.to_string(), enabled);
    persist_settings_snapshot(&app_handle, &updated).await?;
    *current = updated;
    state.set(capability.name, enabled).await;

    tracing::info!("[Capabilities] {} = {}", capability.name, enabled);
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_capability_a_tool_names_is_one_settings_can_turn_off() {
        let tool_ids = registry_tool_ids().expect("registry tools");
        let known: Vec<&str> = CAPABILITIES.iter().map(|c| c.name).collect();

        let unknown: Vec<(&String, &str)> = tool_ids
            .iter()
            .filter_map(|id| tool_to_capability(id).map(|capability| (id, capability)))
            .filter(|(_, capability)| !known.contains(capability))
            .collect();
        assert!(
            unknown.is_empty(),
            "these tools answer to a capability with no settings row: {unknown:?}"
        );

        for name in ["mcp__filesystem__read_text_file", "undo_last", "git_status"] {
            let capability = tool_to_capability(name).expect("governed");
            assert!(known.contains(&capability), "{name} -> {capability}");
        }
    }

    #[test]
    fn every_settings_row_turns_off_at_least_one_tool_and_says_what_stops() {
        let infos = capability_infos(
            cached_registry_tool_ids().expect("registry tools"),
            &HashSet::new(),
        );
        assert_eq!(infos.len(), CAPABILITIES.len());

        let mut names: Vec<&str> = infos.iter().map(|info| info.name).collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), CAPABILITIES.len(), "capability names repeat");

        for info in &infos {
            assert!(info.tool_count > 0, "{} governs no tool", info.name);
            assert!(info.default_enabled);
            assert!(!info.held_off);
            assert!(!info.label.trim().is_empty());
            assert!(
                info.description.contains(" Off: "),
                "{} does not say what stops while it is off",
                info.name
            );
        }
    }

    #[test]
    fn a_row_serializes_with_the_names_the_settings_tab_reads() {
        let infos = capability_infos(
            &["file_read".to_string(), "file_write".to_string()],
            &HashSet::from(["fileOperations"]),
        );
        let files = serde_json::to_value(&infos[0]).expect("serialize");
        assert_eq!(files["heldOff"], true);
        assert_eq!(files["name"], "fileOperations");
        assert_eq!(files["label"], "Files");
        assert_eq!(files["defaultEnabled"], true);
        assert_eq!(files["toolCount"], 2);
    }

    #[tokio::test]
    async fn one_capability_can_be_turned_off_without_touching_the_others() {
        let state = CapabilityState::new();
        state.set("terminalAccess", false).await;
        assert!(!state.is_enabled("terminalAccess").await);
        assert!(state.is_enabled("fileOperations").await);

        state.set("terminalAccess", true).await;
        assert!(state.is_enabled("terminalAccess").await);
    }

    #[test]
    fn a_settings_file_with_no_switches_saved_is_readable() {
        assert_eq!(
            saved_switches_from_json(r#"{"llmConfig":{}}"#),
            SavedSwitches::Saved(HashMap::new())
        );
    }

    #[test]
    fn a_damaged_file_or_damaged_switches_are_reported_unreadable() {
        for damaged in [
            "{ not json",
            "",
            r#"{"featureFlags":"all"}"#,
            r#"{"featureFlags":{"terminalAccess":"no"}}"#,
        ] {
            assert!(
                matches!(
                    saved_switches_from_json(damaged),
                    SavedSwitches::Unreadable(_)
                ),
                "{damaged:?} must not be read as a set of switches"
            );
        }
    }

    #[tokio::test]
    async fn the_app_starts_with_the_saved_switches_enforced() {
        let state = CapabilityState::from_saved(SavedSwitches::Saved(HashMap::from([(
            "terminalAccess".to_string(),
            false,
        )])));

        assert!(!state.is_enabled("terminalAccess").await);
        assert!(state.is_enabled("fileOperations").await);
        assert!(state.held_off().await.is_empty());
        assert!(state
            .refusal("terminalAccess")
            .await
            .is_some_and(|message| message.starts_with("Terminal is turned off in Settings")));
        assert_eq!(state.refusal("fileOperations").await, None);
    }

    #[tokio::test]
    async fn unreadable_switches_hold_every_acting_capability_off() {
        let state =
            CapabilityState::from_saved(SavedSwitches::Unreadable("the settings file".to_string()));

        for capability in CAPABILITIES.iter() {
            assert_eq!(
                state.is_enabled(capability.name).await,
                !capability.acts,
                "{}",
                capability.name
            );
        }
        assert!(state.is_enabled("screenshotOcr").await);
        assert!(state
            .refusal("terminalAccess")
            .await
            .is_some_and(|message| message.contains("could not be read when the app started")));
    }

    #[tokio::test]
    async fn the_persons_own_choice_releases_one_held_capability() {
        let state =
            CapabilityState::from_saved(SavedSwitches::Unreadable("the settings file".to_string()));

        state.set("terminalAccess", true).await;
        assert!(state.is_enabled("terminalAccess").await);
        assert!(!state.is_enabled("fileOperations").await);
    }

    #[tokio::test]
    async fn a_held_capability_is_recorded_off_so_the_replacing_file_says_off() {
        let recorded = held_switch_values();
        for capability in CAPABILITIES.iter() {
            assert_eq!(
                recorded.get(capability.name),
                capability.acts.then_some(&false),
                "{}",
                capability.name
            );
        }

        let next_launch = CapabilityState::from_saved(SavedSwitches::Saved(recorded));
        assert!(!next_launch.is_enabled("terminalAccess").await);
        assert!(next_launch.is_enabled("screenshotOcr").await);
    }

    #[tokio::test]
    async fn turning_a_held_capability_off_again_keeps_it_off_as_the_persons_choice() {
        let state =
            CapabilityState::from_saved(SavedSwitches::Unreadable("the settings file".to_string()));

        state.set("terminalAccess", false).await;
        assert!(!state.is_enabled("terminalAccess").await);
        assert!(!state.held_off().await.contains("terminalAccess"));
        assert!(state
            .refusal("terminalAccess")
            .await
            .is_some_and(|message| message.starts_with("Terminal is turned off in Settings")));
    }

    #[test]
    fn nothing_the_page_can_call_replaces_the_switches() {
        let source = include_str!("capabilities.rs");
        let production = source.split("#[cfg(test)]").next().unwrap_or(source);
        assert!(
            !production.contains("fn sync_capabilities"),
            "a whole-map sync from the page would turn switches back on"
        );
        assert_eq!(
            production.matches("#[tauri::command]").count(),
            2,
            "list_capabilities and set_capability are the only commands"
        );
        assert!(
            production
                .contains(".confirm(&app_handle, capability.name, turn_on_question(capability))")
                && production
                    .contains("static TURN_ON_DECISIONS: crate::sys::native_confirm::ConfirmGate"),
            "turning a capability on is decided in a native dialog"
        );
    }

    #[test]
    fn the_turn_on_question_names_the_capability_and_what_it_allows() {
        for capability in CAPABILITIES.iter() {
            let question = turn_on_question(capability);
            assert!(question.title.contains(capability.label));
            assert!(question.body.contains(capability.label));
            assert!(
                !question.body.contains(" Off: "),
                "{} asks with the off sentence in it",
                capability.name
            );
            assert_eq!(
                question.confirm_label,
                format!("Turn On {}", capability.label)
            );
            assert!(
                crate::sys::native_confirm::can_ask_with(&question.confirm_label),
                "{}",
                question.confirm_label
            );
        }

        let terminal = turn_on_question(&CAPABILITIES[2]);
        assert_eq!(CAPABILITIES[2].name, "terminalAccess");
        assert!(terminal
            .body
            .ends_with("Run shell commands and project tests, asking before each one."));
    }

    #[test]
    fn every_off_sentence_says_what_is_withheld() {
        for capability in CAPABILITIES.iter() {
            let off = capability
                .description
                .split(" Off: ")
                .nth(1)
                .expect("an off sentence");
            assert!(
                off.contains("withheld"),
                "{} promises more than withholding its tools: {off}",
                capability.name
            );
        }
    }

    #[test]
    fn the_tool_count_reads_the_registry_once() {
        let first = cached_registry_tool_ids().expect("registry tools");
        let second = cached_registry_tool_ids().expect("registry tools");
        assert!(std::ptr::eq(first, second));
        assert!(!first.is_empty());
    }

    #[test]
    fn a_refusal_names_the_capability_the_way_settings_does() {
        assert_eq!(capability_label("terminalAccess"), "Terminal");
        assert_eq!(capability_label("somethingNew"), "somethingNew");
    }

    #[test]
    fn test_tool_to_capability_mapping() {
        assert_eq!(tool_to_capability("file_read"), Some("fileOperations"));
        assert_eq!(tool_to_capability("file_write"), Some("fileOperations"));
        assert_eq!(
            tool_to_capability("browser_navigate"),
            Some("browserAutomation")
        );
        assert_eq!(tool_to_capability("ui_click"), Some("computerUse"));
        assert_eq!(tool_to_capability("ui_toggle"), Some("computerUse"));
        assert_eq!(tool_to_capability("ui_focus_window"), Some("computerUse"));
        assert_eq!(tool_to_capability("ui_scroll"), Some("computerUse"));
        assert_eq!(tool_to_capability("ui_read_value"), Some("computerUse"));
        assert_eq!(
            tool_to_capability("terminal_execute"),
            Some("terminalAccess")
        );
        assert_eq!(tool_to_capability("code_execute"), Some("codeExecution"));
        assert_eq!(tool_to_capability("unknown_tool"), None);
    }

    #[test]
    fn every_registry_tool_is_under_a_capability_or_named_always_on() {
        let registry = crate::core::agi::tools::ToolRegistry::new().expect("registry");
        registry.register_all_tools().expect("register all tools");

        let unplaced: Vec<String> = registry
            .list_tools()
            .into_iter()
            .map(|tool| tool.id)
            .filter(|id| tool_switch(id).is_none())
            .collect();
        assert!(
            unplaced.is_empty(),
            "a capability toggle cannot turn these off and nothing says why: {unplaced:?}"
        );

        for tool in registry.list_tools() {
            if let Some(ToolSwitch::AlwaysOn(reason)) = tool_switch(&tool.id) {
                assert!(!reason.trim().is_empty(), "{}", tool.id);
            }
        }
    }

    #[test]
    fn a_capability_turned_off_covers_every_tool_that_does_the_same_thing() {
        for tool in [
            "file_read_range",
            "multi_edit",
            "apply_patch",
            "edit_exact_replace",
            "grep_search",
            "glob_search",
            "undo_last",
            "coding_checkpoint_rewind",
            "mcp__filesystem__read_text_file",
            "mcp__filesystem__write_file",
        ] {
            assert_eq!(tool_to_capability(tool), Some("fileOperations"), "{tool}");
        }
        assert_eq!(tool_to_capability("test_run"), Some("terminalAccess"));
        for tool in ["search_web", "physical_scrape", "api_call"] {
            assert_eq!(tool_to_capability(tool), Some("webSearch"), "{tool}");
        }
        for tool in [
            "git_push",
            "git_init",
            "worktree_create",
            "github_create_repo",
        ] {
            assert_eq!(tool_to_capability(tool), Some("gitIntegration"), "{tool}");
        }
        for tool in ["browser_get_content", "browser_autofill_job_application"] {
            assert_eq!(
                tool_to_capability(tool),
                Some("browserAutomation"),
                "{tool}"
            );
        }
        assert_eq!(
            tool_to_capability("document_edit_excel"),
            Some("documentCreation")
        );
        assert_eq!(tool_to_capability("image_ocr"), Some("screenshotOcr"));
        assert_eq!(tool_to_capability("todo_write"), None);
        assert_eq!(tool_switch("mcp__github__create_issue"), None);
    }

    #[tokio::test]
    async fn test_capability_state_defaults_to_enabled() {
        let state = CapabilityState::new();
        // Unknown capabilities default to enabled
        assert!(state.is_enabled("anything").await);
    }

    #[tokio::test]
    async fn test_capability_state_respects_disabled() {
        let state = CapabilityState::from_saved(SavedSwitches::Saved(HashMap::from([
            ("fileOperations".to_string(), false),
            ("terminalAccess".to_string(), true),
        ])));

        assert!(!state.is_enabled("fileOperations").await);
        assert!(state.is_enabled("terminalAccess").await);
        // Unset capabilities still default to enabled
        assert!(state.is_enabled("codeExecution").await);
    }

    #[tokio::test]
    async fn computer_use_and_the_tools_other_apps_call_answer_to_the_same_switches() {
        let state = CapabilityState::new();
        assert_eq!(state.tool_refusal("computer_use").await, None);

        state.set("computerUse", false).await;
        let off = state
            .tool_refusal("computer_use")
            .await
            .expect("Computer control is off");
        assert!(off.starts_with("Computer control is turned off"), "{off}");
        assert!(state.tool_refusal("ui_click").await.is_some());
        assert_eq!(state.tool_refusal_now("computer_use"), Some(off));

        state.set("terminalAccess", false).await;
        assert!(state
            .tool_refusal_now("agi_bash")
            .is_some_and(|off| off.starts_with("Terminal is turned off")));
        state.set("webSearch", false).await;
        assert!(state.tool_refusal_now("agi_research").is_some());
        for always_on in ["agi_chat", "agi_execute_skill", "agi_run_task"] {
            assert_eq!(state.tool_refusal_now(always_on), None, "{always_on}");
            assert!(matches!(
                tool_switch(always_on),
                Some(ToolSwitch::AlwaysOn(_))
            ));
        }
    }
}
