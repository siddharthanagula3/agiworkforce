use std::io::{self, Stdout};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::Result;
use crossterm::event::{
    self, DisableBracketedPaste, EnableBracketedPaste, Event, KeyCode, KeyEvent, KeyModifiers,
};
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use crossterm::ExecutableCommand;
use ratatui::backend::CrosstermBackend;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Paragraph};
use ratatui::Terminal;

use crate::agent::AgentSession;
use crate::command_registry::{
    registry_from_builtins_skills_and_prompts, CommandRegistry, CommandSource, RegistryCommand,
};
use crate::config::CliConfig;
use crate::context::SystemContext;
use crate::terminal_text::{
    sanitize_terminal_line, sanitize_terminal_lines, sanitize_terminal_text,
};

use super::{clip_cols, display_width, pad_to_cols, truncate_cols};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APPROVAL_EXPIRY: Duration = Duration::from_secs(600);

/// Duration the mode-cycle banner is shown after Shift+Tab.
const MODE_BANNER_TTL: Duration = Duration::from_secs(2);

/// How long a first Ctrl-C keeps the session armed for exit.
const EXIT_CONFIRM_WINDOW: Duration = Duration::from_secs(2);
const REWIND_CONFIRM_WINDOW: Duration = EXIT_CONFIRM_WINDOW;

/// How long a transient status-line notice stays on screen. Matched to
/// [`EXIT_CONFIRM_WINDOW`] so the "press again to exit" hint disappears exactly
/// when pressing again stops exiting.
const STATUS_NOTICE_TTL: Duration = Duration::from_secs(2);

// ---------------------------------------------------------------------------
// Interaction mode (Shift+Tab cycling)
// ---------------------------------------------------------------------------

/// Permission modes available in the TUI, cycling with Shift+Tab.
///
/// Cycle order: Default → Plan → Auto → BypassPermissions → FullAuto → Default,
/// where the two approval-skipping modes join only a session launched with them available.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum InteractionMode {
    /// Normal conversation mode (maps to `PermissionMode::Default`).
    Chat,
    /// Plan mode, read-only tools, no file edits.
    Plan,
    /// Auto (`PermissionMode::AcceptEdits`): edits run, commands go through the safety classifier.
    AcceptEdits,
    /// Bypass all tool permission prompts.
    BypassPermissions,
    /// Full-auto: no prompts, no confirmations. Equivalent to headless YOLO.
    FullAuto,
}

impl InteractionMode {
    /// Advance to next mode in the cycle.
    fn next(self) -> Self {
        match self {
            Self::Chat => Self::Plan,
            Self::Plan => Self::AcceptEdits,
            Self::AcceptEdits => Self::BypassPermissions,
            Self::BypassPermissions => Self::FullAuto,
            Self::FullAuto => Self::Chat,
        }
    }

    fn for_session(session: &crate::agent::AgentSession) -> Self {
        if session.skips_approval() {
            return Self::BypassPermissions;
        }
        match session.governed_permission_mode() {
            crate::cli_options::PermissionMode::Plan => Self::Plan,
            crate::cli_options::PermissionMode::AcceptEdits => Self::AcceptEdits,
            crate::cli_options::PermissionMode::BypassPermissions => Self::BypassPermissions,
            crate::cli_options::PermissionMode::Default
            | crate::cli_options::PermissionMode::DontAsk => Self::Chat,
        }
    }

    fn permission_mode(self) -> crate::cli_options::PermissionMode {
        match self {
            Self::Chat => crate::cli_options::PermissionMode::Default,
            Self::Plan => crate::cli_options::PermissionMode::Plan,
            Self::AcceptEdits => crate::cli_options::PermissionMode::AcceptEdits,
            Self::BypassPermissions | Self::FullAuto => {
                crate::cli_options::PermissionMode::BypassPermissions
            }
        }
    }

    fn skips_approval(self) -> bool {
        matches!(self, Self::BypassPermissions | Self::FullAuto)
    }

    fn available_in(self, session: &crate::agent::AgentSession) -> bool {
        (session.bypass_permissions_available || !self.skips_approval())
            && self
                .permission_mode()
                .within(session.pinned_permission_mode)
                == self.permission_mode()
    }

    fn next_available(self, session: &crate::agent::AgentSession) -> Self {
        let mut next = self.next();
        while next != self && !next.available_in(session) {
            next = next.next();
        }
        next
    }

    fn label(self) -> &'static str {
        match self {
            Self::Chat => "Default",
            Self::Plan => "Plan",
            Self::AcceptEdits => "Auto",
            Self::BypassPermissions => "Bypass",
            Self::FullAuto => "FullAuto",
        }
    }

    /// Status-bar badge background from the semantic terminal palette.
    fn color(self) -> Color {
        use crate::tui::terminal_palette::{
            ui_mode_accept_edits, ui_mode_bypass, ui_mode_default, ui_mode_full_auto, ui_mode_plan,
        };
        match self {
            Self::Chat => ui_mode_default(),
            Self::Plan => ui_mode_plan(),
            Self::AcceptEdits => ui_mode_accept_edits(),
            Self::BypassPermissions => ui_mode_bypass(),
            Self::FullAuto => ui_mode_full_auto(),
        }
    }
}

// ---------------------------------------------------------------------------
// Chat message
// ---------------------------------------------------------------------------

struct ChatMessage {
    role: ChatRole,
    text: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ChatRole {
    User,
    Assistant,
    Teammate,
    System,
    Error,
    Detail,
}

/// A live tool-call row in the transcript. Populated from the agent's tool
/// lifecycle events so the user can see what the agent is doing (running →
/// succeeded/failed) instead of it vanishing into swallowed stderr. Kept
/// separate from `chat_messages` so completion events can update a row in place
/// by `call_id`.
struct ToolCell {
    call_id: String,
    name: String,
    summary: String,
    state: crate::tui::transcript_cell::TranscriptCellState,
    output_preview: Option<String>,
    timing: ToolTiming,
    full_output: Option<String>,
    accent: Option<Color>,
    exit_code: Option<i32>,
    stderr: Option<String>,
    edits: Vec<crate::diff_model::EditResult>,
}

#[derive(Debug, Clone, Copy, Default)]
enum ToolTiming {
    #[default]
    Unknown,
    Running(Instant),
    Finished(u64),
}

impl ToolTiming {
    fn label(self) -> Option<String> {
        let millis = match self {
            ToolTiming::Unknown => return None,
            ToolTiming::Running(started) => started.elapsed().as_millis() as u64,
            ToolTiming::Finished(millis) => millis,
        };
        Some(if millis < 1_000 {
            format!("{millis}ms")
        } else {
            format!("{:.1}s", millis as f64 / 1_000.0)
        })
    }
}

const CONTEXT_WARNING_PERCENT: u8 = 85;
const BELL_AFTER_TURN_OF: std::time::Duration = std::time::Duration::from_secs(10);

static EXPAND_TOOL_OUTPUT: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);
const EXPANDED_TOOL_OUTPUT_LINES: usize = 200;

/// Per-tool-type glyph shown before the tool name (distinct from the run-state
/// glyph) so the transcript reads at a glance which kind of action ran.
fn tool_type_icon(name: &str) -> &'static str {
    let n = name.to_ascii_lowercase();
    if n.contains("read") {
        "▤"
    } else if n.contains("edit") || n.contains("patch") || n.contains("apply") {
        "±"
    } else if n.contains("write") || n.contains("create") {
        "✎"
    } else if n.contains("search") || n.contains("grep") || n.contains("glob") || n.contains("find")
    {
        "⌕"
    } else if n.contains("bash")
        || n.contains("shell")
        || n.contains("exec")
        || n.contains("command")
        || n.contains("powershell")
        || n.contains("run")
    {
        "$"
    } else if n.contains("web") || n.contains("fetch") || n.contains("http") || n.contains("url") {
        "↗"
    } else {
        "▸"
    }
}

/// Render one tool-call cell as transcript lines: a run-state glyph, a per-tool
/// type icon, the bold tool name, and a summary. Shell tools render the summary
/// as a `$` command band in accent color so commands stand out from file ops.
fn tool_cell_lines(cell: &ToolCell, spinner_char: &str) -> Vec<Line<'static>> {
    use crate::tui::terminal_palette::{ui_accent, ui_danger, ui_muted, ui_success};
    use crate::tui::transcript_cell::TranscriptCellState;

    let (glyph, glyph_color): (String, _) = match cell.state {
        TranscriptCellState::Running => (spinner_char.to_string(), ui_muted()),
        TranscriptCellState::Complete => ("✔".to_string(), ui_success()),
        TranscriptCellState::Failed => ("✗".to_string(), ui_danger()),
        TranscriptCellState::Cancelled => ("⊘".to_string(), ui_muted()),
    };
    let icon = tool_type_icon(&cell.name);
    let is_command = icon == "$";

    let mut spans = vec![
        Span::styled(format!("  {glyph} "), Style::default().fg(glyph_color)),
        Span::styled(format!("{icon} "), Style::default().fg(ui_accent())),
        Span::styled(
            cell.name.clone(),
            Style::default().add_modifier(Modifier::BOLD),
        ),
    ];
    if !cell.summary.is_empty() {
        let (text, style) = if is_command {
            (
                format!("  $ {}", cell.summary),
                Style::default().fg(ui_accent()),
            )
        } else if let Some(accent) = cell.accent {
            (
                format!("  {}", cell.summary),
                Style::default().fg(accent).add_modifier(Modifier::BOLD),
            )
        } else {
            (
                format!("  {}", cell.summary),
                Style::default().fg(ui_muted()),
            )
        };
        spans.push(Span::styled(text, style));
    }
    if let Some(elapsed) = cell.timing.label() {
        spans.push(Span::styled(
            format!("  ({elapsed})"),
            Style::default().fg(ui_muted()),
        ));
    }
    if let Some(code) = cell.exit_code {
        spans.push(Span::styled(
            format!("  exit {code}"),
            Style::default().fg(if code == 0 { ui_success() } else { ui_danger() }),
        ));
    }
    let edited = cell.state == TranscriptCellState::Complete && !cell.edits.is_empty();
    if edited {
        let additions: usize = cell.edits.iter().map(|edit| edit.additions()).sum();
        let deletions: usize = cell.edits.iter().map(|edit| edit.deletions()).sum();
        spans.push(Span::styled(
            format!("  +{additions}"),
            Style::default().fg(ui_success()),
        ));
        spans.push(Span::styled(
            format!(" -{deletions}"),
            Style::default().fg(ui_danger()),
        ));
    }
    let mut lines = vec![Line::from(spans)];
    let expanded = EXPAND_TOOL_OUTPUT.load(std::sync::atomic::Ordering::Relaxed);
    match (&cell.full_output, &cell.output_preview) {
        _ if edited => lines.extend(edit_result_lines(&cell.edits, expanded)),
        (Some(output), _) if expanded => {
            let total = output.lines().count();
            for line in output.lines().take(EXPANDED_TOOL_OUTPUT_LINES) {
                lines.push(Line::from(vec![
                    Span::raw("    "),
                    Span::styled(line.to_string(), Style::default().fg(ui_muted())),
                ]));
            }
            if total > EXPANDED_TOOL_OUTPUT_LINES {
                lines.push(Line::from(Span::styled(
                    format!("    … {} more lines", total - EXPANDED_TOOL_OUTPUT_LINES),
                    Style::default().fg(ui_muted()),
                )));
            }
        }
        (_, Some(preview)) => lines.push(Line::from(vec![
            Span::raw("    "),
            Span::styled(preview.clone(), Style::default().fg(ui_muted())),
        ])),
        _ => {}
    }
    if let Some(stderr) = &cell.stderr {
        let shown = if expanded {
            EXPANDED_TOOL_OUTPUT_LINES
        } else {
            1
        };
        for (index, line) in stderr.lines().take(shown).enumerate() {
            lines.push(Line::from(vec![
                Span::styled(
                    if index == 0 {
                        "    stderr "
                    } else {
                        "           "
                    },
                    Style::default()
                        .fg(ui_danger())
                        .add_modifier(Modifier::BOLD),
                ),
                Span::styled(line.to_string(), Style::default().fg(ui_danger())),
            ]));
        }
        let total = stderr.lines().count();
        if total > shown {
            lines.push(Line::from(Span::styled(
                format!("           … {} more stderr lines", total - shown),
                Style::default().fg(ui_muted()),
            )));
        }
    }
    lines
}

const EDIT_PREVIEW_LINES: usize = 12;

/// The block under a finished edit: what was changed, how much, and the
/// changed lines themselves, each on a full-width green or red band.
fn edit_result_lines(
    edits: &[crate::diff_model::EditResult],
    expanded: bool,
) -> Vec<Line<'static>> {
    use crate::diff_model::DiffLine;
    use crate::tui::terminal_palette::{ui_muted, ui_success};
    use crate::tui::widgets::diff_review::diff_bands;

    let bands = diff_bands();
    let limit = if expanded {
        EXPANDED_TOOL_OUTPUT_LINES
    } else {
        EDIT_PREVIEW_LINES
    };
    let mut lines = Vec::new();
    for edit in edits {
        lines.push(Line::from(vec![
            Span::raw("    "),
            Span::styled("● ", Style::default().fg(ui_success())),
            Span::styled(edit.header(), Style::default().add_modifier(Modifier::BOLD)),
        ]));
        lines.push(Line::from(vec![
            Span::raw("    "),
            Span::styled("└ ", Style::default().fg(ui_muted())),
            Span::styled(edit.summary(), Style::default().fg(ui_muted())),
        ]));
        for line in edit.lines.iter().take(limit) {
            let (added, text) = match line {
                DiffLine::Added(text) => (true, text),
                DiffLine::Removed(text) | DiffLine::Context(text) => (false, text),
            };
            let sign = if added { '+' } else { '-' };
            let band = if added { bands.added } else { bands.removed };
            let row = Line::from(Span::styled(
                format!("      {sign} {}", text.replace('\t', "    ")),
                bands.style_for(added),
            ));
            lines.push(match band {
                Some(bg) => row.style(Style::default().bg(bg)),
                None => row,
            });
        }
        if edit.lines.len() > limit {
            lines.push(Line::from(Span::styled(
                format!("      … {} more changed lines", edit.lines.len() - limit),
                Style::default().fg(ui_muted()),
            )));
        }
    }
    lines
}

// ---------------------------------------------------------------------------
// TUI App state
// ---------------------------------------------------------------------------

struct TuiApp {
    session: AgentSession,
    config: CliConfig,
    keybindings: crate::keybindings::Keybindings,
    chat_messages: Vec<ChatMessage>,
    input: String,
    cursor: usize,
    scroll_offset: u16,
    is_loading: bool,
    spinner_tick: u8,
    should_quit: bool,
    /// When the last exit-intent keypress landed on an already-empty composer.
    /// A second press inside `EXIT_CONFIRM_WINDOW` exits; otherwise the intent
    /// lapses, so a stray keystroke minutes later cannot end the session.
    exit_armed_at: Option<Instant>,
    rewind_armed_at: Option<Instant>,
    /// Transient status-line notice, cleared after [`STATUS_NOTICE_TTL`].
    status_notice: Option<(String, Instant)>,
    model_name: String,
    provider_name: String,
    mode: InteractionMode,
    /// Detected sandbox backend. `/status` reports it only while the sandbox is on.
    sandbox_type: Option<crate::sandbox::SandboxType>,
    // Agent picker popup
    agent_picker: super::widgets::agent_picker::AgentPickerState,
    // Model picker popup (new widget-based state)
    model_picker: super::widgets::model_picker::ModelPickerState,
    // Effort picker popup
    effort_picker: super::widgets::effort_picker::EffortPickerState,
    // Statusline field-visibility config, applied by render_status_bar. Seeded
    // current-preserving (mode + cost shown, model/tokens/branch off) so wiring
    // /statusline changes nothing until the user opts in; the /statusline overlay
    // edits a copy and commits it here on save (the generic overlay path dropped it).
    statusline_config: super::widgets::statusline_setup::StatusLineConfig,
    // Terminal-title field config: which of session-id/model/cwd/branch appear in
    // the OS window title. Read from `[ui]` at startup and saved by /title.
    terminal_title_config: super::widgets::terminal_title_setup::TerminalTitleConfig,
    // Currently active effort level (persisted across model switches)
    effort: crate::design_system::Effort,
    // Theme picker popup
    theme_picker: super::widgets::theme_picker::ThemePickerState,
    // Currently active theme choice
    theme_choice: super::widgets::theme_picker::ThemeChoice,
    // Mode-change banner: timestamp when the mode was last cycled via Shift+Tab.
    // The banner self-clears after MODE_BANNER_TTL.
    mode_banner_shown_at: Option<Instant>,
    // Streaming
    stream_buffer: String,
    stream_start: Option<Instant>,
    // Git branch
    git_branch: Option<String>,
    workspace_pane: Option<Vec<String>>,
    command_registry: CommandRegistry,
    // Fallback rotation banner, shared with the agent send loop. The banner
    // self-clears after FALLBACK_BANNER_TTL seconds.
    fallback_banner: Arc<std::sync::Mutex<Option<FallbackBanner>>>,
    // Modal overlay slot: intercepts all key events while active.
    active_overlay: Option<Box<dyn crate::tui::widgets::interactive::InteractiveView>>,
    // Scroll position for text overlays that exceed the visible modal height.
    overlay_scroll: u16,
    // Live tool-call rows for the in-flight turn, keyed by call_id. Cleared at
    // the start of each turn and on /clear.
    tool_cells: Vec<ToolCell>,
    /// Interactive MCP elicitation queue installed only for the full-screen TUI.
    mcp_elicitation_handler: Arc<crate::mcp::tui_handler::TuiElicitationHandler>,
    /// Labels for the images staged on the next turn, one per block queued in
    /// `session.pending_image_blocks`. Kept beside the blocks rather than
    /// derived from them because a `ContentBlock::Image` carries base64 bytes
    /// and no provenance, so the composer would have nothing to name in a chip.
    staged_images: Vec<String>,
    turn_context: Vec<String>,
    /// Images `/image` generated this session, newest last. Held as paths so
    /// the chip can name a real file and `/image open` can hand it to the
    /// user's default viewer.
    generated_images: Vec<std::path::PathBuf>,
    /// Workspace files the `@` picker offers, built once on the first `@` of a
    /// session. A monorepo walk is too slow to repeat per keystroke.
    mention_candidates: Option<Vec<crate::mentions::MentionCandidate>>,
    /// Byte offset of the `@` the open mention popup is completing.
    mention_anchor: Option<usize>,
    prompt_history: super::prompt_history::PromptHistory,
    composer_undo: super::composer_edits::ComposerUndo,
    pasted_texts: super::composer_edits::PastedTexts,
    queued_prompts: Vec<String>,
    side_answers: (
        tokio::sync::mpsc::UnboundedSender<String>,
        tokio::sync::mpsc::UnboundedReceiver<String>,
    ),
    team_seen: u64,
    remote: Option<RemoteLink>,
    remote_prompts: Vec<String>,
    remote_label: Option<String>,
    browser: Arc<std::sync::Mutex<crate::browser_bridge::BrowserAvailability>>,
    start_panel: StartPanel,
}

struct RemoteLink {
    host: Arc<crate::tui::remote_host::TuiRemoteHost>,
    inbox: tokio::sync::mpsc::UnboundedReceiver<crate::tui::remote_host::RemoteInput>,
    stop: tokio::sync::watch::Sender<bool>,
    status: Arc<std::sync::Mutex<Option<crate::remote_control::RemoteControlStatus>>>,
    task: tokio::task::JoinHandle<()>,
}

/// Short-lived banner shown across the top of the chat area when the
/// fallback chain rotates models. Holds a snapshot at the moment of
/// rotation; the renderer is responsible for hiding it once stale.
#[derive(Clone)]
struct FallbackBanner {
    from: String,
    to: String,
    reason: String,
    shown_at: Instant,
}

const FALLBACK_BANNER_TTL: Duration = Duration::from_secs(5);

impl TuiApp {
    fn new(session: AgentSession, config: CliConfig) -> Self {
        // Restore the persisted theme before the first frame. Without this the
        // picker recoloured the running TUI and the choice died at restart.
        let theme_choice = config
            .ui
            .theme
            .as_deref()
            .and_then(super::widgets::theme_picker::ThemeChoice::from_arg)
            .unwrap_or(super::widgets::theme_picker::ThemeChoice::Dark);
        crate::tui::terminal_palette::set_active_theme(theme_choice.applied() as u8);
        let terminal_title_config = config.ui.terminal_title.clone().unwrap_or_default();

        let model_name = session.model.clone();
        let provider_name = crate::design_system::provider_label(&session.provider);

        // `run()` loads a resumed session's prior turns into `session.messages`
        // before this, so the transcript is seeded from them and the first
        // frame already shows the resumed conversation.
        let imported_from = session.managed_session.as_ref().and_then(|managed| {
            crate::sessions::open_db()
                .ok()
                .and_then(|conn| crate::sessions::imported_from(&conn, &managed.session_id))
        });
        let mut chat_messages: Vec<ChatMessage> = session
            .messages
            .iter()
            .filter_map(|m| {
                let role = match m.role.as_str() {
                    "user" => ChatRole::User,
                    "assistant" => ChatRole::Assistant,
                    // System/tool-result messages aren't rendered as
                    // transcript bubbles elsewhere in the TUI either; skip
                    // them here rather than showing raw tool-call JSON.
                    _ => return None,
                };
                let text = m.text_content();
                if text.trim().is_empty() {
                    return None;
                }
                Some(ChatMessage { role, text })
            })
            .collect();
        if let Some(origin) = imported_from.filter(|_| !chat_messages.is_empty()) {
            chat_messages.insert(
                0,
                ChatMessage {
                    role: ChatRole::System,
                    text: format!("The messages below came from {origin}."),
                },
            );
        }
        let mut branch_command = agiworkforce_worktree::host_git();
        branch_command.args(["rev-parse", "--abbrev-ref", "HEAD"]);
        let git_branch = crate::platform::runtime::git::host_git_output(branch_command)
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    String::from_utf8(o.stdout)
                        .ok()
                        .map(|s| s.trim().to_string())
                } else {
                    None
                }
            });

        let sandbox_type = Some(crate::sandbox::SandboxType::detect());
        let mode = InteractionMode::for_session(&session);

        let mut command_registry =
            registry_from_builtins_skills_and_prompts(&crate::skills::discover_skills(), &[]);
        for command in crate::custom_commands::discover_custom_slash_commands() {
            if command_registry.find(&command.name).is_some() {
                continue;
            }
            let source = match command.source {
                crate::custom_commands::CustomCommandSource::ProjectAgi
                | crate::custom_commands::CustomCommandSource::ProjectClaude => {
                    CommandSource::Project
                }
                crate::custom_commands::CustomCommandSource::UserAgi
                | crate::custom_commands::CustomCommandSource::ImportedClaude
                | crate::custom_commands::CustomCommandSource::UserClaude => CommandSource::User,
            };
            let loaded_from = format!("{}: {}", command.source.label(), command.path.display());
            let mut registry_command = RegistryCommand::prompt(
                command.name,
                command.description,
                source,
                Some(&loaded_from),
            );
            registry_command.argument_hint = command.argument_hint;
            command_registry.push(registry_command);
        }
        if let Some(prompts) = session.mcp_prompt_info() {
            register_mcp_prompt_commands(&mut command_registry, prompts);
        }

        let keybindings = crate::keybindings::Keybindings::from_config(&config.ui.keybindings);
        let start_panel = StartPanel::new(provider_access_mode(&session.provider));

        let effort = config
            .default
            .reasoning_effort
            .as_deref()
            .and_then(crate::design_system::Effort::from_config_value)
            .unwrap_or_default();

        Self {
            session,
            config,
            keybindings,
            chat_messages,
            input: String::new(),
            cursor: 0,
            scroll_offset: 0,
            is_loading: false,
            spinner_tick: 0,
            should_quit: false,
            exit_armed_at: None,
            rewind_armed_at: None,
            status_notice: None,
            model_name,
            provider_name,
            mode,
            sandbox_type,
            agent_picker: super::widgets::agent_picker::AgentPickerState::default(),
            model_picker: super::widgets::model_picker::ModelPickerState::default(),
            effort_picker: super::widgets::effort_picker::EffortPickerState::default(),
            statusline_config: super::widgets::statusline_setup::StatusLineConfig {
                show_model: false,
                show_tokens: false,
                show_cost: true,
                show_branch: false,
                show_mode: true,
                show_context: false,
            },
            terminal_title_config,
            effort,
            theme_picker: super::widgets::theme_picker::ThemePickerState::default(),
            theme_choice,
            mode_banner_shown_at: None,
            stream_buffer: String::new(),
            stream_start: None,
            git_branch,
            workspace_pane: None,
            command_registry,
            fallback_banner: Arc::new(std::sync::Mutex::new(None)),
            active_overlay: None,
            overlay_scroll: 0,
            tool_cells: Vec::new(),
            mcp_elicitation_handler: Arc::new(crate::mcp::tui_handler::TuiElicitationHandler::new()),
            staged_images: Vec::new(),
            turn_context: Vec::new(),
            generated_images: Vec::new(),
            mention_candidates: None,
            mention_anchor: None,
            prompt_history: super::prompt_history::PromptHistory::load(),
            composer_undo: Default::default(),
            pasted_texts: Default::default(),
            queued_prompts: Vec::new(),
            side_answers: tokio::sync::mpsc::unbounded_channel(),
            team_seen: 0,
            remote: None,
            remote_prompts: Vec::new(),
            remote_label: None,
            browser: Arc::new(std::sync::Mutex::new(
                crate::browser_bridge::BrowserAvailability::ShellNotRunning,
            )),
            start_panel,
        }
    }

    /// The workspace directory mentions and attachments resolve against.
    fn workspace_root(&self) -> std::path::PathBuf {
        std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
    }

    /// Stage one image file on the next turn, as `--file` does at launch.
    /// Returns the label the composer chip shows.
    fn stage_image_path(&mut self, path: &str) -> Result<String, String> {
        self.stage_image_path_with(path, agiworkforce_utils_image::PromptImageMode::ResizeToFit)
    }

    fn stage_image_path_with(
        &mut self,
        path: &str,
        mode: agiworkforce_utils_image::PromptImageMode,
    ) -> Result<String, String> {
        let root = self.workspace_root();
        let resolved = crate::path_security::validate_workspace_path_with_cwd(path, &root)?;
        if !resolved.is_file() {
            return Err(format!("{path} is not a file"));
        }
        if crate::documents::DocumentKind::for_path(&resolved).is_some() {
            return self.stage_document(&resolved, &root);
        }
        if !crate::is_image_extension(path) {
            return Err(format!("{path} is not an image, PDF or Office document"));
        }
        if crate::model_catalog::find(&self.session.model)
            .is_some_and(|model| !model.supports_vision)
        {
            return Err(format!(
                "{} does not accept images; switch to a vision model with /model first",
                crate::model_catalog::display_name(&self.session.model)
            ));
        }
        let attachment = crate::load_image_attachment_with(&resolved.to_string_lossy(), mode)
            .map_err(|error| format!("{error:#}"))?;
        let path_label = resolved
            .strip_prefix(&root)
            .unwrap_or(resolved.as_path())
            .to_string_lossy()
            .into_owned();
        let size = std::fs::metadata(&resolved)
            .map(|meta| meta.len())
            .unwrap_or(0);
        let label = match mode {
            agiworkforce_utils_image::PromptImageMode::Original => format!(
                "{path_label} ({}, full resolution)",
                crate::tools::format_size(size)
            ),
            agiworkforce_utils_image::PromptImageMode::ResizeToFit => {
                format!("{path_label} ({})", crate::tools::format_size(size))
            }
        };
        if self.staged_images.contains(&label) {
            return Err(format!("{path_label} is already attached"));
        }
        self.session
            .pending_image_blocks
            .push(attachment.into_image_block());
        self.staged_images.push(label.clone());
        Ok(label)
    }

    fn stage_document(
        &mut self,
        resolved: &std::path::Path,
        root: &std::path::Path,
    ) -> Result<String, String> {
        let block = crate::load_document_attachment(&resolved.to_string_lossy())
            .map_err(|error| format!("{error:#}"))?;
        let size = std::fs::metadata(resolved)
            .map(|meta| meta.len())
            .unwrap_or(0);
        let label = format!(
            "{} ({})",
            resolved
                .strip_prefix(root)
                .unwrap_or(resolved)
                .to_string_lossy(),
            crate::tools::format_size(size)
        );
        if self.staged_images.contains(&label) {
            return Err(format!("{label} is already attached"));
        }
        self.session.pending_image_blocks.push(block);
        self.staged_images.push(label.clone());
        Ok(label)
    }

    /// Stage whatever bitmap the system clipboard is holding.
    fn stage_clipboard_image(&mut self) -> Result<String, String> {
        if crate::model_catalog::find(&self.session.model)
            .is_some_and(|model| !model.supports_vision)
        {
            return Err(format!(
                "{} does not accept images; switch to a vision model with /model first",
                crate::model_catalog::display_name(&self.session.model)
            ));
        }
        let image = arboard::Clipboard::new()
            .and_then(|mut clipboard| clipboard.get_image())
            .map_err(|error| format!("no image on the clipboard ({error})"))?;
        let attachment = crate::clipboard_image_attachment(
            image.width as u32,
            image.height as u32,
            image.bytes.into_owned(),
        )
        .map_err(|error| format!("{error:#}"))?;
        let label = format!("clipboard ({}x{})", image.width, image.height);
        self.session
            .pending_image_blocks
            .push(attachment.into_image_block());
        self.staged_images.push(label.clone());
        Ok(label)
    }

    /// Drop one staged image by 1-based position, or every one when `None`.
    fn remove_staged_image(&mut self, position: Option<usize>) -> Result<String, String> {
        match position {
            None => {
                let count = self.staged_images.len();
                self.staged_images.clear();
                self.session.pending_image_blocks.clear();
                Ok(format!("Removed {count} staged image(s)."))
            }
            Some(position) => {
                let index = position
                    .checked_sub(1)
                    .filter(|index| *index < self.staged_images.len())
                    .ok_or_else(|| {
                        format!(
                            "no staged image {position}; {} staged",
                            self.staged_images.len()
                        )
                    })?;
                let label = self.staged_images.remove(index);
                if index < self.session.pending_image_blocks.len() {
                    self.session.pending_image_blocks.remove(index);
                }
                Ok(format!("Removed {label}."))
            }
        }
    }

    /// Candidate list for the `@` picker, walked once per session.
    fn mention_candidates(&mut self) -> Vec<crate::mentions::MentionCandidate> {
        if self.mention_candidates.is_none() {
            let root = self.workspace_root();
            let mut candidates: Vec<crate::mentions::MentionCandidate> =
                crate::agents::discover_agents()
                    .into_iter()
                    .map(|agent| {
                        crate::mentions::MentionCandidate::new(format!(
                            "{}{}",
                            crate::mentions::AGENT_MENTION_PREFIX,
                            agent.name
                        ))
                    })
                    .collect();
            candidates.extend(crate::mentions::workspace_file_candidates(&root));
            self.mention_candidates = Some(candidates);
        }
        self.mention_candidates.clone().unwrap_or_default()
    }

    /// Replace the partially typed `@query` at the cursor with the chosen path.
    fn insert_mention(&mut self, path: &str) {
        let Some(anchor) = self.mention_anchor.take() else {
            return;
        };
        let cursor = floor_char_boundary(&self.input, self.cursor).max(anchor);
        if anchor > self.input.len() || cursor > self.input.len() {
            return;
        }
        let replacement = format!("@{path} ");
        self.input.replace_range(anchor..cursor, &replacement);
        self.cursor = anchor + replacement.len();
    }

    /// Whether this workspace has been trusted, which decides if a mention
    /// carries file contents or only the path. Mirrors the trust gate the tool
    /// layer applies to repository-controlled policy.
    fn workspace_is_trusted(&self) -> bool {
        crate::features::exec::tools::workspace_policy_is_trusted(&self.workspace_root())
    }

    /// Install the fallback banner sink on the underlying session. Idempotent:
    /// calling twice replaces the previous sink.
    fn wire_fallback_banner(&mut self) {
        let banner = Arc::clone(&self.fallback_banner);
        self.session.on_fallback = Some(crate::agent::FallbackSink(Box::new(
            move |from, to, reason| {
                if let Ok(mut slot) = banner.lock() {
                    *slot = Some(FallbackBanner {
                        from: from.to_string(),
                        to: to.to_string(),
                        reason: reason.to_string(),
                        shown_at: Instant::now(),
                    });
                }
            },
        )));
    }

    /// Returns the current banner if it hasn't expired; otherwise clears it.
    fn current_fallback_banner(&self) -> Option<FallbackBanner> {
        let mut slot = self.fallback_banner.lock().ok()?;
        if let Some(b) = slot.as_ref() {
            if b.shown_at.elapsed() <= FALLBACK_BANNER_TTL {
                return Some(b.clone());
            }
            *slot = None;
        }
        None
    }

    fn refresh_workspace_pane(&mut self) {
        if self.workspace_pane.is_some() {
            self.workspace_pane = Some(workspace_pane_lines());
        }
    }

    fn sync_stats(&mut self) {
        let model_changed = self.model_name != self.session.model;
        self.model_name = self.session.model.clone();
        if model_changed && self.terminal_title_config.show_model {
            self.emit_terminal_title();
        }
        self.provider_name = crate::design_system::provider_label(&self.session.provider);
    }

    /// Discard the conversation: what `/clear` does, and what the
    /// `clear_chat` keybinding action does when a config binds it.
    fn discard_conversation(&mut self) {
        self.session.clear();
        self.chat_messages.clear();
        self.scroll_offset = 0;
        self.sync_stats();
    }

    fn spinner_char(&self) -> &str {
        spinner_frame(self.spinner_tick)
    }

    fn model_reasons(&self) -> bool {
        crate::model_catalog::catalog()
            .find(&self.session.model)
            .is_none_or(|model| model.supports_reasoning)
    }

    fn visible_effort_label(&self) -> &'static str {
        if self.model_reasons() {
            self.effort.label()
        } else {
            ""
        }
    }

    fn command_applies_here(&self, name: &str) -> bool {
        let managed = self.session.privacy_mode == crate::agent::PrivacyMode::Managed;
        match name {
            "effort" => self.model_reasons(),
            "image" | "imagine" | "artifacts" | "personalize" | "route" => managed,
            "team" | "teams" => self.session.team_manager.is_some(),
            _ => true,
        }
    }

    fn context_snapshot(&self) -> ContextSnapshot {
        ContextSnapshot::of(
            &self
                .session
                .context_usage(self.config.default.max_tokens as usize),
        )
    }

    fn context_percent(&self) -> u8 {
        self.context_snapshot().percent
    }

    pub fn open_overlay(
        &mut self,
        view: Box<dyn crate::tui::widgets::interactive::InteractiveView>,
    ) {
        self.overlay_scroll = 0;
        self.active_overlay = Some(view);
    }

    /// Route a key to the active overlay. Returns the action the overlay asked
    /// for when it consumed the key (the caller must not forward it to the
    /// composer), and `None` when there is no active overlay.
    fn dispatch_key_to_overlay(&mut self, key: crossterm::event::KeyEvent) -> Option<InputAction> {
        let Some(ov) = self.active_overlay.as_mut() else {
            return None;
        };
        let action = crossterm_to_keyaction(key);
        use crate::tui::widgets::interactive::ViewAction;
        match ov.handle_key(action) {
            ViewAction::Continue => {
                if matches!(
                    action,
                    crate::tui::widgets::interactive::KeyAction::PageDown
                ) {
                    self.overlay_scroll = self.overlay_scroll.saturating_add(5);
                } else if matches!(action, crate::tui::widgets::interactive::KeyAction::PageUp) {
                    self.overlay_scroll = self.overlay_scroll.saturating_sub(5);
                }
            }
            // Enter on the command palette runs the command, the way one Enter
            // does in the composer. Tab is the completion key and fills the
            // composer instead, for a command still owed arguments.
            ViewAction::SideAction(tag) if tag.starts_with("slash:") => {
                let command = format!("/{}", tag.trim_start_matches("slash:"));
                self.input.clear();
                self.cursor = 0;
                self.scroll_offset = 0;
                self.overlay_scroll = 0;
                self.active_overlay = None;
                return Some(InputAction::SendMessage(command));
            }
            ViewAction::SideAction(tag) if tag.starts_with("complete:") => {
                self.input = format!("/{}", tag.trim_start_matches("complete:"));
                self.cursor = self.input.len();
                self.overlay_scroll = 0;
                self.active_overlay = None;
            }
            ViewAction::SideAction(tag) if tag.starts_with("resume:") => {
                let reference = tag.trim_start_matches("resume:").to_string();
                self.overlay_scroll = 0;
                self.active_overlay = None;
                resume_session(&reference, self);
            }
            ViewAction::SideAction(tag) if tag.starts_with("rewind:") => {
                let arg = tag.trim_start_matches("rewind:").to_string();
                self.overlay_scroll = 0;
                self.active_overlay = None;
                apply_rewind(self, &arg);
            }
            ViewAction::SideAction(tag) if tag.starts_with("mention:") => {
                let path = tag.trim_start_matches("mention:").to_string();
                self.insert_mention(&path);
                self.overlay_scroll = 0;
                self.active_overlay = None;
            }
            ViewAction::SideAction(tag) if tag == "mention-cancel-at" => {
                // The popup was dismissed by backspacing over the `@` that
                // opened it, so the composer deletes that character too.
                if let Some(anchor) = self.mention_anchor.take() {
                    if self.input.get(anchor..anchor + 1) == Some("@") {
                        self.input.remove(anchor);
                        self.cursor = anchor;
                    }
                }
                self.overlay_scroll = 0;
                self.active_overlay = None;
            }
            ViewAction::Submit(_) => {
                // Apply the overlay's committed result; dropping it made every
                // generic overlay save nothing.
                let result = ov.take_result();
                self.overlay_scroll = 0;
                self.active_overlay = None;
                if let Some(r) = result {
                    self.apply_overlay_result(r);
                }
            }
            ViewAction::Close | ViewAction::SideAction(_) => {
                self.overlay_scroll = 0;
                self.active_overlay = None;
            }
        }
        Some(InputAction::None)
    }

    /// Apply a committed overlay result to live app state. Central place so new
    /// overlays wire their save here instead of dropping it at the Submit arm.
    fn apply_overlay_result(&mut self, result: crate::tui::widgets::interactive::OverlayResult) {
        use crate::tui::widgets::interactive::OverlayResult;
        match result {
            OverlayResult::StatusLine(config) => {
                self.statusline_config = config;
            }
            OverlayResult::TerminalTitle(config) => {
                self.terminal_title_config = config;
                self.emit_terminal_title();
                if let Err(error) = self
                    .config
                    .persist_terminal_title_project(&self.terminal_title_config)
                {
                    self.chat_messages.push(ChatMessage {
                        role: ChatRole::Error,
                        text: format!("The terminal title choice was not saved: {error}"),
                    });
                }
            }
            OverlayResult::SkillsDisabled(names) => {
                // Persist the disabled set; discover_skills() then skips them for
                // every consumer (prompt injection, registry, tools).
                let set: std::collections::HashSet<String> = names.into_iter().collect();
                if let Err(error) = crate::skills::save_disabled_skills(&set) {
                    self.chat_messages.push(ChatMessage {
                        role: ChatRole::Error,
                        text: format!("The skill choices were not saved: {error}"),
                    });
                }
            }
            OverlayResult::Memory(settings) => {
                self.session.memory_enabled =
                    settings.auto_memory && crate::cli_options::memory_enabled();
                // Persist; the memory pipeline (extract/prune/consolidate) reads it.
                let saved = crate::config::CliConfig::config_dir()
                    .map_err(|error| error.to_string())
                    .and_then(|home| {
                        crate::memory_pipeline::save_memory_settings(
                            &home,
                            settings.auto_memory,
                            settings.decay_threshold_days,
                            settings.max_facts,
                        )
                        .map_err(|error| error.to_string())
                    });
                if let Err(error) = saved {
                    self.chat_messages.push(ChatMessage {
                        role: ChatRole::Error,
                        text: format!("The memory settings were not saved: {error}"),
                    });
                }
            }
            OverlayResult::DiffReviewed(outcome) => {
                let cwd = std::env::current_dir().unwrap_or_default();
                if let Err(error) = crate::platform::runtime::git::check_repository_config_blocking(
                    &cwd,
                    agiworkforce_worktree::config_guard::ConfigUse::CONTENT,
                ) {
                    self.chat_messages.push(ChatMessage {
                        role: ChatRole::System,
                        text: format!("Nothing was changed: {error}"),
                    });
                    return;
                }
                let succeeded = |command: std::process::Command| {
                    crate::platform::runtime::git::host_git_output(command)
                        .is_ok_and(|output| output.status.success())
                };
                let staged_files = outcome
                    .approved
                    .iter()
                    .filter(|path| {
                        let mut command = agiworkforce_worktree::host_git();
                        command.arg("add").arg("--").arg(path);
                        succeeded(command)
                    })
                    .count();
                let apply = |patch: &str, args: &[&str]| -> bool {
                    let Ok(mut file) = tempfile::NamedTempFile::new() else {
                        return false;
                    };
                    if std::io::Write::write_all(&mut file, patch.as_bytes()).is_err() {
                        return false;
                    }
                    let mut command = agiworkforce_worktree::host_git();
                    command
                        .arg("apply")
                        .args(args)
                        .arg("--recount")
                        .arg(file.path());
                    succeeded(command)
                };
                let unstaged_files = outcome
                    .unstage_files
                    .iter()
                    .filter(|path| {
                        let mut command = agiworkforce_worktree::host_git();
                        command.args(["reset", "-q", "--"]).arg(path);
                        succeeded(command)
                    })
                    .count();
                let staged_hunks = outcome
                    .stage_hunks
                    .iter()
                    .filter(|patch| apply(patch, &["--cached"]))
                    .count();
                let unstaged_hunks = outcome
                    .unstage_hunks
                    .iter()
                    .filter(|patch| apply(patch, &["-R", "--cached"]))
                    .count();
                let discarded_hunks = outcome
                    .discard_hunks
                    .iter()
                    .filter(|patch| apply(patch, &["-R"]))
                    .count();
                let failed = outcome.stage_hunks.len() - staged_hunks + outcome.unstage_hunks.len()
                    - unstaged_hunks
                    + outcome.discard_hunks.len()
                    - discarded_hunks;
                let mut text = format!(
                    "Staged {staged_files} file(s) and {staged_hunks} hunk(s); unstaged {unstaged_files} file(s) and {unstaged_hunks} hunk(s); discarded {discarded_hunks} hunk(s) from the working tree."
                );
                if failed > 0 {
                    text.push_str(&format!(
                        " {failed} hunk(s) no longer matched the file and were left as they are; run /diff-review again."
                    ));
                }
                self.chat_messages.push(ChatMessage {
                    role: ChatRole::System,
                    text,
                });
            }
            OverlayResult::DiffApproved(paths) => {
                // Stage the approved files (reversible via `git reset`). Rejected /
                // skipped files are deliberately left untouched, never auto-discard
                // the user's working-tree changes.
                let cwd = std::env::current_dir().unwrap_or_default();
                if let Err(error) = crate::platform::runtime::git::check_repository_config_blocking(
                    &cwd,
                    agiworkforce_worktree::config_guard::ConfigUse::CONTENT,
                ) {
                    self.chat_messages.push(ChatMessage {
                        role: ChatRole::System,
                        text: format!("Nothing was staged: {error}"),
                    });
                    return;
                }
                let mut staged = 0usize;
                for path in paths.iter() {
                    let mut command = agiworkforce_worktree::host_git();
                    command.arg("add").arg("--").arg(path);
                    match crate::platform::runtime::git::host_git_output(command) {
                        Ok(output) if output.status.success() => staged += 1,
                        Ok(_) => {}
                        Err(error) => {
                            self.chat_messages.push(ChatMessage {
                                role: ChatRole::System,
                                text: format!(
                                    "Staging stopped: {}",
                                    crate::platform::runtime::git::host_git_failure(&error)
                                ),
                            });
                            break;
                        }
                    }
                }
                if staged > 0 {
                    self.chat_messages.push(ChatMessage {
                        role: ChatRole::System,
                        text: format!(
                            "Staged {staged} approved file{} (git add). Rejected/skipped files were left unchanged.",
                            if staged == 1 { "" } else { "s" }
                        ),
                    });
                }
            }
        }
    }

    fn terminal_title(&self) -> Option<String> {
        let cwd = std::env::current_dir()
            .ok()
            .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
            .unwrap_or_default();
        let session_id: String = self.session.runtime_session_id.chars().take(8).collect();
        build_terminal_title(
            &self.terminal_title_config,
            &session_id,
            &self.model_name,
            &cwd,
            self.git_branch.as_deref(),
        )
    }

    /// Best-effort: a title-set escape never affects the screen.
    fn emit_terminal_title(&self) {
        if !super::tui_active() {
            return;
        }
        if let Some(title) = self.terminal_title() {
            set_terminal_title(title);
        }
    }
}

static TERMINAL_TITLE_STACKED: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

fn set_terminal_title(title: String) {
    let mut stdout = io::stdout();
    #[cfg(unix)]
    if !TERMINAL_TITLE_STACKED.swap(true, std::sync::atomic::Ordering::Relaxed) {
        use std::io::Write;
        let _ = stdout.write_all(b"\x1b[22;0t");
    }
    let _ = stdout.execute(crossterm::terminal::SetTitle(title));
}

fn release_terminal_title() {
    if TERMINAL_TITLE_STACKED.swap(false, std::sync::atomic::Ordering::Relaxed) {
        use std::io::Write;
        let mut stdout = io::stdout();
        let _ = stdout.write_all(b"\x1b[23;0t");
        let _ = stdout.flush();
    }
}

/// Build the OS window-title string from the enabled fields. `None` when no field
/// is enabled (so the caller does not set an empty title). Pure, unit-tested.
fn build_terminal_title(
    cfg: &crate::tui::widgets::terminal_title_setup::TerminalTitleConfig,
    session_id: &str,
    model: &str,
    cwd: &str,
    branch: Option<&str>,
) -> Option<String> {
    let plain = |text: &str| -> String {
        sanitize_terminal_text(text)
            .chars()
            .map(|c| if c.is_whitespace() { ' ' } else { c })
            .collect()
    };
    let mut parts: Vec<String> = Vec::new();
    if cfg.show_session_id && !session_id.is_empty() {
        parts.push(format!("#{}", plain(session_id)));
    }
    if cfg.show_model && !model.is_empty() {
        parts.push(plain(model));
    }
    if cfg.show_cwd && !cwd.is_empty() {
        parts.push(plain(cwd));
    }
    if cfg.show_branch {
        if let Some(b) = branch {
            parts.push(format!("⎇ {}", plain(b)));
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(format!("agi · {}", parts.join(" · ")))
    }
}

fn crossterm_to_keyaction(
    key: crossterm::event::KeyEvent,
) -> crate::tui::widgets::interactive::KeyAction {
    use crate::tui::widgets::interactive::KeyAction;
    use crossterm::event::KeyCode;
    match key.code {
        KeyCode::Up => KeyAction::Up,
        KeyCode::Down => KeyAction::Down,
        KeyCode::Left => KeyAction::Left,
        KeyCode::Right => KeyAction::Right,
        KeyCode::Enter => KeyAction::Enter,
        KeyCode::Esc => KeyAction::Esc,
        KeyCode::Tab => KeyAction::Tab,
        KeyCode::BackTab => KeyAction::ShiftTab,
        KeyCode::Backspace => KeyAction::Backspace,
        KeyCode::Home => KeyAction::Home,
        KeyCode::End => KeyAction::End,
        KeyCode::PageUp => KeyAction::PageUp,
        KeyCode::PageDown => KeyAction::PageDown,
        KeyCode::Char(c) => KeyAction::Char(c),
        _ => KeyAction::Char(' '),
    }
}

// ---------------------------------------------------------------------------
// Tool approval (TUI overlay path)
// ---------------------------------------------------------------------------

/// Map an approval-overlay button choice to the broker decision the tool layer
/// understands. "Allow once" persists nothing; "Always Allow" is recorded in
/// the `PermissionStore` by the tool layer so later calls skip the prompt;
/// "Deny" / "Deny All" both stop *this* call (Deny All additionally latches the
/// broker so the rest of the turn's requests auto-cancel).
fn approval_choice_to_decision(
    choice: crate::tui::widgets::approval_overlay::ApprovalChoice,
) -> crate::tui::approval_broker::ApprovalDecision {
    use crate::tui::approval_broker::ApprovalDecision;
    use crate::tui::widgets::approval_overlay::ApprovalChoice;
    match choice {
        ApprovalChoice::Yes => ApprovalDecision::AllowOnce,
        ApprovalChoice::AllowSession => ApprovalDecision::AllowSession,
        ApprovalChoice::AlwaysAllow => ApprovalDecision::AlwaysAllow,
        ApprovalChoice::No => ApprovalDecision::Deny,
        ApprovalChoice::DenyAll => ApprovalDecision::Cancel,
        ApprovalChoice::AllowAll => ApprovalDecision::AllowOnce,
    }
}

/// Build the approval overlay for one request.
///
/// The summary and detail lines are the model's own command line and diff
/// hunks; they are stripped here because the overlay paints them directly
/// above the y/n prompt they describe.
fn approval_overlay_for(
    request: &crate::tui::approval_broker::ApprovalRequest,
) -> crate::tui::widgets::approval_overlay::ApprovalOverlayState {
    let mut overlay = crate::tui::widgets::approval_overlay::ApprovalOverlayState::default();
    overlay.open(
        sanitize_terminal_text(&request.summary).into_owned(),
        crate::approval_details::commit_line(request)
            .into_iter()
            .chain(
                request
                    .detail
                    .iter()
                    .map(|line| sanitize_terminal_text(line).into_owned()),
            )
            .collect(),
    );
    overlay.always_allow_unavailable = !request.saves_always_allow;
    overlay.set_targets(crate::tui::widgets::approval_overlay::targets_for(
        &request.kind,
    ));
    if let crate::tui::approval_broker::ApprovalRequestKind::Exec { command } = &request.kind {
        if crate::features::exec::exec_policy::proposed_allow_prefix(command).is_none() {
            overlay.always_allow_unavailable = true;
        }
    }
    overlay
}

/// Render a keyboard-navigable approval modal and return the user's choice.
///
/// The agent turn is parked on the broker (`request().await`) while this runs,
/// so a synchronous key loop here cannot starve it. This intentionally touches
/// only `terminal` + local overlay state, never `TuiApp`, so it composes with
/// the `&mut app.session` borrow held by the in-flight agent future. To avoid
/// blanking the surrounding UI (header/cost-HUD/transcript/composer/status),
/// each frame first redraws the normal in-turn chrome via `draw_turn_chrome`
/// (the same helper `render_turn_frame` uses) and then layers the approval
/// overlay on top *within the same `terminal.draw` closure*, mirroring how
/// `render()` composites `active_overlay`/pickers on top of the main frame.
fn run_tui_approval_modal(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    ctx: &FrameCtx,
    request: &crate::tui::approval_broker::ApprovalRequest,
    settled_elsewhere: &dyn Fn() -> bool,
) -> Result<
    Option<(
        crate::tui::widgets::approval_overlay::ApprovalChoice,
        Option<String>,
    )>,
> {
    use crate::tui::widgets::approval_overlay::ApprovalChoice;
    use crate::tui::widgets::interactive::{InteractiveView, ViewAction};

    let mut overlay = approval_overlay_for(request);
    let expires_at = Instant::now() + APPROVAL_EXPIRY;

    loop {
        if Instant::now() >= expires_at || settled_elsewhere() {
            terminal.draw(|frame| {
                draw_turn_chrome(frame, ctx);
            })?;
            return Ok(None);
        }
        terminal.draw(|frame| {
            let chat_area = draw_turn_chrome(frame, ctx);
            // Drawn last within the same closure so it composites on top of
            // the chrome that was just painted, instead of replacing it.
            overlay.render_into(frame, chat_area);
        })?;

        if event::poll(super::motion::FRAME_INTERVAL)? {
            match event::read()? {
                Event::Key(key) => match overlay.handle_key(crossterm_to_keyaction(key)) {
                    ViewAction::Submit(_) | ViewAction::Close => {
                        // Force a full chrome-only redraw before returning
                        // control to the main loop so no stale overlay
                        // fragments can linger in the terminal's diff state.
                        terminal.draw(|frame| {
                            draw_turn_chrome(frame, ctx);
                        })?;
                        let note = overlay.note();
                        return Ok(Some((overlay.result.unwrap_or(ApprovalChoice::No), note)));
                    }
                    ViewAction::Continue | ViewAction::SideAction(_) => {}
                },
                Event::Paste(text) => overlay.insert_note_text(&sanitize_terminal_text(&text)),
                _ => {}
            }
        }
    }
}

fn run_tui_question_modal(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    ctx: &FrameCtx,
    question: &str,
    options: &[String],
) -> Result<Option<String>> {
    use crate::tui::widgets::interactive::{InteractiveView, ViewAction};

    let mut overlay =
        crate::tui::widgets::question_overlay::QuestionOverlayState::new(question, options);
    loop {
        terminal.draw(|frame| {
            let chat_area = draw_turn_chrome(frame, ctx);
            overlay.render_into(frame, chat_area);
        })?;
        if !event::poll(super::motion::FRAME_INTERVAL)? {
            continue;
        }
        match event::read()? {
            Event::Key(key) => match overlay.handle_key(crossterm_to_keyaction(key)) {
                ViewAction::Submit(_) | ViewAction::Close => {
                    terminal.draw(|frame| {
                        draw_turn_chrome(frame, ctx);
                    })?;
                    return Ok(overlay.answer.take());
                }
                ViewAction::Continue | ViewAction::SideAction(_) => {}
            },
            Event::Paste(text) => overlay.insert_text(&sanitize_terminal_text(&text)),
            _ => {}
        }
    }
}

fn mcp_elicitation_overlay(
    pending: crate::mcp::tui_handler::PendingElicitation,
) -> crate::tui::widgets::elicitation_overlay::ElicitationOverlayState {
    let mut overlay = crate::tui::widgets::elicitation_overlay::ElicitationOverlayState::default();
    overlay.open(pending.server_name, pending.request);
    overlay
}

fn handle_mcp_elicitation_event(
    overlay: &mut crate::tui::widgets::elicitation_overlay::ElicitationOverlayState,
    event: Event,
) -> Option<agiworkforce_mcp::ElicitationResponse> {
    use crate::tui::widgets::interactive::{InteractiveView, KeyAction, ViewAction};

    let action = match event {
        Event::Key(key) => overlay.handle_key(crossterm_to_keyaction(key)),
        Event::Paste(text) => {
            for character in sanitize_terminal_text(&text).chars() {
                let _ = overlay.handle_key(KeyAction::Char(character));
            }
            ViewAction::Continue
        }
        _ => ViewAction::Continue,
    };
    match action {
        ViewAction::Submit(_) | ViewAction::Close => Some(
            overlay
                .result
                .take()
                .unwrap_or_else(agiworkforce_mcp::ElicitationResponse::cancel),
        ),
        ViewAction::Continue | ViewAction::SideAction(_) => None,
    }
}

/// Drive an out-of-band MCP elicitation while the TUI is idle.
fn run_idle_mcp_elicitation_modal(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    app: &TuiApp,
    pending: crate::mcp::tui_handler::PendingElicitation,
) -> Result<agiworkforce_mcp::ElicitationResponse> {
    let mut overlay = mcp_elicitation_overlay(pending);
    loop {
        terminal.draw(|frame| {
            let chat_area = draw_app_frame(frame, app);
            overlay.render_into(frame, chat_area);
        })?;
        if event::poll(super::motion::FRAME_INTERVAL)? {
            if let Some(response) = handle_mcp_elicitation_event(&mut overlay, event::read()?) {
                terminal.draw(|frame| {
                    draw_app_frame(frame, app);
                })?;
                return Ok(response);
            }
        }
    }
}

/// Drive an MCP elicitation while an agent turn is awaiting the server. This
/// mirrors tool approvals: the model future remains parked while the terminal
/// loop gathers the user's structured response.
fn run_turn_mcp_elicitation_modal(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    ctx: &FrameCtx,
    pending: crate::mcp::tui_handler::PendingElicitation,
) -> Result<agiworkforce_mcp::ElicitationResponse> {
    let mut overlay = mcp_elicitation_overlay(pending);
    loop {
        terminal.draw(|frame| {
            let chat_area = draw_turn_chrome(frame, ctx);
            overlay.render_into(frame, chat_area);
        })?;
        if event::poll(super::motion::FRAME_INTERVAL)? {
            if let Some(response) = handle_mcp_elicitation_event(&mut overlay, event::read()?) {
                terminal.draw(|frame| {
                    draw_turn_chrome(frame, ctx);
                })?;
                return Ok(response);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Terminal setup
// ---------------------------------------------------------------------------

/// Leave the terminal usable if the TUI panics.
///
/// `restore_terminal` only runs on the normal return path, and the release
/// profile builds with `panic = "abort"` and `strip = true`. Without this hook
/// a panic drops the user back into a shell that is still in raw mode inside
/// the alternate screen with a hidden cursor, no echo, no line editing, and no
/// visible message, which needs a blind `reset` to recover. Undoing the three
/// terminal state changes before chaining to the previous hook means the
/// panic message actually lands on a working terminal.
fn install_panic_restore_hook() {
    static INSTALLED: std::sync::Once = std::sync::Once::new();
    INSTALLED.call_once(|| {
        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            restore_terminal_state();
            previous(info);
        }));
    });
}

/// Undo the three terminal changes `setup_terminal` makes, without a handle on
/// the `Terminal`. The panic hook and the signal hook both need this; only the
/// ordinary exit path still owns the terminal it set up.
fn restore_terminal_state() {
    if !super::tui_active() {
        return;
    }
    let mut stdout = io::stdout();
    let _ = disable_raw_mode();
    let _ = stdout.execute(DisableBracketedPaste);
    let _ = stdout.execute(LeaveAlternateScreen);
    let _ = stdout.execute(crossterm::cursor::Show);
    release_terminal_title();
    super::set_tui_active(false);
}

/// Leave the terminal usable and take no child with us when the process is
/// told to stop.
///
/// A panic already restores the terminal and an ordinary exit already does, but
/// `kill`, a closed terminal window and a shell shutting down all arrive as
/// signals, and none of them ran either path: the user was dropped into raw
/// mode inside the alternate screen with no cursor, and any command the agent
/// had started outlived the session.
#[cfg(unix)]
fn install_signal_restore_hook() {
    use tokio::signal::unix::{signal, SignalKind};

    static INSTALLED: std::sync::Once = std::sync::Once::new();
    INSTALLED.call_once(|| {
        for (kind, status) in [(SignalKind::terminate(), 143), (SignalKind::hangup(), 129)] {
            let Ok(mut stream) = signal(kind) else {
                continue;
            };
            tokio::spawn(async move {
                if stream.recv().await.is_some() {
                    restore_terminal_state();
                    crate::process_tree::kill_all_process_trees();
                    std::process::exit(status);
                }
            });
        }
    });
}

/// The Windows equivalents: closing the console window and a system shutdown
/// both end the process without unwinding, exactly as a signal does elsewhere.
#[cfg(windows)]
fn install_signal_restore_hook() {
    use tokio::signal::windows::{ctrl_break, ctrl_close, ctrl_shutdown};

    static INSTALLED: std::sync::Once = std::sync::Once::new();
    INSTALLED.call_once(|| {
        macro_rules! on_event {
            ($make:expr, $status:expr) => {
                if let Ok(mut stream) = $make {
                    tokio::spawn(async move {
                        if stream.recv().await.is_some() {
                            restore_terminal_state();
                            crate::process_tree::kill_all_process_trees();
                            std::process::exit($status);
                        }
                    });
                }
            };
        }
        on_event!(ctrl_close(), 143);
        on_event!(ctrl_shutdown(), 143);
        on_event!(ctrl_break(), 130);
    });
}

#[cfg(not(any(unix, windows)))]
fn install_signal_restore_hook() {}

fn setup_terminal() -> Result<Terminal<CrosstermBackend<Stdout>>> {
    install_panic_restore_hook();
    install_signal_restore_hook();
    enable_raw_mode()?;
    super::terminal_palette::requery_default_colors();
    let mut stdout = io::stdout();
    stdout.execute(EnterAlternateScreen)?;
    stdout.execute(EnableBracketedPaste)?;
    let backend = CrosstermBackend::new(stdout);
    let terminal = Terminal::new(backend)?;
    super::set_tui_active(true);
    Ok(terminal)
}

fn restore_terminal(terminal: &mut Terminal<CrosstermBackend<Stdout>>) -> Result<()> {
    super::set_tui_active(false);
    disable_raw_mode()?;
    terminal.backend_mut().execute(DisableBracketedPaste)?;
    terminal.backend_mut().execute(LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

fn render(terminal: &mut Terminal<CrosstermBackend<Stdout>>, app: &TuiApp) -> Result<()> {
    terminal.draw(|frame| {
        draw_app_frame(frame, app);
    })?;
    Ok(())
}

/// Draw the complete idle TUI frame and return its chat area so a modal can be
/// composited over the exact same frame without blanking the transcript.
fn draw_app_frame(frame: &mut ratatui::Frame, app: &TuiApp) -> Rect {
    let area = frame.area();

    // Dynamic input height: border(2) + attachment chip row + content rows (1..=8)
    let input_height = 2
        + attachment_chip_rows(&app.staged_images)
        + generated_chip_rows(&app.generated_images)
        + composer_content_rows(&app.input);
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(HEADER_ROWS),  // header
            Constraint::Min(5),               // chat area
            Constraint::Length(input_height), // input (grows with content)
            Constraint::Length(1),            // status bar
        ])
        .split(area);

    let ctx = FrameCtx::from_app(app);
    render_header(frame, chunks[0], &ctx);
    render_chat(frame, chunks[1], &ctx);
    render_input(frame, chunks[2], app);
    render_status_bar(frame, chunks[3], &ctx);
    render_fallback_banner(frame, chunks[1], app);

    // Mode-change banner (self-clears after MODE_BANNER_TTL)
    render_mode_banner(frame, chunks[1], app);

    // Popups (only one visible at a time; effort picker takes lowest priority)
    if app.effort_picker.visible {
        super::widgets::effort_picker::render(frame, chunks[1], &app.effort_picker);
    }

    if app.theme_picker.visible {
        super::widgets::theme_picker::render(frame, chunks[1], &app.theme_picker);
    }

    if app.agent_picker.visible {
        super::widgets::agent_picker::render(frame, chunks[1], &app.agent_picker);
    } else if app.model_picker.visible {
        super::widgets::model_picker::render(frame, chunks[1], &app.model_picker, &app.model_name);
    }

    // Modal overlay drawn last so it sits on top of everything.
    if let Some(ref ov) = app.active_overlay {
        render_overlay(frame, chunks[1], ov.as_ref(), app.overlay_scroll);
    }

    chunks[1]
}

/// Live in-turn frame. Drawn on each 80ms tick while the send future holds
/// `&mut app.session`, so it can only consume a `FrameCtx` of disjoint fields,
/// never `&app`. Mirrors `render`'s layout (header / chat / composer / status)
/// minus the picker/overlay/HUD layers, which are never active mid-turn. This is
/// what makes streamed output, the animated spinner, and the stall hint visible
/// during a turn instead of appearing all at once when it ends.
fn render_turn_frame(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    ctx: &FrameCtx,
    draft: &str,
    queued: usize,
) -> Result<()> {
    terminal.draw(|frame| {
        draw_turn_chrome_with(frame, ctx, turn_composer_hint(draft, queued));
    })?;
    Ok(())
}

fn turn_composer_hint(draft: &str, queued: usize) -> String {
    let queued = match queued {
        0 => String::new(),
        1 => " · 1 message queued".to_string(),
        count => format!(" · {count} messages queued"),
    };
    match draft.lines().last() {
        Some(line) if !draft.trim().is_empty() => {
            format!("  › {line}  (Enter to queue, /btw to ask aside){queued}")
        }
        _ => format!("  … working, Esc or Ctrl-C to cancel · type to queue a message{queued}"),
    }
}

/// Draws the header/chat/composer-hint/status chrome shared by the live
/// in-turn frame (`render_turn_frame`) and the tool-approval modal
/// (`run_tui_approval_modal`), which layers its overlay on top of this within
/// the same `terminal.draw` closure instead of replacing it. Returns the chat
/// area (`chunks[1]`) so callers can composite additional content over it.
fn draw_turn_chrome(frame: &mut ratatui::Frame, ctx: &FrameCtx) -> Rect {
    draw_turn_chrome_with(
        frame,
        ctx,
        "  … working, Esc or Ctrl-C to cancel".to_string(),
    )
}

fn draw_turn_chrome_with(frame: &mut ratatui::Frame, ctx: &FrameCtx, hint: String) -> Rect {
    let area = frame.area();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(HEADER_ROWS), // header
            Constraint::Min(5),              // chat area
            Constraint::Length(3),           // composer (disabled during a turn)
            Constraint::Length(1),           // status bar
        ])
        .split(area);

    render_header(frame, chunks[0], ctx);
    render_chat(frame, chunks[1], ctx);

    let hint = Paragraph::new(Line::from(Span::styled(
        hint,
        Style::default().fg(crate::tui::terminal_palette::ui_muted()),
    )))
    .block(
        Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(crate::tui::terminal_palette::ui_muted())),
    );
    frame.render_widget(hint, chunks[2]);

    render_status_bar(frame, chunks[3], ctx);

    chunks[1]
}

/// Braille spinner frame for a given tick. Free fn so it can be computed from a
/// `Copy` field during a turn (when `&app`/`&self` is unavailable because the
/// send future holds `&mut app.session`).
fn spinner_frame(tick: u8) -> &'static str {
    const FRAMES: &[&str] = &["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    if super::motion::reduced() {
        return super::motion::STILL_SPINNER;
    }
    FRAMES[(tick as usize) % FRAMES.len()]
}

fn answer_details(
    model: &str,
    turn: &crate::agent::TurnResult,
    elapsed: std::time::Duration,
) -> String {
    let mut parts = vec![
        crate::model_catalog::display_name(model),
        format!(
            "{} in · {} out",
            crate::output::format_tokens(turn.input_tokens),
            crate::output::format_tokens(turn.output_tokens)
        ),
    ];
    if turn.cost_usd > 0.0 && !turn.via_subscription {
        parts.push(crate::output::format_session_credits(turn.cost_usd));
    }
    parts.push(crate::output::format_duration_ms(elapsed.as_millis() as u64));
    parts.join(" · ")
}

/// AGI loading verb shown beside the spinner: one plain, steady word, the same
/// register Claude Code and Codex use, not a rotating vocabulary.
const LOADING_VERB: &str = "Thinking";

/// Append a post-tool-call continuation chunk to the buffered reply. A
/// continuation that resumes mid-sentence needs nothing; one that starts a
/// fresh thought after a tool call needs a paragraph break, or it reads as
/// "I'll read the file.First line:" with no separator at all.
fn append_continuation_chunk(buf: &mut String, chunk: &str) {
    if !buf.is_empty() && !buf.ends_with(char::is_whitespace) {
        buf.push_str("\n\n");
    }
    buf.push_str(chunk);
}

/// Disjoint snapshot of the fields the header/chat/status renderers read. Built
/// either from `&TuiApp` (normal frame) or field-by-field during a turn (live
/// frame), the latter is why these are owned/borrowed values rather than
/// `&TuiApp`: while the send future holds `&mut app.session`, the renderers may
/// only touch fields *other* than `session`, so they can't take `&app`.
struct FrameCtx<'a> {
    model_name: &'a str,
    provider_name: &'a str,
    git_branch: Option<&'a str>,
    context_window: Option<usize>,
    working_path: String,
    total_input_tokens: u32,
    total_output_tokens: u32,
    turn_count: u32,
    context: ContextSnapshot,
    chrome: FrameChrome<'a>,
    chat_messages: &'a [ChatMessage],
    tool_cells: &'a [ToolCell],
    is_loading: bool,
    stream_start: Option<Instant>,
    stream_buffer: &'a str,
    spinner_char: &'a str,
    loading_verb: &'a str,
    awaiting_approval: bool,
    scroll_offset: u16,
    access_mode: crate::design_system::AccessMode,
    /// Session privacy boundary (governs whether a send is allowed). Distinct
    /// from `access_mode`, which only reflects where the active model routes.
    privacy_mode: crate::agent::PrivacyMode,
    mode: InteractionMode,
    effort_label: &'a str,
    cost_str: String,
    /// Transient notice shown ahead of the optional status-bar fields.
    notice: Option<&'a str>,
    /// Which statusline fields the user has enabled (model/tokens/cost/branch/mode).
    statusline: &'a super::widgets::statusline_setup::StatusLineConfig,
    workspace_pane: Option<&'a [String]>,
    /// The key bound to quit, as the keybinding config names it; `None` when
    /// nothing is bound, so the footer offers no quit hint.
    quit_key: Option<&'a str>,
}

/// How full the context window is: the percentage the meters draw and the
/// token figures behind it.
#[derive(Clone, Copy)]
struct ContextSnapshot {
    percent: u8,
    used_tokens: usize,
    limit_tokens: usize,
}

impl ContextSnapshot {
    fn of(usage: &crate::compaction::ContextUsage) -> Self {
        Self {
            percent: (usage.fraction * 100.0).clamp(0.0, 100.0) as u8,
            used_tokens: usage.used_tokens,
            limit_tokens: usage.limit_tokens,
        }
    }
}

/// What the start screen offers beyond the model: the account plan when the
/// session is Managed, and the last sessions in this folder. The sessions are
/// read on a background thread, since the store parses every saved session;
/// `None` is "still reading".
#[derive(Default)]
struct StartPanel {
    plan: Option<String>,
    recent: Arc<std::sync::Mutex<Option<Vec<String>>>>,
}

const START_PANEL_RECENT_SESSIONS: usize = 3;

impl StartPanel {
    fn new(access_mode: crate::design_system::AccessMode) -> Self {
        let plan = (access_mode == crate::design_system::AccessMode::Cloud)
            .then(crate::tier_cache::read_tier_cache)
            .flatten()
            .map(|cached| cached.tier.label().to_string());
        Self {
            plan,
            recent: Arc::default(),
        }
    }

    /// A plain thread, not a runtime task: the runtime waits for its blocking
    /// tasks at exit, and a slow store must not hold up quitting.
    fn read_recent_sessions(&self) {
        let slot = Arc::clone(&self.recent);
        std::thread::spawn(move || {
            let cwd = std::env::current_dir()
                .map(|cwd| cwd.display().to_string())
                .unwrap_or_default();
            let rows = crate::sessions::open_db()
                .and_then(|conn| crate::sessions::list_sessions(&conn, usize::MAX))
                .map(|sessions| {
                    recent_session_rows(&sessions, &cwd, chrono::Utc::now().timestamp_millis())
                })
                .unwrap_or_default();
            if let Ok(mut recent) = slot.lock() {
                *recent = Some(rows);
            }
        });
    }
}

/// Rows for the start screen: the newest sessions that ran in `cwd`, each as
/// how long ago it was last used and its title. Both clocks are milliseconds,
/// the unit the session store records.
fn recent_session_rows(
    sessions: &[crate::sessions::SessionSummary],
    cwd: &str,
    now_millis: i64,
) -> Vec<String> {
    sessions
        .iter()
        .filter(|session| session.cwd == cwd && session.message_count > 0 && !session.archived)
        .take(START_PANEL_RECENT_SESSIONS)
        .map(|session| {
            format!(
                "{}  {}",
                time_ago_label(now_millis.saturating_sub(session.updated_at) / 1_000),
                truncate_cols(&sanitize_terminal_text(&session.display_title()), 48)
            )
        })
        .collect()
}

fn time_ago_label(seconds: i64) -> String {
    const MINUTE: i64 = 60;
    const HOUR: i64 = 60 * MINUTE;
    const DAY: i64 = 24 * HOUR;
    match seconds {
        s if s < MINUTE => "just now".to_string(),
        s if s < HOUR => format!("{}m ago", s / MINUTE),
        s if s < DAY => format!("{}h ago", s / HOUR),
        s => format!("{}d ago", s / DAY),
    }
}

/// The parts of a frame that come from beyond the session: whether a browser
/// is paired, and the start screen's extras.
struct FrameChrome<'a> {
    browser: crate::browser_bridge::BrowserAvailability,
    plan: Option<&'a str>,
    recent: Option<Vec<String>>,
    whats_new: Option<String>,
}

impl<'a> FrameChrome<'a> {
    /// `start_screen` is true only while the start screen is the thing drawn,
    /// the one place the plan, recent sessions and release summary appear.
    fn new(
        browser: &Arc<std::sync::Mutex<crate::browser_bridge::BrowserAvailability>>,
        start: &'a StartPanel,
        start_screen: bool,
    ) -> Self {
        Self {
            browser: browser
                .lock()
                .map(|state| *state)
                .unwrap_or(crate::browser_bridge::BrowserAvailability::ShellNotRunning),
            plan: start.plan.as_deref(),
            recent: if start_screen {
                start.recent.lock().ok().and_then(|recent| recent.clone())
            } else {
                None
            },
            whats_new: if start_screen { whats_new_line() } else { None },
        }
    }
}

/// The running build's release summary, once the startup update check has
/// fetched it. A summary for any other version is not about this build.
fn whats_new_line() -> Option<String> {
    whats_new_for(
        crate::update_check::latest_known_release()?,
        crate::update_check::running_version(),
    )
}

fn whats_new_for(release: &crate::update_check::CliRelease, running: &str) -> Option<String> {
    if release.version != running {
        return None;
    }
    let summary = release.release_notes.as_ref()?.summary.as_deref()?;
    let one_line = summary.split_whitespace().collect::<Vec<_>>().join(" ");
    (!one_line.is_empty()).then(|| sanitize_terminal_text(&one_line).into_owned())
}

impl<'a> FrameCtx<'a> {
    fn from_app(app: &'a TuiApp) -> Self {
        FrameCtx {
            workspace_pane: app.workspace_pane.as_deref(),
            model_name: &app.model_name,
            statusline: &app.statusline_config,
            provider_name: &app.provider_name,
            git_branch: app.git_branch.as_deref(),
            context_window: model_context_window(&app.model_name),
            working_path: crate::onboarding::current_working_path(),
            total_input_tokens: app.session.total_input_tokens,
            total_output_tokens: app.session.total_output_tokens,
            turn_count: app.session.turn_count,
            context: app.context_snapshot(),
            chrome: FrameChrome::new(&app.browser, &app.start_panel, app.chat_messages.is_empty()),
            chat_messages: &app.chat_messages,
            tool_cells: &app.tool_cells,
            is_loading: app.is_loading,
            stream_start: app.stream_start,
            stream_buffer: &app.stream_buffer,
            spinner_char: app.spinner_char(),
            loading_verb: LOADING_VERB,
            awaiting_approval: false,
            scroll_offset: app.scroll_offset,
            access_mode: provider_access_mode(&app.session.provider),
            privacy_mode: app.session.privacy_mode,
            mode: app.mode,
            effort_label: app.visible_effort_label(),
            cost_str: crate::output::format_session_credits(app.session.cost_ledger.total_usd),
            notice: app.live_notice(),
            quit_key: app
                .keybindings
                .display(crate::keybindings::KeybindingAction::Quit),
        }
    }
}

impl TuiApp {
    /// The status-line notice while it is still within its TTL.
    fn live_notice(&self) -> Option<&str> {
        self.status_notice
            .as_ref()
            .filter(|(_, at)| at.elapsed() <= STATUS_NOTICE_TTL)
            .map(|(text, _)| text.as_str())
            .or(self.remote_label.as_deref())
    }
}

fn model_context_window(model: &str) -> Option<usize> {
    crate::model_catalog::find(model)
        .map(|entry| entry.context_window)
        .filter(|window| *window > 0)
}

fn context_window_label(tokens: usize) -> String {
    const THOUSAND: usize = 1_000;
    const MILLION: usize = 1_000_000;
    if tokens >= MILLION {
        let millions = format!("{:.1}", tokens as f64 / MILLION as f64);
        format!("{}M context", millions.trim_end_matches(".0"))
    } else if tokens >= THOUSAND {
        format!("{}K context", tokens / THOUSAND)
    } else {
        format!("{tokens} context")
    }
}

fn header_line(ctx: &FrameCtx, with_context: bool, with_path: bool) -> Line<'static> {
    use crate::tui::terminal_palette::{ui_accent, ui_brand, ui_muted};

    let mut spans = vec![
        Span::styled(
            format!(" {} ", crate::PRODUCT_NAME),
            Style::default().fg(ui_brand()).add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            format!(" v{} ", env!("CARGO_PKG_VERSION")),
            Style::default().fg(ui_muted()),
        ),
        Span::raw(" │ "),
        Span::styled(
            ctx.model_name.to_string(),
            Style::default().add_modifier(Modifier::BOLD),
        ),
    ];
    if let Some(window) = ctx.context_window.filter(|_| with_context) {
        spans.push(Span::styled(
            format!(" ({})", context_window_label(window)),
            Style::default().fg(ui_muted()),
        ));
    }
    spans.push(Span::raw(" │ "));
    spans.push(Span::styled(
        ctx.provider_name.to_string(),
        Style::default().fg(ui_accent()),
    ));

    if let Some(branch) = ctx.git_branch {
        spans.push(Span::raw(" │ "));
        spans.push(Span::styled(
            format!(" {branch}"),
            Style::default().fg(ui_muted()),
        ));
    }

    if with_path && !ctx.working_path.is_empty() {
        spans.push(Span::raw(" │ "));
        spans.push(Span::styled(
            ctx.working_path.clone(),
            Style::default().fg(ui_muted()),
        ));
    }

    let mut line = Line::from(spans);
    sanitize_terminal_line(&mut line);
    line
}

fn fitted_header_line(ctx: &FrameCtx, width: usize) -> Line<'static> {
    [(true, true), (true, false), (false, false)]
        .into_iter()
        .map(|(with_context, with_path)| header_line(ctx, with_context, with_path))
        .find(|line| line.width() <= width)
        .unwrap_or_else(|| header_line(ctx, false, false))
}

/// What this turn's tool calls are doing, the way the header counts them. A
/// call waiting on the user's approval is awaiting, not working.
#[derive(Debug, PartialEq, Eq)]
struct ActivityCounts {
    awaiting: usize,
    working: usize,
    completed: usize,
    failed: usize,
}

fn activity_counts(ctx: &FrameCtx) -> ActivityCounts {
    use crate::tui::transcript_cell::TranscriptCellState;

    let count = |state: TranscriptCellState| {
        ctx.tool_cells
            .iter()
            .filter(|cell| cell.state == state)
            .count()
    };
    let awaiting = usize::from(ctx.awaiting_approval);
    let running = count(TranscriptCellState::Running);
    let thinking = usize::from(ctx.is_loading && running == 0 && !ctx.awaiting_approval);
    ActivityCounts {
        awaiting,
        working: running.saturating_sub(awaiting) + thinking,
        completed: count(TranscriptCellState::Complete),
        failed: count(TranscriptCellState::Failed),
    }
}

/// The counts in full and, for a narrow row, in short.
fn activity_counts_labels(counts: &ActivityCounts) -> [String; 2] {
    let failed = if counts.failed > 0 {
        format!(" · {} failed", counts.failed)
    } else {
        String::new()
    };
    [
        format!(
            " {} awaiting input · {} working · {} completed{failed}",
            counts.awaiting, counts.working, counts.completed
        ),
        format!(
            " {} awaiting · {} working · {} done{failed}",
            counts.awaiting, counts.working, counts.completed
        ),
    ]
}

const HEADER_METER_CELLS: usize = 10;

fn context_color(percent: u8) -> Color {
    use crate::tui::terminal_palette::{ui_accent, ui_danger, ui_success};
    if percent >= 85 {
        ui_danger()
    } else if percent >= 60 {
        ui_accent()
    } else {
        ui_success()
    }
}

fn context_meter_label(percent: u8) -> String {
    let filled = (usize::from(percent) * HEADER_METER_CELLS / 100).min(HEADER_METER_CELLS);
    format!(
        "context {}{} {percent}% ",
        "█".repeat(filled),
        "░".repeat(HEADER_METER_CELLS - filled),
    )
}

/// The header's second row: what the agent is doing on the left, how full the
/// context window is on the right. The meter yields first when the row is
/// narrow, then the counts are clipped; neither is ever dropped silently.
fn header_status_line(ctx: &FrameCtx, width: usize) -> Line<'static> {
    use crate::tui::terminal_palette::ui_muted;

    let labels = activity_counts_labels(&activity_counts(ctx));
    let meter = context_meter_label(ctx.context.percent);
    let muted = Style::default().fg(ui_muted());
    let mut spans = Vec::new();
    let with_meter = labels
        .iter()
        .find(|label| display_width(label) + display_width(&meter) < width);
    if let Some(label) = with_meter {
        let gap = width - display_width(label) - display_width(&meter);
        spans.push(Span::styled(label.clone(), muted));
        spans.push(Span::raw(" ".repeat(gap)));
        spans.push(Span::styled(
            meter,
            Style::default().fg(context_color(ctx.context.percent)),
        ));
    } else {
        let label = labels
            .iter()
            .find(|label| display_width(label) <= width)
            .unwrap_or(&labels[1]);
        spans.push(Span::styled(truncate_cols(label, width), muted));
    }
    let mut line = Line::from(spans);
    sanitize_terminal_line(&mut line);
    line
}

fn render_header(frame: &mut ratatui::Frame, area: Rect, ctx: &FrameCtx) {
    use crate::tui::terminal_palette::ui_muted;

    let width = area.width.saturating_sub(2) as usize;
    let header_text = vec![
        fitted_header_line(ctx, width),
        header_status_line(ctx, width),
    ];

    // The header and the transcript are one continuous frame: the header owns
    // the top border, the transcript the sides, and the row between them is a
    // tee-junction divider, never a `└┘` that closes a box the content then
    // carries on inside. Tokens, cost and turns render once, in the footer
    // status line; this block carries no title and the divider no label.
    let block = Block::default()
        .borders(Borders::TOP | Borders::LEFT | Borders::RIGHT)
        .border_style(Style::default().fg(ui_muted()));

    frame.render_widget(Paragraph::new(header_text).block(block), area);
    render_header_divider(frame, area);
}

/// Draw the header/transcript divider across the last row of the header area.
fn render_header_divider(frame: &mut ratatui::Frame, area: Rect) {
    use crate::tui::terminal_palette::ui_muted;
    if area.height < 2 || area.width < 2 {
        return;
    }
    let style = Style::default().fg(ui_muted());
    let inner = area.width as usize - 2;
    let line = Line::from(vec![
        Span::styled("├", style),
        Span::styled("─".repeat(inner), style),
        Span::styled("┤", style),
    ]);
    let row = Rect {
        x: area.x,
        y: area.y + area.height - 1,
        width: area.width,
        height: 1,
    };
    frame.render_widget(Paragraph::new(line), row);
}

const HEADER_ROWS: u16 = 4;
const WORKSPACE_PANE_MIN_WIDTH: u16 = 90;
const WORKSPACE_PANE_MAX_LINES: usize = 2000;

fn workspace_pane_lines() -> Vec<String> {
    match crate::runtime::git::diff_for_command("head") {
        Ok(read) => {
            let mut lines: Vec<String> = read.summary().lines().map(str::to_string).collect();
            if !read.diff.is_empty() {
                lines.push(String::new());
                lines.extend(read.text.lines().map(str::to_string));
            }
            lines.truncate(WORKSPACE_PANE_MAX_LINES);
            lines
        }
        Err(message) => vec![message],
    }
}

fn render_workspace_pane(frame: &mut ratatui::Frame, area: Rect, pane: &[String]) {
    use crate::tui::terminal_palette::{ui_accent, ui_danger, ui_muted, ui_success};
    let lines: Vec<Line> = pane
        .iter()
        .map(|line| {
            let text = crate::terminal_text::sanitize_terminal_text(line);
            let style = if line.starts_with("+++") || line.starts_with("---") {
                Style::default().add_modifier(Modifier::BOLD)
            } else if line.starts_with('+') {
                Style::default().fg(ui_success())
            } else if line.starts_with('-') {
                Style::default().fg(ui_danger())
            } else if line.starts_with("@@") {
                Style::default().fg(ui_accent())
            } else if line.starts_with("diff --git") || line.starts_with("index ") {
                Style::default().fg(ui_muted())
            } else {
                Style::default()
            };
            Line::from(Span::styled(text, style))
        })
        .collect();
    let pane = Paragraph::new(lines).block(
        Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(ui_muted()))
            .title(" Workspace · changes since the last commit "),
    );
    frame.render_widget(pane, area);
}

fn render_chat(frame: &mut ratatui::Frame, area: Rect, ctx: &FrameCtx) {
    let area = match ctx.workspace_pane {
        Some(pane) if area.width >= WORKSPACE_PANE_MIN_WIDTH => {
            let columns = Layout::default()
                .direction(Direction::Horizontal)
                .constraints([Constraint::Percentage(58), Constraint::Percentage(42)])
                .split(area);
            render_workspace_pane(frame, columns[1], pane);
            columns[0]
        }
        _ => area,
    };
    use crate::tui::terminal_palette::{
        ui_accent, ui_brand, ui_cloud, ui_danger, ui_muted, ui_success,
    };
    let mut lines: Vec<Line> = Vec::new();
    let start_view = ctx.chat_messages.is_empty() && !ctx.is_loading;

    if start_view {
        use crate::design_system::AccessMode;
        // Access-mode colors match the status-bar chip so the visual identity is
        // consistent across the app. The word is the same "Local" / "Your key" /
        // "Managed" trust-boundary vocabulary the status chip and VS Code use.
        let (mode_tail, mode_color) = match ctx.access_mode {
            AccessMode::Local => ("on-device & private", ui_success()),
            AccessMode::Byok => ("billed by your provider", ui_accent()),
            AccessMode::Cloud => ("AGI cloud subscription", ui_cloud()),
        };
        let mode_label = match ctx.chrome.plan {
            Some(plan) => format!("{} · {plan} · {mode_tail}", ctx.access_mode.trust_word()),
            None => format!("{} · {mode_tail}", ctx.access_mode.trust_word()),
        };

        lines.push(Line::from(""));
        lines.push(Line::from(vec![
            Span::styled(
                "  Welcome to AGI",
                Style::default().fg(ui_brand()).add_modifier(Modifier::BOLD),
            ),
            Span::styled(
                format!(" v{}", env!("CARGO_PKG_VERSION")),
                Style::default().add_modifier(Modifier::BOLD),
            ),
        ]));
        lines.push(Line::from(""));
        // Orient the user: which model are they on, reached via which mode.
        lines.push(Line::from(vec![
            Span::styled("  Model  ", Style::default().fg(ui_muted())),
            Span::styled(
                ctx.model_name.to_string(),
                Style::default().add_modifier(Modifier::BOLD),
            ),
            Span::styled("   ◉ ", Style::default().fg(mode_color)),
            Span::styled(mode_label, Style::default().fg(mode_color)),
        ]));
        if !ctx.working_path.is_empty() {
            lines.push(Line::from(vec![
                Span::styled("  Folder ", Style::default().fg(ui_muted())),
                Span::styled(ctx.working_path.clone(), Style::default().fg(ui_muted())),
            ]));
        }
        lines.push(Line::from(Span::styled(
            "  Choose Local, Your key, or Managed with /model.",
            Style::default().fg(ui_muted()),
        )));
        lines.push(Line::from(""));
        if ctx.chrome.recent.is_some() {
            lines.push(Line::from(Span::styled(
                "  Recent activity",
                Style::default().add_modifier(Modifier::BOLD),
            )));
        }
        match &ctx.chrome.recent {
            None => {}
            Some(rows) if rows.is_empty() => {
                lines.push(Line::from(Span::styled(
                    "    No recent activity",
                    Style::default().fg(ui_muted()),
                )));
            }
            Some(rows) => {
                for row in rows {
                    lines.push(Line::from(Span::styled(
                        format!("    {row}"),
                        Style::default().fg(ui_muted()),
                    )));
                }
                lines.push(Line::from(Span::styled(
                    "    /resume for more",
                    Style::default().fg(ui_muted()),
                )));
            }
        }
        if let Some(summary) = &ctx.chrome.whats_new {
            lines.push(Line::from(Span::styled(
                "  What's new",
                Style::default().add_modifier(Modifier::BOLD),
            )));
            lines.push(Line::from(Span::styled(
                format!("    {summary}"),
                Style::default().fg(ui_muted()),
            )));
        }
        lines.push(Line::from(Span::styled(
            "    /help for more",
            Style::default().fg(ui_muted()),
        )));
        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled(
            "  Type a message and press Enter to send.",
            Style::default().fg(ui_muted()),
        )));
        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled(
            "  Type / for commands · Shift+Tab to change how much AGI does alone.",
            Style::default().fg(ui_muted()),
        )));
        lines.push(Line::from(Span::styled(
            "  Esc clears · Ctrl+D twice to quit · /keys for all keys.",
            Style::default().fg(ui_muted()),
        )));
    } else {
        for msg in ctx.chat_messages {
            if msg.role == ChatRole::Detail {
                lines.push(Line::from(Span::styled(
                    format!("    ↳ {}", msg.text),
                    Style::default().fg(ui_muted()),
                )));
                continue;
            }
            if !lines.is_empty() {
                lines.push(Line::from(""));
            }

            let (prefix, prefix_style) = match msg.role {
                ChatRole::User => (
                    "  > ",
                    Style::default()
                        .fg(ui_accent())
                        .add_modifier(Modifier::BOLD),
                ),
                ChatRole::Assistant => (
                    "  ✦ ",
                    Style::default().fg(ui_brand()).add_modifier(Modifier::BOLD),
                ),
                ChatRole::Teammate => (
                    "  ◆ ",
                    Style::default().fg(ui_brand()).add_modifier(Modifier::BOLD),
                ),
                ChatRole::System => (
                    "  ℹ ",
                    Style::default()
                        .fg(ui_accent())
                        .add_modifier(Modifier::BOLD),
                ),
                ChatRole::Error => (
                    "  ✗ ",
                    Style::default()
                        .fg(ui_danger())
                        .add_modifier(Modifier::BOLD),
                ),
                ChatRole::Detail => ("  ↳ ", Style::default().fg(ui_muted())),
            };

            let (sender, text) = if msg.role == ChatRole::Teammate {
                msg.text.split_once('\n').unwrap_or((msg.text.as_str(), ""))
            } else {
                ("", msg.text.as_str())
            };
            let mut prefix_spans = vec![Span::styled(prefix.to_string(), prefix_style)];
            if !sender.is_empty() {
                prefix_spans.push(Span::styled(sender.to_string(), prefix_style));
            }
            lines.push(Line::from(prefix_spans));

            // Use full markdown renderer for assistant messages
            if msg.role == ChatRole::Assistant {
                let md_lines = super::markdown_renderer::render_markdown(text);
                lines.extend(md_lines);
            } else {
                // Simple rendering for user/system/error messages
                for text_line in text.lines() {
                    let style = match msg.role {
                        ChatRole::User => Style::default(),
                        ChatRole::Teammate => Style::default(),
                        ChatRole::System => Style::default(),
                        ChatRole::Error => Style::default(),
                        ChatRole::Detail => Style::default().fg(ui_muted()),
                        // Assistant is handled by the outer if-branch; reaching
                        // here would be a logic error but we render it as plain
                        // default foreground rather than panicking so the TUI stays responsive.
                        ChatRole::Assistant => Style::default(),
                    };
                    let content = format!("    {text_line}");
                    lines.push(Line::from(parse_inline_md(&content, style)));
                }
            }
        }
    }

    // Tool-call rows: a visible record of what the agent did this turn
    // (running → succeeded/failed), instead of vanishing into swallowed stderr.
    if !ctx.tool_cells.is_empty() {
        lines.push(Line::from(""));
        let running: Vec<&ToolCell> = ctx
            .tool_cells
            .iter()
            .filter(|cell| cell.state == crate::tui::transcript_cell::TranscriptCellState::Running)
            .collect();
        if running.len() > 1 {
            let what = if running
                .iter()
                .all(|cell| matches!(cell.name.as_str(), "task" | "agent"))
            {
                "subagents"
            } else {
                "tools"
            };
            lines.push(Line::from(Span::styled(
                format!("  ⧉ {} {what} working at once", running.len()),
                Style::default().fg(ui_accent()),
            )));
        }
        for cell in ctx.tool_cells {
            lines.extend(tool_cell_lines(cell, ctx.spinner_char));
        }
    }

    // Loading indicator with shimmer
    if ctx.is_loading {
        lines.push(Line::from(""));
        let elapsed = ctx.stream_start.map(|s| s.elapsed()).unwrap_or_default();
        let elapsed_str = if elapsed.as_secs() >= 60 {
            format!("{}m {}s", elapsed.as_secs() / 60, elapsed.as_secs() % 60)
        } else {
            format!("{}s", elapsed.as_secs())
        };
        let verb = ctx.loading_verb;
        // After ~10s with no streamed output yet, add a gentle stall hint so a
        // slow first token (cold local model, network) doesn't look like a hang.
        let stalled = ctx.stream_buffer.is_empty() && elapsed.as_secs() >= 10;
        let status = if ctx.awaiting_approval {
            "Waiting for your approval".to_string()
        } else if stalled {
            format!("{verb}… {elapsed_str} · still working")
        } else {
            format!("{verb}… {elapsed_str}")
        };
        let mut spinner_line: Vec<Span<'static>> = vec![Span::styled(
            format!("  {} ", ctx.spinner_char),
            Style::default().fg(ui_accent()),
        )];
        spinner_line.extend(super::shimmer::shimmer_spans(&status));
        lines.push(Line::from(spinner_line));

        // Live streamed output. During a turn this is redrawn each tick, so show
        // a generous tail (not just 5 lines) for a real streaming feel.
        if !ctx.stream_buffer.is_empty() {
            lines.extend(streaming_markdown_tail(ctx.stream_buffer));
        }
    }

    // Assistant, tool, and streamed provider text all land in these spans, and
    // ratatui hands a span's bytes to the terminal unchanged.
    sanitize_terminal_lines(&mut lines);

    // Wrap here rather than with `Wrap`, which restarts a continuation row at
    // column 0 and puts the text hard against the left border. Wrapping first
    // also makes the scroll maths count rendered rows, not logical lines.
    let mut lines = super::wrap_styled_lines(lines, area.width.saturating_sub(2) as usize, 2);

    // Scroll
    let visible_height = area.height.saturating_sub(1) as usize;
    if start_view && ctx.tool_cells.is_empty() {
        let inner_width = area.width.saturating_sub(2) as usize;
        let block_width = lines.iter().map(Line::width).max().unwrap_or(0);
        let left = " ".repeat(inner_width.saturating_sub(block_width) / 2);
        for line in &mut lines {
            line.spans.insert(0, Span::raw(left.clone()));
        }
        let top = visible_height.saturating_sub(lines.len()) / 2;
        lines.splice(0..0, std::iter::repeat_with(|| Line::from("")).take(top));
    }
    let total_lines = lines.len();
    let max_scroll = total_lines.saturating_sub(visible_height) as u16;
    let effective_scroll = ctx.scroll_offset.min(max_scroll);
    let scroll_pos = max_scroll.saturating_sub(effective_scroll);

    let block = Block::default()
        .borders(Borders::LEFT | Borders::RIGHT | Borders::BOTTOM)
        .border_style(Style::default().fg(ui_muted()));

    let chat = Paragraph::new(lines).block(block).scroll((scroll_pos, 0));

    frame.render_widget(chat, area);
}

fn parse_inline_md(text: &str, base_style: Style) -> Vec<Span<'static>> {
    let mut spans: Vec<Span<'static>> = Vec::new();
    let mut remaining = text.to_string();
    let bold_style = base_style.add_modifier(Modifier::BOLD);
    let code_style = Style::default().fg(crate::tui::terminal_palette::ui_accent());

    while !remaining.is_empty() {
        if let Some(start) = remaining.find("**") {
            if let Some(end) = remaining[start + 2..].find("**") {
                if start > 0 {
                    spans.push(Span::styled(remaining[..start].to_string(), base_style));
                }
                let bold_text = &remaining[start + 2..start + 2 + end];
                spans.push(Span::styled(bold_text.to_string(), bold_style));
                remaining = remaining[start + 2 + end + 2..].to_string();
                continue;
            }
        }

        if let Some(start) = remaining.find('`') {
            if remaining[start..].starts_with("```") {
                spans.push(Span::styled(remaining.clone(), base_style));
                break;
            }
            if let Some(end) = remaining[start + 1..].find('`') {
                if start > 0 {
                    spans.push(Span::styled(remaining[..start].to_string(), base_style));
                }
                let code_text = &remaining[start + 1..start + 1 + end];
                spans.push(Span::styled(code_text.to_string(), code_style));
                remaining = remaining[start + 1 + end + 1..].to_string();
                continue;
            }
        }

        spans.push(Span::styled(remaining.clone(), base_style));
        break;
    }

    if spans.is_empty() {
        spans.push(Span::styled(String::new(), base_style));
    }
    spans
}

fn render_input(frame: &mut ratatui::Frame, area: Rect, app: &TuiApp) {
    use crate::tui::terminal_palette::ui_muted;

    let prompt_char = match app.mode {
        InteractionMode::Chat => "> ",
        InteractionMode::Plan => "P ",
        InteractionMode::AcceptEdits => "A ",
        InteractionMode::BypassPermissions => "! ",
        InteractionMode::FullAuto => "F ",
    };

    let prompt_width = prompt_char_width(prompt_char);

    let exit_armed = app
        .exit_armed_at
        .is_some_and(|armed| armed.elapsed() <= EXIT_CONFIRM_WINDOW);

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(ui_muted()))
        .title(format!(" {} ", app.mode.label()));

    // Attachment chips sit above the message, so a staged image is visible
    // without the user having to remember they pasted one.
    let chip_rows =
        attachment_chip_rows(&app.staged_images) + generated_chip_rows(&app.generated_images);
    let mut leading: Vec<Line> = Vec::new();
    if !app.staged_images.is_empty() {
        leading.push(Line::from(Span::styled(
            attachment_chip_line(&app.staged_images),
            Style::default().fg(app.mode.color()),
        )));
    }
    if !app.generated_images.is_empty() {
        leading.push(Line::from(Span::styled(
            generated_chip_line(&app.generated_images),
            Style::default().fg(app.mode.color()),
        )));
    }

    if app.input.is_empty() && !app.is_loading {
        // Show placeholder on single line
        let placeholder_line = Line::from(vec![
            Span::styled(
                prompt_char,
                Style::default()
                    .fg(app.mode.color())
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled(
                if exit_armed {
                    "Press the same key again to exit"
                } else {
                    "Message AGI...  / for commands"
                },
                Style::default().fg(ui_muted()),
            ),
        ]);
        let mut lines = leading;
        lines.push(placeholder_line);
        sanitize_terminal_lines(&mut lines);
        let widget = Paragraph::new(lines).block(block);
        frame.render_widget(widget, area);
        // Position cursor after prompt character
        let cursor_x = area.x + 1 + prompt_width;
        let cursor_y = area.y + 1 + chip_rows;
        frame.set_cursor_position((cursor_x, cursor_y));
        return;
    }

    // Multiline: split input by '\n' and render each line.
    let style = Style::default();
    let prompt_style = Style::default()
        .fg(app.mode.color())
        .add_modifier(Modifier::BOLD);

    let lines_text: Vec<&str> = app.input.split('\n').collect();
    let mut lines: Vec<Line> = leading;
    lines.extend(lines_text.iter().enumerate().map(|(i, &text)| {
        if i == 0 {
            Line::from(vec![
                Span::styled(prompt_char, prompt_style),
                Span::styled(text.to_string(), style),
            ])
        } else {
            // Indent continuation lines to align with text after prompt
            let indent = " ".repeat(prompt_width as usize);
            Line::from(vec![
                Span::styled(indent, style),
                Span::styled(text.to_string(), style),
            ])
        }
    }));

    sanitize_terminal_lines(&mut lines);

    let widget = Paragraph::new(lines).block(block);
    frame.render_widget(widget, area);

    if !app.is_loading {
        // Compute cursor (row, col) within the multiline content
        let cursor_byte = floor_char_boundary(&app.input, app.cursor);
        let text_before = &app.input[..cursor_byte];
        let cursor_row = text_before.chars().filter(|&c| c == '\n').count();
        let line_start_byte = text_before.rfind('\n').map(|p| p + 1).unwrap_or(0);
        let col_text_width = Line::from(text_before[line_start_byte..].to_string()).width() as u16;

        // Continuation rows align under the first line's text, same as row 0.
        let indent_width = prompt_width;
        let cursor_x = area.x + 1 + indent_width + col_text_width;
        let cursor_y = area.y + 1 + chip_rows + cursor_row as u16;
        frame.set_cursor_position((cursor_x, cursor_y));
    }
}

/// One row when images are staged for the next turn, none otherwise. The chip
/// row is what tells the user an attachment is pending, so the composer grows
/// by it rather than overwriting a line of their message.
fn attachment_chip_rows(staged: &[String]) -> u16 {
    u16::from(!staged.is_empty())
}

/// The chip line: what is attached, and how to drop it.
fn attachment_chip_line(staged: &[String]) -> String {
    let names: Vec<&str> = staged.iter().map(String::as_str).collect();
    format!("📎 {} · /attach remove to drop", names.join(", "))
}

/// One row when `/image` has produced something this session. A generated
/// file the user never sees the path of is a silent result, so the composer
/// grows by the row rather than printing the path once and losing it up the
/// transcript.
fn generated_chip_rows(generated: &[std::path::PathBuf]) -> u16 {
    u16::from(!generated.is_empty())
}

/// The generated-image chip: the newest file, and how to open it.
fn generated_chip_line(generated: &[std::path::PathBuf]) -> String {
    let Some(newest) = generated.last() else {
        return String::new();
    };
    let name = newest
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("image");
    let more = match generated.len() {
        0 | 1 => String::new(),
        count => format!(" (+{} more)", count - 1),
    };
    format!("🖼 {name}{more} · /image open to view · /image clear to dismiss")
}

/// Return the number of display rows needed for the input composer content
/// (excluding the 2 border rows). Minimum 1, maximum 8.
fn composer_content_rows(input: &str) -> u16 {
    let newlines = input.chars().filter(|&c| c == '\n').count() as u16;
    (newlines + 1).clamp(1, 8)
}

fn prompt_char_width(prompt_char: &str) -> u16 {
    Line::from(prompt_char.to_string()).width() as u16
}

#[cfg(test)]
fn input_prefix_display_width(input: &str, cursor: usize) -> u16 {
    let cursor = floor_char_boundary(input, cursor);
    Line::from(input[..cursor].to_string()).width() as u16
}

fn render_fallback_banner(frame: &mut ratatui::Frame, chat_area: Rect, app: &TuiApp) {
    use crate::tui::terminal_palette::{ui_on_light, ui_warning};
    let Some(banner) = app.current_fallback_banner() else {
        return;
    };
    let text = format!(
        " ↘ Falling back: {} → {} ({})  ",
        sanitize_terminal_text(&banner.from),
        sanitize_terminal_text(&banner.to),
        sanitize_terminal_text(&banner.reason)
    );
    let width = (display_width(&text) as u16).min(chat_area.width.saturating_sub(2));
    if width == 0 {
        return;
    }
    let area = Rect {
        x: chat_area.x + (chat_area.width.saturating_sub(width)) / 2,
        y: chat_area.y,
        width,
        height: 1,
    };
    let banner_widget = Paragraph::new(Line::from(Span::styled(
        text,
        Style::default()
            .fg(ui_on_light())
            .bg(ui_warning())
            .add_modifier(Modifier::BOLD),
    )));
    frame.render_widget(banner_widget, area);
}

/// Process-global cache of locally-discovered models (Ollama / LM Studio),
/// converted to catalog `Model`s so the `/model` picker can show a Local
/// section for what's actually installed. Populated by a non-blocking
/// background probe at TUI startup (see the spawn after `TuiApp::new`), so
/// launch never waits on the 2.5s local-probe timeout. Read synchronously by
/// the (sync) `/model` slash handler.
static DISCOVERED_LOCAL_MODELS: std::sync::OnceLock<
    std::sync::Mutex<Vec<crate::model_catalog::Model>>,
> = std::sync::OnceLock::new();

/// Compose every live picker source in one place so opening, searching, and
/// keyboard navigation cannot silently drop a dynamic source.
fn available_picker_models() -> Vec<crate::model_catalog::Model> {
    let mut models = crate::model_catalog::catalog().all().to_vec();
    models.extend(crate::models::openrouter_models::load_cached_models());
    models.extend(crate::models::gateway_models::cached_picker_models());
    if let Some(cache) = DISCOVERED_LOCAL_MODELS.get() {
        if let Ok(local) = cache.lock() {
            models.extend(local.iter().cloned());
        }
    }
    models
}

/// Map a discovered local model into a catalog `Model`. Provider is what places
/// the row in the picker's Local section (`ProviderId::from_catalog_name`); the
/// other fields are presentation-only defaults since context window, tool
/// support, and routing are re-resolved at model-switch time.
fn discovered_local_to_catalog_model(
    d: &crate::local_models::DiscoveredLocalModel,
) -> crate::model_catalog::Model {
    crate::model_catalog::Model {
        id: d.id.clone(),
        provider: d.provider.clone(),
        display_name: d.id.clone(),
        context_window: 0,
        max_output_tokens: 0,
        input_price_per_1m: 0.0,
        output_price_per_1m: 0.0,
        cache_read_price_per_1m: 0.0,
        cache_write_price_per_1m: 0.0,
        supports_tools: false,
        supports_vision: false,
        supports_reasoning: false,
        supports_audio_input: false,
        supports_audio_output: false,
        supports_pdf: false,
        release_date: String::new(),
        status: "active".to_string(),
        cloud_eligible: false,
        requires_environment: None,
    }
}

/// Classify the active runtime provider into an access mode for the status
/// chip. Presentation only, mirrors the model-picker grouping and never
/// affects routing. A keyless OpenAI-compatible endpoint (e.g. LM Studio) and
/// Ollama are Local; the AGI-managed endpoint is Cloud; anything with a key is
/// BYOK.
fn provider_access_mode(provider: &crate::models::Provider) -> crate::design_system::AccessMode {
    use crate::design_system::AccessMode;
    use crate::models::{OllamaMode, Provider};
    match provider {
        Provider::ManagedCloud => AccessMode::Cloud,
        // Local Ollama is on-device; Ollama Cloud is a hosted service reached
        // with the user's key, so it is BYOK (data leaves the device).
        Provider::Ollama(OllamaMode::Local) => AccessMode::Local,
        Provider::Ollama(OllamaMode::Cloud) => AccessMode::Byok,
        Provider::Custom { api_key_env, .. } => {
            if api_key_env.is_some() {
                AccessMode::Byok
            } else {
                AccessMode::Local
            }
        }
        Provider::OpenAICompatible {
            name, api_key_env, ..
        } => {
            if name.eq_ignore_ascii_case("agi-cloud") || name.eq_ignore_ascii_case("agicloud") {
                AccessMode::Cloud
            } else if api_key_env.is_none() {
                AccessMode::Local
            } else {
                AccessMode::Byok
            }
        }
        Provider::Anthropic | Provider::Google => AccessMode::Byok,
    }
}

/// Total terminal columns a row of spans occupies.
fn row_width(spans: &[Span]) -> usize {
    spans.iter().map(|s| display_width(&s.content)).sum()
}

fn token_counts_label(input: u32, output: u32) -> String {
    format!(
        "in {} · out {}",
        crate::output::format_tokens(input),
        crate::output::format_tokens(output)
    )
}

fn compact_token_counts_label(turns: u32, input: u32, output: u32) -> String {
    format!(
        "T{turns}↑{}↓{}",
        crate::output::format_tokens(input),
        crate::output::format_tokens(output)
    )
}

const BROWSER_STATE_REFRESH: Duration = Duration::from_secs(15);

/// Keep the footer's browser state fresh without ever asking the desktop app
/// from the render loop.
fn spawn_browser_watch(
    slot: Arc<std::sync::Mutex<crate::browser_bridge::BrowserAvailability>>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        loop {
            let state = crate::browser_bridge::browser_state().await;
            if let Ok(mut current) = slot.lock() {
                *current = state.availability;
            }
            tokio::time::sleep(BROWSER_STATE_REFRESH).await;
        }
    })
}

/// The footer's word on the browser, from the last pairing check. With no
/// desktop app running there is nothing to report, and `/chrome` explains.
fn browser_footer_label(
    availability: crate::browser_bridge::BrowserAvailability,
) -> Option<&'static str> {
    use crate::browser_bridge::BrowserAvailability;
    match availability {
        BrowserAvailability::Paired => Some("browser paired · /chrome"),
        BrowserAvailability::PairedNotAnswering => Some("browser not answering · /chrome"),
        BrowserAvailability::NotPaired => Some("browser not paired · /chrome"),
        BrowserAvailability::ShellNotRunning => None,
    }
}

fn render_status_bar(frame: &mut ratatui::Frame, area: Rect, ctx: &FrameCtx) {
    use crate::tui::terminal_palette::{
        ui_accent, ui_cloud, ui_danger, ui_muted, ui_on_dark, ui_on_light, ui_status_bar_bg,
        ui_success, ui_warning,
    };
    let badge_fg = if ctx.mode == InteractionMode::Chat {
        ui_on_dark()
    } else {
        ui_on_light()
    };
    let cost_str = ctx.cost_str.clone();

    // Access-mode chip: always show whether the active model is reached via
    // Local (on-device), Your key (a provider key the user supplied), or
    // Managed (AGI's cloud subscription). Keeps AGI's core differentiator
    // visible at all times. Purely a label, it reflects the active provider,
    // it never changes routing.
    let access_span = |tier: usize| -> Span<'static> {
        use crate::agent::PrivacyMode;
        use crate::design_system::AccessMode;
        let name = ctx.access_mode.trust_word();
        let dot = if tier >= 2 { "" } else { "◉ " };
        // The session privacy mode governs whether a send is allowed; the access
        // tier only reflects where the active model routes. A Local session with
        // an off-device model is BLOCKED, surface the mismatch in danger color
        // so the session mode is visible.
        if ctx.privacy_mode == PrivacyMode::Local && ctx.access_mode != AccessMode::Local {
            Span::styled(
                format!("{dot}Local≠{name}"),
                Style::default()
                    .fg(ui_danger())
                    .add_modifier(Modifier::BOLD),
            )
        } else {
            let color = match ctx.access_mode {
                AccessMode::Local => ui_success(),
                AccessMode::Byok => ui_accent(),
                AccessMode::Cloud => ui_cloud(),
            };
            Span::styled(
                format!("{dot}{name}"),
                Style::default().fg(color).add_modifier(Modifier::BOLD),
            )
        }
    };

    // Context-usage fill bar with escalating color (green → accent → red),
    // shortened then reduced to a bare percentage as the terminal narrows.
    let ctx_pct = ctx.context.percent;
    let ctx_color = context_color(ctx_pct);
    let ctx_indicator = move |tier: usize| -> String {
        if tier >= 2 {
            return format!("{ctx_pct}%");
        }
        let bar_w = if tier == 0 { 8usize } else { 4usize };
        let filled = ((ctx_pct as usize * bar_w) / 100).min(bar_w);
        format!(
            "ctx [{}{}] {ctx_pct:>3}%",
            "█".repeat(filled),
            "░".repeat(bar_w - filled),
        )
    };

    // Indicators a user must be able to trust at a glance: the permission mode,
    // the access tier, context usage and the effort level. A narrow terminal
    // abbreviates these; it never silently drops one. The sandbox backend lives
    // in `/status` now, not here, see `footer_keeps_tokens_and_turns_at_every_width`.
    // Only the keyboard hints and the opt-in fields are droppable.
    let sl = ctx.statusline;
    let build_essentials = |tier: usize| -> Vec<Span<'static>> {
        let gap = if tier >= 2 { " " } else { "  " };
        let mut spans: Vec<Span<'static>> = Vec::new();
        if sl.show_mode {
            let label = if tier == 0 {
                ctx.mode.label().to_string()
            } else {
                clip_cols(ctx.mode.label(), 3)
            };
            spans.push(Span::styled(
                format!(" {label} "),
                Style::default().fg(badge_fg).bg(ctx.mode.color()),
            ));
            spans.push(Span::raw(" "));
        }
        spans.push(access_span(tier));
        spans.push(Span::raw(gap));
        spans.push(Span::styled(
            ctx_indicator(tier),
            Style::default().fg(ctx_color),
        ));
        if !ctx.effort_label.is_empty() {
            spans.push(Span::raw(gap));
            spans.push(Span::styled(
                match tier {
                    0 => format!("effort:{}", ctx.effort_label),
                    1 => format!("eff:{}", ctx.effort_label),
                    _ => format!("e:{}", clip_cols(ctx.effort_label, 1)),
                },
                Style::default().fg(ui_muted()),
            ));
        }
        spans
    };

    // The running total, tiered on its own budget: a long cost string that no
    // longer fits shrinks to bare token counts rather than abbreviating every
    // other indicator alongside it, and it is never dropped outright. Turns
    // rides along here too, the same cluster `/cost` reports.
    let cost_forms = move |tier: usize| -> Vec<String> {
        if !sl.show_cost {
            return Vec::new();
        }
        let counts = token_counts_label(ctx.total_input_tokens, ctx.total_output_tokens);
        let full = format!("{counts} · {cost_str} · T{}", ctx.turn_count);
        let short = format!("{counts} · T{}", ctx.turn_count);
        let shortest = compact_token_counts_label(
            ctx.turn_count,
            ctx.total_input_tokens,
            ctx.total_output_tokens,
        );
        match tier {
            0 => vec![full, short, shortest],
            1 => vec![short, shortest],
            _ => vec![shortest],
        }
    };

    // Keyboard hints in descending usefulness. The slash hint is the one that
    // teaches the app, so it is the last to go; each has a compact form, since
    // a hint that only appears at 180 columns is a hint most users never see.
    let quit_key = ctx.quit_key;
    let hints = move |tier: usize| -> Vec<String> {
        let (slash, quit, mode) = if tier == 0 {
            ("/: commands", ": quit", "Shift+Tab: mode")
        } else {
            ("/ cmds", " quit", "⇧⇥ mode")
        };
        std::iter::once(slash.to_string())
            .chain(quit_key.map(|key| format!("{key}{quit}")))
            .chain(std::iter::once(mode.to_string()))
            .collect()
    };

    let avail = area.width as usize;

    // Pick the lowest tier that still leaves room for the cost readout and the
    // slash hint. The untiered row put the indicators first and silently
    // dropped both below 180 columns, with no ellipsis to say so; abbreviating
    // an indicator is a smaller loss than a user never learning `/` exists.
    const HINTS_WORTH_ABBREVIATING_FOR: usize = 1;
    let row_target = |tier: usize| -> usize {
        let mut width = row_width(&build_essentials(tier));
        // The cost readout degrades on its own budget below, so the tier only
        // has to leave room for its shortest form.
        if let Some(form) = cost_forms(tier).last() {
            width += display_width(form) + 2;
        }
        for hint in hints(tier).iter().take(HINTS_WORTH_ABBREVIATING_FOR) {
            width += display_width(hint) + 2;
        }
        width
    };
    let tier = (0..=2).find(|tier| row_target(*tier) <= avail).unwrap_or(2);

    let mut spans = build_essentials(tier);
    let mut used = row_width(&spans);

    // A transient notice outranks the droppable fields: it is the only thing on
    // the bar telling the user what their last keypress actually did.
    if let Some(notice) = ctx.notice {
        let room = avail.saturating_sub(used + 2);
        if room > 0 {
            let text = truncate_cols(notice, room);
            used += display_width(&text) + 2;
            spans.push(Span::raw("  "));
            spans.push(Span::styled(
                text,
                Style::default()
                    .fg(ui_warning())
                    .add_modifier(Modifier::BOLD),
            ));
        }
    }

    if let Some(form) = cost_forms(tier)
        .into_iter()
        .find(|form| used + display_width(form) + 2 <= avail)
    {
        used += display_width(&form) + 2;
        spans.push(Span::raw("  "));
        spans.push(Span::styled(form, Style::default().fg(ui_muted())));
    }

    // Droppable extras in descending priority. A field that does not fit is
    // skipped rather than ending the loop, so a short hint still lands when a
    // long one ahead of it could not.
    let mut optional: Vec<Span> = Vec::new();
    if sl.show_model {
        optional.push(Span::styled(
            format!("model:{}", ctx.model_name),
            Style::default().fg(ui_muted()),
        ));
    }
    if sl.show_tokens {
        optional.push(Span::styled(
            format!(
                "{} · T{}",
                token_counts_label(ctx.total_input_tokens, ctx.total_output_tokens),
                ctx.turn_count
            ),
            Style::default().fg(ui_muted()),
        ));
    }
    if sl.show_branch {
        if let Some(branch) = ctx.git_branch {
            optional.push(Span::styled(
                format!("⎇ {branch}"),
                Style::default().fg(ui_muted()),
            ));
        }
    }
    if sl.show_context && ctx.context.limit_tokens > 0 {
        optional.push(Span::styled(
            format!(
                "context:{}/{}",
                crate::output::format_tokens(ctx.context.used_tokens as u32),
                crate::output::format_tokens(ctx.context.limit_tokens as u32)
            ),
            Style::default().fg(ui_muted()),
        ));
    }
    for hint in hints(tier) {
        optional.push(Span::styled(hint, Style::default().fg(ui_muted())));
    }
    if let Some(label) = browser_footer_label(ctx.chrome.browser) {
        optional.push(Span::styled(label, Style::default().fg(ui_muted())));
    }
    for opt in optional {
        let w = display_width(&opt.content) + 2;
        if used + w <= avail {
            spans.push(Span::raw("  "));
            spans.push(opt);
            used += w;
        }
    }

    let mut bar_line = Line::from(spans);
    sanitize_terminal_line(&mut bar_line);
    let bar =
        Paragraph::new(bar_line).style(Style::default().bg(ui_status_bar_bg()).fg(ui_on_dark()));
    frame.render_widget(bar, area);
}

/// Render the 2-second mode-cycle banner across the top of the chat area.
fn render_mode_banner(frame: &mut ratatui::Frame, chat_area: Rect, app: &TuiApp) {
    let Some(shown_at) = app.mode_banner_shown_at else {
        return;
    };
    if shown_at.elapsed() > MODE_BANNER_TTL {
        return;
    }
    let text = format!("  Mode: {} (shift+tab to cycle)  ", app.mode.label());
    let width = (display_width(&text) as u16).min(chat_area.width.saturating_sub(2));
    if width == 0 {
        return;
    }
    let area = Rect {
        x: chat_area.x + (chat_area.width.saturating_sub(width)) / 2,
        y: chat_area.y,
        width,
        height: 1,
    };
    use crate::tui::terminal_palette::{ui_on_dark, ui_on_light};
    // Use the same color as the mode badge, with semantic foreground contrast.
    let bg = app.mode.color();
    let fg = if app.mode == InteractionMode::Chat {
        ui_on_dark()
    } else {
        ui_on_light()
    };
    frame.render_widget(
        Paragraph::new(Line::from(Span::styled(
            text,
            Style::default().fg(fg).bg(bg).add_modifier(Modifier::BOLD),
        ))),
        area,
    );
}

fn render_overlay(
    frame: &mut ratatui::Frame,
    area: Rect,
    ov: &dyn crate::tui::widgets::interactive::InteractiveView,
    scroll_offset: u16,
) {
    ov.fit_rows(area.height);
    // Prefer a view's styled lines (e.g. the diff review's +/- coloring); fall
    // back to the plain text render for every other overlay.
    let mut lines: Vec<Line> = match ov.render_styled() {
        Some(styled) => styled,
        None => {
            let text = ov.render();
            if text.is_empty() {
                return;
            }
            text.lines().map(|l| Line::from(l.to_string())).collect()
        }
    };
    if lines.is_empty() {
        return;
    }
    // Overlays quote model, tool, and MCP text directly above a consent
    // prompt, so an escape here could repaint the decision the user is about
    // to give.
    sanitize_terminal_lines(&mut lines);
    // Each InteractiveView already renders its own complete box (with a title
    // row), so the overlay is sized to that content and drawn without a
    // ratatui border of its own.
    let height = (lines.len() as u16).min(area.height);
    let width = lines
        .iter()
        .map(|l| l.width() as u16)
        .max()
        .unwrap_or(0)
        .min(area.width);
    let overlay_area = Rect {
        x: area.x + area.width.saturating_sub(width) / 2,
        y: area.y + area.height.saturating_sub(height) / 2,
        width,
        height,
    };
    frame.render_widget(ratatui::widgets::Clear, overlay_area);
    let visible_lines = overlay_area.height as usize;
    let max_scroll = lines.len().saturating_sub(visible_lines) as u16;
    let scroll = scroll_offset.min(max_scroll);
    let para = Paragraph::new(lines)
        .style(Style::default().bg(super::terminal_palette::ui_surface_elevated()))
        .scroll((scroll, 0));
    frame.render_widget(para, overlay_area);
}

// ---------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------

/// What ended the session, as the Stop hook reports it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum QuitReason {
    QuitKey,
    Interrupt,
    ExitCommand,
}

impl QuitReason {
    fn label(self) -> &'static str {
        match self {
            Self::QuitKey => "quit_key",
            Self::Interrupt => "interrupt",
            Self::ExitCommand => "exit_command",
        }
    }
}

#[derive(Debug)]
enum InputAction {
    None,
    SendMessage(String),
    Quit(QuitReason),
    ScrollUp,
    ScrollDown,
    Redraw,
    ClearChat,
    CycleMode,
    OpenEditor,
}

fn handle_key_event(app: &mut TuiApp, key: KeyEvent) -> InputAction {
    // Overlay intercepts every key first.
    if let Some(action) = app.dispatch_key_to_overlay(key) {
        return action;
    }

    // Agent picker mode
    if app.agent_picker.visible {
        return handle_agent_picker_key(app, key);
    }

    // Model picker mode
    if app.model_picker.visible {
        return handle_model_picker_key(app, key);
    }

    // Effort picker mode
    if app.effort_picker.visible {
        return handle_effort_picker_key(app, key);
    }

    // Theme picker mode
    if app.theme_picker.visible {
        return handle_theme_picker_key(app, key);
    }

    if app.is_loading {
        if app
            .keybindings
            .matches(crate::keybindings::KeybindingAction::Quit, key)
        {
            return InputAction::Quit(QuitReason::QuitKey);
        }
        return InputAction::None;
    }

    // These legacy text-rendered dialogs advertise Esc as their local close
    // affordance. Keep that dismissal stable even when global quit changes.
    if key.code == KeyCode::Esc
        && app.chat_messages.last().is_some_and(|message| {
            message.role == ChatRole::System
                && super::widgets::screen_renderers::is_dialog_frame(&message.text)
        })
    {
        app.chat_messages.pop();
        return InputAction::None;
    }

    if app
        .keybindings
        .matches(crate::keybindings::KeybindingAction::Quit, key)
    {
        if !app.input.is_empty() {
            app.input.clear();
            app.cursor = 0;
            app.exit_armed_at = None;
            app.status_notice = Some(("cleared the composer".to_string(), Instant::now()));
            return InputAction::None;
        }
        if app
            .exit_armed_at
            .is_some_and(|armed| armed.elapsed() <= EXIT_CONFIRM_WINDOW)
        {
            app.exit_armed_at = None;
            return InputAction::Quit(QuitReason::QuitKey);
        }
        app.exit_armed_at = Some(Instant::now());
        app.status_notice = Some((
            format!(
                "press {} again to quit",
                app.keybindings
                    .display(crate::keybindings::KeybindingAction::Quit)
                    .unwrap_or("it")
            ),
            Instant::now(),
        ));
        return InputAction::None;
    }
    if key.code == KeyCode::Esc && key.modifiers.is_empty() {
        if !app.input.is_empty() {
            app.prompt_history.record(&app.input);
            app.input.clear();
            app.cursor = 0;
            app.rewind_armed_at = None;
            app.status_notice = Some((
                "cleared the composer · Up brings it back".to_string(),
                Instant::now(),
            ));
            return InputAction::None;
        }
        if app
            .rewind_armed_at
            .is_some_and(|armed| armed.elapsed() <= REWIND_CONFIRM_WINDOW)
        {
            app.rewind_armed_at = None;
            open_checkpoint_picker(app);
            return InputAction::None;
        }
        app.rewind_armed_at = Some(Instant::now());
        app.status_notice = Some(("press Esc again to rewind".to_string(), Instant::now()));
        return InputAction::None;
    }
    if app
        .keybindings
        .matches(crate::keybindings::KeybindingAction::CycleMode, key)
    {
        return InputAction::CycleMode;
    }
    if app
        .keybindings
        .matches(crate::keybindings::KeybindingAction::CycleModel, key)
    {
        cycle_model(app);
        return InputAction::None;
    }
    if app
        .keybindings
        .matches(crate::keybindings::KeybindingAction::ClearInput, key)
    {
        // Raw mode clears ISIG, so Ctrl-C arrives as a keypress and the process
        // has no keyboard exit at idle other than Esc. Give it the conventional
        // one: clear a composer that has something in it, and otherwise treat a
        // repeat inside the window as the deliberate exit it almost always is.
        if app.input.is_empty() {
            if app
                .exit_armed_at
                .is_some_and(|armed| armed.elapsed() <= EXIT_CONFIRM_WINDOW)
            {
                app.exit_armed_at = None;
                return InputAction::Quit(QuitReason::Interrupt);
            }
            app.exit_armed_at = Some(Instant::now());
            app.status_notice = Some((
                "nothing to interrupt · Ctrl-C again to exit".to_string(),
                Instant::now(),
            ));
            return InputAction::None;
        }
        app.input.clear();
        app.cursor = 0;
        app.exit_armed_at = None;
        app.status_notice = Some(("cleared the composer".to_string(), Instant::now()));
        return InputAction::None;
    }
    if app
        .keybindings
        .matches(crate::keybindings::KeybindingAction::Redraw, key)
    {
        return InputAction::Redraw;
    }
    if app
        .keybindings
        .matches(crate::keybindings::KeybindingAction::ClearChat, key)
    {
        return InputAction::ClearChat;
    }
    if app.input.is_empty()
        && app.cursor == 0
        && app
            .keybindings
            .matches(crate::keybindings::KeybindingAction::OpenPalette, key)
    {
        open_command_popup(app);
        return InputAction::None;
    }

    if super::composer_edits::is_undo_key(key) || super::composer_edits::is_redo_key(key) {
        let restored = if super::composer_edits::is_undo_key(key) {
            app.composer_undo.undo(&app.input, app.cursor)
        } else {
            app.composer_undo.redo(&app.input, app.cursor)
        };
        if let Some((input, cursor)) = restored {
            app.input = input;
            app.cursor = cursor.min(app.input.len());
        }
        return InputAction::None;
    }
    if super::composer_edits::is_external_editor_key(key) {
        return InputAction::OpenEditor;
    }
    if key.code == KeyCode::Char('o') && key.modifiers.contains(KeyModifiers::CONTROL) {
        let expanded = !EXPAND_TOOL_OUTPUT.fetch_xor(true, std::sync::atomic::Ordering::Relaxed);
        app.status_notice = Some((
            if expanded {
                "showing full tool output, Ctrl-O to collapse"
            } else {
                "tool output collapsed"
            }
            .to_string(),
            Instant::now(),
        ));
        return InputAction::None;
    }

    match key.code {
        // Shift+Enter or Alt+Enter → insert newline (multiline composer)
        KeyCode::Enter
            if key.modifiers.contains(KeyModifiers::SHIFT)
                || key.modifiers.contains(KeyModifiers::ALT) =>
        {
            insert_char_at_cursor(&mut app.input, &mut app.cursor, '\n');
            InputAction::None
        }

        // Plain Enter → submit message (claude.ai / ChatGPT parity)
        KeyCode::Enter => {
            let text = app.pasted_texts.expand(app.input.trim());
            if text.trim().is_empty() {
                return InputAction::None;
            }
            app.input.clear();
            app.cursor = 0;
            app.scroll_offset = 0;
            app.pasted_texts.clear();
            app.composer_undo.reset();
            InputAction::SendMessage(text)
        }

        // Ctrl+V pastes an image off the clipboard as an attachment. Text
        // pastes arrive through bracketed paste, not here, so this key is only
        // reached when the user asked for a clipboard image explicitly.
        KeyCode::Char('v') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            let notice = match app.stage_clipboard_image() {
                Ok(label) => format!("attached {label}"),
                Err(reason) => reason,
            };
            app.status_notice = Some((notice, Instant::now()));
            InputAction::None
        }

        // Ctrl-J is the terminal's own newline: 0x0A reaches crossterm as
        // Ctrl+J, and it is the only multi-line key a terminal without the
        // keyboard protocol can send, where Shift+Enter never arrives.
        KeyCode::Char('j') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            insert_char_at_cursor(&mut app.input, &mut app.cursor, '\n');
            InputAction::None
        }

        KeyCode::Char('u') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            kill_to_line_start(&mut app.input, &mut app.cursor);
            InputAction::None
        }

        // Every remaining control chord is a command this build does not bind.
        // Falling through to the insert arm below typed its letter into the
        // message instead, so Ctrl-J and Ctrl-U read as "j" and "u".
        KeyCode::Char(_) if key.modifiers.contains(KeyModifiers::CONTROL) => InputAction::None,

        KeyCode::Char(c) => {
            insert_char_at_cursor(&mut app.input, &mut app.cursor, c);
            // `@` at a word boundary opens the file picker, the same way `/` on
            // an empty composer opens the command popup.
            if c == '@' && crate::mentions::active_mention_query(&app.input, app.cursor).is_some() {
                open_mention_popup(app);
            }
            InputAction::None
        }

        KeyCode::Backspace => {
            backspace_at_cursor(&mut app.input, &mut app.cursor);
            InputAction::None
        }

        KeyCode::Delete => {
            delete_at_cursor(&mut app.input, &mut app.cursor);
            InputAction::None
        }

        KeyCode::Left => {
            app.cursor = previous_char_boundary(&app.input, app.cursor);
            InputAction::None
        }

        KeyCode::Right => {
            app.cursor = next_char_boundary(&app.input, app.cursor);
            InputAction::None
        }

        KeyCode::Home => {
            // Move to start of current line (not start of whole buffer).
            let cursor = floor_char_boundary(&app.input, app.cursor);
            let line_start = app.input[..cursor].rfind('\n').map(|p| p + 1).unwrap_or(0);
            app.cursor = line_start;
            InputAction::None
        }
        KeyCode::End if app.input.is_empty() || key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.scroll_offset = 0;
            InputAction::None
        }
        KeyCode::End => {
            // Move to end of current line (not end of whole buffer).
            let cursor = floor_char_boundary(&app.input, app.cursor);
            let line_end = app.input[cursor..]
                .find('\n')
                .map(|p| cursor + p)
                .unwrap_or(app.input.len());
            app.cursor = line_end;
            InputAction::None
        }

        // Up/Down: navigate within multiline composer when applicable, then
        // through earlier prompts, otherwise scroll the chat area.
        KeyCode::Up => {
            if composer_move_up(app) {
                InputAction::None
            } else if let Some(prompt) = app.prompt_history.older(&app.input) {
                app.input = prompt;
                app.cursor = app.input.len();
                InputAction::None
            } else {
                InputAction::ScrollUp
            }
        }
        KeyCode::Down => {
            if composer_move_down(app) {
                InputAction::None
            } else if let Some(prompt) = app.prompt_history.newer() {
                app.input = prompt;
                app.cursor = app.input.len();
                InputAction::None
            } else {
                InputAction::ScrollDown
            }
        }
        KeyCode::PageUp => InputAction::ScrollUp,
        KeyCode::PageDown => InputAction::ScrollDown,

        _ => InputAction::None,
    }
}

/// Try to move the composer cursor up one line. Returns true if a line move
/// was performed (cursor was not already on the first line), false otherwise.
fn composer_move_up(app: &mut TuiApp) -> bool {
    let cursor = floor_char_boundary(&app.input, app.cursor);
    // Find start of current line
    let line_start = app.input[..cursor].rfind('\n').map(|p| p + 1).unwrap_or(0);
    if line_start == 0 {
        // Already on the first line, let the event fall through to scroll chat.
        return false;
    }
    // Column offset within current line
    let col_offset = cursor - line_start;
    // Find start of previous line
    let prev_line_start = app.input[..line_start.saturating_sub(1)]
        .rfind('\n')
        .map(|p| p + 1)
        .unwrap_or(0);
    let prev_line_end = line_start - 1; // the '\n' itself
    let prev_line_len = prev_line_end - prev_line_start;
    // Land at same column or end of prev line
    app.cursor = prev_line_start + col_offset.min(prev_line_len);
    true
}

/// Try to move the composer cursor down one line. Returns true if a line move
/// was performed (cursor was not already on the last line), false otherwise.
fn composer_move_down(app: &mut TuiApp) -> bool {
    let cursor = floor_char_boundary(&app.input, app.cursor);
    // Find end of current line (next '\n' or end of buffer)
    let line_start = app.input[..cursor].rfind('\n').map(|p| p + 1).unwrap_or(0);
    let col_offset = cursor - line_start;
    // Find start of next line
    let next_newline = app.input[cursor..].find('\n');
    let Some(rel) = next_newline else {
        // Already on last line.
        return false;
    };
    let next_line_start = cursor + rel + 1;
    // Find end of next line
    let next_line_end = app.input[next_line_start..]
        .find('\n')
        .map(|p| next_line_start + p)
        .unwrap_or(app.input.len());
    let next_line_len = next_line_end - next_line_start;
    app.cursor = next_line_start + col_offset.min(next_line_len);
    true
}

/// Register any MCP-discovered prompt commands (`/mcp:<server>:<prompt>`)
/// into `registry` that aren't already present.
///
/// Idempotent: a prompt already registered by name is skipped, so this runs
/// when `TuiApp` is built and again once the background MCP attach finishes,
/// which is when most servers' prompts first exist.
fn register_mcp_prompt_commands(registry: &mut CommandRegistry, prompts: &[crate::mcp::McpPrompt]) {
    for prompt in prompts {
        if registry.find(&prompt.command_name).is_some() {
            continue;
        }
        let loaded_from = format!("mcp:{}", prompt.server_name);
        let mut registry_command = RegistryCommand::prompt(
            prompt.command_name.clone(),
            format!("[MCP:{}] {}", prompt.server_name, prompt.description),
            CommandSource::Mcp,
            Some(&loaded_from),
        );
        if !prompt.arguments.is_empty() {
            registry_command.argument_hint = Some(
                prompt
                    .arguments
                    .iter()
                    .map(|arg| {
                        if arg.required {
                            format!("{}=<value>", arg.name)
                        } else {
                            format!("[{}=<value>]", arg.name)
                        }
                    })
                    .collect::<Vec<_>>()
                    .join(" "),
            );
        }
        registry.push(registry_command);
    }
}

/// Open the session picker over the chat area. `/history` and a bare `/resume`
/// both land here: the listing is a panel Esc can close, not a stderr dump that
/// leaves Esc falling through to the global quit.
fn open_session_picker(app: &mut TuiApp, filter: &str) {
    use crate::tui::widgets::session_picker::{SessionEntry, SessionPickerView};

    let entries: Vec<SessionEntry> =
        match crate::platform::runtime::session_control::list_active_managed_sessions() {
            Ok(summaries) => summaries
                .iter()
                .map(|summary| SessionEntry {
                    id: summary.session_id.clone(),
                    label: format!(
                        "{}  {}  {}{}",
                        &summary.session_id[..summary.session_id.len().min(8)],
                        summary.updated_at.format("%Y-%m-%d %H:%M"),
                        crate::output::format_message_count(summary.message_count as i64),
                        summary
                            .title
                            .as_deref()
                            .map(|title| format!("  {title}"))
                            .unwrap_or_default(),
                    ),
                })
                .filter(|entry: &SessionEntry| {
                    filter.is_empty() || entry.label.to_lowercase().contains(&filter.to_lowercase())
                })
                .collect(),
            Err(error) => {
                app.chat_messages.push(ChatMessage {
                    role: ChatRole::System,
                    text: format!("Could not list sessions: {error:#}"),
                });
                return;
            }
        };
    if entries.is_empty() && !filter.is_empty() {
        app.status_notice = Some((format!("no session matches '{filter}'"), Instant::now()));
        return;
    }

    app.open_overlay(Box::new(SessionPickerView::new(entries)));
}

/// Adopt a session by id and report what happened in the transcript. The REPL
/// handler reports through stderr, which is invisible under the alternate
/// screen, so its "Loaded ..." line would be a claim the user never sees.
fn resume_session(reference: &str, app: &mut TuiApp) {
    use crate::platform::runtime::session_control as sessions;

    let text = match sessions::resolve_managed_session_reference(reference) {
        Ok(resolved) => match sessions::load_managed_session(reference) {
            Ok(managed) => {
                let session_id = managed.session_id.clone();
                let messages = managed.messages.clone();
                let count = messages.len();
                match app.session.adopt_managed_session(managed, resolved.path) {
                    Ok(()) => {
                        app.session.messages = messages;
                        app.session.turn_count = app
                            .session
                            .messages
                            .iter()
                            .filter(|message| message.role == "user")
                            .count() as u32;
                        app.sync_stats();
                        rebuild_transcript_from_session(app);
                        format!("Resumed session {session_id} ({count} messages).")
                    }
                    Err(error) => format!(
                        "Refusing to resume a session with unknown or incompatible routing authority: {error:#}"
                    ),
                }
            }
            Err(error) => format!("Could not load session: {error:#}"),
        },
        Err(error) => format!("No session matches `{reference}`: {error:#}"),
    };

    app.chat_messages.push(ChatMessage {
        role: ChatRole::System,
        text,
    });
}

fn open_checkpoint_picker(app: &mut TuiApp) {
    use crate::tui::widgets::checkpoint_picker::{CheckpointEntry, CheckpointPickerView};

    let summaries = app.session.checkpoint_summaries();
    let entries: Vec<CheckpointEntry> = summaries
        .iter()
        .rev()
        .enumerate()
        .map(|(offset, summary)| CheckpointEntry {
            steps: offset + 1,
            label: sanitize_terminal_text(&format!(
                "{}  {}  ({}{})",
                summary.created_at.format("%H:%M"),
                crate::repl::checkpoint_prompt_line(&summary.prompt),
                crate::repl::checkpoint_files_label(summary.tracked_files),
                if summary.conversation_available() {
                    ""
                } else {
                    "; code only"
                }
            ))
            .into_owned(),
            tracked_files: summary.tracked_files,
            conversation_available: summary.conversation_available(),
        })
        .collect();
    app.open_overlay(Box::new(CheckpointPickerView::new(entries)));
}

fn apply_rewind(app: &mut TuiApp, arg: &str) {
    let (message, rewound) = crate::repl::rewind_session(arg, &mut app.session);
    let conversation_restored = rewound
        .as_ref()
        .is_some_and(|rewound| rewound.conversation_restored);
    if conversation_restored {
        rebuild_transcript_from_session(app);
        app.tool_cells.clear();
    }
    app.chat_messages.push(ChatMessage {
        role: ChatRole::System,
        text: message.plain_message(),
    });
    let prompt = rewound
        .filter(|rewound| rewound.conversation_restored && !rewound.prompt.trim().is_empty())
        .map(|rewound| rewound.prompt);
    if let Some(prompt) = prompt {
        app.input = prompt;
        app.cursor = app.input.len();
        app.status_notice = Some((
            "your prompt from that point is back in the composer".to_string(),
            Instant::now(),
        ));
    }
    app.sync_stats();
}

/// Rebuild the visible transcript from the session's own messages, so what the
/// screen shows and what the model was sent cannot drift apart.
fn rebuild_transcript_from_session(app: &mut TuiApp) {
    app.chat_messages = app
        .session
        .messages
        .iter()
        .filter_map(chat_message_from_session)
        .collect();
    app.tool_cells.clear();
    app.scroll_offset = 0;
}

const VOICE_TRANSCRIPT_LABEL: &str = "(spoken)";

fn append_session_messages_since(app: &mut TuiApp, first: usize) {
    if app.session.messages.len() < first {
        rebuild_transcript_from_session(app);
        return;
    }
    let added: Vec<ChatMessage> = app.session.messages[first..]
        .iter()
        .filter_map(chat_message_from_session)
        .collect();
    app.chat_messages.extend(added);
    app.scroll_offset = 0;
}

fn chat_message_from_session(message: &crate::models::Message) -> Option<ChatMessage> {
    let role = match message.role.as_str() {
        "user" => ChatRole::User,
        "assistant" => ChatRole::Assistant,
        _ => return None,
    };
    let text = message.text_content();
    (!text.trim().is_empty()).then_some(ChatMessage { role, text })
}

fn open_command_popup(app: &mut TuiApp) {
    use crate::tui::widgets::command_popup::{CommandPopup, RegistryCommand as PopupCmd};

    let mut cmds: Vec<PopupCmd> = app
        .command_registry
        .commands()
        .iter()
        .map(|rc| {
            PopupCmd::new(
                rc.slash_name().trim_start_matches('/'),
                rc.description.clone(),
            )
        })
        .collect();

    // TUI-only interactive overlays. These open ratatui overlays that the
    // line-based REPL can't render, so they are intentionally kept out of the
    // shared `builtin_slash_registry_commands()` (whose REPL-coverage contract
    // would reject them). They are still dispatched by `handle_slash_command`
    // below, so surface them here so `/` makes them discoverable in the TUI.
    for (name, desc) in [
        (
            "attach",
            "Attach an image, PDF or Office file to the next message",
        ),
        ("memories", "Configure auto-memory settings"),
        ("skills-toggle", "Enable or disable individual skills"),
        ("title", "Configure the terminal window title"),
        ("diff-review", "Review changed files hunk by hunk"),
        ("dictate", "Dictate into the composer without sending"),
        ("find", "Search this conversation's messages"),
        (
            "workflow",
            "Plan a goal into steps and run them as subagents",
        ),
    ] {
        if !cmds.iter().any(|c| c.name == name) {
            cmds.push(PopupCmd::new(name, desc));
        }
    }

    cmds.retain(|command| app.command_applies_here(&command.name));
    app.open_overlay(Box::new(CommandPopup::new(cmds)));
}

/// Turn the `@path` tokens in a submitted message into the prompt the model
/// receives, staging any image a mention named and reporting what was skipped.
fn resolve_composer_mentions(app: &mut TuiApp, text: &str) -> String {
    let root = app.workspace_root();
    let trusted = app.workspace_is_trusted();
    let expansion = crate::mentions::expand_mentions(text, &root, trusted);
    app.turn_context = expansion.inlined.clone();
    let known_agents: Vec<String> = crate::agents::discover_agents()
        .into_iter()
        .map(|agent| agent.name)
        .collect();
    let agents = crate::mentions::mentioned_agents(text, &root, &known_agents);

    for image in &expansion.images {
        match app.stage_image_path(image) {
            Ok(label) => app.chat_messages.push(ChatMessage {
                role: ChatRole::System,
                text: format!("Attached {label}."),
            }),
            Err(reason) => app.chat_messages.push(ChatMessage {
                role: ChatRole::System,
                text: format!("Could not attach {image}: {reason}"),
            }),
        }
    }
    for (path, reason) in &expansion.skipped {
        if path
            .strip_prefix(crate::mentions::AGENT_MENTION_PREFIX)
            .is_some_and(|name| agents.iter().any(|agent| agent == name))
        {
            continue;
        }
        app.chat_messages.push(ChatMessage {
            role: ChatRole::System,
            text: format!("{path} was not inlined: {reason}"),
        });
    }
    if agents.is_empty() {
        return expansion.prompt;
    }
    let named = agents
        .iter()
        .map(|agent| format!("\"{agent}\""))
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        "{}\n\nThe user addressed this to the {named} agent. Run it with the agent tool (action \"run\", that name, and this request as the prompt) instead of answering directly.",
        expansion.prompt
    )
}

fn open_mention_popup(app: &mut TuiApp) {
    use crate::tui::widgets::mention_popup::MentionPopup;

    let Some((anchor, _)) = crate::mentions::active_mention_query(&app.input, app.cursor) else {
        return;
    };
    let candidates = app.mention_candidates();
    if candidates.is_empty() {
        app.status_notice = Some(("no workspace files to mention".to_string(), Instant::now()));
        return;
    }
    app.mention_anchor = Some(anchor);
    app.open_overlay(Box::new(MentionPopup::new(candidates)));
}

fn insert_char_at_cursor(input: &mut String, cursor: &mut usize, c: char) {
    *cursor = floor_char_boundary(input, *cursor);
    input.insert(*cursor, c);
    *cursor += c.len_utf8();
}

fn insert_str_at_cursor(input: &mut String, cursor: &mut usize, text: &str) {
    *cursor = floor_char_boundary(input, *cursor);
    input.insert_str(*cursor, text);
    *cursor += text.len();
}

fn handle_paste_text(app: &mut TuiApp, text: &str) {
    if app.is_loading {
        return;
    }
    if app.active_overlay.is_some() {
        return;
    }
    // Clipboard content is untrusted here: an OSC 52 write from an earlier
    // turn can put escapes on the clipboard that would repaint the composer.
    let text = sanitize_terminal_text(text);
    let inserted = app
        .pasted_texts
        .collapse(&text)
        .unwrap_or_else(|| text.into_owned());
    insert_str_at_cursor(&mut app.input, &mut app.cursor, &inserted);
}

async fn image_stop_keys() {
    loop {
        tokio::time::sleep(Duration::from_millis(80)).await;
        while event::poll(Duration::ZERO).unwrap_or(false) {
            if let Ok(Event::Key(key)) = event::read() {
                if key.code == KeyCode::Esc
                    || (key.code == KeyCode::Char('c')
                        && key.modifiers.contains(KeyModifiers::CONTROL))
                {
                    return;
                }
            }
        }
    }
}

fn edit_turn_draft(input: &mut String, cursor: &mut usize, key: KeyEvent) -> Option<String> {
    let control = key.modifiers.contains(KeyModifiers::CONTROL);
    match key.code {
        KeyCode::Enter
            if key.modifiers.contains(KeyModifiers::SHIFT)
                || key.modifiers.contains(KeyModifiers::ALT) =>
        {
            insert_char_at_cursor(input, cursor, '\n')
        }
        KeyCode::Enter => {
            let draft = input.trim().to_string();
            input.clear();
            *cursor = 0;
            return (!draft.is_empty()).then_some(draft);
        }
        KeyCode::Char('j') if control => insert_char_at_cursor(input, cursor, '\n'),
        KeyCode::Char('u') if control => kill_to_line_start(input, cursor),
        KeyCode::Char(_) if control => {}
        KeyCode::Char(typed) => insert_char_at_cursor(input, cursor, typed),
        KeyCode::Backspace => backspace_at_cursor(input, cursor),
        KeyCode::Delete => delete_at_cursor(input, cursor),
        KeyCode::Left => *cursor = previous_char_boundary(input, *cursor),
        KeyCode::Right => *cursor = next_char_boundary(input, *cursor),
        KeyCode::Home => *cursor = 0,
        KeyCode::End => *cursor = input.len(),
        _ => {}
    }
    None
}

fn find_in_transcript(messages: &[ChatMessage], query: &str) -> String {
    let query = query.trim();
    if query.is_empty() {
        return "Usage: /find <text>".to_string();
    }
    let needle = query.to_lowercase();
    let mut hits = Vec::new();
    for (index, message) in messages.iter().enumerate() {
        let who = match message.role {
            ChatRole::User => "you",
            ChatRole::Assistant => "assistant",
            ChatRole::Teammate => "teammate",
            ChatRole::System | ChatRole::Error | ChatRole::Detail => continue,
        };
        for line in message.text.lines() {
            if line.to_lowercase().contains(&needle) {
                let snippet: String = line.trim().chars().take(120).collect();
                hits.push(format!("  #{:<3} {who:<9} {snippet}", index + 1));
            }
        }
    }
    if hits.is_empty() {
        return format!("Nothing in this conversation matches '{query}'.");
    }
    let total = hits.len();
    hits.truncate(FIND_RESULT_LIMIT);
    let mut text = format!("{total} line(s) match '{query}':\n{}", hits.join("\n"));
    if total > FIND_RESULT_LIMIT {
        text.push_str(&format!("\n  … {} more", total - FIND_RESULT_LIMIT));
    }
    text
}

const FIND_RESULT_LIMIT: usize = 30;

fn start_side_query(
    config: &crate::config::CliConfig,
    query: crate::agent::SideQuery,
    question: String,
    answers: tokio::sync::mpsc::UnboundedSender<String>,
) {
    let config = config.clone();
    tokio::spawn(async move {
        let text = match query.ask(&config, &question, Box::new(|_| {})).await {
            Ok(answer) => format!(
                "btw: {}\n\n{}",
                sanitize_terminal_text(&question),
                sanitize_terminal_text(answer.trim())
            ),
            Err(error) => format!("btw failed: {error:#}"),
        };
        let _ = answers.send(text);
    });
}

async fn drain_team_messages(app: &mut TuiApp) -> bool {
    let Some(team) = app.session.team_manager.clone() else {
        return false;
    };
    let (messages, seen) = team.messages_since(app.team_seen).await;
    app.team_seen = seen;
    let mut shown = false;
    for message in &messages {
        if let Some((sender, text)) = crate::teams::thread_entry(message) {
            app.chat_messages.push(ChatMessage {
                role: ChatRole::Teammate,
                text: sanitize_terminal_text(&format!("{sender}\n{text}")).into_owned(),
            });
            shown = true;
        }
    }
    shown
}

fn drain_side_answers(app: &mut TuiApp) {
    while let Ok(text) = app.side_answers.1.try_recv() {
        app.chat_messages.push(ChatMessage {
            role: ChatRole::System,
            text,
        });
    }
}

fn remote_status_label(status: &crate::remote_control::RemoteControlStatus) -> Option<String> {
    use crate::remote_control::RemoteControlStatus;
    match status {
        RemoteControlStatus::Waiting { .. } => {
            Some("Remote Control: waiting for your phone".to_string())
        }
        RemoteControlStatus::Connected { phone } => {
            Some(format!("Remote Control: {}", sanitize_terminal_text(phone)))
        }
        RemoteControlStatus::PhoneLeft => Some("Remote Control: phone disconnected".to_string()),
        RemoteControlStatus::PhoneNeedsUpdate => {
            Some("Remote Control: update the phone app".to_string())
        }
        RemoteControlStatus::Reconnecting => Some("Remote Control: reconnecting".to_string()),
        RemoteControlStatus::Off => None,
    }
}

fn start_remote_control(app: &mut TuiApp) -> String {
    if app.remote.is_some() {
        return "Remote Control is already on. /remote-control off stops it.".to_string();
    }
    let Some(thread_id) = app.session.managed_session_id().map(str::to_string) else {
        return "Remote Control needs a saved session, and this one is not being saved."
            .to_string();
    };
    if let Err(error) = app.session.persist_managed_session() {
        return format!(
            "Remote Control could not save this session first: {}",
            sanitize_terminal_text(&format!("{error:#}"))
        );
    }
    let workspace = app.workspace_root();
    let inner = match crate::runtime::session_control::ManagedSessionStore::user_config()
        .map_err(|error| error.to_string())
        .and_then(|store| {
            crate::app_server::CliDeveloperSessionHost::new_with_store(
                app.config.clone(),
                workspace.clone(),
                store,
                false,
            )
            .map_err(|error| error.to_string())
        }) {
        Ok(inner) => inner,
        Err(error) => {
            return format!(
                "Remote Control could not start: {}",
                sanitize_terminal_text(&error)
            )
        }
    };
    let (host, inbox) = crate::tui::remote_host::TuiRemoteHost::new(inner, thread_id);
    let (stop, stopped) = tokio::sync::watch::channel(false);
    let status = Arc::new(std::sync::Mutex::new(None));
    let sink = Arc::clone(&status);
    let relay_host = Arc::clone(&host);
    let task = tokio::spawn(async move {
        let result = crate::remote_control::run_with(
            relay_host,
            &workspace,
            stopped,
            move |update: crate::remote_control::RemoteControlStatus| {
                use crate::remote_control::RemoteControlStatus;
                match &update {
                    RemoteControlStatus::Waiting { folder, pairing_line } => {
                        let scan = crate::remote_control::render_qr(pairing_line, false)
                            .map(|qr| format!("On your phone, open AGI Mobile, go to Remote, tap Scan and point it at this code:\n{qr}\nOr enter the code on the phone and paste:\n"))
                            .unwrap_or_else(|| "On your phone, open AGI Mobile, go to Remote, tap Scan, choose to enter the code, and paste:\n".to_string());
                        crate::tui::push_tui_notice(format!(
                            "Remote Control is on for {folder}.\n{scan}{pairing_line}"
                        ))
                    }
                    RemoteControlStatus::Connected { phone } => crate::tui::push_tui_notice(
                        format!("Remote Control: {} is connected. It sees this session's messages, tool activity and approvals, and can answer them.", sanitize_terminal_text(phone)),
                    ),
                    RemoteControlStatus::PhoneLeft => crate::tui::push_tui_notice(
                        "Remote Control: the phone disconnected. It can reconnect while Remote Control stays on.".to_string(),
                    ),
                    RemoteControlStatus::PhoneNeedsUpdate => crate::tui::push_tui_notice(
                        "Remote Control: the phone app needs an update to connect.".to_string(),
                    ),
                    RemoteControlStatus::Reconnecting | RemoteControlStatus::Off => {}
                }
                if let Ok(mut current) = sink.lock() {
                    *current = Some(update);
                }
            },
        )
        .await;
        crate::tui::push_tui_notice(match result {
            Ok(()) => "Remote Control is off.".to_string(),
            Err(error) => format!("Remote Control stopped: {error:#}"),
        });
    });
    app.remote = Some(RemoteLink {
        host,
        inbox,
        stop,
        status,
        task,
    });
    app.remote_label = Some("Remote Control: starting".to_string());
    "Starting Remote Control for this session. /remote-control off stops it.".to_string()
}

fn stop_remote_control(app: &mut TuiApp) -> String {
    app.remote_label = None;
    match app.remote.take() {
        Some(link) => {
            let _ = link.stop.send(true);
            "Stopping Remote Control; the phone can no longer reach this session.".to_string()
        }
        None => "Remote Control is not on.".to_string(),
    }
}

fn drain_remote_control(app: &mut TuiApp) {
    let Some(link) = app.remote.as_mut() else {
        return;
    };
    if link.task.is_finished() {
        app.remote = None;
        app.remote_label = None;
        return;
    }
    while let Ok(input) = link.inbox.try_recv() {
        if let crate::tui::remote_host::RemoteInput::Message(text) = input {
            app.remote_prompts.push(text);
        }
    }
    if let Some(label) = link
        .status
        .lock()
        .ok()
        .and_then(|status| status.as_ref().map(remote_status_label))
    {
        app.remote_label = label;
    }
}

/// Delete from the cursor back to the start of its line, the readline `Ctrl-U`
/// kill. Line-scoped rather than buffer-scoped so it matches `Home` in a
/// multi-line composer.
fn kill_to_line_start(input: &mut String, cursor: &mut usize) {
    let end = floor_char_boundary(input, *cursor);
    let start = input[..end].rfind('\n').map(|at| at + 1).unwrap_or(0);
    if start == end {
        return;
    }
    input.replace_range(start..end, "");
    *cursor = start;
}

fn backspace_at_cursor(input: &mut String, cursor: &mut usize) {
    *cursor = floor_char_boundary(input, *cursor);
    if *cursor == 0 {
        return;
    }
    let previous = previous_char_boundary(input, *cursor);
    input.remove(previous);
    *cursor = previous;
}

fn delete_at_cursor(input: &mut String, cursor: &mut usize) {
    *cursor = floor_char_boundary(input, *cursor);
    if *cursor < input.len() {
        input.remove(*cursor);
    }
}

fn previous_char_boundary(input: &str, cursor: usize) -> usize {
    let cursor = floor_char_boundary(input, cursor);
    if cursor == 0 {
        return 0;
    }
    input[..cursor]
        .char_indices()
        .last()
        .map(|(idx, _)| idx)
        .unwrap_or(0)
}

fn next_char_boundary(input: &str, cursor: usize) -> usize {
    let cursor = floor_char_boundary(input, cursor);
    if cursor >= input.len() {
        return input.len();
    }
    input[cursor..]
        .char_indices()
        .nth(1)
        .map(|(idx, _)| cursor + idx)
        .unwrap_or(input.len())
}

fn floor_char_boundary(input: &str, cursor: usize) -> usize {
    let mut cursor = cursor.min(input.len());
    while cursor > 0 && !input.is_char_boundary(cursor) {
        cursor -= 1;
    }
    cursor
}

fn handle_agent_picker_key(app: &mut TuiApp, key: KeyEvent) -> InputAction {
    use super::widgets::agent_picker::{handle_key, AgentPickerAction};

    let action = handle_key(&mut app.agent_picker, key);

    match action {
        AgentPickerAction::Nothing => InputAction::None,
        AgentPickerAction::Close => {
            app.input.clear();
            app.cursor = 0;
            InputAction::None
        }
        AgentPickerAction::Invoke(agent_name) => {
            app.input.clear();
            app.cursor = 0;
            match crate::agents::find_agent(&agent_name) {
                Some(def) => {
                    def.apply_to_session(&mut app.session);
                    app.mode = InteractionMode::for_session(&app.session);
                    app.sync_stats();
                    let model_note = if def.model.is_some() {
                        format!(" (model: {})", app.session.model)
                    } else {
                        String::new()
                    };
                    app.chat_messages.push(ChatMessage {
                        role: ChatRole::System,
                        text: format!("Agent `{}` activated{}", agent_name, model_note),
                    });
                }
                None => {
                    app.chat_messages.push(ChatMessage {
                        role: ChatRole::System,
                        text: format!("Agent `{}` not found.", agent_name),
                    });
                }
            }
            InputAction::None
        }
    }
}

fn handle_model_picker_key(app: &mut TuiApp, key: KeyEvent) -> InputAction {
    use super::widgets::model_picker::{handle_key, PickerAction};

    let all_models = available_picker_models();
    let action = handle_key(&mut app.model_picker, key, &all_models);

    match action {
        PickerAction::Nothing => InputAction::None,

        PickerAction::Close => {
            app.input.clear();
            app.cursor = 0;
            InputAction::None
        }

        PickerAction::FocusSearch => InputAction::None,

        PickerAction::Select {
            model_id,
            provider_id,
            effort: _effort,
            banner,
        } => {
            app.input.clear();
            app.cursor = 0;
            let switched = if provider_id == crate::design_system::ProviderId::AGICloud {
                app.session.switch_managed_model(&model_id)
            } else {
                app.session.switch_model(&model_id)
            };
            let text = match switched {
                Ok(()) => banner,
                Err(err) => format!(
                    "Model switch failed: {}",
                    crate::errors::terminal_text(&err)
                ),
            };
            app.sync_stats();
            app.chat_messages.push(ChatMessage {
                role: ChatRole::System,
                text,
            });
            InputAction::None
        }
    }
}

/// The model after `current` in `candidates`, wrapping, that `usable` accepts.
/// `None` when no other model qualifies.
fn next_cycle_model(
    candidates: &[(String, crate::design_system::ProviderId)],
    current: &str,
    mut usable: impl FnMut(&str, crate::design_system::ProviderId) -> bool,
) -> Option<(String, crate::design_system::ProviderId)> {
    let start = candidates
        .iter()
        .position(|(id, _)| id == current)
        .map_or(0, |position| position + 1);
    (0..candidates.len())
        .map(|offset| &candidates[(start + offset) % candidates.len()])
        .find(|(id, provider)| id != current && usable(id, *provider))
        .cloned()
}

/// Step to the next model of the picker's list that this session can run, in
/// the same access mode (Local, Your key, Managed) as the current one. A model
/// in another mode is a different trust boundary and stays a deliberate
/// choice made in `/model`.
fn cycle_model(app: &mut TuiApp) {
    use super::widgets::model_picker::{ModelPickerState, PickerRow};

    let boundary = provider_access_mode(&app.session.provider);
    let mut picker = ModelPickerState::default();
    picker.rebuild_rows(&available_picker_models());
    let candidates: Vec<(String, crate::design_system::ProviderId)> = picker
        .rows
        .iter()
        .filter_map(|row| match row {
            PickerRow::ModelRow { provider_id, model }
                if provider_id.access_mode() == boundary && !picker.is_locked(row) =>
            {
                Some((model.id.clone(), *provider_id))
            }
            _ => None,
        })
        .collect();

    let account = crate::models::AccountRoute::load();
    let config = &app.config;
    let next = next_cycle_model(&candidates, &app.session.model, |model, _| {
        match crate::models::decide_turn_route(config, &account, model, None) {
            crate::models::TurnRoute::Runnable(provider) => {
                provider_access_mode(&provider) == boundary
            }
            crate::models::TurnRoute::Blocked { .. } => false,
        }
    });
    let Some((model_id, provider_id)) = next else {
        app.status_notice = Some((
            "no other model to cycle to · /model lists them all".to_string(),
            Instant::now(),
        ));
        return;
    };
    let switched = if provider_id == crate::design_system::ProviderId::AGICloud {
        app.session.switch_managed_model(&model_id)
    } else {
        app.session.switch_model(&model_id)
    };
    app.status_notice = Some((
        match switched {
            Ok(()) => format!("model: {}", crate::model_catalog::display_name(&model_id)),
            Err(error) => format!(
                "model switch failed: {}",
                crate::errors::terminal_text(&error)
            ),
        },
        Instant::now(),
    ));
    app.sync_stats();
}

fn fast_mode_on_status(model: &str) -> String {
    match crate::onboarding::fast_mode_cost_note(model) {
        Some(note) => format!("ON, using {model} for speed · {note}"),
        None => format!("ON, using {model} for speed"),
    }
}

fn handle_effort_picker_key(app: &mut TuiApp, key: KeyEvent) -> InputAction {
    use super::widgets::effort_picker::{handle_key, PickerAction};

    let action = handle_key(&mut app.effort_picker, key);

    match action {
        PickerAction::Nothing => InputAction::None,
        PickerAction::Close => {
            app.input.clear();
            app.cursor = 0;
            InputAction::None
        }
        PickerAction::Select(effort) => {
            app.effort = effort;
            app.input.clear();
            app.cursor = 0;
            let saved = app
                .config
                .persist_effort_project(&effort.label().to_ascii_lowercase())
                .map(|_| " and saved as this project's default")
                .unwrap_or("");
            app.chat_messages.push(ChatMessage {
                role: ChatRole::System,
                text: format!("Effort set to {}{saved}", effort.label()),
            });
            InputAction::None
        }
    }
}

fn theme_set_message(
    choice: super::widgets::theme_picker::ThemeChoice,
    saved: Result<std::path::PathBuf>,
) -> String {
    match saved {
        Ok(path) => format!(
            "Theme set to {}, saved in {}.",
            choice.label(),
            path.display()
        ),
        Err(error) => format!(
            "Theme set to {} for this session; it could not be saved: {}",
            choice.label(),
            sanitize_terminal_text(&format!("{error:#}"))
        ),
    }
}

fn handle_theme_picker_key(app: &mut TuiApp, key: KeyEvent) -> InputAction {
    use super::widgets::theme_picker::{handle_key, PickerAction};

    let action = handle_key(&mut app.theme_picker, key);

    match action {
        PickerAction::Nothing => InputAction::None,
        PickerAction::Close => {
            app.input.clear();
            app.cursor = 0;
            InputAction::None
        }
        PickerAction::Select(choice) => {
            app.theme_choice = choice;
            // Apply the theme: re-routes every `ui_*` semantic token so the whole
            // TUI recolors on the next frame.
            crate::tui::terminal_palette::set_active_theme(choice.applied() as u8);
            // Persist so the choice survives a restart.
            let text = theme_set_message(choice, app.config.persist_theme_project(choice.slug()));
            app.input.clear();
            app.cursor = 0;
            app.chat_messages.push(ChatMessage {
                role: ChatRole::System,
                text,
            });
            InputAction::None
        }
    }
}

// ---------------------------------------------------------------------------
// Natural language mode detection
// ---------------------------------------------------------------------------

/// Detect if user is asking to switch modes via natural language.
///
/// SECURITY: Permission-*escalating* modes (AcceptEdits, BypassPermissions,
/// FullAuto) are only triggered by an explicit, command-style utterance whose
/// entire (trimmed) text is the trigger phrase, never by a fuzzy substring
/// buried in conversational prose. This prevents a user who merely *discusses*
/// those words (e.g. "don't give me no prompts about this") from silently
/// disabling tool-approval prompts for the rest of the session. The
/// non-escalating modes (Plan, Chat), which only restrict or normalize
/// behavior, keep the more permissive natural-language matching.
fn detect_mode_intent(text: &str) -> Option<InteractionMode> {
    let lower = text.to_lowercase();
    // Normalize to the bare command phrase: trim surrounding whitespace and a
    // single leading slash so both "/yolo" and "yolo mode" map to one trigger.
    let exact = lower.trim();
    let exact = exact.strip_prefix('/').unwrap_or(exact).trim();

    // Plan mode triggers, non-escalating (read-only), natural language allowed.
    if lower == "/plan"
        || lower.contains("go to plan mode")
        || lower.contains("enter plan mode")
        || lower.contains("switch to plan")
        || lower.contains("plan mode")
        || lower.contains("plan this first")
        || lower.contains("plan first")
        || lower.contains("plan before")
        || lower.contains("plan properly")
        || lower.contains("make a plan first")
    {
        return Some(InteractionMode::Plan);
    }

    // Accept edits mode, escalating: require the message to BE the command.
    if matches!(
        exact,
        "accept edits"
            | "accept-edits"
            | "auto mode"
            | "auto-mode"
            | "auto accept"
            | "auto-accept"
            | "accept all edits"
            | "accept edits mode"
            | "yolo"
            | "yolo mode"
    ) {
        return Some(InteractionMode::AcceptEdits);
    }

    // Bypass permissions, escalating: require the message to BE the command.
    if matches!(
        exact,
        "bypass permissions"
            | "bypass permission"
            | "bypass permissions mode"
            | "skip permissions"
            | "skip permission"
            | "dangerously skip permissions"
            | "no prompts"
    ) {
        return Some(InteractionMode::BypassPermissions);
    }

    // FullAuto, escalating: require the message to BE the command.
    if matches!(
        exact,
        "full auto" | "fullauto" | "full-auto" | "full auto mode" | "full-auto mode"
    ) {
        return Some(InteractionMode::FullAuto);
    }

    // Back to chat mode, non-escalating (de-escalates), natural language allowed.
    if lower.contains("normal mode")
        || lower.contains("chat mode")
        || lower.contains("exit plan")
        || lower.contains("stop planning")
    {
        return Some(InteractionMode::Chat);
    }

    None
}

/// True for modes that disable or weaken the tool-approval gate. A pure
/// utterance that switches into one of these is treated strictly as a command
/// and is NOT also forwarded to the model as a chat turn.
fn mode_is_permission_escalating(mode: InteractionMode) -> bool {
    matches!(
        mode,
        InteractionMode::AcceptEdits
            | InteractionMode::BypassPermissions
            | InteractionMode::FullAuto
    )
}

/// Apply a mode change to the app and session.
fn apply_mode(app: &mut TuiApp, mode: InteractionMode) -> bool {
    if !mode.available_in(&app.session) {
        return false;
    }
    app.mode = mode;
    app.session.permission_mode = mode.permission_mode();
    // An approval covers the plan it was given in; entering plan mode again
    // must lock mutating tools until the next plan is approved.
    if app.session.plan_mode != (mode == InteractionMode::Plan) {
        app.session.plan_approved = false;
    }
    app.session.plan_mode = mode == InteractionMode::Plan;
    app.session.skip_permissions =
        mode == InteractionMode::BypassPermissions || mode == InteractionMode::FullAuto;
    app.session.auto_approve_safe = mode == InteractionMode::AcceptEdits
        || mode == InteractionMode::BypassPermissions
        || mode == InteractionMode::FullAuto;
    // FullAuto: verbose output so the user can see what is happening
    if mode == InteractionMode::FullAuto {
        app.session.quiet = false;
    }
    true
}

fn pinned_mode_notice(app: &TuiApp) -> String {
    format!(
        "Your organization's policy holds tool approval at {}, so a looser mode is not available.",
        app.session.governed_permission_mode().name()
    )
}

fn unavailable_mode_notice(app: &TuiApp, mode: InteractionMode) -> String {
    if mode.skips_approval()
        && !app.session.bypass_permissions_available
        && app.session.pinned_permission_mode.is_none()
    {
        return format!(
            "{} is off for this session. Start agi with --allow-dangerously-skip-permissions \
             to make it available, or --dangerously-skip-permissions to start in it.",
            mode.label()
        );
    }
    pinned_mode_notice(app)
}

fn mode_description(mode: InteractionMode) -> &'static str {
    match mode {
        InteractionMode::Chat => "Normal conversation mode",
        InteractionMode::Plan => {
            "Plan mode, read-only tools only, no file edits. Model will plan before acting."
        }
        InteractionMode::AcceptEdits => {
            "Auto, file edits, read-only tools and commands the safety classifier clears run; everything else asks. /auto-mode-setup reviews this repository."
        }
        InteractionMode::BypassPermissions => {
            "Bypass, all tool prompts skipped. Use with caution!"
        }
        InteractionMode::FullAuto => {
            "FullAuto, no prompts, no confirmations. Extreme caution required!"
        }
    }
}

// ---------------------------------------------------------------------------
// Slash command handling
// ---------------------------------------------------------------------------

enum SlashResult {
    NotSlash,
    SystemMessage(String),
    Quit,
    SendAsPrompt,
    SendPrompt(String),
    SendMcpPrompt(String),
    RunAdvisor(String),
    RunCompact(String),
    RunLogin(String),
    RunLogout,
    StatusReport(String),
    /// Leave the TUI, run the interactive voice loop, then re-enter.
    RunVoice(String),
    RunDictate(String),
    /// Generate an image on the account and stage its file as a chip.
    RunImage(String),
    /// Read the account's artifact index, or open one of its artifacts.
    RunArtifacts(String),
    RunTasks(String),
    RunTeam(String),
    RunWorktree(String),
    RunMcp(String),
    RunAttachUrl(String),
    RunPersonalize(String),
    RunBtw(String),
    RunAgentDraft(crate::agents::AgentRequest),
    RunRemoteControl(String),
    RunFeedback(crate::cloud::feedback::FeedbackKind, String),
}

const ADD_CONTEXT_MENU: &str = "Ways to add context to your next message:
  @path            Inline a file, or list a folder with @dir/
  @agent-<name>    Hand the message to one of your agents
  /attach <file>   Attach an image, PDF or Office file
  /attach --full <image>  Attach it without scaling it down, for fine detail
  /attach <url>    Fetch a web page and add its text to the conversation
  Ctrl+V           Attach the image on the clipboard
  Paste            Long pastes collapse to [Pasted text #N]; the full text is sent
  /mcp             Run a connected server's prompt as /mcp:<server>:<prompt>
  /attach list     Show what is staged · /attach remove [n|all]";

const STREAM_SOURCE_TAIL_LINES: usize = 200;
const STREAM_RENDERED_TAIL_LINES: usize = 40;

fn streaming_markdown_tail(buffer: &str) -> Vec<Line<'static>> {
    let source: Vec<&str> = buffer.lines().collect();
    let start = source.len().saturating_sub(STREAM_SOURCE_TAIL_LINES);
    let open_fence = source[..start]
        .iter()
        .filter(|line| line.trim_start().starts_with("```"))
        .count()
        % 2
        == 1;
    let mut tail = String::new();
    if open_fence {
        tail.push_str("```\n");
    }
    tail.push_str(&source[start..].join("\n"));
    let rendered = super::markdown_renderer::render_markdown(&tail);
    let skip = rendered.len().saturating_sub(STREAM_RENDERED_TAIL_LINES);
    rendered.into_iter().skip(skip).collect()
}

fn resolve_tui_slash_command(input_command: &str, registry: &CommandRegistry) -> String {
    let normalized = input_command.to_lowercase();
    // `/sessions` is an exact TUI/REPL runtime command; keep it from being
    // rewritten through the registry's `/resume` compatibility alias.
    if matches!(normalized.as_str(), "/sessions") {
        return normalized;
    }

    registry
        .find(input_command)
        .map(RegistryCommand::slash_name)
        .unwrap_or(normalized)
}

fn handle_slash(input: &str, app: &mut TuiApp) -> SlashResult {
    if !input.starts_with('/') {
        return SlashResult::NotSlash;
    }

    let parts: Vec<&str> = input.splitn(2, ' ').collect();
    let cmd = resolve_tui_slash_command(parts[0], &app.command_registry);
    let arg = parts.get(1).map(|s| s.trim()).unwrap_or_default();

    match cmd.as_str() {
        "/exit" | "/quit" | "/q" => SlashResult::Quit,

        "/clear" => {
            app.discard_conversation();
            SlashResult::SystemMessage("Context cleared.".to_string())
        }

        "/model" | "/m" => {
            if arg.is_empty() {
                // Open the interactive model picker overlay.
                let all = available_picker_models();
                let current = app.model_name.clone();
                app.model_picker.open(&all, &current);
                SlashResult::SystemMessage(String::new()) // picker UI handles confirmation
            } else {
                match app.session.switch_model_by_name(arg) {
                    Ok(()) => {
                        app.sync_stats();
                        let provider = crate::models::provider_name(&app.session.provider);
                        SlashResult::SystemMessage(format!("Switched to {} ({})", arg, provider))
                    }
                    Err(err) => SlashResult::SystemMessage(format!("Model switch failed: {err}")),
                }
            }
        }

        "/image" => match arg {
            "" => SlashResult::SystemMessage(
                "/image <prompt> draws an image on your account and saves it here; Esc stops it. \
                 Put --aspect 16:9, --quality hd, --transparent, --model or -n before the prompt \
                 to change settings, and add --save-defaults to keep them. /image again reuses \
                 your last prompt and settings, /image retry tries a failed or stopped image \
                 again, /image last shows what the last one used. /image open views the last \
                 one, /image clear dismisses the chip."
                    .to_string(),
            ),
            "last" => SlashResult::SystemMessage(crate::cloud::image::describe_last()),
            "clear" => {
                let count = app.generated_images.len();
                app.generated_images.clear();
                SlashResult::SystemMessage(if count == 0 {
                    "No generated images to dismiss.".to_string()
                } else {
                    format!("Dismissed {count} generated image chip(s).")
                })
            }
            "open" => match app.generated_images.last() {
                None => SlashResult::SystemMessage(
                    "Nothing generated yet. Try /image a red bicycle.".to_string(),
                ),
                Some(path) => {
                    let opened = crate::oauth::open_external_url(
                        &format!("file://{}", path.display()),
                        crate::oauth::UserActionContext::user_initiated(),
                    );
                    SlashResult::SystemMessage(if opened {
                        format!("Opened {}", path.display())
                    } else {
                        format!("Could not open a viewer. The file is at {}", path.display())
                    })
                }
            },
            prompt => SlashResult::RunImage(prompt.to_string()),
        },

        "/artifacts" => SlashResult::RunArtifacts(arg.to_string()),
        "/tasks" | "/task" => SlashResult::RunTasks(arg.to_string()),
        "/team" | "/teams" => SlashResult::RunTeam(arg.to_string()),
        "/upgrade" => SlashResult::SystemMessage(crate::claude_parity::open_upgrade_page()),
        "/desktop" | "/app" => SlashResult::SystemMessage(crate::cloud::open_in_desktop(&app.session)),
        "/find" => SlashResult::SystemMessage(find_in_transcript(&app.chat_messages, arg)),
        "/personalize" => SlashResult::RunPersonalize(arg.to_string()),

        "/plan" if matches!(arg, "accept" | "approve") => SlashResult::SystemMessage(
            if !matches!(
                app.session.permission_mode,
                crate::cli_options::PermissionMode::Plan
            ) {
                "/plan accept: not in plan mode. Use /plan to enter it first.".to_string()
            } else if app.session.approve_plan().is_err() {
                "/plan accept: no plan to approve yet. Ask the model to call update_plan first."
                    .to_string()
            } else {
                "Plan approved. Mutating tools enabled for this session.".to_string()
            },
        ),

        "/plan" if arg.starts_with("reject") => {
            let feedback = arg.strip_prefix("reject").unwrap_or("").trim().to_string();
            SlashResult::SystemMessage(if app.session.reject_plan(&feedback).is_err() {
                "/plan reject: needs a reason. Usage: /plan reject <feedback>".to_string()
            } else {
                "Plan rejected. Feedback queued for the model on the next turn.".to_string()
            })
        }

        "/plan" if matches!(arg, "show" | "view") => SlashResult::SystemMessage(
            match (&app.session.current_plan, &app.session.current_plan_path) {
                (Some(plan), path) => {
                    let (remaining, total) = plan.outstanding();
                    let heading = match path {
                        Some(path) => format!("Plan ({})", path.display()),
                        None => "Plan".to_string(),
                    };
                    sanitize_terminal_text(&format!(
                        "{heading}\n\n{}\n{remaining} of {total} steps outstanding",
                        plan.render_markdown()
                    ))
                    .into_owned()
                }
                _ => "No plan yet. Ask the model to call update_plan.".to_string(),
            },
        ),

        "/plan" => {
            let new_mode = if app.mode == InteractionMode::Plan {
                InteractionMode::Chat
            } else {
                InteractionMode::Plan
            };
            if !apply_mode(app, new_mode) {
                return SlashResult::SystemMessage(pinned_mode_notice(app));
            }
            SlashResult::SystemMessage(format!("{}, {}", app.mode.label(), mode_description(app.mode)))
        }

        "/cost" => {
            let cost = crate::output::format_accumulated_cost(
                app.session.total_input_tokens,
                app.session.total_output_tokens,
                app.session.cost_ledger.total_usd,
                provider_access_mode(&app.session.provider),
            );
            let mut lines = vec![format!("Turns: {} │ {}", app.session.turn_count, cost)];
            lines.extend(crate::usage_summary::session_model_lines(
                &app.session.cost_ledger.model_breakdown(),
            ));
            SlashResult::SystemMessage(lines.join("\n"))
        }

        "/output-style" => {
            if arg.is_empty() {
                let active = &app.session.output_style;
                let mut lines = vec![format!("Active: {}", active)];
                lines.push(String::new());
                lines.push("Available styles:".to_string());
                for s in crate::output_styles::load_all() {
                    let marker = if s.name == *active { "*" } else { " " };
                    lines.push(format!(
                        " {} {}  {}",
                        marker,
                        pad_to_cols(&s.name, 14),
                        s.description
                    ));
                }
                lines.push(String::new());
                lines.push("Switch with: /output-style <name>".to_string());
                SlashResult::SystemMessage(lines.join("\n"))
            } else {
                app.session.apply_output_style(arg);
                let mut message = format!(
                    "Output style: {} (applies on next turn)",
                    app.session.output_style
                );
                if let Err(err) = app
                    .config
                    .persist_output_style_project(&app.session.output_style)
                {
                    message.push_str(&format!("\nFailed to persist output style: {err}"));
                }
                SlashResult::SystemMessage(message)
            }
        }

        "/fallback" => {
            match app.session.fallback_chain.as_ref() {
                Some(chain) if !chain.primaries.is_empty() => {
                    let head = chain.head().unwrap_or("?");
                    let tail = chain.tail().join(" → ");
                    let display = if tail.is_empty() {
                        head.to_string()
                    } else {
                        format!("{} → {}", head, tail)
                    };
                    SlashResult::SystemMessage(format!(
                        "Fallback chain: {}\nRotates on: {:?}",
                        display, chain.on
                    ))
                }
                _ => SlashResult::SystemMessage(
                    "No fallback chain set. Restart with `--fallback-model <model>` or `-m a,b,c`."
                        .to_string(),
                ),
            }
        }

        "/replay" => SlashResult::SystemMessage(
            "Session replay: drop to shell and run\n  agi session list\n  agi session fork <id> --at-turn N --as <name>\n/rewind picks a turn of this session in place."
                .to_string(),
        ),

        "/insights" => {
            SlashResult::SystemMessage(crate::claude_parity::render_insights(&app.session))
        }

        "/status" => {
            let account = match crate::tier_cache::load_jwt() {
                None => "not signed in (agi login)".to_string(),
                Some(_) => match crate::tier_cache::read_tier_cache() {
                    Some(cached) => format!("signed in, {} plan", cached.tier.label()),
                    None => "signed in".to_string(),
                },
            };
            let msg = format!(
                "Account: {account}\nVersion: {}\nModel: {}\nProvider: {}\nMode: {}\nSandbox: {}\nTurns: {}\nTokens: {} in / {} out\nContext: {}%",
                env!("CARGO_PKG_VERSION"),
                crate::model_catalog::display_name(&app.session.model),
                app.provider_name,
                app.mode.label(),
                crate::sandbox::status_word(
                    app.sandbox_type
                        .filter(|_| !crate::sandbox::sandbox_disabled())
                ),
                app.session.turn_count,
                app.session.total_input_tokens,
                app.session.total_output_tokens,
                app.context_percent(),
            );
            SlashResult::StatusReport(format!(
                "{msg}\n{}",
                app.session.session_status_lines().join("\n")
            ))
        }

        "/context" | "/ctx" => SlashResult::SystemMessage(
            app.session
                .context_report(app.config.default.max_tokens as usize),
        ),

        "/fast" => {
            match app.session.toggle_fast_mode(None) {
                Ok(()) => {
                    app.sync_stats();
                    let status = if app.session.fast_mode {
                        fast_mode_on_status(&app.session.model)
                    } else {
                        format!("OFF, back to {}", app.session.model)
                    };
                    SlashResult::SystemMessage(format!("Fast mode {status}"))
                }
                Err(err) => SlashResult::SystemMessage(format!("Fast mode failed: {err}")),
            }
        }

        "/new" => {
            app.discard_conversation();
            SlashResult::SystemMessage("Started new conversation.".to_string())
        }

        "/models" if !arg.is_empty() => SlashResult::SystemMessage(
            crate::provider::find_model(arg)
                .map(|model| crate::provider::format_model_detail(&model))
                .unwrap_or_else(|| format!("No model named {arg} in the catalog.")),
        ),

        "/models" | "/providers" => {
            let models_output = crate::model_catalog::catalog()
                .all()
                .iter()
                .map(|m| {
                    let flags = format!(
                        "{}{}{}{}{}",
                        if m.supports_tools { "T" } else { " " },
                        if m.supports_vision { "V" } else { " " },
                        if m.supports_reasoning { "R" } else { " " },
                        if m.supports_pdf { "P" } else { " " },
                        if m.supports_audio_input { "A" } else { " " },
                    );
                    format!(
                        "  {} [{}] {:>6}K ctx  {} {}",
                        pad_to_cols(&m.id, 32),
                        flags,
                        m.context_window / 1000,
                        crate::cost_ledger::format_credits_per_million_tokens(
                            m.input_price_per_1m,
                            m.output_price_per_1m,
                        ),
                        if crate::model_catalog::input_token_pricing_tiers(&m.id).is_empty() {
                            "base"
                        } else {
                            "base+tiered"
                        },
                    )
                })
                .collect::<Vec<_>>()
                .join("\n");
            SlashResult::SystemMessage(format!(
                "Available models:\n{models_output}\n\nFlags: T=tools, V=vision, R=reasoning, P=reads PDFs, A=audio input. /models <id> shows one model.\nPrices are per 1M input/output tokens; `base+tiered` has request-input bands shown by `agi --cost MODEL`.\nLive local discovery: run `agi models scan` or `agi models status`."
            ))
        }

        "/config" => SlashResult::SystemMessage(
            crate::repl::config_for_display(arg, &mut app.config).plain_message(),
        ),

        "/trust" | "/untrust" => SlashResult::SystemMessage(
            crate::repl::trust_for_display(if cmd == "/untrust" && arg.is_empty() {
                "revoke"
            } else {
                arg
            })
            .plain_message(),
        ),

        "/worktree" | "/wt" => SlashResult::RunWorktree(arg.to_string()),

        "/diff" if arg.trim() == "panel" => {
            if app.workspace_pane.take().is_some() {
                SlashResult::SystemMessage("Closed the workspace pane.".to_string())
            } else {
                app.workspace_pane = Some(workspace_pane_lines());
                SlashResult::SystemMessage(format!(
                    "The workspace pane now shows the changes since the last commit beside the chat, refreshed after each turn. It needs a window at least {WORKSPACE_PANE_MIN_WIDTH} columns wide. /diff panel again closes it."
                ))
            }
        }

        "/diff" => SlashResult::SystemMessage(crate::runtime::git::diff_summary_for_command(arg)),

        "/copy" => {
            let Some(target) = crate::claude_parity::CopyTarget::parse(arg) else {
                return SlashResult::SystemMessage(format!(
                    "Unknown /copy target: {arg}. Use one of: (nothing) | code | diff"
                ));
            };
            let Some(last) = app
                .chat_messages
                .iter()
                .rev()
                .find(|m| m.role == ChatRole::Assistant)
            else {
                return SlashResult::SystemMessage("No assistant response to copy.".to_string());
            };
            let payload = match target.extract(&last.text) {
                Ok(payload) => payload,
                Err(message) => return SlashResult::SystemMessage(message.to_string()),
            };
            #[cfg(not(target_os = "android"))]
            {
                match arboard::Clipboard::new().and_then(|mut cb| cb.set_text(&payload)) {
                    Ok(()) => SlashResult::SystemMessage(format!(
                        "Copied {} to clipboard ({} lines).",
                        target.label(),
                        payload.lines().count()
                    )),
                    Err(_) => SlashResult::SystemMessage(
                        "Clipboard not available. Contents:\n".to_string() + &payload,
                    ),
                }
            }
            #[cfg(target_os = "android")]
            SlashResult::SystemMessage("Clipboard not available on this platform.".to_string())
        }

        "/table" => {
            let reply = app
                .chat_messages
                .iter()
                .rev()
                .find(|m| m.role == ChatRole::Assistant)
                .map(|m| m.text.as_str());
            SlashResult::SystemMessage(crate::claude_parity::table_command(reply, arg))
        }

        "/background" | "/bg" => match crate::background::hand_off(&mut app.session, arg) {
            Ok(message) => {
                app.chat_messages.clear();
                app.scroll_offset = 0;
                app.sync_stats();
                SlashResult::SystemMessage(message)
            }
            Err(message) => SlashResult::SystemMessage(message),
        },

        "/links" => {
            let reply = app
                .chat_messages
                .iter()
                .rev()
                .find(|m| m.role == ChatRole::Assistant)
                .map(|m| m.text.as_str());
            SlashResult::SystemMessage(crate::claude_parity::links_command(reply, arg))
        }

        "/login" => SlashResult::RunLogin(arg.to_string()),

        "/logout" => SlashResult::RunLogout,

        "/help" | "/h" | "/?" => {
            SlashResult::SystemMessage(crate::command_registry::format_command_help(
                &app.command_registry,
                crate::command_registry::ShortcutHelp::Tui,
            ))
        }

        // ── Session management ──
        "/compact" => SlashResult::RunCompact(arg.to_string()),

        "/history" | "/sessions" => {
            open_session_picker(app, arg.strip_prefix("search").unwrap_or(arg).trim());
            SlashResult::SystemMessage(String::new())
        }

        "/resume" => {
            if arg.is_empty() {
                open_session_picker(app, "");
            } else {
                resume_session(arg, app);
            }
            SlashResult::SystemMessage(String::new())
        }

        // Every arm below renders the outcome the command itself decided.
        // Restating it here is what let the TUI answer "Session saved." to a
        // write that was refused, and "Exported above." to an empty screen.
        "/fork" | "/branch" => {
            let outcome = crate::repl::branch_session_for_display(arg, &mut app.session);
            app.sync_stats();
            SlashResult::SystemMessage(outcome.plain_message())
        }

        "/save" => {
            let outcome = crate::repl::save_session_for_display(&mut app.session);
            app.sync_stats();
            SlashResult::SystemMessage(outcome.plain_message())
        }

        "/rename" => {
            match crate::repl::rename_session_for_display(arg) {
                Ok(message) => SlashResult::SystemMessage(message),
                Err(message) => SlashResult::SystemMessage(message),
            }
        }

        "/export" => {
            if let Some(outcome) = crate::repl::export_conversation_to_file(arg, &app.session) {
                return SlashResult::SystemMessage(outcome.plain_message());
            }
            match crate::repl::export_conversation_for_display(arg, &app.session) {
                Ok(export) => {
                    SlashResult::SystemMessage(sanitize_terminal_text(&export).into_owned())
                }
                Err(outcome) => SlashResult::SystemMessage(outcome.plain_message()),
            }
        }

        "/rewind" => {
            if arg.trim().is_empty() {
                open_checkpoint_picker(app);
            } else {
                apply_rewind(app, arg);
            }
            SlashResult::SystemMessage(String::new())
        }

        // ── Tools & plugins ──
        "/mcp" if !arg.is_empty() => SlashResult::RunMcp(arg.to_string()),

        "/mcp" => {
            use crate::tui::widgets::screen_renderers::{
                McpScope, McpServerSummary, McpStatus, render_mcp_list,
            };
            let tools = app.session.mcp_info().unwrap_or_default();
            let registry = crate::mcp::registry::McpRegistry::load()
                .map(|registry| registry.list())
                .unwrap_or_default();
            let configured = crate::mcp::McpManager::load_configs().unwrap_or_default();
            let tokens = crate::mcp::McpOAuthStore::load().unwrap_or_default();
            let mut names: Vec<String> = configured
                .keys()
                .cloned()
                .chain(registry.iter().map(|row| row.name.clone()))
                .chain(tools.iter().map(|tool| tool.server_name.clone()))
                .collect();
            names.sort();
            names.dedup();
            let servers: Vec<McpServerSummary> = names
                .iter()
                .map(|name| {
                    let tool_count = tools.iter().filter(|tool| &tool.server_name == name).count();
                    let disabled = registry.iter().any(|row| &row.name == name && !row.enabled);
                    let signed_out_remote = configured.get(name).is_some_and(|config| {
                        match config.as_transport() {
                            crate::mcp::McpTransport::Http { url, .. }
                            | crate::mcp::McpTransport::Sse { url, .. } => {
                                tokens.get(&url).is_none()
                                    && tokens.get(url.trim_end_matches('/')).is_none()
                            }
                            crate::mcp::McpTransport::Stdio { .. } => false,
                        }
                    });
                    let status = if disabled {
                        McpStatus::Disabled
                    } else if configured
                        .get(name)
                        .and_then(|config| crate::mcp::policy_refusal(name, config))
                        .is_some()
                    {
                        McpStatus::Blocked
                    } else if tool_count > 0 {
                        McpStatus::Connected
                    } else if signed_out_remote {
                        McpStatus::NeedsAuth
                    } else {
                        McpStatus::Failed
                    };
                    McpServerSummary {
                        name: name.clone(),
                        status,
                        tool_count: Some(tool_count),
                    }
                })
                .collect();
            let mut text = render_mcp_list(&[McpScope {
                label: "Configured servers".to_string(),
                servers,
            }]);
            for name in &names {
                if let Some(reason) = configured.get(name).filter(|_| !registry.iter().any(|row| &row.name == name && !row.enabled)).and_then(|config| crate::mcp::policy_refusal(name, config)) {
                    text.push_str(&format!("\n{reason}"));
                }
            }
            text.push_str(
                "\n/mcp tools [server] lists tools · /mcp restart reconnects · agi mcp login <name> signs in to a remote server · /mcp enable|disable <name>",
            );
            SlashResult::SystemMessage(text)
        }

        "/permissions" | "/perms" | "/approvals" => SlashResult::SystemMessage(
            crate::repl::permissions_for_display(arg, &app.session).plain_message(),
        ),

        "/agents" => {
            // No arg → open interactive picker; simple name → quick-invoke;
            // management subcommands (list/show/create/validate/help) → text output.
            let is_management_subcommand = matches!(
                arg.split_whitespace().next().unwrap_or(""),
                "" | "list" | "ls" | "show" | "view" | "inspect" | "path" | "where"
                    | "new" | "create" | "init" | "validate" | "doctor" | "check"
                    | "delete" | "remove" | "rm" | "rename" | "set"
                    | "help" | "-h" | "--help"
            );
            if arg.is_empty() {
                // Open interactive agent picker overlay
                app.agent_picker.open();
                SlashResult::SystemMessage(String::new())
            } else if let Some(request) = crate::agents::AgentRequest::parse(arg) {
                SlashResult::RunAgentDraft(request)
            } else if is_management_subcommand {
                SlashResult::SystemMessage(crate::agents::render_agents_command(arg))
            } else {
                // Treat as quick-invoke: /agents <name>
                match crate::agents::find_agent(arg) {
                    Some(def) => {
                        def.apply_to_session(&mut app.session);
                        app.mode = InteractionMode::for_session(&app.session);
                        app.sync_stats();
                        let model_note = if def.model.is_some() {
                            format!(" (model: {})", app.session.model)
                        } else {
                            String::new()
                        };
                        SlashResult::SystemMessage(format!(
                            "Agent `{}` activated{}",
                            arg, model_note
                        ))
                    }
                    None => SlashResult::SystemMessage(crate::agents::render_agents_command(arg)),
                }
            }
        }

        "/init" => {
            SlashResult::SystemMessage(crate::repl::init_project_for_display().plain_message())
        }

        "/skills" if arg.starts_with("import") => {
            let path = arg.trim_start_matches("import").trim();
            SlashResult::SystemMessage(if path.is_empty() {
                "Usage: /skills import <path to SKILL.md or its folder>".to_string()
            } else {
                match crate::skills::import_skill(std::path::Path::new(
                    &crate::path_security::expand_home(path),
                )) {
                    Ok(target) => format!("Imported the skill to {}.", target.display()),
                    Err(reason) => reason,
                }
            })
        }

        "/skills" if arg.starts_with("remove") => {
            let name = arg.trim_start_matches("remove").trim();
            SlashResult::SystemMessage(if name.is_empty() {
                "Usage: /skills remove <skill name>".to_string()
            } else {
                match std::env::current_dir()
                    .map_err(anyhow::Error::from)
                    .and_then(|root| crate::installs::remove_skill(&root, name))
                {
                    Ok(removed) => format!("Removed the skill {}.", removed.display()),
                    Err(error) => format!("Could not remove '{name}': {error:#}"),
                }
            })
        }

        "/skills" => {
            let skills = crate::skills::discover_skills();
            if skills.is_empty() {
                SlashResult::SystemMessage("No skills found. Add .md files to .agiworkforce/skills/ or ~/.agiworkforce/skills/".to_string())
            } else {
                let mut msg = format!("Skills ({}):\n", skills.len());
                for s in &skills {
                    msg.push_str(&format!(
                        "  {} {}\n",
                        pad_to_cols(&s.name, 25),
                        s.description
                    ));
                }
                SlashResult::SystemMessage(msg)
            }
        }

        "/attach" => {
            let (action, rest) = arg.split_once(' ').unwrap_or((arg, ""));
            match action {
                "" => SlashResult::SystemMessage(ADD_CONTEXT_MENU.to_string()),
                url if url.starts_with("https://") || url.starts_with("http://") => {
                    SlashResult::RunAttachUrl(url.to_string())
                }
                "list" => SlashResult::SystemMessage(if app.staged_images.is_empty() {
                    "Nothing staged for the next turn.".to_string()
                } else {
                    let rows: Vec<String> = app
                        .staged_images
                        .iter()
                        .enumerate()
                        .map(|(i, label)| format!("  {}. {label}", i + 1))
                        .collect();
                    format!("Staged for the next turn:\n{}", rows.join("\n"))
                }),
                "remove" | "rm" => {
                    let target = rest.trim();
                    let position = match target {
                        "" | "all" => None,
                        other => match other.parse::<usize>() {
                            Ok(position) => Some(position),
                            Err(_) => {
                                return SlashResult::SystemMessage(format!(
                                    "Not a staged image number: {other}"
                                ))
                            }
                        },
                    };
                    match app.remove_staged_image(position) {
                        Ok(message) => SlashResult::SystemMessage(message),
                        Err(reason) => SlashResult::SystemMessage(reason),
                    }
                }
                "--full" => match app.stage_image_path_with(
                    rest.trim(),
                    agiworkforce_utils_image::PromptImageMode::Original,
                ) {
                    Ok(label) => SlashResult::SystemMessage(format!(
                        "Attached {label}. It is sent without being scaled down, so it costs more input; /attach remove drops it."
                    )),
                    Err(reason) => SlashResult::SystemMessage(format!(
                        "Could not attach {}: {reason}",
                        rest.trim()
                    )),
                },
                "clipboard" => match app.stage_clipboard_image() {
                    Ok(label) => SlashResult::SystemMessage(format!("Attached {label}.")),
                    Err(reason) => SlashResult::SystemMessage(format!("Could not attach: {reason}")),
                },
                path => match app.stage_image_path(path) {
                    Ok(label) => SlashResult::SystemMessage(format!(
                        "Attached {label}. It goes with your next message; /attach remove drops it."
                    )),
                    Err(reason) => {
                        SlashResult::SystemMessage(format!("Could not attach {path}: {reason}"))
                    }
                },
            }
        }

        "/hooks" => {
            match crate::hooks::apply_hooks_command(arg) {
                Ok(message) => SlashResult::SystemMessage(message),
                Err(error) => SlashResult::SystemMessage(format!("{error:#}")),
            }
        }

        "/plugin" | "/plugins" if crate::installs::is_plugin_action(arg) =>
        {
            SlashResult::SystemMessage(crate::installs::plugin_command(arg).unwrap_or_else(|| {
                "Usage: /plugins enable|disable|update|remove <name>, or /plugins configure <name> [KEY=VALUE ...]".to_string()
            }))
        }

        "/plugin" | "/plugins" | "/marketplace" | "/market" => {
            use crate::tui::widgets::screen_renderers::{
                PluginGroup, PluginSummary, PluginTab, PluginTabsView,
            };
            // Discover installed plugins from global and project plugin directories.
            let mut manager = crate::features::plugins::plugins::PluginsManager::new();
            let cwd = std::env::current_dir().ok();
            let _ = manager.load_all(cwd.as_deref());
            let installed: Vec<PluginSummary> = manager
                .plugins()
                .iter()
                .map(|p| PluginSummary {
                    name: p.config_name.clone(),
                    status_glyph: if p.enabled { "✔" } else { "◯" },
                    source_group: if p.from_project_dir {
                        PluginGroup::Project
                    } else {
                        PluginGroup::User
                    },
                })
                .collect();
            let errors: Vec<String> = manager
                .plugins()
                .iter()
                .filter_map(|p| p.error.clone())
                .collect();
            let tab = PluginTab::parse(arg).unwrap_or(if cmd.starts_with("/market") {
                PluginTab::Marketplaces
            } else {
                PluginTab::Installed
            });
            app.open_overlay(Box::new(PluginTabsView::new(tab, installed, errors)));
            SlashResult::SystemMessage(
                "Plugins (\u{2190}\u{2192} switch tabs \u{00b7} Esc close)".to_string(),
            )
        }

        // ── Memory ──
        "/memory" | "/mem" => SlashResult::SystemMessage(
            crate::repl::memory_for_display(
                arg,
                crate::repl::EditorAvailability::TerminalOwnedByUi,
                app.session.privacy_mode,
            )
            .plain_message(),
        ),

        // ── Voice ──
        // The slash handler is sync and voice is async and needs the terminal
        // outside the alternate screen, so it returns a deferred action, as
        // RunLogin and RunAdvisor do.
        "/dictate" => SlashResult::RunDictate(
            if arg.is_empty() {
                crate::voice_languages::default_language()
            } else {
                arg
            }
            .to_string(),
        ),

        "/voice" | "/v" => {
            let lang = if arg.is_empty() {
                crate::voice_languages::default_language()
            } else {
                arg
            };
            if crate::voice_languages::is_valid_language(lang) {
                SlashResult::RunVoice(lang.to_string())
            } else {
                let langs = crate::voice_languages::supported_languages();
                let codes: Vec<&str> = langs.iter().map(|(c, _)| *c).collect();
                SlashResult::SystemMessage(format!(
                    "Unsupported language '{}'. Supported: {}",
                    lang,
                    codes.join(", ")
                ))
            }
        }

        // ── Theme ──
        "/theme" => {
            if arg.is_empty() {
                // Open the interactive theme picker overlay.
                app.theme_picker.open(app.theme_choice);
                SlashResult::SystemMessage(String::new()) // picker handles confirmation
            } else {
                // Direct-set: /theme <slug>
                use super::widgets::theme_picker::ThemeChoice;
                match ThemeChoice::from_arg(arg) {
                    Some(choice) => {
                        app.theme_choice = choice;
                        crate::tui::terminal_palette::set_active_theme(choice.applied() as u8);
                        SlashResult::SystemMessage(theme_set_message(
                            choice,
                            app.config.persist_theme_project(choice.slug()),
                        ))
                    }
                    None => SlashResult::SystemMessage(format!(
                        "Unknown theme: '{arg}'. Available: {}",
                        ThemeChoice::available()
                    )),
                }
            }
        }

        // ── Side query ──
        "/remote-control" | "/rc" => SlashResult::RunRemoteControl(arg.to_string()),

        "/btw" => {
            if arg.is_empty() {
                SlashResult::SystemMessage("Usage: /btw <question>, ask a side question".to_string())
            } else {
                SlashResult::RunBtw(arg.to_string())
            }
        }

        "/workflow" | "/workflows" => {
            if arg.is_empty() {
                SlashResult::SystemMessage(crate::subagent::WORKFLOW_USAGE.to_string())
            } else if let Some(reason) = crate::subagent::workflow_blocker(&app.session) {
                SlashResult::SystemMessage(reason.to_string())
            } else {
                SlashResult::SendPrompt(crate::subagent::workflow_prompt(arg))
            }
        }

        "/search" => {
            if arg.is_empty() {
                SlashResult::SystemMessage(
                    "Usage: /search <question>, answer from a web search".to_string(),
                )
            } else {
                app.session.search_next_turn = true;
                SlashResult::SendPrompt(arg.to_string())
            }
        }

        // ── Review ──
        "/review" => {
            app.session.effort = Some(app.effort);
            match crate::claude_parity::handle_shared_command("/review", arg, &mut app.session) {
                crate::claude_parity::ParityCommandResult::Prompt(prompt) => {
                    SlashResult::SendPrompt(prompt)
                }
                _ => SlashResult::SendAsPrompt,
            }
        }

        "/security-review" if arg.is_empty() => {
            app.open_overlay(Box::new(
                crate::tui::widgets::question_overlay::QuestionOverlayState::for_command(
                    "security-review",
                    "Security review scope",
                    crate::claude_parity::SECURITY_REVIEW_QUESTION,
                    &crate::claude_parity::SECURITY_REVIEW_SCOPES,
                ),
            ));
            SlashResult::SystemMessage(String::new())
        }

        "/effort" | "/e" => {
            if arg.is_empty() {
                // Open the interactive effort picker overlay.
                app.effort_picker.open(app.effort);
                SlashResult::SystemMessage(String::new()) // picker handles confirmation
            } else {
                let new_effort = match arg.to_lowercase().as_str() {
                    "l" => Some(crate::design_system::Effort::Low),
                    "med" | "m" => Some(crate::design_system::Effort::Medium),
                    "h" => Some(crate::design_system::Effort::High),
                    other => crate::design_system::Effort::from_config_value(other),
                };
                match new_effort {
                    Some(e) => {
                        app.effort = e;
                        let saved = app
                            .config
                            .persist_effort_project(&e.label().to_ascii_lowercase())
                            .map(|_| " and saved as this project's default")
                            .unwrap_or("");
                        let note = if matches!(
                            crate::model_catalog::effort_support(&app.session.model),
                            crate::model_catalog::EffortSupport::Unsupported
                        ) {
                            ". This model has no effort control, so it applies once you switch to one that does"
                        } else {
                            ""
                        };
                        SlashResult::SystemMessage(format!(
                            "Effort set to {}{saved}{note}",
                            e.label()
                        ))
                    }
                    None => SlashResult::SystemMessage(format!(
                        "Unknown effort level '{arg}'. Use: {}",
                        crate::design_system::Effort::ALL
                            .iter()
                            .map(|effort| effort.wire_value())
                            .collect::<Vec<_>>()
                            .join(" | ")
                    )),
                }
            }
        }

        "/usage" => {
            use super::widgets::screen_renderers::{render_usage, UsageSummary};
            let usage = UsageSummary {
                input_tokens: app.session.total_input_tokens,
                output_tokens: app.session.total_output_tokens,
                cache_read_tokens: app.session.total_cache_read_tokens,
                cache_write_tokens: app.session.total_cache_creation_tokens,
                estimated_cost_usd: app.session.cost_ledger.total_usd,
                by_model: app.session.cost_ledger.model_breakdown(),
                turn_count: app.session.turn_count,
                model: crate::model_catalog::display_name(&app.session.model),
                account_lines: crate::usage_summary::account_lines_blocking(),
            };
            SlashResult::SystemMessage(render_usage(&usage))
        }

        // ── New interactive overlays ──

        "/memories" => {
            use crate::tui::widgets::memories_settings::{MemoriesSettingsView, MemorySettings};
            // Seed from the persisted settings; save commits back via take_result.
            let home = crate::config::CliConfig::config_dir().ok();
            let (auto_memory, decay_threshold_days, max_facts) = home
                .as_deref()
                .map(crate::memory_pipeline::load_memory_settings)
                .unwrap_or((true, 30, 500));
            let mut view = MemoriesSettingsView::new(MemorySettings {
                auto_memory,
                decay_threshold_days,
                max_facts,
            });
            if let Some(home) = home.as_deref() {
                view = view.with_stored_facts(crate::memory_pipeline::stored_fact_count(home));
            }
            app.open_overlay(Box::new(view));
            SlashResult::SystemMessage(
                "Memory settings (\u{2191}\u{2193} navigate \u{00b7} Enter toggle \u{00b7} Esc close)".into(),
            )
        }

        "/skills-toggle" => {
            use crate::tui::widgets::skills_toggle::{Skill as ToggleSkill, SkillsToggleView};
            // List ALL skills with their real enabled state (from the persisted
            // disable set), so the overlay can turn skills off AND back on. Save
            // commits the disabled set via take_result → apply_overlay_result.
            let disabled = crate::skills::load_disabled_skills();
            let skills: Vec<ToggleSkill> = crate::skills::discover_skills_all()
                .into_iter()
                .map(|s| {
                    let enabled = !disabled.contains(&s.name);
                    ToggleSkill::new(s.name, s.description, enabled)
                })
                .collect();
            let view = SkillsToggleView::new(skills);
            app.open_overlay(Box::new(view));
            SlashResult::SystemMessage(
                "Skills (\u{2191}\u{2193} navigate \u{00b7} Space toggle \u{00b7} Enter save \u{00b7} Esc cancel)".into(),
            )
        }

        "/statusline" => {
            use crate::tui::widgets::statusline_setup::StatusLineSetupView;
            // Seed from the LIVE config so the overlay reflects the current state,
            // and its save commits back via take_result → apply_overlay_result.
            let view = StatusLineSetupView::new(app.statusline_config.clone());
            app.open_overlay(Box::new(view));
            SlashResult::SystemMessage(
                "Statusline setup (\u{2191}\u{2193} navigate \u{00b7} Space toggle \u{00b7} Enter save \u{00b7} Esc cancel)".into(),
            )
        }

        "/title" => {
            use crate::tui::widgets::terminal_title_setup::TerminalTitleSetupView;
            // Seed from the LIVE config; save commits back via take_result →
            // apply_overlay_result, which emits the new window title.
            let view = TerminalTitleSetupView::new(app.terminal_title_config.clone());
            app.open_overlay(Box::new(view));
            SlashResult::SystemMessage(
                "Terminal title setup (\u{2191}\u{2193} navigate \u{00b7} Space toggle \u{00b7} Enter save \u{00b7} Esc cancel)".into(),
            )
        }

        "/diff-review" => {
            use crate::tui::widgets::diff_review::{DiffReviewView, FileDiff};
            // Gather changed files from `git status --porcelain` synchronously.
            let cwd = std::env::current_dir().unwrap_or_default();
            if let Err(error) = crate::platform::runtime::git::check_repository_config_blocking(
                &cwd,
                agiworkforce_worktree::config_guard::ConfigUse::CONTENT,
            )
            {
                return SlashResult::SystemMessage(error.to_string());
            }
            let mut status_command = agiworkforce_worktree::host_git();
            status_command.args(["status", "--porcelain", "--ignore-submodules=dirty"]);
            let status = crate::platform::runtime::git::host_git_output(status_command);
            // Same trap as /diff: a non-zero git exit leaves stdout empty, which
            // is indistinguishable from a clean tree unless the status is read.
            let status_out = match status {
                Ok(ref output) if output.status.success() => {
                    String::from_utf8_lossy(&output.stdout).to_string()
                }
                Ok(output) => {
                    let detail = String::from_utf8_lossy(&output.stderr);
                    let detail = detail.trim();
                    return SlashResult::SystemMessage(if detail.is_empty() {
                        "git status failed.".to_string()
                    } else {
                        format!("git status failed: {detail}")
                    });
                }
                Err(error) => {
                    return SlashResult::SystemMessage(
                        crate::platform::runtime::git::host_git_failure(&error),
                    );
                }
            };
            // Untracked files have no HEAD revision to diff against, so they
            // are listed from the porcelain status and shown as additions.
            let untracked: Vec<String> = status_out
                .lines()
                .filter_map(|line| line.strip_prefix("?? "))
                .map(str::to_string)
                .collect();
            let mut diff_command = agiworkforce_worktree::host_git();
            diff_command.args([
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--ignore-submodules=dirty",
                "HEAD",
            ]);
            let tracked_diff = match crate::platform::runtime::git::host_git_output(diff_command)
            {
                Ok(output) => String::from_utf8_lossy(&output.stdout).to_string(),
                Err(error) => {
                    return SlashResult::SystemMessage(
                        crate::platform::runtime::git::host_git_failure(&error),
                    );
                }
            };
            let parsed = crate::diff_model::Diff::parse(&tracked_diff);
            let read_diff = |args: &[&str]| {
                let mut command = agiworkforce_worktree::host_git();
                command.args(args).args([
                    "--no-ext-diff",
                    "--no-textconv",
                    "--ignore-submodules=dirty",
                ]);
                crate::platform::runtime::git::host_git_output(command)
                    .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                    .unwrap_or_default()
            };
            let mut hunks_by_path: std::collections::HashMap<
                std::path::PathBuf,
                Vec<(Vec<String>, String, bool)>,
            > = std::collections::HashMap::new();
            for (text, staged) in [(read_diff(&["diff", "--cached"]), true), (read_diff(&["diff"]), false)] {
                let model = crate::diff_model::Diff::parse(&text);
                let patches = crate::diff_model::file_hunk_patches(&text);
                if patches.len() != model.files.len() {
                    continue;
                }
                for (file, patches) in model.files.iter().zip(patches) {
                    if patches.len() != file.hunks.len() {
                        continue;
                    }
                    let entry = hunks_by_path.entry(file.path().to_path_buf()).or_default();
                    for (hunk, patch) in file.hunks.iter().zip(patches) {
                        let mut preview = vec![hunk.header()];
                        preview.extend(hunk.lines.iter().map(crate::diff_model::DiffLine::render));
                        entry.push((preview, patch, staged));
                    }
                }
            }
            let mut files: Vec<FileDiff> = parsed
                .files
                .iter()
                .map(|file| {
                    let hunks = hunks_by_path.remove(file.path()).unwrap_or_default();
                    FileDiff::from_model(file).with_hunks(hunks)
                })
                .collect();
            files.extend(untracked.iter().map(|path| {
                let mut file = FileDiff::new(path.as_str(), Vec::new(), 0, 0);
                file.kind = crate::diff_model::FileChangeKind::Added;
                file
            }));
            if files.is_empty() {
                SlashResult::SystemMessage("No changed files (working tree clean).".into())
            } else {
                let view = DiffReviewView::new(files);
                app.open_overlay(Box::new(view));
                SlashResult::SystemMessage(
                    "Diff review (\u{2191}\u{2193} file \u{00b7} \u{2190}\u{2192} hunk \u{00b7} y approve \u{00b7} n reject \u{00b7} s skip \u{00b7} Enter done \u{00b7} Esc close). An approved file or hunk is staged, a rejected one is left unstaged (unstaged if it was staged), and d pressed twice on an unstaged hunk discards it from the working tree.".into(),
                )
            }
        }

        "/advisor" => {
            if arg.is_empty() {
                SlashResult::SystemMessage(
                    "Usage: /advisor <question>, consult a catalog-selected advisor model".into(),
                )
            } else {
                SlashResult::RunAdvisor(arg.to_string())
            }
        }

        "/team-onboarding" | "/onboarding" => {
            SlashResult::SystemMessage(crate::claude_parity::render_team_onboarding())
        }

        "/terminal-setup" | "/shell-setup" => {
            let snippet = "# Add to ~/.bashrc or ~/.zshrc:\nexport AGIWORKFORCE_HOME=\"$HOME/.agiworkforce\"\n# agi is the primary command; agiworkforce remains a compatibility alias\n# fish: set -gx AGIWORKFORCE_HOME ~/.agiworkforce";
            SlashResult::SystemMessage(format!("Shell integration:\n{snippet}"))
        }

        "/reload-plugins" => {
            let mut manager = crate::plugins::PluginsManager::new();
            match manager.load_all(None) {
                Ok(plugins) => SlashResult::SystemMessage(format!("Reloaded {} plugin(s).", plugins.len())),
                Err(e) => SlashResult::SystemMessage(format!("Plugin reload failed: {e}")),
            }
        }

        "/extra-usage" | "/pricing" => {
            SlashResult::SystemMessage(crate::claude_parity::open_upgrade_page())
        }

        "/remote-env" => SlashResult::SystemMessage(crate::claude_parity::render_remote_env()),

        "/keybindings" | "/keys" => SlashResult::SystemMessage(app.keybindings.render_help(
            crate::keybindings::resolved_edit_mode(app.config.ui.edit_mode.as_deref()),
        )),

        _ => {
            if let Some(prompt) = crate::custom_commands::expand_custom_slash_invocation(input) {
                return SlashResult::SendPrompt(prompt);
            }
            if let Some(loaded) =
                crate::skills::skill_command_prompt(cmd.trim_start_matches('/'), arg)
            {
                return match loaded {
                    Ok(prompt) => SlashResult::SendPrompt(prompt),
                    Err(reason) => SlashResult::SystemMessage(reason),
                };
            }
            if input.trim_start().starts_with("/mcp:") {
                return SlashResult::SendMcpPrompt(input.to_string());
            }

            let shared =
                crate::claude_parity::handle_shared_command(cmd.as_str(), arg, &mut app.session);
            persist_tui_shared_ui_config(cmd.as_str(), arg, app);

            match shared {
                crate::claude_parity::ParityCommandResult::SystemMessage(message) => {
                    SlashResult::SystemMessage(message)
                }
                crate::claude_parity::ParityCommandResult::Prompt(prompt) => {
                    SlashResult::SendPrompt(prompt)
                }
                crate::claude_parity::ParityCommandResult::DraftPrompt {
                    prompt,
                    destination,
                    provider,
                } => {
                    app.input = sanitize_terminal_text(&prompt).into_owned();
                    app.cursor = app.input.len();
                    SlashResult::SystemMessage(format!(
                        "Drafted {} continuation for provider `{provider}`. Review the exact payload before pressing Enter; edits require a fresh preview.",
                        match destination {
                            crate::agent::PrivacyMode::Byok => destination.trust_word(),
                            crate::agent::PrivacyMode::Managed => "Managed Cloud",
                            crate::agent::PrivacyMode::Local => "Local",
                        }
                    ))
                }
                crate::claude_parity::ParityCommandResult::Feedback { kind, message } => {
                    SlashResult::RunFeedback(kind, message)
                }
                crate::claude_parity::ParityCommandResult::NotHandled => SlashResult::SendAsPrompt,
            }
        }
    }
}

fn format_advisor_tool_output(raw: &str) -> String {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) else {
        return raw.to_string();
    };
    let answer = value.get("answer").and_then(|v| v.as_str()).unwrap_or(raw);
    let model = value.get("model_used").and_then(|v| v.as_str());
    match model {
        Some(model) => format!("{answer}\n\n[advisor model: {model}]"),
        None => answer.to_string(),
    }
}

fn persist_tui_shared_ui_config(cmd: &str, arg: &str, app: &mut TuiApp) {
    match cmd {
        "/output-style" if crate::claude_parity::output_style_arg_persists(arg) => {
            let _ = app
                .config
                .persist_output_style_project(&app.session.output_style);
        }
        "/privacy-mode" | "/trust-boundary" => {
            if crate::agent::PrivacyMode::from_arg(arg)
                .is_some_and(|mode| mode == app.session.privacy_mode)
            {
                let _ = app
                    .config
                    .persist_privacy_mode_project(app.session.privacy_mode.label());
            }
        }
        _ => {}
    }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
pub async fn run(
    config: &mut CliConfig,
    model: &str,
    sys_context: &SystemContext,
    custom_system_prompt: Option<&str>,
    resume_messages: Option<Vec<crate::models::Message>>,
    resume_managed_session: Option<(crate::runtime::session::ManagedSession, std::path::PathBuf)>,
    max_turns: Option<usize>,
    skip_permissions: bool,
    allow_bypass_permissions: bool,
    fallback_chain: crate::routing::fallback::FallbackChain,
    session_name: Option<String>,
    team_mode: bool,
    auto_approve_safe: bool,
    quiet: bool,
    provider_override: Option<String>,
    permission_mode: crate::cli_options::PermissionMode,
    auto_approve_plan: bool,
    allowed_tools: Vec<String>,
    disallowed_tools: Vec<String>,
    mcp_config_options: crate::mcp::McpConfigLoadOptions,
    agent_name: Option<String>,
    auto_route_seed: Option<crate::routing::classify::AutoRouteSeed>,
) -> Result<()> {
    crate::tier_cache::ensure_plan_models_cached().await;
    crate::tools::enable_interactive_questions();
    let effective_provider_override = crate::models::plan_first_provider_override(
        &crate::models::AccountRoute::load(),
        model,
        &config.default.model,
        &config.default.provider,
        provider_override.as_deref(),
    );
    let effective_provider_override = effective_provider_override.as_deref();
    let mut session = AgentSession::new_checked(
        model,
        sys_context,
        custom_system_prompt,
        effective_provider_override,
    )?;
    session.set_additional_context_dirs(
        crate::path_security::registered_additional_workspace_roots(),
    )?;
    session.apply_ui_config(config);
    crate::update_check::spawn_startup_check(config, session.privacy_mode);
    crate::claude_parity::connectors::prefetch_workspace_policy(session.privacy_mode);
    session.max_turns = max_turns;
    session.skip_permissions = skip_permissions;
    session.bypass_permissions_available = skip_permissions || allow_bypass_permissions;
    session.auto_approve_safe = auto_approve_safe;
    session.quiet = quiet;
    if fallback_chain.primaries.len() > 1 {
        session.fallback_chain = Some(fallback_chain);
    }
    session.session_name = session_name;
    session.permission_mode = permission_mode;
    session.auto_approve_plan = auto_approve_plan;
    session.apply_tool_filters(&allowed_tools, &disallowed_tools);
    if matches!(permission_mode, crate::cli_options::PermissionMode::Plan) {
        session.plan_mode = true;
    }
    if team_mode {
        session.enable_team_mode();
    }
    // Wire --agent: load the named agent definition and apply overrides to the session.
    if let Some(ref name) = agent_name {
        match crate::agents::find_agent(name) {
            Some(agent_def) => {
                agent_def.apply_to_session(&mut session);
                eprintln!(
                    "Agent '{}' loaded.",
                    sanitize_terminal_text(&agent_def.name)
                );
            }
            None => {
                eprintln!(
                    "Warning: agent '{}' not found. Run /agents to list available agents.",
                    sanitize_terminal_text(name)
                );
            }
        }
    }

    match (resume_messages, resume_managed_session) {
        (Some(messages), Some((managed_session, path))) => {
            if !messages.is_empty() {
                session.messages = messages;
            }
            session.turn_count = session
                .messages
                .iter()
                .filter(|message| message.role == "user")
                .count() as u32;
            session.adopt_managed_session(managed_session, path)?;
        }
        (Some(messages), None) => {
            if !messages.is_empty() {
                session.messages = messages;
            }
            session.turn_count = session
                .messages
                .iter()
                .filter(|message| message.role == "user")
                .count() as u32;
            session.enable_managed_session()?;
        }
        (None, Some((managed_session, path))) => {
            session.messages = managed_session.messages.clone();
            session.turn_count = session
                .messages
                .iter()
                .filter(|message| message.role == "user")
                .count() as u32;
            session.adopt_managed_session(managed_session, path)?;
        }
        (None, None) => {
            session.enable_managed_session()?;
        }
    }

    // `--auto` launches install the resolved launch route + tier so every
    // interactive turn re-classifies and re-resolves with continuity
    // (AUTO-ROUTER-MIGRATION-01 CLI clause; see AgentSession::send).
    if let Some(seed) = auto_route_seed {
        session.auto_routing_tier = Some(seed.tier);
        session.set_managed_auto_routing(Some(seed.state));
    }

    // Mark the TUI active *before* spawning any background work so the MCP
    // attach's `connect_all` progress lines ("N tools discovered", etc.) are
    // suppressed instead of racing the (later) `setup_terminal` flag flip and
    // bleeding raw stderr into the alternate screen. `setup_terminal` sets it
    // again (idempotent).
    super::set_tui_active(true);

    // MCP connect, browser OAuth included, runs in the background so a repo
    // `.mcp.json` naming an OAuth server cannot hold startup for
    // OAUTH_INTERACTIVE_TIMEOUT. The event loop injects the manager once it is
    // ready; until then turns run without MCP tools.
    let mcp_elicitation_handler = Arc::new(crate::mcp::tui_handler::TuiElicitationHandler::new());
    let mut mcp_attach_join: Option<tokio::task::JoinHandle<Option<crate::mcp::McpManager>>> = {
        let opts = mcp_config_options.clone();
        let privacy_mode = session.privacy_mode;
        let elicitation: Arc<dyn agiworkforce_mcp::ElicitationHandler> =
            Arc::clone(&mcp_elicitation_handler) as Arc<dyn agiworkforce_mcp::ElicitationHandler>;
        Some(tokio::spawn(async move {
            match crate::build_mcp_manager_with_elicitation(
                &opts,
                true,
                true,
                privacy_mode,
                elicitation,
            )
            .await
            {
                Ok(mgr) => mgr,
                Err(e) => {
                    // Background task during a live TUI: a raw stderr warning
                    // would corrupt the alternate screen. Swallow it here; the
                    // user can inspect MCP state via `/mcp`.
                    if !crate::tui::tui_active() {
                        crate::output::print_warn(&format!("MCP config/connect error: {e:#}"));
                    }
                    None
                }
            }
        }))
    };

    // Populate the OpenRouter BYOK model cache in the background (public
    // `/models` endpoint, no key needed) so the model picker can list current
    // OpenRouter models without blocking startup. Skipped while the cache is
    // fresh; the picker reads the cache directly, so this task just refreshes it.
    if crate::models::openrouter_models::load_cached_models().is_empty() {
        tokio::spawn(async move {
            if let Ok(models) = crate::models::openrouter_models::fetch_openrouter_models().await {
                crate::models::openrouter_models::save_cache(
                    &models,
                    &chrono::Utc::now().to_rfc3339(),
                );
            }
        });
    }

    // Discover the account's managed-cloud roster without delaying terminal
    // startup. The trusted-host/JWT boundary lives in gateway_models; the
    // picker reads the resulting process-local catalog when `/model` opens.
    tokio::spawn(async move {
        match crate::models::gateway_models::discover_gateway_models().await {
            Ok(catalog) => crate::models::gateway_models::store_live_catalog(catalog),
            Err(error) => {
                tracing::debug!("managed model discovery unavailable during TUI startup: {error}")
            }
        }
    });

    // Hooks
    let hooks_config = session.hooks_config().clone();
    crate::hooks::run_hooks(
        &hooks_config,
        crate::hooks::HookEvent::SessionStart,
        &crate::hooks::HookInput {
            event: "SessionStart".to_string(),
            session_id: Some(session.runtime_session_id.clone()),
            model: Some(model.to_string()),
            tool_name: None,
            tool_args: None,
            tool_output: None,
            message: None,
            tool_execution: None,
        },
    )
    .await;

    let mut app = TuiApp::new(session, config.clone());
    if let Some(temperature) = config.default.temperature {
        if crate::model_catalog::model_rejects_sampling_parameters(&app.session.model) {
            app.chat_messages.push(ChatMessage {
                role: ChatRole::System,
                text: format!(
                    "{} does not accept a temperature, so your configured {temperature} is not sent to it.",
                    crate::model_catalog::display_name(&app.session.model)
                ),
            });
        }
    }
    app.mcp_elicitation_handler = mcp_elicitation_handler;
    let browser_watch = spawn_browser_watch(Arc::clone(&app.browser));
    app.start_panel.read_recent_sessions();
    app.wire_fallback_banner();
    // Populate the picker's Local section without blocking launch: probe Ollama
    // / LM Studio in the background (2.5s timeout) and cache the catalog-shaped
    // results for the sync `/model` handler to read.
    {
        let cfg = config.clone();
        tokio::spawn(async move {
            let probes = crate::local_models::discover_all(&cfg).await;
            let models: Vec<crate::model_catalog::Model> =
                crate::local_models::discovered_models(&probes)
                    .iter()
                    .map(discovered_local_to_catalog_model)
                    .collect();
            let _ = DISCOVERED_LOCAL_MODELS
                .get_or_init(|| std::sync::Mutex::new(Vec::new()))
                .lock()
                .map(|mut g| *g = models);
        });
    }
    super::motion::set_reduced(
        crate::output::plain_output() || app.config.ui.reduced_motion == Some(true),
    );
    let mut terminal = setup_terminal()?;
    crate::tui::terminal_palette::set_active_theme(app.theme_choice.applied() as u8);
    app.emit_terminal_title();

    let result = run_event_loop(&mut terminal, &mut app, &mut mcp_attach_join).await;
    browser_watch.abort();

    // Abort the background MCP attach if it never finished (e.g. OAuth still
    // pending) so it can't keep a browser-wait or connection alive after exit.
    if let Some(handle) = mcp_attach_join.take() {
        handle.abort();
    }
    if let Some(link) = app.remote.take() {
        let _ = link.stop.send(true);
        let _ = tokio::time::timeout(std::time::Duration::from_secs(3), link.task).await;
    }

    // A turn cancelled with Esc/Ctrl-C reconciles history in memory but never
    // reaches the end-of-turn persist, so quitting straight after a cancel
    // leaves the file ending on a lone user message and `agi resume` reopens it
    // with two user turns in a row. This is a no-op when persistence is off.
    if let Err(error) = app.session.persist_managed_session() {
        tracing::warn!("failed to persist the session on exit: {error:#}");
    }

    release_terminal_title();
    restore_terminal(&mut terminal)?;

    if let Err(error) = app.session.finalize_memory(&app.config).await {
        crate::output::print_warn(&format!("Session memory extraction failed: {error:#}"));
    }

    app.session.sync_to_account().await;

    // Session end hooks
    crate::hooks::run_hooks(
        &hooks_config,
        crate::hooks::HookEvent::SessionEnd,
        &crate::hooks::HookInput {
            event: "SessionEnd".to_string(),
            session_id: Some(app.session.runtime_session_id.clone()),
            model: Some(app.session.model.clone()),
            tool_name: None,
            tool_args: None,
            tool_output: None,
            message: None,
            tool_execution: None,
        },
    )
    .await;

    if let Some(mut mgr) = app.session.take_mcp_manager() {
        mgr.shutdown_all().await;
    }

    crate::output::print_session_cost(
        app.session.total_input_tokens,
        app.session.total_output_tokens,
        app.session.turn_count,
        app.session.cost_ledger.total_usd,
        provider_access_mode(&app.session.provider),
    );

    result
}

async fn run_event_loop(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    app: &mut TuiApp,
    mcp_attach_join: &mut Option<tokio::task::JoinHandle<Option<crate::mcp::McpManager>>>,
) -> Result<()> {
    render(terminal, app)?;

    loop {
        // Inject the MCP manager once the background attach finishes, without
        // blocking the UI. Until then, turns simply run without MCP tools.
        if mcp_attach_join
            .as_ref()
            .map(|h| h.is_finished())
            .unwrap_or(false)
        {
            if let Some(handle) = mcp_attach_join.take() {
                if let Ok(Some(mgr)) = handle.await {
                    app.session.set_mcp_manager(mgr);
                    // The servers' prompts exist only now, so register them
                    // for dispatch and for the `/` popup.
                    if let Some(prompts) = app.session.mcp_prompt_info() {
                        register_mcp_prompt_commands(&mut app.command_registry, prompts);
                    }
                }
            }
        }

        // MCP servers may elicit input outside an active model turn. Never
        // replace an overlay the user is already operating; the FIFO request
        // stays queued until that overlay closes.
        if app.active_overlay.is_none() {
            let handler = Arc::clone(&app.mcp_elicitation_handler);
            while let Some(pending) = handler.drain_pending().await {
                let request_id = pending.id;
                let response = run_idle_mcp_elicitation_modal(terminal, app, pending)?;
                handler.complete(request_id, response).await;
            }
        }

        // Surface out-of-band notices (e.g. a local model's tool support being
        // dropped for a turn) as system messages so they are visible instead of
        // silently swallowed, then redraw so they appear immediately.
        let notices = crate::tui::drain_tui_notices();
        if !notices.is_empty() {
            for text in notices {
                app.chat_messages.push(ChatMessage {
                    role: ChatRole::System,
                    text,
                });
            }
            render(terminal, app)?;
        }

        if drain_team_messages(app).await {
            render(terminal, app)?;
        }

        drain_side_answers(app);
        drain_remote_control(app);
        if !app.is_loading && !app.remote_prompts.is_empty() {
            let text = std::mem::take(&mut app.remote_prompts).join("\n\n");
            app.chat_messages.push(ChatMessage {
                role: ChatRole::System,
                text: "From your phone:".to_string(),
            });
            let staged = std::mem::take(&mut app.session.pending_image_blocks);
            let labels = std::mem::take(&mut app.staged_images);
            let context = std::mem::take(&mut app.turn_context);
            let sent = send_message(terminal, app, &text).await;
            app.session.pending_image_blocks = staged;
            app.staged_images = labels;
            app.turn_context = context;
            sent?;
            continue;
        }
        let queued = (!app.is_loading && !app.queued_prompts.is_empty())
            .then(|| std::mem::take(&mut app.queued_prompts).join("\n\n"));
        if queued.is_some() || event::poll(super::motion::FRAME_INTERVAL)? {
            let before = (app.input.clone(), app.cursor);
            let action = match queued {
                Some(text) => InputAction::SendMessage(text),
                None => match event::read()? {
                    Event::Key(key) => handle_key_event(app, key),
                    Event::Paste(text) => {
                        handle_paste_text(app, &text);
                        InputAction::None
                    }
                    _ => InputAction::None,
                },
            };
            if !matches!(action, InputAction::SendMessage(_)) {
                app.composer_undo.observe(before, &app.input);
            }

            match action {
                InputAction::OpenEditor => {
                    let before = (app.input.clone(), app.cursor);
                    restore_terminal(terminal)?;
                    let edited = super::composer_edits::edit_in_external_editor(&app.input);
                    *terminal = setup_terminal()?;
                    match edited {
                        Ok(text) => {
                            app.input = sanitize_terminal_text(&text).into_owned();
                            app.cursor = app.input.len();
                            app.composer_undo.observe(before, &app.input);
                        }
                        Err(error) => {
                            app.status_notice = Some((format!("{error:#}"), Instant::now()));
                        }
                    }
                }
                InputAction::Quit(reason) => {
                    run_stop_hook(app, reason).await;
                    app.should_quit = true;
                }

                InputAction::CycleMode => {
                    let new_mode = app.mode.next_available(&app.session);
                    if new_mode == app.mode {
                        app.chat_messages.push(ChatMessage {
                            role: ChatRole::System,
                            text: pinned_mode_notice(app),
                        });
                    } else {
                        apply_mode(app, new_mode);
                        // Stamp the banner so it shows for MODE_BANNER_TTL seconds.
                        app.mode_banner_shown_at = Some(Instant::now());
                        let mut msg =
                            format!("{}, {}", app.mode.label(), mode_description(app.mode));
                        if new_mode == InteractionMode::BypassPermissions {
                            msg.push_str("\n\n  WARNING: All tool confirmations are bypassed!");
                            msg.push_str(
                                "\n  This means commands will execute without asking you first.",
                            );
                            msg.push_str("\n  Press Shift+Tab again to advance to FullAuto, or cycle back to Default.");
                        }
                        if new_mode == InteractionMode::FullAuto {
                            msg.push_str(
                                "\n\n  WARNING: Full-auto mode, no prompts, no confirmations.",
                            );
                            msg.push_str(
                                "\n  Use with extreme caution in trusted environments only.",
                            );
                        }
                        app.chat_messages.push(ChatMessage {
                            role: ChatRole::System,
                            text: msg,
                        });
                        let hcfg = app.session.hooks_config().clone();
                        crate::hooks::run_hooks(
                            &hcfg,
                            crate::hooks::HookEvent::PlanModeChanged,
                            &crate::hooks::HookInput {
                                event: "PlanModeChanged".to_string(),
                                session_id: Some(app.session.runtime_session_id.clone()),
                                model: Some(app.session.model.clone()),
                                tool_name: None,
                                tool_args: None,
                                tool_output: None,
                                message: Some(new_mode.label().to_string()),
                                tool_execution: None,
                            },
                        )
                        .await;
                    }
                }

                InputAction::SendMessage(text) if text.starts_with('!') => {
                    app.prompt_history.record(&text);
                    let command = text.trim_start_matches('!').trim().to_string();
                    let message = if command.is_empty() {
                        "Type a shell command after !".to_string()
                    } else if !app.workspace_is_trusted() {
                        "This folder is not trusted, so shell commands stay off. Trust it with /trust grant first.".to_string()
                    } else {
                        match crate::repl::run_user_shell_command(&command, &mut app.session, false)
                            .await
                        {
                            Ok((output, success)) => format!(
                                "$ {}\n{}\n({})",
                                sanitize_terminal_text(&command),
                                sanitize_terminal_text(output.trim_end()),
                                if success { "exit 0" } else { "failed" }
                            ),
                            Err(error) => format!("Could not run {command}: {error:#}"),
                        }
                    };
                    app.chat_messages.push(ChatMessage {
                        role: ChatRole::System,
                        text: message,
                    });
                }

                InputAction::SendMessage(text) => {
                    app.prompt_history.record(&text);
                    // Detect natural language mode switches.
                    let mut handled_as_mode_command = false;
                    if let Some(new_mode) = detect_mode_intent(&text) {
                        if apply_mode(app, new_mode) {
                            let hcfg = app.session.hooks_config().clone();
                            crate::hooks::run_hooks(
                                &hcfg,
                                crate::hooks::HookEvent::PlanModeChanged,
                                &crate::hooks::HookInput {
                                    event: "PlanModeChanged".to_string(),
                                    session_id: Some(app.session.runtime_session_id.clone()),
                                    model: Some(app.session.model.clone()),
                                    tool_name: None,
                                    tool_args: None,
                                    tool_output: None,
                                    message: Some(new_mode.label().to_string()),
                                    tool_execution: None,
                                },
                            )
                            .await;
                            app.chat_messages.push(ChatMessage {
                                role: ChatRole::System,
                                text: format!(
                                    "{}, {}",
                                    app.mode.label(),
                                    mode_description(app.mode)
                                ),
                            });
                        } else {
                            app.chat_messages.push(ChatMessage {
                                role: ChatRole::System,
                                text: unavailable_mode_notice(app, new_mode),
                            });
                        }
                        // A pure utterance that escalates into a permission-weakening
                        // mode is a command, not a chat turn: do NOT also forward it
                        // to the model (avoids an unintended extra turn + the mode
                        // change being a side effect of normal chat input). Plan/Chat
                        // switches still fall through so the message is sent for
                        // context.
                        if mode_is_permission_escalating(new_mode) {
                            handled_as_mode_command = true;
                        }
                    }

                    // A pure permission-escalating mode-switch utterance is fully
                    // handled above; skip slash/prompt dispatch (the loop still
                    // renders below).
                    if !handled_as_mode_command {
                        match handle_slash(&text, app) {
                            SlashResult::Quit => {
                                run_stop_hook(app, QuitReason::ExitCommand).await;
                                app.should_quit = true;
                            }
                            SlashResult::SystemMessage(msg) => {
                                if !msg.is_empty() {
                                    app.chat_messages.push(ChatMessage {
                                        role: ChatRole::System,
                                        text: msg,
                                    });
                                }
                            }
                            SlashResult::RunLogin(provider) => {
                                // Leave TUI, run interactive login, re-enter TUI
                                restore_terminal(terminal)?;
                                let result = crate::auth::interactive_login_for_provider(
                                    Some(provider.as_str()).filter(|name| !name.is_empty()),
                                )
                                .await;
                                *terminal = setup_terminal()?;
                                crate::claude_parity::connectors::forget_local_tool_policy();
                                match result {
                                    Ok(()) => {
                                        app.chat_messages.push(ChatMessage {
                                            role: ChatRole::System,
                                            text: "Login complete. Credentials saved.".to_string(),
                                        });
                                    }
                                    Err(e) => {
                                        app.chat_messages.push(ChatMessage {
                                            role: ChatRole::System,
                                            text: format!("Login failed: {e}"),
                                        });
                                    }
                                }
                            }
                            SlashResult::RunDictate(lang) => {
                                restore_terminal(terminal)?;
                                let dictated = crate::voice::dictate(&app.session, &lang).await;
                                *terminal = setup_terminal()?;
                                match dictated {
                                    Ok(Some(text)) => {
                                        let before = (app.input.clone(), app.cursor);
                                        insert_str_at_cursor(
                                            &mut app.input,
                                            &mut app.cursor,
                                            sanitize_terminal_text(&text).as_ref(),
                                        );
                                        app.composer_undo.observe(before, &app.input);
                                        app.status_notice = Some((
                                            "dictation added to the composer, Enter to send"
                                                .to_string(),
                                            Instant::now(),
                                        ));
                                    }
                                    Ok(None) => {
                                        app.status_notice = Some((
                                            "dictation cancelled".to_string(),
                                            Instant::now(),
                                        ));
                                    }
                                    Err(error) => app.chat_messages.push(ChatMessage {
                                        role: ChatRole::System,
                                        text: format!("Dictation failed: {error:#}"),
                                    }),
                                }
                            }
                            SlashResult::RunVoice(lang) => {
                                // Voice owns the terminal (it prints prompts and
                                // reads audio state), so drop the alt-screen for
                                // the duration and restore it after, the same
                                // shape as RunLogin above.
                                restore_terminal(terminal)?;
                                let first_voice_message = app.session.messages.len();
                                let result = crate::voice::run_voice_mode(
                                    &mut app.session,
                                    &app.config,
                                    &lang,
                                )
                                .await;
                                *terminal = setup_terminal()?;
                                app.sync_stats();
                                let first_voice_row = app.chat_messages.len();
                                append_session_messages_since(app, first_voice_message);
                                for message in app.chat_messages.iter_mut().skip(first_voice_row) {
                                    if message.role == ChatRole::User {
                                        message.text =
                                            format!("{VOICE_TRANSCRIPT_LABEL} {}", message.text);
                                    }
                                }
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text: match result {
                                        Ok(()) => "Voice session ended.".to_string(),
                                        Err(e) => format!("Voice mode failed: {e}"),
                                    },
                                });
                            }
                            SlashResult::RunImage(argument) => {
                                let privacy = app.session.privacy_mode;
                                let cwd = app.workspace_root();
                                if crate::cloud::image::slash_generates(&argument) {
                                    app.chat_messages.push(ChatMessage {
                                        role: ChatRole::System,
                                        text: "Generating the image. Esc stops it.".to_string(),
                                    });
                                    render(terminal, app)?;
                                }
                                let outcome = crate::cloud::image::run_slash(
                                    privacy,
                                    &argument,
                                    &cwd,
                                    image_stop_keys(),
                                )
                                .await;
                                app.generated_images.extend(outcome.paths);
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text: outcome.text,
                                });
                            }
                            SlashResult::RunArtifacts(argument) => {
                                let text = crate::cloud::artifacts::slash(
                                    app.session.privacy_mode,
                                    &argument,
                                )
                                .await;
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text,
                                });
                            }
                            SlashResult::RunRemoteControl(action) => {
                                let text = match action.trim() {
                                    "off" | "stop" => stop_remote_control(app),
                                    "" | "on" | "start" => start_remote_control(app),
                                    other => {
                                        format!("Usage: /remote-control [on|off], not {other}")
                                    }
                                };
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text,
                                });
                            }
                            SlashResult::RunBtw(question) => {
                                match app.session.side_query(&app.config) {
                                    Ok(query) => {
                                        start_side_query(
                                            &app.config,
                                            query,
                                            question,
                                            app.side_answers.0.clone(),
                                        );
                                        app.status_notice = Some((
                                            "answering the side question".to_string(),
                                            Instant::now(),
                                        ));
                                    }
                                    Err(error) => app.chat_messages.push(ChatMessage {
                                        role: ChatRole::System,
                                        text: format!("/btw {error:#}"),
                                    }),
                                }
                            }
                            SlashResult::RunAgentDraft(request) => {
                                let text =
                                    match crate::agents::DraftSource::from_session(&app.session) {
                                        Ok(source) => {
                                            let config = app.config.clone();
                                            let answers = app.side_answers.0.clone();
                                            tokio::spawn(async move {
                                                let _ = answers
                                                    .send(request.create(&source, &config).await);
                                            });
                                            crate::agents::GENERATING_AGENT_CONFIGURATION
                                                .to_string()
                                        }
                                        Err(refusal) => refusal,
                                    };
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text,
                                });
                            }
                            SlashResult::RunPersonalize(argument) => {
                                let text = match crate::cloud::personalization::run(&argument).await
                                {
                                    Ok(text) | Err(text) => text,
                                };
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text,
                                });
                            }
                            SlashResult::RunAttachUrl(url) => {
                                let text =
                                    match crate::repl::attach_url_context(&url, &mut app.session)
                                        .await
                                    {
                                        Ok(chars) => format!(
                                        "Attached {url} ({chars} characters) to the conversation."
                                    ),
                                        Err(error) => format!("Could not attach {url}: {error:#}"),
                                    };
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text,
                                });
                            }
                            SlashResult::RunMcp(argument) => {
                                let outcome =
                                    crate::repl::mcp_for_display(&argument, &mut app.session).await;
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text: outcome.plain_message(),
                                });
                            }
                            SlashResult::RunWorktree(argument) => {
                                let text = crate::repl::handle_worktree(&argument).await;
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text: sanitize_terminal_text(&text).into_owned(),
                                });
                            }
                            SlashResult::RunTasks(argument) => {
                                let outcome = crate::repl::tasks_for_display(
                                    app.session.subagent_manager.as_ref(),
                                    &argument,
                                )
                                .await;
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text: outcome.plain_message(),
                                });
                            }
                            SlashResult::RunTeam(argument) => {
                                let text = crate::teams::team_command(
                                    app.session.team_manager.as_ref(),
                                    &argument,
                                )
                                .await;
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text,
                                });
                            }
                            SlashResult::RunCompact(focus) => {
                                let focus = (!focus.trim().is_empty()).then_some(focus.as_str());
                                let result = app.session.compact_now(&app.config, focus).await;
                                app.sync_stats();
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text: format!(
                                        "Context compacted: ~{} -> ~{} tokens ({}% of limit).",
                                        result.before.used_tokens,
                                        result.after.used_tokens,
                                        (result.after.used_fraction * 100.0) as u32
                                    ),
                                });
                            }
                            SlashResult::StatusReport(report) => {
                                let connectivity = crate::cloud::client::connectivity_line(
                                    app.session.privacy_mode,
                                )
                                .await;
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text: format!("{report}\n{connectivity}"),
                                });
                            }
                            SlashResult::RunFeedback(kind, message) => {
                                let text = crate::cloud::send_feedback(kind, &message).await;
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text,
                                });
                            }
                            SlashResult::RunLogout => {
                                let text =
                                    match crate::app_server::account::sign_out_of_every_provider()
                                        .await
                                    {
                                        Ok(signed_out) => signed_out.message(),
                                        Err(error) => format!("Could not log out: {error:#}"),
                                    };
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text,
                                });
                            }
                            SlashResult::NotSlash | SlashResult::SendAsPrompt => {
                                let prompt = resolve_composer_mentions(app, &text);
                                let (prompt, notices) =
                                    app.session.expand_mcp_resource_mentions(&prompt).await;
                                for notice in notices {
                                    app.chat_messages.push(ChatMessage {
                                        role: ChatRole::System,
                                        text: notice,
                                    });
                                }
                                send_message_with_prompt(terminal, app, &text, &prompt).await?;
                            }
                            SlashResult::SendPrompt(prompt) => {
                                send_message(terminal, app, &prompt).await?;
                            }
                            SlashResult::SendMcpPrompt(invocation) => {
                                match app.session.expand_mcp_prompt_invocation(&invocation).await {
                                    Ok(Some(prompt)) => {
                                        send_message(terminal, app, &prompt).await?;
                                    }
                                    Ok(None) => app.chat_messages.push(ChatMessage {
                                        role: ChatRole::System,
                                        text: "Unknown MCP prompt command.".to_string(),
                                    }),
                                    Err(e) => app.chat_messages.push(ChatMessage {
                                        role: ChatRole::System,
                                        text: format!("MCP prompt failed: {e:#}"),
                                    }),
                                }
                            }
                            SlashResult::RunAdvisor(question) => {
                                let call = crate::agent::ToolCall {
                                    name: "advisor".to_string(),
                                    args: std::collections::HashMap::from([(
                                        "question".to_string(),
                                        question,
                                    )]),
                                };
                                let opts = crate::tools::ToolExecOptions {
                                    additional_workspace_roots: Vec::new(),
                                    mcp_tool_definitions: None,
                                    require_confirmation: false,
                                    auto_approve_safe: true,
                                    auto_approve_edits: false,
                                    quiet: true,
                                    approval_callback: None,
                                    user_input_callback: None,
                                    privacy_mode: app.session.privacy_mode,
                                    workspace_root: std::env::current_dir().ok(),
                                };
                                let text = match crate::tools::execute_tool_with_opts(&call, &opts)
                                    .await
                                {
                                    Ok(result) if result.success => {
                                        format_advisor_tool_output(&result.output)
                                    }
                                    Ok(result) => format!("Advisor failed: {}", result.output),
                                    Err(e) => format!("Advisor failed: {e:#}"),
                                };
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text,
                                });
                            }
                        }
                    }
                }

                InputAction::ScrollUp => {
                    app.scroll_offset = app.scroll_offset.saturating_add(3);
                }

                InputAction::ScrollDown => {
                    app.scroll_offset = app.scroll_offset.saturating_sub(3);
                }

                // Repaint every cell. This is the escape hatch when anything
                // has written over the frame; it must never be the conversation
                // that gets discarded, which is what `/clear` and the
                // (unbound by default) `clear_chat` action are for.
                InputAction::Redraw => {
                    terminal.clear()?;
                }

                InputAction::ClearChat => {
                    app.discard_conversation();
                    app.status_notice = Some(("context cleared".to_string(), Instant::now()));
                }

                InputAction::None => {}
            }
        }

        if app.is_loading {
            app.spinner_tick = app.spinner_tick.wrapping_add(1);
        }

        if app.should_quit {
            break;
        }

        render(terminal, app)?;
    }

    Ok(())
}

async fn run_stop_hook(app: &TuiApp, reason: QuitReason) {
    crate::hooks::run_hooks(
        app.session.hooks_config(),
        crate::hooks::HookEvent::Stop,
        &crate::hooks::HookInput {
            event: "Stop".to_string(),
            session_id: Some(app.session.runtime_session_id.clone()),
            model: Some(app.session.model.clone()),
            tool_name: None,
            tool_args: None,
            tool_output: None,
            message: Some(reason.label().to_string()),
            tool_execution: None,
        },
    )
    .await;
}

/// Settle every cell the turn left mid-flight. A cancelled turn, or a tool
/// whose completion event never arrived, otherwise leaves a `Running` row whose
/// glyph is the spinner frame, and the spinner only advances while a turn is in
/// flight, so it sits frozen in the transcript for the rest of the session.
fn settle_running_tool_cells(cells: &mut [ToolCell]) {
    use crate::tui::transcript_cell::TranscriptCellState;
    for cell in cells.iter_mut() {
        if matches!(cell.state, TranscriptCellState::Running) {
            cell.state = TranscriptCellState::Cancelled;
        }
    }
}

/// Apply a tool lifecycle event to a tool-cell list: `ToolStarted` adds a
/// running row; `ToolCompleted` updates the matching row in place by `call_id`.
/// Operates on a plain `Vec` (not `TuiApp`) so it can run in the agent-turn
/// `select!` loop without conflicting with the `&mut app.session` borrow the
/// in-flight turn future holds.
fn apply_tool_event(cells: &mut Vec<ToolCell>, ev: crate::tui::app_event::TuiAppEvent) {
    use crate::tui::app_event::{ToolStatus, TuiAppEvent};
    use crate::tui::transcript_cell::TranscriptCellState;
    match ev {
        TuiAppEvent::ToolStarted {
            call_id,
            name,
            summary,
            input,
        } => {
            let accent = if name == "agent" {
                input
                    .get("name")
                    .and_then(|value| value.as_str())
                    .and_then(crate::agents::find_agent_exact)
                    .and_then(|agent| {
                        agent
                            .color_name()
                            .and_then(crate::tui::terminal_palette::ui_agent)
                    })
            } else {
                None
            };
            let edits = crate::diff_model::proposed_edits(&name, &input);
            cells.push(ToolCell {
                call_id,
                name,
                summary,
                state: TranscriptCellState::Running,
                output_preview: None,
                timing: ToolTiming::Running(Instant::now()),
                full_output: None,
                accent,
                exit_code: None,
                stderr: None,
                edits,
            });
        }
        TuiAppEvent::ToolCompleted {
            call_id,
            status,
            output,
            duration_ms,
            ..
        } => {
            if let Some(cell) = cells.iter_mut().find(|c| c.call_id == call_id) {
                cell.state = match status {
                    ToolStatus::Failed => TranscriptCellState::Failed,
                    ToolStatus::Cancelled => TranscriptCellState::Cancelled,
                    _ => TranscriptCellState::Complete,
                };
                let (exit_code, output, stderr) = if tool_type_icon(&cell.name) == "$" {
                    split_command_output(&output)
                } else {
                    (None, output.as_str(), None)
                };
                if cell.state != TranscriptCellState::Complete
                    || crate::diff_model::replaced_by_user_edit(output)
                {
                    cell.edits.clear();
                }
                cell.exit_code = exit_code;
                cell.stderr = stderr
                    .map(|stderr| sanitize_terminal_text(stderr.trim_end()).into_owned())
                    .filter(|stderr| !stderr.is_empty());
                cell.output_preview = compact_tool_output_preview(output);
                cell.timing = ToolTiming::Finished(duration_ms);
                cell.full_output = Some(sanitize_terminal_text(output.trim_end()).into_owned())
                    .filter(|output| !output.is_empty());
            }
        }
        _ => {}
    }
}

fn split_command_output(output: &str) -> (Option<i32>, &str, Option<&str>) {
    let (exit_code, rest) = match output.split_once('\n') {
        Some((first, rest)) => match first
            .strip_prefix("Exit code: ")
            .and_then(|code| code.trim().parse().ok())
        {
            Some(code) => (Some(code), rest),
            None => (None, output),
        },
        None => (None, output),
    };
    if let Some(stderr) = rest.strip_prefix("[stderr]\n") {
        return (exit_code, "", Some(stderr));
    }
    match rest.split_once("\n[stderr]\n") {
        Some((stdout, stderr)) => (exit_code, stdout, Some(stderr)),
        None => (exit_code, rest, None),
    }
}

fn compact_tool_output_preview(output: &str) -> Option<String> {
    let line = output
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())?;
    const MAX_COLS: usize = 96;
    // Strip before truncating: `truncate_cols` measures display width, which
    // would both mis-count an escape and cut one in half.
    Some(truncate_cols(
        sanitize_terminal_text(line).as_ref(),
        MAX_COLS,
    ))
}

async fn send_message(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    app: &mut TuiApp,
    user_text: &str,
) -> Result<()> {
    send_message_with_prompt(terminal, app, user_text, user_text).await
}

/// Send a turn whose transcript line and model prompt differ.
///
/// `@file` mentions are the reason the two are separate: the transcript keeps
/// the `@path` the user typed, and the model receives it with the file's
/// contents spliced in ahead of the message, the same `<file path="…">` block
/// `--file` produces.
async fn send_message_with_prompt(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    app: &mut TuiApp,
    transcript_text: &str,
    user_text: &str,
) -> Result<()> {
    let hooks_cfg = app.session.hooks_config().clone();
    crate::hooks::run_hooks(
        &hooks_cfg,
        crate::hooks::HookEvent::UserPromptSubmit,
        &crate::hooks::HookInput {
            event: "UserPromptSubmit".to_string(),
            session_id: Some(app.session.runtime_session_id.clone()),
            model: Some(app.session.model.clone()),
            tool_name: None,
            tool_args: None,
            tool_output: None,
            message: Some(user_text.to_string()),
            tool_execution: None,
        },
    )
    .await;

    match app.session.reload_if_changed_on_disk() {
        Ok(true) => {
            rebuild_transcript_from_session(app);
            app.chat_messages.push(ChatMessage {
                role: ChatRole::System,
                text: "This conversation continued in another app, so it now shows the saved version and your message continues from there.".to_string(),
            });
        }
        Ok(false) => {}
        Err(error) => app.chat_messages.push(ChatMessage {
            role: ChatRole::System,
            text: format!(
                "This conversation changed in another app and could not be reloaded: {}",
                sanitize_terminal_text(&format!("{error:#}"))
            ),
        }),
    }
    let context: Vec<String> = std::mem::take(&mut app.turn_context)
        .into_iter()
        .chain(app.staged_images.iter().cloned())
        .collect();
    app.chat_messages.push(ChatMessage {
        role: ChatRole::User,
        text: transcript_text.to_string(),
    });
    if !context.is_empty() {
        app.chat_messages.push(ChatMessage {
            role: ChatRole::Detail,
            text: format!("with {}", context.join(" · ")),
        });
    }

    // The session drains `pending_image_blocks` into this turn, so the chips
    // that named them go with it.
    app.staged_images.clear();

    app.is_loading = true;
    app.scroll_offset = 0;
    app.stream_buffer.clear();
    app.tool_cells.clear();
    app.stream_start = Some(Instant::now());
    render(terminal, app)?;

    let response_buf = Arc::new(Mutex::new(String::new()));
    let buf_for_callback = Arc::clone(&response_buf);
    let buf_for_display = Arc::clone(&response_buf);

    // One reply, one buffer. The agentic loop streams every completion after a
    // tool call through its own sink, which otherwise falls back to `print!`
    // and writes past ratatui, so the model's answer landed on the frame's
    // borders instead of in the transcript.
    {
        let buf = Arc::clone(&response_buf);
        let sink: Arc<dyn Fn(&str) + Send + Sync> = Arc::new(move |chunk: &str| {
            if let Ok(mut buf) = buf.lock() {
                append_continuation_chunk(&mut buf, sanitize_terminal_text(chunk).as_ref());
            }
        });
        app.session.on_continuation_chunk = Some(crate::agent::ContinuationSink(sink));
    }

    // Share buffer with the render loop so partial output is visible
    let config_clone = app.config.clone();

    // Install a per-turn TUI approval broker. Tool code reaches it through the
    // approval callback (`broker.request(...).await`); we drain pending
    // requests in the loop below and resolve them with a keyboard-navigable
    // overlay instead of `dialoguer` freezing the alternate screen. A fresh
    // broker per turn means "Deny All" and queue state reset cleanly each send.
    let broker = crate::tui::approval_broker::ApprovalBroker::new();
    {
        let cb_broker = broker.clone();
        let callback: crate::tools::ApprovalCallback = Arc::new(move |req| {
            let broker = cb_broker.clone();
            Box::pin(async move { broker.request(req).await })
        });
        app.session.on_tool_approval = Some(crate::agent::ToolApprovalSink(callback));
    }
    let remote_host = app.remote.as_ref().map(|link| Arc::clone(&link.host));
    if let Some(host) = &remote_host {
        host.begin_turn(broker.clone());
    }

    // Tool lifecycle events are drained in the select! loop below into a local
    // Vec, never `app`, so they cannot conflict with the `&mut app.session`
    // borrow the turn future holds; the live frame draws from that Vec.
    let (tool_tx, mut tool_rx) =
        tokio::sync::mpsc::unbounded_channel::<crate::tui::app_event::TuiAppEvent>();
    {
        let tx = tool_tx.clone();
        let sink: std::sync::Arc<dyn Fn(crate::tui::app_event::TuiAppEvent) + Send + Sync> =
            std::sync::Arc::new(move |ev| {
                let _ = tx.send(ev);
            });
        app.session.on_tool_event = Some(crate::agent::ToolEventSink(sink));
    }
    let mut tool_cells: Vec<ToolCell> = Vec::new();
    let mut preparing = true;

    // Drive the agent turn while staying responsive to approval requests. The
    // event loop is otherwise parked inside this `.await`, so without the
    // `select!` the broker's oneshot would deadlock (the worker waits for a
    // decision the frozen UI can never deliver). `biased` polls the turn future
    // first; a pending approval can only exist while the turn is still in
    // flight, so this never strands a queued request.
    // Thread the current effort level's thinking budget into the session before
    // every send. Only Anthropic respects this field; other providers ignore it.
    // Low/Medium → None (standard inference), High/Max → Some(N tokens).
    app.session.thinking_budget_tokens = app.effort.thinking_budget_for_anthropic();
    app.session.effort = Some(app.effort);

    // Snapshot the session-derived display bits before the send future takes a
    // `&mut app.session` borrow. These don't change during a turn (provider is
    // fixed; token totals only settle once it ends), so the live frame can reuse
    // them while the rest of `FrameCtx` is built from disjoint `app` fields.
    let turn_access_mode = provider_access_mode(&app.session.provider);
    let turn_privacy_mode = app.session.privacy_mode;
    let turn_effort_label = app.visible_effort_label();
    let turn_count = app.session.turn_count;
    let turn_input_tokens = app.session.total_input_tokens;
    let turn_output_tokens = app.session.total_output_tokens;
    let turn_context = app.context_snapshot();
    let turn_context_percent = turn_context.percent;
    let turn_started = Instant::now();
    let turn_cost_str = crate::output::format_session_credits(app.session.cost_ledger.total_usd);
    let turn_notice = app.live_notice().map(str::to_string);
    let side_query = app
        .session
        .side_query(&app.config)
        .map_err(|error| format!("{error:#}"));

    let result = {
        let callback = Box::new(move |chunk: &str| {
            if let Ok(mut buf) = buf_for_callback.lock() {
                // Sanitize per chunk so a sequence split across two chunks
                // cannot reassemble in the buffer that feeds the live frame,
                // the finalized transcript message, and cancelled-turn replay.
                buf.push_str(sanitize_terminal_text(chunk).as_ref());
            }
        });

        let send_fut = app.session.send(&config_clone, user_text, callback);
        tokio::pin!(send_fut);

        loop {
            tokio::select! {
                biased;
                outcome = &mut send_fut => break Some(outcome),
                _ = broker.notified() => {
                    while let Some(req) = broker.drain_pending().await {
                        // Same disjoint-field construction as the live-frame
                        // `FrameCtx` below: `app.session` is already
                        // mutably borrowed by `send_fut`, so this must stay
                        // field-by-field rather than `FrameCtx::from_app(app)`.
                        let approval_ctx = FrameCtx {
                            workspace_pane: app.workspace_pane.as_deref(),
                            model_name: &app.model_name,
                            statusline: &app.statusline_config,
                            provider_name: &app.provider_name,
                            git_branch: app.git_branch.as_deref(),
                            context_window: model_context_window(&app.model_name),
                            working_path: crate::onboarding::current_working_path(),
                            total_input_tokens: turn_input_tokens,
                            total_output_tokens: turn_output_tokens,
                            turn_count,
                            context: turn_context,
                            chrome: FrameChrome::new(&app.browser, &app.start_panel, false),
                            chat_messages: &app.chat_messages,
                            tool_cells: &tool_cells,
                            is_loading: app.is_loading,
                            stream_start: app.stream_start,
                            stream_buffer: &app.stream_buffer,
                            spinner_char: spinner_frame(app.spinner_tick),
                            loading_verb: LOADING_VERB,
                            awaiting_approval: true,
                            scroll_offset: app.scroll_offset,
                            access_mode: turn_access_mode,
                            privacy_mode: turn_privacy_mode,
                            mode: app.mode,
                            effort_label: turn_effort_label,
                            cost_str: turn_cost_str.clone(),
                            notice: turn_notice.as_deref(),
                            quit_key: app
                                .keybindings
                                .display(crate::keybindings::KeybindingAction::Quit),
                        };
                        if let crate::tui::approval_broker::ApprovalRequestKind::Question {
                            question,
                            options,
                        } = &req.kind
                        {
                            let answer =
                                run_tui_question_modal(terminal, &approval_ctx, question, options)?;
                            terminal.clear()?;
                            let decision = if answer.is_some() {
                                crate::tui::approval_broker::ApprovalDecision::AllowOnce
                            } else {
                                crate::tui::approval_broker::ApprovalDecision::Cancel
                            };
                            broker.complete_with_note(req.id, decision, answer).await;
                            continue;
                        }
                        if let Some(host) = &remote_host {
                            host.approval_requested(&req);
                        }
                        let answered_remotely = || {
                            remote_host
                                .as_ref()
                                .and_then(|host| host.answered_remotely(req.id))
                        };
                        let modal = run_tui_approval_modal(
                            terminal,
                            &approval_ctx,
                            &req,
                            &|| answered_remotely().is_some(),
                        )?;
                        if let Some(host) = &remote_host {
                            host.approval_settled(req.id);
                        }
                        if let Some(allowed) = answered_remotely() {
                            terminal.clear()?;
                            app.chat_messages.push(ChatMessage {
                                role: ChatRole::System,
                                text: format!(
                                    "{} on your phone: {}",
                                    if allowed { "Allowed" } else { "Denied" },
                                    sanitize_terminal_text(&req.summary)
                                ),
                            });
                            continue;
                        }
                        let Some((choice, note)) = modal
                        else {
                            terminal.clear()?;
                            broker
                                .complete(req.id, crate::tui::approval_broker::ApprovalDecision::Timeout)
                                .await;
                            app.chat_messages.push(ChatMessage {
                                role: ChatRole::System,
                                text: format!(
                                    "The approval for {} expired after {} minutes without an answer, so it did not run.",
                                    sanitize_terminal_text(&req.summary),
                                    APPROVAL_EXPIRY.as_secs() / 60
                                ),
                            });
                            continue;
                        };
                        // The modal ran its own key loop over frames ratatui
                        // drew; force the next frame to repaint every cell so
                        // nothing the prompt covered survives it.
                        terminal.clear()?;
                        broker
                            .complete_with_note(req.id, approval_choice_to_decision(choice), note)
                            .await;
                        match choice {
                            crate::tui::widgets::approval_overlay::ApprovalChoice::DenyAll => {
                                broker.deny_all_remaining().await;
                            }
                            crate::tui::widgets::approval_overlay::ApprovalChoice::AllowAll => {
                                broker.allow_all_remaining().await;
                            }
                            _ => {}
                        }
                    }
                }
                Some(ev) = tool_rx.recv() => {
                    if ev == crate::tui::app_event::TuiAppEvent::ModelRequested {
                        preparing = false;
                    }
                    if let Some(host) = &remote_host {
                        host.tool_event(&ev);
                    }
                    apply_tool_event(&mut tool_cells, ev);
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(80)) => {
                    // The UI is parked during a turn (the send future holds a &mut
                    // borrow of the session), so this tick is the only place we can
                    // honor a cancel keystroke. Poll non-blockingly; Esc or Ctrl-C
                    // aborts by breaking out, which drops `send_fut` and cancels the
                    // in-flight stream.
                    let mut cancelled = false;
                    while !cancelled && crossterm::event::poll(std::time::Duration::ZERO)? {
                        match crossterm::event::read()? {
                            crossterm::event::Event::Key(key) => {
                                cancelled = key.code == crossterm::event::KeyCode::Esc
                                    || (key.code == crossterm::event::KeyCode::Char('c')
                                        && key
                                            .modifiers
                                            .contains(crossterm::event::KeyModifiers::CONTROL));
                                if cancelled {
                                    break;
                                }
                                if key.code == crossterm::event::KeyCode::Char('o')
                                    && key
                                        .modifiers
                                        .contains(crossterm::event::KeyModifiers::CONTROL)
                                {
                                    EXPAND_TOOL_OUTPUT
                                        .fetch_xor(true, std::sync::atomic::Ordering::Relaxed);
                                    continue;
                                }
                                let Some(draft) = edit_turn_draft(&mut app.input, &mut app.cursor, key) else {
                                    continue;
                                };
                                match draft.strip_prefix("/btw ").map(str::trim) {
                                    Some(question) if !question.is_empty() => match &side_query {
                                        Ok(query) => start_side_query(
                                            &config_clone,
                                            query.clone(),
                                            question.to_string(),
                                            app.side_answers.0.clone(),
                                        ),
                                        Err(reason) => app.chat_messages.push(ChatMessage {
                                            role: ChatRole::System,
                                            text: format!("/btw {reason}"),
                                        }),
                                    },
                                    _ => app.queued_prompts.push(draft),
                                }
                            }
                            crossterm::event::Event::Paste(text) => insert_str_at_cursor(
                                &mut app.input,
                                &mut app.cursor,
                                sanitize_terminal_text(&text).as_ref(),
                            ),
                            _ => {}
                        }
                    }
                    if let Some(link) = app.remote.as_mut() {
                        while let Ok(input) = link.inbox.try_recv() {
                            match input {
                                crate::tui::remote_host::RemoteInput::Interrupt => cancelled = true,
                                crate::tui::remote_host::RemoteInput::Message(text) => {
                                    app.remote_prompts.push(text)
                                }
                            }
                        }
                    }
                    if cancelled {
                        app.status_notice =
                            Some(("stopping the turn…".to_string(), Instant::now()));
                        break None;
                    }
                    while let Ok(text) = app.side_answers.1.try_recv() {
                        app.chat_messages.push(ChatMessage {
                            role: ChatRole::System,
                            text,
                        });
                    }

                    // Live redraw. Pull the latest streamed text into a disjoint
                    // `app` field, advance the spinner, mirror tool cells, then
                    // draw a frame built entirely from fields *other* than
                    // `app.session` (still borrowed by `send_fut`).
                    if let Ok(b) = buf_for_display.lock() {
                        app.stream_buffer = b.clone();
                    }
                    if let Some(host) = &remote_host {
                        host.output(&app.stream_buffer);
                    }
                    app.spinner_tick = app.spinner_tick.wrapping_add(1);
                    let ctx = FrameCtx {
                        workspace_pane: app.workspace_pane.as_deref(),
                        model_name: &app.model_name,
                        statusline: &app.statusline_config,
                        provider_name: &app.provider_name,
                        git_branch: app.git_branch.as_deref(),
                        context_window: model_context_window(&app.model_name),
                        working_path: crate::onboarding::current_working_path(),
                        total_input_tokens: turn_input_tokens,
                        total_output_tokens: turn_output_tokens,
                        turn_count,
                        context: turn_context,
                        chrome: FrameChrome::new(&app.browser, &app.start_panel, false),
                        chat_messages: &app.chat_messages,
                        tool_cells: &tool_cells,
                        is_loading: app.is_loading,
                        stream_start: app.stream_start,
                        stream_buffer: &app.stream_buffer,
                        spinner_char: spinner_frame(app.spinner_tick),
                        loading_verb: if preparing {
                            "Preparing context"
                        } else {
                            LOADING_VERB
                        },
                        awaiting_approval: false,
                        scroll_offset: app.scroll_offset,
                        access_mode: turn_access_mode,
                        privacy_mode: turn_privacy_mode,
                        mode: app.mode,
                        effort_label: turn_effort_label,
                        cost_str: turn_cost_str.clone(),
                        notice: turn_notice.as_deref(),
                        quit_key: app
                            .keybindings
                            .display(crate::keybindings::KeybindingAction::Quit),
                    };
                    render_turn_frame(terminal, &ctx, &app.input, app.queued_prompts.len())?;

                    // MCP servers may also elicit input MID-turn: the engine's
                    // read-loop parks awaiting the response, so the queue must
                    // be driven here too (the idle-loop drain at the top of
                    // `run_event_loop` only runs between turns). Mirrors the approval
                    // arm above; uses the same disjoint-field `ctx`.
                    let elicitation_handler = Arc::clone(&app.mcp_elicitation_handler);
                    while let Some(pending) = elicitation_handler.drain_pending().await {
                        let request_id = pending.id;
                        let response = run_turn_mcp_elicitation_modal(terminal, &ctx, pending)?;
                        elicitation_handler.complete(request_id, response).await;
                    }
                }
            }
        }
    };

    // Tear down the per-turn approval wiring so a later turn can never reference
    // a broker whose drain loop has ended. Any straggling request (none expected
    // once the turn future resolved) is cancelled defensively.
    app.session.on_tool_approval = None;
    broker.cancel_all().await;

    // Drain any tool events still buffered in the channel, then surface the
    // collected cells in the transcript and tear down the per-turn sink.
    while let Ok(ev) = tool_rx.try_recv() {
        apply_tool_event(&mut tool_cells, ev);
    }
    app.session.on_tool_event = None;
    app.session.on_continuation_chunk = None;
    settle_running_tool_cells(&mut tool_cells);
    let mut changed_files: Vec<String> = tool_cells
        .iter()
        .filter(|cell| {
            cell.state == crate::tui::transcript_cell::TranscriptCellState::Complete
                && matches!(
                    cell.name.as_str(),
                    "write_file" | "edit_file" | "multiedit" | "apply_patch" | "notebook_edit"
                )
                && !cell.summary.trim().is_empty()
        })
        .map(|cell| cell.summary.clone())
        .collect();
    changed_files.dedup();
    app.tool_cells = tool_cells;

    // Copy final streamed content into stream_buffer for last render
    if let Ok(buf) = buf_for_display.lock() {
        app.stream_buffer = buf.clone();
    }

    app.is_loading = false;
    app.stream_start = None;

    if let Some(host) = &remote_host {
        host.output(&app.stream_buffer);
        match &result {
            Some(Ok(turn)) => host.end_turn(
                agiworkforce_protocol::developer_session::TurnStatus::Completed,
                if app.stream_buffer.is_empty() {
                    &turn.response
                } else {
                    &app.stream_buffer
                },
            ),
            Some(Err(error)) => host.end_turn(
                agiworkforce_protocol::developer_session::TurnStatus::Failed,
                &format!("{error:#}"),
            ),
            None => host.end_turn(
                agiworkforce_protocol::developer_session::TurnStatus::Interrupted,
                &app.stream_buffer,
            ),
        }
    }

    match result {
        Some(Ok(turn)) => {
            let response_text = if app.stream_buffer.is_empty() {
                turn.response.clone()
            } else {
                app.stream_buffer.clone()
            };

            app.chat_messages.push(ChatMessage {
                role: ChatRole::Assistant,
                text: response_text,
            });
            app.chat_messages.push(ChatMessage {
                role: ChatRole::Detail,
                text: answer_details(&app.session.model, &turn, turn_started.elapsed()),
            });

            app.sync_stats();

            if !changed_files.is_empty() {
                app.chat_messages.push(ChatMessage {
                    role: ChatRole::System,
                    text: format!(
                        "Files changed this turn: {}. /diff shows what changed.",
                        changed_files.join(", ")
                    ),
                });
            }

            if let Some(footer) = crate::sources::render_footer(&turn.sources) {
                app.chat_messages.push(ChatMessage {
                    role: ChatRole::System,
                    text: footer,
                });
            }

            if app.config.ui.bell_on_finish == Some(true)
                && turn_started.elapsed() >= BELL_AFTER_TURN_OF
            {
                use std::io::Write;
                let mut stdout = std::io::stdout();
                let _ = stdout.write_all(b"\x07");
                let _ = stdout.flush();
            }

            let context_percent = app.context_percent();
            if context_percent >= CONTEXT_WARNING_PERCENT
                && turn_context_percent < CONTEXT_WARNING_PERCENT
            {
                app.chat_messages.push(ChatMessage {
                    role: ChatRole::System,
                    text: format!(
                        "Context is {context_percent}% full. /compact summarizes earlier turns to make room before the window runs out."
                    ),
                });
            }

            if !turn.managed_request_ids.is_empty() {
                let request_ids = turn.managed_request_ids.clone();
                tokio::spawn(async move {
                    if let Some(billed) = crate::usage_summary::billed_turn(&request_ids).await {
                        crate::tui::push_tui_notice(format!(
                            "This turn: {}",
                            crate::usage_summary::render_billed_turn(&billed)
                        ));
                    }
                });
            }
        }
        Some(Err(e)) => {
            app.chat_messages.push(ChatMessage {
                role: ChatRole::Error,
                text: crate::errors::terminal_text(&e),
            });
        }
        None => {
            // Cancelled mid-stream (Esc / Ctrl-C). Keep whatever streamed so far
            // and reconcile session history so the next turn stays a valid
            // user→assistant sequence.
            let partial = app.stream_buffer.clone();
            render(terminal, app)?;
            app.session.cancel_turn(&partial).await;
            crate::cloud::product_analytics::record(
                &app.config,
                app.session.privacy_mode,
                "generation_stopped",
            );
            app.status_notice = Some(("stopped the turn".to_string(), Instant::now()));
            if !partial.is_empty() {
                app.chat_messages.push(ChatMessage {
                    role: ChatRole::Assistant,
                    text: partial,
                });
            }
            app.chat_messages.push(ChatMessage {
                role: ChatRole::System,
                text: "⊘ Stopped".to_string(),
            });
            app.sync_stats();
        }
    }

    app.refresh_workspace_pane();
    app.scroll_offset = 0;
    render(terminal, app)?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::command_registry::builtin_slash_registry_commands;
    use crate::tui::widgets::interactive::{InteractiveView, KeyAction, ViewAction};

    fn quiet_chrome() -> FrameChrome<'static> {
        FrameChrome {
            browser: crate::browser_bridge::BrowserAvailability::ShellNotRunning,
            plan: None,
            recent: None,
            whats_new: None,
        }
    }

    // Minimal stub view that tracks how many times handle_key was called.
    struct StubView {
        call_count: usize,
        close_on_enter: bool,
        last_key: Option<KeyAction>,
    }

    impl StubView {
        fn new(close_on_enter: bool) -> Self {
            Self {
                call_count: 0,
                close_on_enter,
                last_key: None,
            }
        }
    }

    impl InteractiveView for StubView {
        fn render(&self) -> String {
            format!("stub calls={}", self.call_count)
        }

        fn handle_key(&mut self, key: KeyAction) -> ViewAction {
            self.call_count += 1;
            self.last_key = Some(key);
            if self.close_on_enter && key == KeyAction::Enter {
                ViewAction::Submit(0)
            } else if key == KeyAction::Esc {
                ViewAction::Close
            } else {
                ViewAction::Continue
            }
        }
    }

    /// Regression: a post-tool-call continuation landed on the same line as
    /// the pre-tool sentence with no separator at all
    /// ("I'll read the file.First line:").
    #[test]
    fn continuation_chunk_starts_a_new_paragraph() {
        let mut buf = "I'll read the file.".to_string();
        append_continuation_chunk(&mut buf, "First line:");
        assert_eq!(buf, "I'll read the file.\n\nFirst line:");
    }

    #[test]
    fn continuation_chunk_skips_the_blank_line_when_already_whitespace() {
        let mut buf = "Reading the file.\n".to_string();
        append_continuation_chunk(&mut buf, "Done.");
        assert_eq!(buf, "Reading the file.\nDone.");

        let mut buf = "Reading the file. ".to_string();
        append_continuation_chunk(&mut buf, "Done.");
        assert_eq!(buf, "Reading the file. Done.");
    }

    #[test]
    fn continuation_chunk_into_an_empty_buffer_adds_no_leading_blank_line() {
        let mut buf = String::new();
        append_continuation_chunk(&mut buf, "First line:");
        assert_eq!(buf, "First line:");
    }

    struct SlashActionView;

    impl InteractiveView for SlashActionView {
        fn render(&self) -> String {
            "slash action".to_string()
        }

        fn handle_key(&mut self, key: KeyAction) -> ViewAction {
            match key {
                KeyAction::Enter => ViewAction::SideAction("slash:plan".to_string()),
                _ => ViewAction::Continue,
            }
        }
    }

    fn make_key(code: crossterm::event::KeyCode) -> crossterm::event::KeyEvent {
        crossterm::event::KeyEvent::new(code, crossterm::event::KeyModifiers::NONE)
    }

    #[test]
    fn tool_cell_renders_per_type_icon_state_glyph_and_command_band() {
        use crate::tui::transcript_cell::TranscriptCellState;
        let line0 = |cell: &ToolCell| -> String {
            tool_cell_lines(cell, "⠋")[0]
                .spans
                .iter()
                .map(|s| s.content.as_ref())
                .collect()
        };

        // Edit + complete → ✔ state glyph and ± type icon.
        let edit = ToolCell {
            call_id: "1".into(),
            name: "edit_file".into(),
            summary: "src/main.rs".into(),
            state: TranscriptCellState::Complete,
            output_preview: None,
            timing: ToolTiming::default(),
            full_output: None,
            accent: None,
            exit_code: None,
            stderr: None,
            edits: Vec::new(),
        };
        let t = line0(&edit);
        assert!(
            t.contains('✔') && t.contains('±') && t.contains("edit_file"),
            "got: {t}"
        );

        // Shell tool → $ icon AND a `$ <command>` band.
        let cmd = ToolCell {
            call_id: "2".into(),
            name: "bash".into(),
            summary: "ls -la".into(),
            state: TranscriptCellState::Running,
            output_preview: None,
            timing: ToolTiming::default(),
            full_output: None,
            accent: None,
            exit_code: None,
            stderr: None,
            edits: Vec::new(),
        };
        assert!(
            line0(&cmd).contains("$ ls -la"),
            "command band missing: {}",
            line0(&cmd)
        );

        // Failed read → ✗ state glyph and ▤ read icon.
        let fail = ToolCell {
            call_id: "3".into(),
            name: "read_file".into(),
            summary: String::new(),
            state: TranscriptCellState::Failed,
            output_preview: None,
            timing: ToolTiming::default(),
            full_output: None,
            accent: None,
            exit_code: None,
            stderr: None,
            edits: Vec::new(),
        };
        let f = line0(&fail);
        assert!(f.contains('✗') && f.contains('▤'), "got: {f}");
    }

    #[test]
    fn accented_input_insert_and_delete_stay_on_byte_boundaries() {
        let mut input = String::new();
        let mut cursor = 0;

        insert_char_at_cursor(&mut input, &mut cursor, 'é');
        assert_eq!(input, "é");
        assert_eq!(cursor, "é".len());
        assert!(input.is_char_boundary(cursor));

        insert_char_at_cursor(&mut input, &mut cursor, 'x');
        assert_eq!(input, "éx");
        assert_eq!(cursor, input.len());
        assert!(input.is_char_boundary(cursor));

        cursor = previous_char_boundary(&input, cursor);
        delete_at_cursor(&mut input, &mut cursor);
        assert_eq!(input, "é");
        assert_eq!(cursor, "é".len());
        assert!(input.is_char_boundary(cursor));

        backspace_at_cursor(&mut input, &mut cursor);
        assert_eq!(input, "");
        assert_eq!(cursor, 0);
    }

    #[test]
    fn cjk_cursor_movement_uses_valid_byte_boundaries() {
        let input = "a界b".to_string();
        let mut cursor = input.len();

        cursor = previous_char_boundary(&input, cursor);
        assert_eq!(cursor, "a界".len());
        assert!(input.is_char_boundary(cursor));

        cursor = previous_char_boundary(&input, cursor);
        assert_eq!(cursor, "a".len());
        assert!(input.is_char_boundary(cursor));

        cursor = next_char_boundary(&input, cursor);
        assert_eq!(cursor, "a界".len());
        assert!(input.is_char_boundary(cursor));
    }

    #[test]
    fn emoji_input_insert_backspace_and_delete_stay_on_byte_boundaries() {
        let mut input = String::new();
        let mut cursor = 0;

        insert_char_at_cursor(&mut input, &mut cursor, '🙂');
        assert_eq!(input, "🙂");
        assert_eq!(cursor, "🙂".len());
        assert!(input.is_char_boundary(cursor));

        insert_char_at_cursor(&mut input, &mut cursor, '!');
        assert_eq!(input, "🙂!");

        cursor = previous_char_boundary(&input, cursor);
        backspace_at_cursor(&mut input, &mut cursor);
        assert_eq!(input, "!");
        assert_eq!(cursor, 0);

        delete_at_cursor(&mut input, &mut cursor);
        assert_eq!(input, "");
        assert_eq!(cursor, 0);
    }

    #[test]
    fn mixed_ascii_unicode_cursor_and_display_width_are_character_aware() {
        let input = "abé界🙂z";

        assert_eq!(previous_char_boundary(input, input.len()), "abé界🙂".len());
        assert_eq!(next_char_boundary(input, "abé".len()), "abé界".len());
        assert_eq!(floor_char_boundary(input, "abé".len() - 1), "ab".len());

        assert_eq!(input_prefix_display_width(input, "ab".len()), 2);
        assert_eq!(input_prefix_display_width(input, "abé".len()), 3);
        assert_eq!(input_prefix_display_width(input, "abé界".len()), 5);
        assert_eq!(input_prefix_display_width(input, "abé界🙂".len()), 7);
    }

    #[test]
    fn approval_choice_maps_to_expected_decision() {
        use crate::tui::approval_broker::ApprovalDecision;
        use crate::tui::widgets::approval_overlay::ApprovalChoice;

        assert_eq!(
            approval_choice_to_decision(ApprovalChoice::Yes),
            ApprovalDecision::AllowOnce
        );
        assert_eq!(
            approval_choice_to_decision(ApprovalChoice::AlwaysAllow),
            ApprovalDecision::AlwaysAllow
        );
        assert_eq!(
            approval_choice_to_decision(ApprovalChoice::AllowSession),
            ApprovalDecision::AllowSession
        );
        assert_eq!(
            approval_choice_to_decision(ApprovalChoice::No),
            ApprovalDecision::Deny
        );
        assert_eq!(
            approval_choice_to_decision(ApprovalChoice::DenyAll),
            ApprovalDecision::Cancel
        );

        // Allowing decisions let the tool run; denials must not.
        assert!(approval_choice_to_decision(ApprovalChoice::Yes).is_allowing());
        assert!(approval_choice_to_decision(ApprovalChoice::AllowSession).is_allowing());
        assert!(approval_choice_to_decision(ApprovalChoice::AlwaysAllow).is_allowing());
        assert!(!approval_choice_to_decision(ApprovalChoice::No).is_allowing());
        assert!(!approval_choice_to_decision(ApprovalChoice::DenyAll).is_allowing());
    }

    #[test]
    fn auto_mode_is_entered_only_by_the_bare_phrase() {
        for phrase in ["auto mode", "/auto-mode", "  Auto Mode  "] {
            assert_eq!(
                detect_mode_intent(phrase),
                Some(InteractionMode::AcceptEdits),
                "{phrase}"
            );
        }
        for prose in ["should we use auto mode here?", "/auto-mode-setup"] {
            assert_ne!(
                detect_mode_intent(prose),
                Some(InteractionMode::AcceptEdits),
                "{prose}"
            );
        }
    }

    #[test]
    fn auto_description_matches_the_classifier_gated_approval_behavior() {
        assert_eq!(InteractionMode::AcceptEdits.label(), "Auto");
        assert_eq!(
            InteractionMode::AcceptEdits.permission_mode().name(),
            "acceptEdits"
        );
        assert_eq!(
            mode_description(InteractionMode::AcceptEdits),
            "Auto, file edits, read-only tools and commands the safety classifier clears run; everything else asks. /auto-mode-setup reviews this repository."
        );
    }

    #[test]
    fn provider_access_mode_classifies_trust_boundary() {
        use crate::design_system::AccessMode;
        use crate::models::{OllamaMode, Provider};

        // Local: on-device Ollama + keyless OpenAI-compatible (LM Studio).
        assert_eq!(
            provider_access_mode(&Provider::Ollama(OllamaMode::Local)),
            AccessMode::Local
        );
        assert_eq!(
            provider_access_mode(&crate::models::lmstudio_provider()),
            AccessMode::Local
        );

        // BYOK: keyed cloud providers + Ollama Cloud (hosted, needs a key, so
        // data leaves the device, must NOT read as Local).
        assert_eq!(provider_access_mode(&Provider::Anthropic), AccessMode::Byok);
        assert_eq!(
            provider_access_mode(&crate::models::openai_provider()),
            AccessMode::Byok
        );
        assert_eq!(
            provider_access_mode(&Provider::Ollama(OllamaMode::Cloud)),
            AccessMode::Byok
        );

        // Cloud: the AGI-managed endpoint.
        assert_eq!(
            provider_access_mode(&Provider::OpenAICompatible {
                name: "agi-cloud",
                base_url: "https://api.agiworkforce.com/v1/chat/completions",
                api_key_env: Some("AGI_API_KEY"),
            }),
            AccessMode::Cloud
        );
    }

    #[test]
    fn tool_events_build_and_update_cells() {
        use crate::tui::app_event::{ToolStatus, TuiAppEvent};
        use crate::tui::transcript_cell::TranscriptCellState;

        let mut cells: Vec<ToolCell> = Vec::new();
        apply_tool_event(
            &mut cells,
            TuiAppEvent::ToolStarted {
                call_id: "1".into(),
                name: "read_file".into(),
                summary: "a.rs".into(),
                input: serde_json::json!({ "path": "a.rs" }),
            },
        );
        apply_tool_event(
            &mut cells,
            TuiAppEvent::ToolStarted {
                call_id: "2".into(),
                name: "run_command".into(),
                summary: "ls".into(),
                input: serde_json::json!({ "command": "ls" }),
            },
        );
        assert_eq!(cells.len(), 2);
        assert!(matches!(cells[0].state, TranscriptCellState::Running));

        // Completion updates the matching cell in place, keyed by call_id.
        apply_tool_event(
            &mut cells,
            TuiAppEvent::ToolCompleted {
                call_id: "1".into(),
                name: "read_file".into(),
                status: ToolStatus::Succeeded,
                output: "ok".into(),
                duration_ms: 10,
            },
        );
        apply_tool_event(
            &mut cells,
            TuiAppEvent::ToolCompleted {
                call_id: "2".into(),
                name: "run_command".into(),
                status: ToolStatus::Failed,
                output: "boom".into(),
                duration_ms: 20,
            },
        );
        let c1 = cells.iter().find(|c| c.call_id == "1").expect("cell 1");
        let c2 = cells.iter().find(|c| c.call_id == "2").expect("cell 2");
        assert!(matches!(c1.state, TranscriptCellState::Complete));
        assert!(matches!(c2.state, TranscriptCellState::Failed));
        assert_eq!(c1.output_preview.as_deref(), Some("ok"));
        assert_eq!(c2.output_preview.as_deref(), Some("boom"));

        // Completion for an unknown call_id is a no-op (no panic, no new cell).
        apply_tool_event(
            &mut cells,
            TuiAppEvent::ToolCompleted {
                call_id: "ghost".into(),
                name: "read_file".into(),
                status: ToolStatus::Succeeded,
                output: String::new(),
                duration_ms: 0,
            },
        );
        assert_eq!(cells.len(), 2);
    }

    /// Regression: a tool whose completion event never arrived kept a `Running`
    /// cell, and `Running` renders the spinner frame while the spinner only
    /// advances during a turn, so a frozen glyph sat in the transcript forever.
    #[test]
    fn a_turn_that_ends_mid_tool_leaves_no_spinning_cell() {
        use crate::tui::app_event::{ToolStatus, TuiAppEvent};
        use crate::tui::transcript_cell::TranscriptCellState;

        let mut cells: Vec<ToolCell> = Vec::new();
        for call_id in ["1", "2"] {
            apply_tool_event(
                &mut cells,
                TuiAppEvent::ToolStarted {
                    call_id: call_id.into(),
                    name: "read_file".into(),
                    summary: "a.rs".into(),
                    input: serde_json::json!({ "path": "a.rs" }),
                },
            );
        }
        apply_tool_event(
            &mut cells,
            TuiAppEvent::ToolCompleted {
                call_id: "1".into(),
                name: "read_file".into(),
                status: ToolStatus::Succeeded,
                output: "ok".into(),
                duration_ms: 10,
            },
        );

        settle_running_tool_cells(&mut cells);

        assert!(matches!(cells[0].state, TranscriptCellState::Complete));
        assert!(
            matches!(cells[1].state, TranscriptCellState::Cancelled),
            "an unfinished tool must settle instead of spinning forever"
        );
        let rendered = tool_cell_lines(&cells[1], "⠙")
            .iter()
            .map(|line| line.to_string())
            .collect::<String>();
        assert!(!rendered.contains('⠙'), "got: {rendered}");
    }

    #[test]
    fn compact_tool_output_preview_uses_first_non_empty_line_and_truncates() {
        assert_eq!(
            compact_tool_output_preview("\n\nfirst line\nsecond line").as_deref(),
            Some("first line")
        );
        assert!(compact_tool_output_preview("\n  \n").is_none());

        let long = "x".repeat(120);
        let preview = compact_tool_output_preview(&long).expect("preview");
        assert_eq!(display_width(&preview), 96);
        assert!(preview.ends_with('…'));
    }

    /// End-to-end: a denied decision routed through callback → broker → tool
    /// must produce an observable "denied" tool result and never touch disk,
    /// proving behavior, not just compilation. The whole flow is wrapped in a
    /// timeout so that a future deadlock regression fails fast instead of
    /// hanging the suite (the symptom we want CI to catch).
    #[tokio::test]
    async fn denied_approval_blocks_tool_execution_via_callback() {
        use crate::tui::approval_broker::{ApprovalBroker, ApprovalDecision};

        let (success, exists) = tokio::time::timeout(std::time::Duration::from_secs(5), async {
            let broker = ApprovalBroker::new();
            let cb_broker = broker.clone();
            let callback: crate::tools::ApprovalCallback = std::sync::Arc::new(move |req| {
                let broker = cb_broker.clone();
                Box::pin(async move { broker.request(req).await })
            });

            // Drive the broker from a separate task: deny whatever is requested.
            let drain_broker = broker.clone();
            let drain = tokio::spawn(async move {
                drain_broker.notified().await;
                if let Some(req) = drain_broker.drain_pending().await {
                    drain_broker.complete(req.id, ApprovalDecision::Deny).await;
                }
            });

            // Path inside cwd so `validate_file_path` accepts it and the
            // approval callback is actually reached (mirrors the proven
            // file_ops::write_file_uses_approval_callback test).
            let tmp = tempfile::tempdir_in(".").expect("tempdir");
            let target = tmp.path().join("denied.txt");

            let call = crate::agent::ToolCall {
                name: "write_file".to_string(),
                args: std::collections::HashMap::from([
                    ("path".to_string(), target.display().to_string()),
                    ("content".to_string(), "should not be written".to_string()),
                ]),
            };
            let opts = crate::tools::ToolExecOptions {
                additional_workspace_roots: Vec::new(),
                mcp_tool_definitions: None,
                require_confirmation: true,
                auto_approve_safe: false,
                auto_approve_edits: false,
                quiet: true,
                approval_callback: Some(callback),
                user_input_callback: None,
                privacy_mode: crate::agent::PrivacyMode::Local,
                workspace_root: std::env::current_dir().ok(),
            };

            let result = crate::tools::execute_tool_with_opts(&call, &opts)
                .await
                .expect("tool executes");
            drain.await.expect("drain task");

            (result.success, target.exists())
        })
        .await
        .expect("approval flow must not deadlock");

        assert!(!success, "denied write must report failure");
        assert!(!exists, "denied write must not create the file on disk");
    }

    /// Positive counterpart: an AllowOnce decision routed through
    /// callback → broker → tool must let the write reach disk. Proves the
    /// allow path is wired, not just the deny path.
    #[tokio::test]
    async fn allowed_approval_runs_tool_via_callback() {
        use crate::tui::approval_broker::{ApprovalBroker, ApprovalDecision};

        let (success, contents) = tokio::time::timeout(std::time::Duration::from_secs(5), async {
            let broker = ApprovalBroker::new();
            let cb_broker = broker.clone();
            let callback: crate::tools::ApprovalCallback = std::sync::Arc::new(move |req| {
                let broker = cb_broker.clone();
                Box::pin(async move { broker.request(req).await })
            });

            let drain_broker = broker.clone();
            let drain = tokio::spawn(async move {
                drain_broker.notified().await;
                if let Some(req) = drain_broker.drain_pending().await {
                    drain_broker
                        .complete(req.id, ApprovalDecision::AllowOnce)
                        .await;
                }
            });

            let tmp = tempfile::tempdir_in(".").expect("tempdir");
            let target = tmp.path().join("allowed.txt");

            let call = crate::agent::ToolCall {
                name: "write_file".to_string(),
                args: std::collections::HashMap::from([
                    ("path".to_string(), target.display().to_string()),
                    ("content".to_string(), "written\n".to_string()),
                ]),
            };
            let opts = crate::tools::ToolExecOptions {
                additional_workspace_roots: Vec::new(),
                mcp_tool_definitions: None,
                require_confirmation: true,
                auto_approve_safe: false,
                auto_approve_edits: false,
                quiet: true,
                approval_callback: Some(callback),
                user_input_callback: None,
                privacy_mode: crate::agent::PrivacyMode::Local,
                workspace_root: std::env::current_dir().ok(),
            };

            let result = crate::tools::execute_tool_with_opts(&call, &opts)
                .await
                .expect("tool executes");
            drain.await.expect("drain task");

            let contents = std::fs::read_to_string(&target).ok();
            (result.success, contents)
        })
        .await
        .expect("approval flow must not deadlock");

        assert!(success, "allowed write must report success");
        assert_eq!(
            contents.as_deref(),
            Some("written\n"),
            "allowed write must land the exact content on disk"
        );
    }

    /// Integration: two parallel tools each queue an approval through ONE shared
    /// broker, a single FIFO drain loop (mirroring the `send_message` overlay
    /// loop) resolves both, and each tool must observe ITS OWN decision.
    ///
    /// This is the gap the prior tests leave: `approval_broker::drains_requests_fifo`
    /// exercises FIFO at the broker layer with fake workers, and the two
    /// `*_approval_*_via_callback` tests each drive a SINGLE real tool. Nothing
    /// covers two concurrent *real* tools (`join_all` in `chat.rs`) racing
    /// through the FIFO. We grant one path and deny the other to prove the
    /// decisions are routed per-request (not swapped or broadcast).
    ///
    /// Decisions key off `req.kind` content (the target path), NOT drain order:
    /// under concurrency the enqueue order is nondeterministic, so asserting on
    /// "first drained" would be flaky. Keying on identity makes the assertion
    /// order-independent while still exercising the single-at-a-time FIFO drain.
    /// The whole flow is timeout-wrapped so a deadlock regression fails fast.
    #[tokio::test]
    async fn two_parallel_tools_each_observe_their_own_decision_via_fifo() {
        use crate::tui::approval_broker::{ApprovalBroker, ApprovalDecision, ApprovalRequestKind};

        let outcome = tokio::time::timeout(std::time::Duration::from_secs(5), async {
            let broker = ApprovalBroker::new();
            let cb_broker = broker.clone();
            let callback: crate::tools::ApprovalCallback = std::sync::Arc::new(move |req| {
                let broker = cb_broker.clone();
                Box::pin(async move { broker.request(req).await })
            });

            // Two distinct in-cwd targets so `validate_file_path` accepts them and
            // each produces a distinct `FileWrite { path }` approval kind.
            let tmp = tempfile::tempdir_in(".").expect("tempdir");
            let allow_target = tmp.path().join("allow.txt");
            let deny_target = tmp.path().join("deny.txt");

            // FIFO drain loop: park on `notified()`, then drain ALL pending each
            // wake (notify_one coalesces, so two near-simultaneous requests may
            // produce a single wake), completing until BOTH have a decision.
            // Decision is chosen from the request's target path: allow_target ->
            // AllowOnce, anything else -> Deny.
            let drain_broker = broker.clone();
            let drain = tokio::spawn(async move {
                let mut completed = 0;
                while completed < 2 {
                    drain_broker.notified().await;
                    while let Some(req) = drain_broker.drain_pending().await {
                        let is_allow = matches!(
                            &req.kind,
                            ApprovalRequestKind::FileWrite { path }
                                if path.file_name()
                                    == std::path::Path::new("allow.txt").file_name()
                        );
                        let decision = if is_allow {
                            ApprovalDecision::AllowOnce
                        } else {
                            ApprovalDecision::Deny
                        };
                        drain_broker.complete(req.id, decision).await;
                        completed += 1;
                    }
                }
            });

            let mk_call = |path: &std::path::Path, body: &str| crate::agent::ToolCall {
                name: "write_file".to_string(),
                args: std::collections::HashMap::from([
                    ("path".to_string(), path.display().to_string()),
                    ("content".to_string(), body.to_string()),
                ]),
            };
            let opts = crate::tools::ToolExecOptions {
                additional_workspace_roots: Vec::new(),
                mcp_tool_definitions: None,
                require_confirmation: true,
                auto_approve_safe: false,
                auto_approve_edits: false,
                quiet: true,
                approval_callback: Some(callback),
                user_input_callback: None,
                privacy_mode: crate::agent::PrivacyMode::Local,
                workspace_root: std::env::current_dir().ok(),
            };

            // Run BOTH tools concurrently (mirrors `join_all` in chat.rs). Each
            // independently calls `broker.request().await` through the shared
            // callback; the single drain loop resolves them via the FIFO.
            let allow_call = mk_call(&allow_target, "allowed\n");
            let deny_call = mk_call(&deny_target, "should not be written");
            let (allow_res, deny_res) = tokio::join!(
                crate::tools::execute_tool_with_opts(&allow_call, &opts),
                crate::tools::execute_tool_with_opts(&deny_call, &opts),
            );
            drain.await.expect("drain task");

            let allow_res = allow_res.expect("allow tool executes");
            let deny_res = deny_res.expect("deny tool executes");

            (
                allow_res.success,
                std::fs::read_to_string(&allow_target).ok(),
                deny_res.success,
                deny_target.exists(),
            )
        })
        .await
        .expect("two-tool approval flow must not deadlock");

        let (allow_success, allow_contents, deny_success, deny_exists) = outcome;

        // The allowed tool observed AllowOnce: it succeeded and wrote its file.
        assert!(allow_success, "allowed tool must report success");
        assert_eq!(
            allow_contents.as_deref(),
            Some("allowed\n"),
            "allowed tool must land its exact content on disk"
        );

        // The denied tool observed Deny: it failed and never touched disk,
        // proving the two decisions were routed per-request, not swapped.
        assert!(!deny_success, "denied tool must report failure");
        assert!(!deny_exists, "denied tool must not create its file on disk");
    }

    // Build the thinnest possible TuiApp without touching the filesystem or
    // spawning terminals, we only test the overlay slot, not the TUI render.
    fn minimal_app() -> TuiApp {
        minimal_app_with(crate::config::CliConfig::default())
    }

    fn minimal_app_with(config: crate::config::CliConfig) -> TuiApp {
        let sys_ctx = crate::context::SystemContext {
            cwd: "/tmp".into(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "linux".into(),
            shell: "bash".into(),
        };
        // From the catalog, not a literal: the hardcoded-model guard forbids naming
        // a model here, and a literal goes stale the next time one is retired.
        let model = crate::model_catalog::fast_completion_model("anthropic");
        let session = crate::agent::AgentSession::new(&model, &sys_ctx, None);
        TuiApp::new(session, config)
    }

    #[test]
    fn workflow_without_a_goal_shows_usage() {
        let mut app = minimal_app();
        match handle_slash("/workflow", &mut app) {
            SlashResult::SystemMessage(text) => {
                assert_eq!(text, crate::subagent::WORKFLOW_USAGE)
            }
            _ => panic!("expected usage"),
        }
    }

    #[test]
    fn workflow_is_refused_without_a_saved_session() {
        let mut app = minimal_app();
        match handle_slash("/workflow audit the error paths", &mut app) {
            SlashResult::SystemMessage(text) => assert!(text.contains("saved session"), "{text}"),
            _ => panic!("expected the blocker message"),
        }
    }

    #[test]
    fn workflow_sends_a_staged_subagent_prompt() {
        let mut app = minimal_app();
        app.session.set_session_persistence(true);
        app.session.managed_session = Some(crate::runtime::session::ManagedSession::new(
            "tui-workflow",
            chrono::Utc::now(),
        ));
        app.session.managed_session_path = Some("tui-workflow.jsonl".into());
        match handle_slash("/workflow audit the error paths", &mut app) {
            SlashResult::SendPrompt(prompt) => {
                assert_eq!(
                    prompt,
                    crate::subagent::workflow_prompt("audit the error paths")
                )
            }
            _ => panic!("expected a workflow prompt"),
        }
    }

    #[test]
    fn workspace_mcp_tui_lists_blocked_status_and_reason() {
        crate::cloud::workspace_policy::with_test_policy(
            serde_json::json!({"code": {"allowMcpServers": false}}),
            || {
                crate::mcp::with_test_configs(
                    std::collections::HashMap::from([(
                        "blocked-tui-fixture".to_string(),
                        crate::mcp::McpServerConfig::http(
                            "https://mcp.example.test/mcp",
                            std::collections::HashMap::new(),
                        ),
                    )]),
                    || {
                        let mut app = minimal_app();
                        let SlashResult::SystemMessage(text) = handle_slash("/mcp", &mut app)
                        else {
                            panic!("MCP list must render a system message");
                        };
                        assert!(text.contains("blocked-tui-fixture · ⊘ blocked by your workspace"));
                        assert!(text.contains("MCP server 'blocked-tui-fixture' was not started"));
                        assert!(text.contains("administrator has turned MCP servers off"));
                        assert!(!text.contains("blocked-tui-fixture · △ needs authentication"));
                    },
                )
            },
        );
    }

    fn modes_reached_by_shift_tab(app: &TuiApp) -> Vec<InteractionMode> {
        let mut reached = vec![app.mode];
        let mut mode = app.mode;
        for _ in 0..10 {
            mode = mode.next_available(&app.session);
            reached.push(mode);
        }
        reached
    }

    #[test]
    fn shift_tab_never_reaches_an_approval_skipping_mode_without_the_launch_opt_in() {
        let mut app = minimal_app();
        app.session.pinned_permission_mode = None;

        let reached = modes_reached_by_shift_tab(&app);

        assert!(
            reached.contains(&InteractionMode::AcceptEdits),
            "{reached:?}"
        );
        assert!(
            !reached.contains(&InteractionMode::BypassPermissions),
            "{reached:?}"
        );
        assert!(!reached.contains(&InteractionMode::FullAuto), "{reached:?}");
    }

    #[test]
    fn a_typed_bypass_command_is_refused_without_the_launch_opt_in() {
        let mut app = minimal_app();
        app.session.pinned_permission_mode = None;

        assert!(!apply_mode(&mut app, InteractionMode::BypassPermissions));
        assert!(!apply_mode(&mut app, InteractionMode::FullAuto));
        assert!(!app.session.skip_permissions);
        assert_eq!(app.mode, InteractionMode::Chat);
        assert!(
            unavailable_mode_notice(&app, InteractionMode::BypassPermissions)
                .contains("--allow-dangerously-skip-permissions"),
            "the refusal names the opt-in"
        );
    }

    #[test]
    fn re_entering_plan_mode_locks_mutating_tools_until_the_next_approval() {
        let mut app = minimal_app();
        app.session.pinned_permission_mode = None;

        assert!(apply_mode(&mut app, InteractionMode::Plan));
        app.session.plan_approved = true;
        assert!(apply_mode(&mut app, InteractionMode::Plan));
        assert!(
            app.session.plan_approved,
            "staying in plan keeps its approval"
        );

        assert!(apply_mode(&mut app, InteractionMode::Chat));
        assert!(apply_mode(&mut app, InteractionMode::Plan));
        assert!(!app.session.plan_approved);
    }

    #[test]
    fn the_launch_opt_in_puts_bypass_and_full_auto_back_in_the_cycle() {
        let mut app = minimal_app();
        app.session.pinned_permission_mode = None;
        app.session.bypass_permissions_available = true;

        assert_eq!(
            InteractionMode::AcceptEdits.next_available(&app.session),
            InteractionMode::BypassPermissions
        );
        assert_eq!(
            InteractionMode::BypassPermissions.next_available(&app.session),
            InteractionMode::FullAuto
        );
        assert!(apply_mode(&mut app, InteractionMode::BypassPermissions));
        assert!(app.session.skip_permissions);
    }

    #[test]
    fn an_organization_pin_still_outranks_the_launch_opt_in() {
        let mut app = minimal_app();
        app.session.pinned_permission_mode = Some(crate::cli_options::PermissionMode::AcceptEdits);
        app.session.bypass_permissions_available = true;

        let reached = modes_reached_by_shift_tab(&app);

        assert!(
            !reached.contains(&InteractionMode::BypassPermissions),
            "{reached:?}"
        );
        assert!(!reached.contains(&InteractionMode::FullAuto), "{reached:?}");
    }

    #[test]
    fn review_uses_the_tui_effort_and_a_leading_level_overrides_it() {
        let mut app = minimal_app();
        app.effort = crate::design_system::Effort::Low;
        let quick = match handle_slash("/review", &mut app) {
            SlashResult::SendPrompt(prompt) => prompt,
            _ => panic!("/review should send a prompt"),
        };
        app.effort = crate::design_system::Effort::Xhigh;
        let thorough = match handle_slash("/review", &mut app) {
            SlashResult::SendPrompt(prompt) => prompt,
            _ => panic!("/review should send a prompt"),
        };
        assert_ne!(quick, thorough);
        assert!(quick.contains("one quick pass"), "{quick}");
        assert!(thorough.contains("second pass"), "{thorough}");

        match handle_slash("/review low src/lib.rs", &mut app) {
            SlashResult::SendPrompt(prompt) => {
                assert!(prompt.contains("one quick pass"), "{prompt}");
                assert!(prompt.contains("src/lib.rs"), "{prompt}");
            }
            _ => panic!("/review with a level should send a prompt"),
        }
    }

    #[test]
    fn effort_slash_takes_every_ladder_level_and_lists_them_when_unknown() {
        let tmp = tempfile::tempdir().unwrap();
        let mut app = minimal_app();
        app.config.source.project_path = Some(tmp.path().join(".agiworkforce").join("config.toml"));
        for effort in crate::design_system::Effort::ALL {
            let result = handle_slash(&format!("/effort {}", effort.wire_value()), &mut app);
            assert!(matches!(result, SlashResult::SystemMessage(_)));
            assert_eq!(app.effort, *effort);
        }
        match handle_slash("/effort extreme", &mut app) {
            SlashResult::SystemMessage(text) => {
                assert!(
                    text.contains("none | minimal | low | medium | high | xhigh | max"),
                    "{text}"
                );
            }
            _ => panic!("/effort extreme should explain itself"),
        }
    }

    /// Regression: `/voice` in the TUI printed "Voice mode requires the REPL
    /// (not TUI). Run: agi --no-tui --voice-lang en" on top of a complete,
    /// working 1,186-line implementation. Voice never needed the REPL, it
    /// needed the alt-screen dropped, which RunLogin/RunAdvisor already do.
    #[test]
    fn voice_slash_dispatches_instead_of_redirecting_to_the_repl() {
        let mut app = minimal_app();

        // Default language, and an explicit supported one, both dispatch.
        assert!(matches!(
            handle_slash("/voice", &mut app),
            SlashResult::RunVoice(ref l) if l == "en"
        ));
        assert!(matches!(
            handle_slash("/v es", &mut app),
            SlashResult::RunVoice(ref l) if l == "es"
        ));

        // An unsupported language is rejected in place, listing what works;
        // it must not dispatch a voice session that would immediately fail.
        match handle_slash("/voice klingon", &mut app) {
            SlashResult::SystemMessage(msg) => {
                assert!(msg.contains("Unsupported language"), "got: {msg}");
                assert!(msg.contains("en"), "should list supported codes: {msg}");
                assert!(!msg.contains("--no-tui"), "must not redirect to the REPL");
            }
            _ => panic!("expected a rejection message for an unsupported language"),
        }
    }

    #[test]
    fn managed_handoff_preloads_tui_composer_with_correct_route_label() {
        let mut app = minimal_app();
        app.session.model = crate::model_catalog::cloud_models()[0].id.clone();
        app.session.provider = crate::models::Provider::ManagedCloud;
        app.session.set_session_persistence(true);
        app.session
            .set_privacy_mode(crate::agent::PrivacyMode::Local);
        app.session.managed_session = Some(crate::runtime::session::ManagedSession::new(
            "tui-source",
            chrono::Utc::now(),
        ));
        app.session.managed_session_path = Some("tui-source.jsonl".into());

        match handle_slash("/continue-with-cloud full", &mut app) {
            SlashResult::SystemMessage(message) => {
                assert!(message.contains("Managed Cloud"));
                assert!(message.contains("managed_cloud"));
            }
            _ => panic!("expected Managed Cloud review message"),
        }
        assert!(app.input.contains("Local chat in Managed Cloud mode"));
        assert!(app.input.contains("Destination provider: managed_cloud"));
    }

    #[test]
    fn overlay_intercepts_keys_before_composer() {
        let mut app = minimal_app();
        let view = Box::new(StubView::new(true /* close_on_enter */));
        app.open_overlay(view);
        assert!(app.active_overlay.is_some());

        // Down, consumed by overlay, not forwarded
        let consumed = app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::Down));
        assert!(consumed.is_some());
        assert!(app.active_overlay.is_some(), "overlay stays open on Down");

        // Enter, overlay should close and slot cleared
        let consumed = app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::Enter));
        assert!(consumed.is_some());
        assert!(app.active_overlay.is_none(), "overlay cleared after Submit");
    }

    #[test]
    fn closed_overlay_is_cleared_on_esc() {
        let mut app = minimal_app();
        app.open_overlay(Box::new(StubView::new(false)));
        assert!(app.active_overlay.is_some());

        let consumed = app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::Esc));
        assert!(consumed.is_some());
        assert!(app.active_overlay.is_none());
    }

    #[test]
    fn statusline_overlay_save_applies_config_to_app() {
        // Regression: the generic overlay Submit was DROPPED at dispatch, so
        // /statusline's "Enter save" persisted nothing. It now applies via
        // take_result → apply_overlay_result.
        use crate::tui::widgets::statusline_setup::StatusLineSetupView;
        let mut app = minimal_app();
        assert!(!app.statusline_config.show_model, "model off by default");
        app.open_overlay(Box::new(StatusLineSetupView::new(
            app.statusline_config.clone(),
        )));

        // Space toggles the field under the cursor (index 0 = "model").
        app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::Char(' ')));
        // Enter saves.
        let consumed = app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::Enter));
        assert!(consumed.is_some());
        assert!(app.active_overlay.is_none(), "overlay cleared after save");
        assert!(
            app.statusline_config.show_model,
            "toggled 'model' field persisted to the app on save"
        );
    }

    #[test]
    fn statusline_overlay_esc_discards_changes() {
        use crate::tui::widgets::statusline_setup::StatusLineSetupView;
        let mut app = minimal_app();
        let before = app.statusline_config.clone();
        app.open_overlay(Box::new(StatusLineSetupView::new(
            app.statusline_config.clone(),
        )));
        app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::Char(' ')));
        app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::Esc));
        assert!(app.active_overlay.is_none());
        assert_eq!(app.statusline_config, before, "Esc discards the toggle");
    }

    #[test]
    fn build_terminal_title_composes_only_enabled_fields() {
        use crate::tui::widgets::terminal_title_setup::TerminalTitleConfig;
        let all = TerminalTitleConfig {
            show_session_id: false,
            show_model: true,
            show_cwd: true,
            show_branch: true,
        };
        assert_eq!(
            build_terminal_title(&all, "abcdef", "some-model", "myrepo", Some("main")),
            Some("agi · some-model · myrepo · ⎇ main".to_string())
        );
        let only_id = TerminalTitleConfig {
            show_session_id: true,
            show_model: false,
            show_cwd: false,
            show_branch: false,
        };
        assert_eq!(
            build_terminal_title(&only_id, "abcdef12", "m", "c", Some("b")),
            Some("agi · #abcdef12".to_string())
        );
        let none = TerminalTitleConfig {
            show_session_id: false,
            show_model: false,
            show_cwd: false,
            show_branch: false,
        };
        assert_eq!(build_terminal_title(&none, "x", "m", "c", Some("b")), None);
    }

    #[test]
    fn the_terminal_title_strips_escapes_from_every_field() {
        use crate::tui::widgets::terminal_title_setup::TerminalTitleConfig;
        let all = TerminalTitleConfig {
            show_session_id: true,
            show_model: true,
            show_cwd: true,
            show_branch: true,
        };
        let title = build_terminal_title(
            &all,
            "abc",
            "model",
            &format!("repo{ESCAPE_PAYLOAD}dir\nname"),
            Some("main"),
        )
        .expect("title");
        assert_no_terminal_escapes(&title, "terminal title");
        assert!(!title.contains('\n'), "{title:?}");
    }

    #[test]
    fn the_title_is_built_at_startup_from_the_saved_config() {
        use crate::tui::widgets::terminal_title_setup::TerminalTitleConfig;
        let mut app = minimal_app();
        app.model_name = "fixture-model".to_string();
        app.git_branch = Some("main".to_string());
        app.terminal_title_config = TerminalTitleConfig {
            show_session_id: false,
            show_model: true,
            show_cwd: false,
            show_branch: true,
        };
        assert_eq!(
            app.terminal_title().as_deref(),
            Some("agi · fixture-model · ⎇ main")
        );
        app.terminal_title_config = TerminalTitleConfig {
            show_session_id: false,
            show_model: false,
            show_cwd: false,
            show_branch: false,
        };
        assert_eq!(
            app.terminal_title(),
            None,
            "an all-off config sets no title"
        );
    }

    #[test]
    fn a_saved_title_config_is_what_the_app_starts_with() {
        use crate::tui::widgets::terminal_title_setup::TerminalTitleConfig;
        let mut config = crate::config::CliConfig::default();
        config.ui.terminal_title = Some(TerminalTitleConfig {
            show_session_id: true,
            show_model: false,
            show_cwd: false,
            show_branch: false,
        });
        let app = minimal_app_with(config);
        assert!(app.terminal_title_config.show_session_id);
        assert!(!app.terminal_title_config.show_model);
        assert_eq!(
            minimal_app().terminal_title_config,
            TerminalTitleConfig::default()
        );
    }

    #[test]
    fn saving_the_title_overlay_persists_it_to_the_project_config() {
        use crate::tui::widgets::terminal_title_setup::TerminalTitleSetupView;
        let tmp = tempfile::tempdir().unwrap();
        let config_file = tmp.path().join(".agiworkforce").join("config.toml");
        let mut app = minimal_app();
        app.config.source.project_path = Some(config_file.clone());
        app.open_overlay(Box::new(TerminalTitleSetupView::new(
            app.terminal_title_config.clone(),
        )));
        app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::Char(' ')));
        app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::Enter));

        let saved = std::fs::read_to_string(&config_file).expect("config written");
        assert!(saved.contains("[ui.terminal_title]"), "{saved}");
        assert!(saved.contains("show_session_id = true"), "{saved}");
    }

    #[test]
    fn title_overlay_save_applies_config_to_app() {
        use crate::tui::widgets::terminal_title_setup::TerminalTitleSetupView;
        let mut app = minimal_app();
        assert!(
            !app.terminal_title_config.show_session_id,
            "session-id off by default"
        );
        app.open_overlay(Box::new(TerminalTitleSetupView::new(
            app.terminal_title_config.clone(),
        )));
        // cursor 0 = "session-id"; Space toggles it, Enter saves.
        app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::Char(' ')));
        app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::Enter));
        assert!(app.active_overlay.is_none());
        assert!(
            app.terminal_title_config.show_session_id,
            "toggled 'session-id' field persisted to the app on save"
        );
    }

    #[test]
    fn no_overlay_means_keys_fall_through() {
        let mut app = minimal_app();
        assert!(app.active_overlay.is_none());

        let consumed = app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::Enter));
        assert!(consumed.is_none(), "no overlay → dispatch returns None");
    }

    #[test]
    fn the_composer_shows_no_generated_chip_until_an_image_exists() {
        let mut app = minimal_app();
        assert_eq!(generated_chip_rows(&app.generated_images), 0);
        app.generated_images
            .push(std::path::PathBuf::from("/work/a-red-bicycle.png"));
        assert_eq!(generated_chip_rows(&app.generated_images), 1);
        let chip = generated_chip_line(&app.generated_images);
        assert!(chip.contains("a-red-bicycle.png"), "{chip}");
        assert!(chip.contains("/image open"), "the chip says how to open it");
    }

    #[test]
    fn the_generated_chip_names_the_newest_image_and_counts_the_rest() {
        let mut app = minimal_app();
        app.generated_images = vec![
            std::path::PathBuf::from("/work/first.png"),
            std::path::PathBuf::from("/work/second.png"),
        ];
        let chip = generated_chip_line(&app.generated_images);
        assert!(chip.contains("second.png"), "{chip}");
        assert!(chip.contains("+1 more"), "{chip}");
        assert_eq!(generated_chip_rows(&app.generated_images), 1);
    }

    #[test]
    fn slash_image_with_a_prompt_runs_a_generation() {
        let mut app = minimal_app();
        let result = handle_slash("/image a red bicycle", &mut app);
        assert!(
            matches!(result, SlashResult::RunImage(ref prompt) if prompt == "a red bicycle"),
            "a prompt must reach the hosted route rather than the model"
        );
    }

    #[test]
    fn slash_image_without_a_prompt_explains_itself_instead_of_generating() {
        let mut app = minimal_app();
        let result = handle_slash("/image", &mut app);
        match result {
            SlashResult::SystemMessage(message) => {
                assert!(message.contains("/image open"), "{message}");
            }
            _ => panic!("a bare /image must not spend an image"),
        }
    }

    #[test]
    fn slash_image_clear_drops_the_chip() {
        let mut app = minimal_app();
        app.generated_images
            .push(std::path::PathBuf::from("/work/a.png"));
        let _ = handle_slash("/image clear", &mut app);
        assert!(app.generated_images.is_empty());
        assert_eq!(generated_chip_rows(&app.generated_images), 0);
    }

    #[test]
    fn slash_image_open_with_nothing_generated_says_so_and_opens_nothing() {
        let _guard = crate::oauth::external_open_spy::lock();
        crate::oauth::external_open_spy::enable_and_reset();
        let mut app = minimal_app();
        let result = handle_slash("/image open", &mut app);
        let opened = crate::oauth::external_open_spy::open_count();
        crate::oauth::external_open_spy::disable();
        assert_eq!(opened, 0, "nothing to open must launch nothing");
        assert!(matches!(result, SlashResult::SystemMessage(_)));
    }

    #[test]
    fn slash_image_open_hands_the_newest_file_to_the_viewer() {
        let _guard = crate::oauth::external_open_spy::lock();
        crate::oauth::external_open_spy::enable_and_reset();
        let mut app = minimal_app();
        app.generated_images
            .push(std::path::PathBuf::from("/work/a-red-bicycle.png"));
        let result = handle_slash("/image open", &mut app);
        let opened = crate::oauth::external_open_spy::open_count();
        crate::oauth::external_open_spy::disable();
        assert_eq!(opened, 1);
        match result {
            SlashResult::SystemMessage(message) => {
                assert!(message.contains("a-red-bicycle.png"), "{message}")
            }
            _ => panic!("opening reports what it opened"),
        }
    }

    #[test]
    fn at_key_opens_the_file_picker_and_keeps_the_character() {
        let mut app = minimal_app();
        // Seed the candidate list so the test does not depend on the walk
        // finding files under whatever directory it runs in.
        app.mention_candidates = Some(vec![
            crate::mentions::MentionCandidate::new("src/lib.rs"),
            crate::mentions::MentionCandidate::new("README.md"),
        ]);

        let action = handle_key_event(&mut app, make_key(crossterm::event::KeyCode::Char('@')));

        assert!(matches!(action, InputAction::None));
        assert!(app.active_overlay.is_some(), "the picker opens on @");
        // Unlike `/`, the `@` stays in the composer: it is part of the mention.
        assert_eq!(app.input, "@");
        assert_eq!(app.mention_anchor, Some(0));
    }

    #[test]
    fn an_at_inside_a_word_does_not_open_the_picker() {
        let mut app = minimal_app();
        app.mention_candidates = Some(vec![crate::mentions::MentionCandidate::new("src/lib.rs")]);
        app.input = "mail me".to_string();
        app.cursor = app.input.len();

        handle_key_event(&mut app, make_key(crossterm::event::KeyCode::Char('@')));
        assert!(app.active_overlay.is_none());
        assert_eq!(app.input, "mail me@");
    }

    #[test]
    fn choosing_a_file_replaces_the_typed_query_with_the_path() {
        let mut app = minimal_app();
        app.input = "explain @li".to_string();
        app.cursor = app.input.len();
        app.mention_anchor = Some(8);

        app.insert_mention("src/lib.rs");

        assert_eq!(app.input, "explain @src/lib.rs ");
        assert_eq!(app.cursor, app.input.len());
        assert_eq!(app.mention_anchor, None, "the anchor is consumed");
    }

    #[test]
    fn a_mention_chosen_mid_message_keeps_the_text_after_the_cursor() {
        let mut app = minimal_app();
        app.input = "@li and then some".to_string();
        app.cursor = 3;
        app.mention_anchor = Some(0);

        app.insert_mention("src/lib.rs");

        assert_eq!(app.input, "@src/lib.rs  and then some");
    }

    #[test]
    fn the_composer_shows_no_chip_row_until_something_is_staged() {
        let mut app = minimal_app();
        assert_eq!(attachment_chip_rows(&app.staged_images), 0);
        app.staged_images.push("shot.png".to_string());
        assert_eq!(attachment_chip_rows(&app.staged_images), 1);
        let chip = attachment_chip_line(&app.staged_images);
        assert!(chip.contains("shot.png"));
        assert!(
            chip.contains("/attach remove"),
            "the chip says how to drop it"
        );
    }

    #[test]
    fn removing_a_staged_image_drops_its_block_and_its_chip() {
        let mut app = minimal_app();
        app.staged_images = vec!["a.png".to_string(), "b.png".to_string()];
        app.session.pending_image_blocks = vec![
            crate::models::ContentBlock::Image {
                mime: "image/png".to_string(),
                data_b64: "a".to_string(),
            },
            crate::models::ContentBlock::Image {
                mime: "image/png".to_string(),
                data_b64: "b".to_string(),
            },
        ];

        app.remove_staged_image(Some(1)).expect("removes the first");

        assert_eq!(app.staged_images, vec!["b.png".to_string()]);
        assert_eq!(app.session.pending_image_blocks.len(), 1);

        app.remove_staged_image(None).expect("clears the rest");
        assert!(app.staged_images.is_empty());
        assert!(app.session.pending_image_blocks.is_empty());
    }

    #[test]
    fn removing_an_image_that_is_not_staged_is_refused() {
        let mut app = minimal_app();
        app.staged_images = vec!["a.png".to_string()];
        assert!(app.remove_staged_image(Some(2)).is_err());
        assert!(app.remove_staged_image(Some(0)).is_err());
        assert_eq!(app.staged_images.len(), 1);
    }

    #[test]
    fn attach_reports_a_path_that_is_not_an_image() {
        let mut app = minimal_app();
        let error = app.stage_image_path("Cargo.toml").expect_err("refused");
        assert!(error.contains("not an image") || error.contains("not a file"));
        assert!(app.staged_images.is_empty());
    }

    #[test]
    fn slash_key_opens_palette_without_inserting_duplicate_slash() {
        let mut app = minimal_app();
        let action = handle_key_event(&mut app, make_key(crossterm::event::KeyCode::Char('/')));

        assert!(matches!(action, InputAction::None));
        assert!(app.active_overlay.is_some());
        assert_eq!(app.input, "");
        assert_eq!(app.cursor, 0);
    }

    #[test]
    fn esc_clears_a_written_composer_then_twice_opens_rewind() {
        use crossterm::event::KeyCode;

        let mut app = minimal_app();
        app.input = "half a question".to_string();
        app.cursor = app.input.len();

        let action = handle_key_event(&mut app, make_key(KeyCode::Esc));
        assert!(
            matches!(action, InputAction::None),
            "the first Esc must not end a session that has unsent text in it"
        );
        assert_eq!(app.input, "");
        assert_eq!(app.cursor, 0);

        let action = handle_key_event(&mut app, make_key(KeyCode::Esc));
        assert!(matches!(action, InputAction::None));
        assert_eq!(app.live_notice(), Some("press Esc again to rewind"));

        let action = handle_key_event(&mut app, make_key(KeyCode::Esc));
        assert!(
            matches!(action, InputAction::None),
            "Esc twice on an empty composer opens rewind, as in Claude Code, and never quits"
        );
        assert!(app.active_overlay.is_some(), "the rewind picker opened");
    }

    /// Regression: Esc on the `/history` listing fell straight through to the
    /// global quit, ending the session with a Session Summary instead of
    /// closing the panel. Esc closes the topmost panel first.
    #[test]
    fn esc_closes_the_session_picker_instead_of_quitting() {
        use crate::tui::widgets::session_picker::{SessionEntry, SessionPickerView};
        use crossterm::event::KeyCode;

        let mut app = minimal_app();
        app.open_overlay(Box::new(SessionPickerView::new(vec![SessionEntry {
            id: "abc123".to_string(),
            label: "abc123  2026-09-14 09:47  3 msgs".to_string(),
        }])));

        let action = handle_key_event(&mut app, make_key(KeyCode::Esc));
        assert!(
            matches!(action, InputAction::None),
            "Esc on an open panel must never reach the global quit"
        );
        assert!(app.active_overlay.is_none(), "the panel closed");
        assert!(
            app.exit_armed_at.is_none(),
            "closing a panel must not arm the exit either"
        );

        let action = handle_key_event(&mut app, make_key(KeyCode::Esc));
        assert!(matches!(action, InputAction::None));
        assert!(app.exit_armed_at.is_none());
    }

    /// An expired arm must not carry over: Esc pressed minutes apart is two
    /// stray keystrokes, not a request to rewind.
    #[test]
    fn an_expired_esc_arm_does_not_open_rewind() {
        use crossterm::event::KeyCode;

        let mut app = minimal_app();
        handle_key_event(&mut app, make_key(KeyCode::Esc));
        app.rewind_armed_at = Some(Instant::now() - REWIND_CONFIRM_WINDOW - Duration::from_secs(1));

        let action = handle_key_event(&mut app, make_key(KeyCode::Esc));
        assert!(matches!(action, InputAction::None));
        assert!(
            app.active_overlay.is_none(),
            "presses minutes apart do not open rewind"
        );
    }

    /// Regression: a terminal without the keyboard protocol never sends
    /// Shift+Enter, and Ctrl-J (0x0A) and Ctrl-U (0x15) reach crossterm as
    /// `Char('j')`/`Char('u')` with CONTROL, so both typed their letter into
    /// the message instead of inserting a newline and killing the line.
    #[test]
    fn ctrl_j_inserts_a_newline_and_ctrl_u_kills_to_line_start() {
        use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

        let ctrl = |c: char| KeyEvent::new(KeyCode::Char(c), KeyModifiers::CONTROL);
        let mut app = minimal_app();

        for c in "first".chars() {
            handle_key_event(&mut app, make_key(KeyCode::Char(c)));
        }
        handle_key_event(&mut app, ctrl('j'));
        for c in "second".chars() {
            handle_key_event(&mut app, make_key(KeyCode::Char(c)));
        }
        assert_eq!(app.input, "first\nsecond");
        assert_eq!(app.cursor, app.input.len());

        handle_key_event(&mut app, ctrl('u'));
        assert_eq!(
            app.input, "first\n",
            "Ctrl-U kills the line, not the buffer"
        );
        assert_eq!(app.cursor, app.input.len());

        // No stray letter from either chord, and an unbound control chord types
        // nothing at all rather than inserting its own letter.
        handle_key_event(&mut app, ctrl('q'));
        assert_eq!(app.input, "first\n");
    }

    /// Regression: Ctrl-L is advertised as "clear screen" and instead discarded
    /// the conversation, which then reported `0 turns` in the session summary.
    /// Clearing the conversation is what `/clear` is for.
    #[test]
    fn ctrl_l_repaints_the_screen_and_keeps_the_conversation() {
        use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

        let mut app = minimal_app();
        app.chat_messages.push(ChatMessage {
            role: ChatRole::User,
            text: "REDRAW_MARKER_16180".to_string(),
        });
        app.session.turn_count = 3;

        let action = handle_key_event(
            &mut app,
            KeyEvent::new(KeyCode::Char('l'), KeyModifiers::CONTROL),
        );
        assert!(matches!(action, InputAction::Redraw));
        assert_eq!(app.session.turn_count, 3, "Ctrl-L must not reset the count");
        assert_eq!(app.chat_messages.len(), 1, "the transcript stays");

        // `/clear` is still the way to discard it.
        assert!(matches!(
            handle_slash("/clear", &mut app),
            SlashResult::SystemMessage(_)
        ));
        assert_eq!(app.session.turn_count, 0);
        assert!(app.chat_messages.is_empty());
    }

    /// `clear_chat` ships with no default chord, so a fresh install never
    /// binds it; a config that opts in gets a key that discards the
    /// conversation, the same effect as `/clear`.
    #[test]
    fn clear_chat_discards_the_conversation_when_a_project_binds_it() {
        use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

        let mut app = minimal_app();
        app.chat_messages.push(ChatMessage {
            role: ChatRole::User,
            text: "CLEAR_CHAT_MARKER_27182".to_string(),
        });
        app.session.turn_count = 3;

        let unbound_key = KeyEvent::new(KeyCode::Char('k'), KeyModifiers::CONTROL);
        assert!(matches!(
            handle_key_event(&mut app, unbound_key),
            InputAction::None
        ));
        assert_eq!(app.chat_messages.len(), 1, "unbound by default");

        app.keybindings = crate::keybindings::Keybindings::from_config(
            &std::collections::BTreeMap::from([("clear_chat".to_string(), "ctrl+k".to_string())]),
        );
        let action = handle_key_event(&mut app, unbound_key);
        assert!(matches!(action, InputAction::ClearChat));

        app.discard_conversation();
        assert_eq!(app.session.turn_count, 0);
        assert!(app.chat_messages.is_empty());
    }

    #[test]
    fn ctrl_c_exits_only_on_the_second_press() {
        use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

        let mut app = minimal_app();
        let ctrl_c = || KeyEvent::new(KeyCode::Char('c'), KeyModifiers::CONTROL);

        let action = handle_key_event(&mut app, ctrl_c());
        assert!(
            matches!(action, InputAction::None),
            "one Ctrl-C arms the exit rather than taking it"
        );
        assert!(app.exit_armed_at.is_some());

        let action = handle_key_event(&mut app, ctrl_c());
        assert!(
            matches!(action, InputAction::Quit(QuitReason::Interrupt)),
            "raw mode swallows SIGINT, so a repeated Ctrl-C is the keyboard exit"
        );
    }

    #[test]
    fn ctrl_c_clears_a_written_composer_and_disarms() {
        use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

        let mut app = minimal_app();
        let action = handle_key_event(
            &mut app,
            KeyEvent::new(KeyCode::Char('c'), KeyModifiers::CONTROL),
        );
        assert!(matches!(action, InputAction::None));
        assert!(app.exit_armed_at.is_some());

        app.input = "typed after arming".to_string();
        app.cursor = app.input.len();
        let action = handle_key_event(
            &mut app,
            KeyEvent::new(KeyCode::Char('c'), KeyModifiers::CONTROL),
        );
        assert!(
            matches!(action, InputAction::None),
            "clearing text is not an exit, even while armed"
        );
        assert_eq!(app.input, "");
        assert!(
            app.exit_armed_at.is_none(),
            "clearing must disarm, or the next Ctrl-C exits unexpectedly"
        );
    }

    #[test]
    fn an_expired_exit_arm_does_not_quit() {
        use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

        let mut app = minimal_app();
        app.exit_armed_at =
            Instant::now().checked_sub(EXIT_CONFIRM_WINDOW + Duration::from_secs(1));

        let action = handle_key_event(
            &mut app,
            KeyEvent::new(KeyCode::Char('c'), KeyModifiers::CONTROL),
        );
        assert!(
            matches!(action, InputAction::None),
            "a Ctrl-C from minutes ago must not combine with this one to exit"
        );
        assert!(app
            .exit_armed_at
            .is_some_and(|at| at.elapsed() < EXIT_CONFIRM_WINDOW));
    }

    #[test]
    fn configured_palette_binding_replaces_the_default_in_live_dispatch() {
        use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

        let mut app = minimal_app();
        app.config
            .ui
            .keybindings
            .insert("open_palette".to_string(), "ctrl+p".to_string());
        app.keybindings = crate::keybindings::Keybindings::from_config(&app.config.ui.keybindings);

        let action = handle_key_event(&mut app, make_key(KeyCode::Char('/')));
        assert!(matches!(action, InputAction::None));
        assert!(app.active_overlay.is_none());
        assert_eq!(app.input, "/");

        app.input.clear();
        app.cursor = 0;
        let action = handle_key_event(
            &mut app,
            KeyEvent::new(KeyCode::Char('p'), KeyModifiers::CONTROL),
        );
        assert!(matches!(action, InputAction::None));
        assert!(app.active_overlay.is_some());
        assert!(app.input.is_empty());
    }

    /// Regression: `/help` then Enter sat inert in the composer, because the
    /// palette's Enter only accepted the completion and a *second* Enter
    /// submitted it. One Enter runs the command, the way it does everywhere else.
    #[test]
    fn one_enter_runs_the_command_the_palette_has_highlighted() {
        let mut app = minimal_app();
        app.open_overlay(Box::new(SlashActionView));

        let consumed = app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::Enter));

        assert!(matches!(consumed, Some(InputAction::SendMessage(ref text)) if text == "/plan"));
        assert!(app.active_overlay.is_none());
        assert!(
            app.input.is_empty(),
            "the composer keeps nothing to re-send"
        );
        assert_eq!(app.cursor, 0);
    }

    /// Typing the whole command and pressing Enter once must run it, through
    /// the real `CommandPopup` rather than a stub side-action.
    #[test]
    fn typing_a_command_into_the_palette_runs_it_on_the_first_enter() {
        use crossterm::event::KeyCode;

        let mut app = minimal_app();
        assert!(matches!(
            handle_key_event(&mut app, make_key(KeyCode::Char('/'))),
            InputAction::None
        ));
        assert!(app.active_overlay.is_some(), "`/` opens the palette");

        for c in "help".chars() {
            assert!(matches!(
                handle_key_event(&mut app, make_key(KeyCode::Char(c))),
                InputAction::None
            ));
        }

        let action = handle_key_event(&mut app, make_key(KeyCode::Enter));
        assert!(
            matches!(action, InputAction::SendMessage(ref text) if text == "/help"),
            "one Enter must submit, got {action:?}"
        );
        assert!(app.active_overlay.is_none());
    }

    #[test]
    fn security_review_asks_for_its_scope_before_it_runs() {
        use crossterm::event::KeyCode;

        let mut app = minimal_app();
        assert!(matches!(
            handle_slash("/security-review", &mut app),
            SlashResult::SystemMessage(ref text) if text.is_empty()
        ));
        assert!(app.active_overlay.is_some(), "the scope question opens");

        app.dispatch_key_to_overlay(make_key(KeyCode::Down));
        let consumed = app.dispatch_key_to_overlay(make_key(KeyCode::Enter));
        assert!(
            matches!(consumed, Some(InputAction::SendMessage(ref text)) if text == "/security-review --repo"),
            "the picked scope runs the command, got {consumed:?}"
        );
        assert!(app.active_overlay.is_none());
    }

    #[test]
    fn a_described_agent_is_drafted_and_a_bare_create_asks_for_the_description() {
        let mut app = minimal_app();
        assert!(matches!(
            handle_slash(
                "/agents create reviews pull requests for risky changes",
                &mut app
            ),
            SlashResult::RunAgentDraft(_)
        ));
        assert!(matches!(
            handle_slash("/agents create", &mut app),
            SlashResult::SystemMessage(ref text) if text.contains("Describe what this agent should do")
        ));
    }

    #[test]
    fn security_review_with_a_scope_given_runs_without_asking() {
        let mut app = minimal_app();
        assert!(matches!(
            handle_slash("/security-review src/auth", &mut app),
            SlashResult::SendPrompt(ref prompt) if prompt.contains("src/auth")
        ));
        assert!(app.active_overlay.is_none());
    }

    /// Tab stays the completion key so a command that still needs arguments can
    /// be filled into the composer without running first.
    #[test]
    fn tab_fills_the_composer_instead_of_running_the_command() {
        use crossterm::event::KeyCode;

        let mut app = minimal_app();
        handle_key_event(&mut app, make_key(KeyCode::Char('/')));
        for c in "rename".chars() {
            handle_key_event(&mut app, make_key(KeyCode::Char(c)));
        }

        let action = handle_key_event(&mut app, make_key(KeyCode::Tab));
        assert!(matches!(action, InputAction::None));
        assert_eq!(app.input, "/rename");
        assert_eq!(app.cursor, app.input.len());
        assert!(app.active_overlay.is_none());
    }

    #[test]
    fn pasted_text_inserts_without_submitting() {
        let mut app = minimal_app();

        handle_paste_text(&mut app, "first line\n/second line");

        assert_eq!(app.input, "first line\n/second line");
        assert_eq!(app.cursor, app.input.len());
        assert!(app.chat_messages.is_empty());
    }

    #[test]
    fn overlay_page_keys_adjust_scroll_state() {
        let mut app = minimal_app();
        app.open_overlay(Box::new(StubView::new(false)));

        let consumed = app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::PageDown));
        assert!(consumed.is_some());
        assert_eq!(app.overlay_scroll, 5);

        let consumed = app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::PageUp));
        assert!(consumed.is_some());
        assert_eq!(app.overlay_scroll, 0);
    }

    fn builtin_registry() -> CommandRegistry {
        let mut registry = CommandRegistry::default();
        registry.extend(builtin_slash_registry_commands());
        registry
    }

    fn tui_runtime_command_names() -> std::collections::BTreeSet<&'static str> {
        let mut names = std::collections::BTreeSet::new();
        names.extend(
            crate::claude_parity::shared_runtime_command_names()
                .iter()
                .copied(),
        );
        names.extend([
            "upgrade",
            "desktop",
            "app",
            "exit",
            "quit",
            "q",
            "clear",
            "model",
            "m",
            "plan",
            "cost",
            "output-style",
            "fallback",
            "replay",
            "insights",
            "status",
            "context",
            "tasks",
            "task",
            "team",
            "teams",
            "personalize",
            "tools",
            "budget",
            "continue",
            "fast",
            "new",
            "models",
            "providers",
            "config",
            "diff",
            "copy",
            "login",
            "logout",
            "feedback",
            "bug",
            "help",
            "h",
            "?",
            "compact",
            "history",
            "sessions",
            "resume",
            "fork",
            "branch",
            "save",
            "rename",
            "export",
            "rewind",
            "mcp",
            "permissions",
            "perms",
            "approvals",
            "agents",
            "init",
            "skills",
            "hooks",
            "attach",
            "plugin",
            "plugins",
            "marketplace",
            "market",
            "memory",
            "mem",
            "voice",
            "v",
            "image",
            "imagine",
            "theme",
            "btw",
            "search",
            "ctx",
            "review",
            "effort",
            "e",
            "usage",
            "memories",
            "skills-toggle",
            "statusline",
            "title",
            "diff-review",
            "advisor",
            "team-onboarding",
            "onboarding",
            "terminal-setup",
            "shell-setup",
            "reload-plugins",
            "extra-usage",
            "pricing",
            "remote-env",
            "remote-control",
            "rc",
            "workflow",
            "workflows",
        ]);
        names
    }

    #[test]
    fn slash_resolution_keeps_exact_sessions_runtime_command() {
        let registry = builtin_registry();

        assert_eq!(
            resolve_tui_slash_command("/sessions", &registry),
            "/sessions"
        );
    }

    #[test]
    fn slash_resolution_still_normalizes_registered_aliases() {
        let registry = builtin_registry();

        assert_eq!(resolve_tui_slash_command("/branch", &registry), "/fork");
        assert_eq!(resolve_tui_slash_command("/diagnose", &registry), "/doctor");
    }

    #[test]
    fn registered_builtin_commands_have_tui_runtime_coverage() {
        let runtime = tui_runtime_command_names();

        for command in builtin_slash_registry_commands() {
            assert!(
                runtime.contains(command.name.as_str()),
                "/{} is registered but has no TUI runtime coverage",
                command.name
            );
            for alias in command.aliases {
                assert!(
                    runtime.contains(alias.as_str()),
                    "/{} alias for /{} has no TUI runtime coverage",
                    alias,
                    command.name
                );
            }
        }
    }

    /// Regression for the tool-approval-modal blanking bug: `run_tui_approval_modal`
    /// used to run its own isolated `terminal.draw` that cleared the *entire*
    /// frame and rendered only the approval box, wiping out the
    /// header/cost-HUD/transcript/composer/status chrome underneath. The fix
    /// makes it share `draw_turn_chrome` (the same helper `render_turn_frame`
    /// uses for the live in-turn frame) and layer the overlay on top within the
    /// same `terminal.draw` closure, mirroring how `render()` composites
    /// `active_overlay`/pickers over the main frame instead of replacing it.
    ///
    /// This exercises the exact draw sequence `run_tui_approval_modal` performs
    /// (`draw_turn_chrome` then `overlay.render_into` in one `terminal.draw`)
    /// against a `TestBackend` and asserts the rendered buffer contains BOTH
    /// the chrome (header title + a distinctive transcript message) AND the
    /// approval box, proving compositing rather than full-frame replacement.
    /// Regression: the BYOK privacy notice reached the screen through
    /// `output::print_info`'s `eprintln!` while ratatui owned the terminal, so
    /// it landed outside the frame buffer and the diff renderer never repainted
    /// those cells. Live captures showed it splicing letters into the reply
    /// ("Blaeberry", "fromgyousnow") and breaking the transcript border.
    #[test]
    fn a_notice_raised_under_the_tui_lands_in_the_transcript_not_on_stderr() {
        let mut app = minimal_app();
        let _ = crate::tui::drain_tui_notices();

        crate::tui::set_tui_active(true);
        crate::output::print_info("PRIVACY_NOTICE_MARKER_271828");
        crate::output::print_warn("WARN_NOTICE_MARKER_161803");
        let queued = crate::tui::drain_tui_notices();
        crate::tui::set_tui_active(false);

        assert_eq!(
            queued,
            vec![
                "PRIVACY_NOTICE_MARKER_271828".to_string(),
                "WARN_NOTICE_MARKER_161803".to_string()
            ],
            "every notice must reach the TUI's own sink while it owns the terminal"
        );

        for text in queued {
            app.chat_messages.push(ChatMessage {
                role: ChatRole::System,
                text,
            });
        }
        let rendered = draw_app(&app, 100, 30);
        assert!(
            rendered.contains("PRIVACY_NOTICE_MARKER_271828"),
            "the notice must be part of the frame:\n{rendered}"
        );

        // Without a TUI the same call belongs on stderr, or the exec and REPL
        // surfaces lose every warning they print into a queue nothing drains.
        crate::output::print_info("STDERR_ONLY_MARKER_141421");
        assert!(crate::tui::drain_tui_notices().is_empty());
    }

    #[tokio::test]
    async fn a_teammate_message_shows_its_sender_in_the_receiving_thread() {
        let mut app = minimal_app();
        app.session.enable_team_mode();
        let team = app.session.team_manager.clone().expect("team mode");
        team.spawn_teammate("scout", "researcher", "")
            .await
            .unwrap();
        team.spawn_teammate("builder", "engineer", "")
            .await
            .unwrap();

        team.send_message("scout", crate::teams::LEAD, "FOUND_THE_LEAK_314159")
            .await
            .unwrap();
        team.send_message("builder", "scout", "NEEDS_A_REVIEW_271828")
            .await
            .unwrap();
        team.send_message(crate::teams::USER, "scout", "TYPED_BY_THE_PERSON_161803")
            .await
            .unwrap();

        assert!(drain_team_messages(&mut app).await);
        assert!(!drain_team_messages(&mut app).await);

        let roles: Vec<_> = app
            .chat_messages
            .iter()
            .map(|message| message.role == ChatRole::Teammate)
            .collect();
        assert_eq!(roles, vec![true, true]);

        let rendered = draw_app(&app, 100, 30);
        assert!(
            rendered.contains("scout"),
            "the sender must head the entry:\n{rendered}"
        );
        assert!(rendered.contains("FOUND_THE_LEAK_314159"), "{rendered}");
        assert!(rendered.contains("builder to scout"), "{rendered}");
        assert!(rendered.contains("NEEDS_A_REVIEW_271828"), "{rendered}");
        assert!(
            !rendered.contains("TYPED_BY_THE_PERSON_161803"),
            "{rendered}"
        );
    }

    #[tokio::test]
    async fn a_teammate_message_cannot_inject_terminal_escapes_into_the_thread() {
        let mut app = minimal_app();
        app.session.enable_team_mode();
        let team = app.session.team_manager.clone().expect("team mode");
        team.spawn_teammate("scout", "researcher", "")
            .await
            .unwrap();
        team.send_message("scout", crate::teams::LEAD, "plain\u{1b}[2Jtext")
            .await
            .unwrap();

        drain_team_messages(&mut app).await;

        assert!(app
            .chat_messages
            .iter()
            .all(|message| !message.text.contains('\u{1b}')));
    }

    /// Regression: every overlay drew over whatever the transcript had left on
    /// those cells, so `/model`, `/history` and `/theme` all showed fragments of
    /// old status lines and replies bleeding through the popup.
    #[test]
    fn an_overlay_draws_over_a_cleared_region() {
        use crate::tui::widgets::session_picker::{SessionEntry, SessionPickerView};

        let mut app = minimal_app();
        for i in 0..40 {
            app.chat_messages.push(ChatMessage {
                role: ChatRole::Assistant,
                text: format!("TRANSCRIPT_BLEED_MARKER_{i} ").repeat(6),
            });
        }
        let without_overlay = draw_app(&app, 100, 30);
        assert!(without_overlay.contains("TRANSCRIPT_BLEED_MARKER_"));

        app.open_overlay(Box::new(SessionPickerView::new(
            (0..12)
                .map(|i| SessionEntry {
                    id: format!("id-{i}"),
                    label: format!("id-{i}  2026-09-14 09:47  3 msgs"),
                })
                .collect(),
        )));
        let rendered = draw_app(&app, 100, 30);

        let overlay_rows: Vec<&str> = rendered
            .lines()
            .filter(|row| row.contains('│') && row.contains("id-"))
            .collect();
        assert!(
            !overlay_rows.is_empty(),
            "overlay must be drawn:\n{rendered}"
        );
        for row in overlay_rows {
            assert!(
                !row.contains("TRANSCRIPT_BLEED_MARKER_"),
                "transcript bleeds through the popup: {row:?}"
            );
        }
    }

    /// Regression: a resize was reported as resetting the transcript to the
    /// welcome state. The view has to survive every width it is drawn at.
    #[test]
    fn the_transcript_survives_a_resize() {
        let mut app = minimal_app();
        app.chat_messages.push(ChatMessage {
            role: ChatRole::User,
            text: "RESIZE_MARKER_57721".to_string(),
        });
        app.chat_messages.push(ChatMessage {
            role: ChatRole::Assistant,
            text: "RESIZE_REPLY_57721".to_string(),
        });

        for (width, height) in [(100u16, 30u16), (60, 20), (100, 30), (180, 50)] {
            let rendered = draw_app(&app, width, height);
            assert!(
                rendered.contains("RESIZE_REPLY_57721"),
                "transcript lost at {width}x{height}:\n{rendered}"
            );
            assert!(
                !rendered.contains("Welcome to AGI"),
                "a live conversation must never fall back to the welcome state"
            );
        }
    }

    /// Regression: the header and `/status` printed the provider as a Rust
    /// `Debug` dump, complete with the base URL and the key's env var name, and
    /// each one cased it differently.
    #[test]
    fn the_provider_reads_as_a_display_name_in_the_header_and_status() {
        use crate::design_system::provider_label;

        let deepseek = crate::models::deepseek_provider();
        assert_eq!(provider_label(&deepseek), "DeepSeek");
        assert_eq!(provider_label(&crate::models::openai_provider()), "OpenAI");
        assert_eq!(provider_label(&crate::models::xai_provider()), "xAI");
        assert_eq!(
            provider_label(&crate::models::Provider::ManagedCloud),
            "AGI Cloud"
        );

        let mut app = minimal_app();
        app.session.provider = deepseek;
        app.sync_stats();

        let rendered = draw_app(&app, 100, 30);
        assert!(rendered.contains("DeepSeek"), "{rendered}");
        for leak in ["OpenAICompatible", "api_key_env", "base_url"] {
            assert!(!rendered.contains(leak), "header leaks {leak}:\n{rendered}");
        }

        match handle_slash("/status", &mut app) {
            SlashResult::StatusReport(message) => {
                assert!(message.contains("Provider: DeepSeek"), "{message}");
                assert!(!message.contains("api_key_env"), "{message}");
            }
            _ => panic!("/status must report in place"),
        }
    }

    /// The sandbox backend moved out of the footer (see
    /// `footer_keeps_tokens_and_turns_at_every_width`) into `/status`, using
    /// the same word `crate::sandbox::status_word` gives the rest of the app.
    #[test]
    fn status_reports_the_sandbox_backend() {
        let mut app = minimal_app();

        app.sandbox_type = Some(crate::sandbox::SandboxType::MacosSeatbelt);
        match handle_slash("/status", &mut app) {
            SlashResult::StatusReport(message) => {
                assert!(message.contains("Sandbox: seatbelt"), "{message}");
            }
            _ => panic!("/status must report in place"),
        }

        app.sandbox_type = None;
        match handle_slash("/status", &mut app) {
            SlashResult::StatusReport(message) => {
                assert!(message.contains("Sandbox: no sandbox"), "{message}");
            }
            _ => panic!("/status must report in place"),
        }
    }

    #[test]
    fn approval_modal_composites_over_chrome_instead_of_blanking_it() {
        use crate::tui::widgets::approval_overlay::ApprovalOverlayState;
        use ratatui::backend::TestBackend;

        let chat_messages = vec![ChatMessage {
            role: ChatRole::Assistant,
            text: "UNIQUE_TRANSCRIPT_MARKER_314159".to_string(),
        }];
        let tool_cells: Vec<ToolCell> = Vec::new();
        let statusline_cfg = crate::tui::widgets::statusline_setup::StatusLineConfig::default();
        let ctx = FrameCtx {
            workspace_pane: None,
            model_name: "fixture-local-model:latest",
            statusline: &statusline_cfg,
            provider_name: "ollama",
            git_branch: None,
            context_window: None,
            working_path: String::new(),
            total_input_tokens: 10,
            total_output_tokens: 5,
            turn_count: 1,
            context: ContextSnapshot {
                percent: 1,
                used_tokens: 0,
                limit_tokens: 0,
            },
            chrome: quiet_chrome(),
            chat_messages: &chat_messages,
            tool_cells: &tool_cells,
            is_loading: true,
            stream_start: None,
            stream_buffer: "",
            spinner_char: "⠋",
            loading_verb: "Reasoning",
            awaiting_approval: false,
            scroll_offset: 0,
            access_mode: crate::design_system::AccessMode::Local,
            privacy_mode: crate::agent::PrivacyMode::Local,
            mode: InteractionMode::Chat,
            effort_label: "Medium",
            cost_str: "0 credits".to_string(),
            notice: None,
            quit_key: Some("ctrl+d"),
        };

        let mut overlay = ApprovalOverlayState::default();
        overlay.open(
            "Allow write_file to modify:",
            vec!["src/main.rs (+1 / -0 lines)".to_string()],
        );

        let mut terminal = Terminal::new(TestBackend::new(100, 30)).expect("terminal");
        terminal
            .draw(|frame| {
                let chat_area = draw_turn_chrome(frame, &ctx);
                overlay.render_into(frame, chat_area);
            })
            .expect("draw");

        let rendered: String = terminal
            .backend()
            .buffer()
            .content()
            .iter()
            .map(|cell| cell.symbol())
            .collect();

        assert!(
            rendered.contains("Tool Approval"),
            "approval box must be drawn"
        );
        assert!(
            rendered.contains("fixture-local-model:latest"),
            "header chrome must still be visible under the approval overlay, not blanked"
        );
        assert!(
            rendered.contains("UNIQUE_TRANSCRIPT_MARKER_314159"),
            "transcript content must still be visible under the approval overlay, not blanked"
        );
        assert!(
            rendered.contains("Esc or Ctrl-C to cancel") || rendered.contains("working"),
            "composer/status chrome must still be visible under the approval overlay, not blanked"
        );
    }

    // -----------------------------------------------------------------------
    // Header and footer layout at the three widths a developer actually uses.
    // Both are drawn against a real `TestBackend`, so the snapshots capture the
    // border characters and the abbreviation tier, not just the field values.
    // -----------------------------------------------------------------------

    fn layout_fixture_ctx<'a>(
        statusline: &'a crate::tui::widgets::statusline_setup::StatusLineConfig,
        chat_messages: &'a [ChatMessage],
        tool_cells: &'a [ToolCell],
        effort_label: &'a str,
        notice: Option<&'a str>,
    ) -> FrameCtx<'a> {
        FrameCtx {
            workspace_pane: None,
            model_name: "fixture-flagship",
            statusline,
            provider_name: "anthropic",
            git_branch: None,
            context_window: Some(200_000),
            working_path: "~/projects/fixture".to_string(),
            total_input_tokens: 1_234,
            total_output_tokens: 567,
            turn_count: 3,
            context: ContextSnapshot {
                percent: 42,
                used_tokens: 0,
                limit_tokens: 0,
            },
            chrome: quiet_chrome(),
            chat_messages,
            tool_cells,
            is_loading: false,
            stream_start: None,
            stream_buffer: "",
            spinner_char: "⠋",
            loading_verb: "Reasoning",
            awaiting_approval: false,
            scroll_offset: 0,
            access_mode: crate::design_system::AccessMode::Byok,
            privacy_mode: crate::agent::PrivacyMode::Byok,
            mode: InteractionMode::Chat,
            effort_label,
            cost_str: "Tokens: 1234 in / 567 out (billed by your provider)".to_string(),
            notice,
            quit_key: Some("ctrl+d"),
        }
    }

    fn draw_header(width: u16) -> String {
        use ratatui::backend::TestBackend;
        let statusline = shipped_statusline();
        let messages: Vec<ChatMessage> = Vec::new();
        let cells: Vec<ToolCell> = Vec::new();
        let ctx = layout_fixture_ctx(&statusline, &messages, &cells, "High", None);
        let mut terminal = Terminal::new(TestBackend::new(width, HEADER_ROWS)).expect("terminal");
        terminal
            .draw(|frame| render_header(frame, Rect::new(0, 0, width, HEADER_ROWS), &ctx))
            .expect("draw");
        buffer_rows(&terminal, width)
    }

    fn draw_footer(width: u16, effort_label: &str, notice: Option<&str>) -> String {
        use ratatui::backend::TestBackend;
        let statusline = shipped_statusline();
        let messages: Vec<ChatMessage> = Vec::new();
        let cells: Vec<ToolCell> = Vec::new();
        let ctx = layout_fixture_ctx(&statusline, &messages, &cells, effort_label, notice);
        let mut terminal = Terminal::new(TestBackend::new(width, 1)).expect("terminal");
        terminal
            .draw(|frame| render_status_bar(frame, Rect::new(0, 0, width, 1), &ctx))
            .expect("draw");
        buffer_rows(&terminal, width)
    }

    /// Draw the whole idle frame the way `render` does, against a `TestBackend`.
    fn draw_app(app: &TuiApp, width: u16, height: u16) -> String {
        use ratatui::backend::TestBackend;
        let mut terminal = Terminal::new(TestBackend::new(width, height)).expect("terminal");
        terminal
            .draw(|frame| {
                draw_app_frame(frame, app);
            })
            .expect("draw");
        buffer_rows(&terminal, width)
    }

    fn buffer_rows(terminal: &Terminal<ratatui::backend::TestBackend>, width: u16) -> String {
        let symbols: Vec<String> = terminal
            .backend()
            .buffer()
            .content()
            .iter()
            .map(|cell| cell.symbol().to_string())
            .collect();
        symbols
            .chunks(width as usize)
            .map(|row| row.concat().trim_end().to_string())
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// The status-line fields `TuiApp::new` actually ships with, which differ
    /// from `StatusLineConfig::default()`.
    fn shipped_statusline() -> crate::tui::widgets::statusline_setup::StatusLineConfig {
        crate::tui::widgets::statusline_setup::StatusLineConfig {
            show_model: false,
            show_tokens: false,
            show_cost: true,
            show_branch: false,
            show_mode: true,
            show_context: false,
        }
    }

    #[test]
    fn header_border_is_unbroken_at_every_width() {
        for width in [120u16, 80, 40] {
            let rendered = draw_header(width);
            let rows: Vec<&str> = rendered.lines().collect();
            assert_eq!(rows.len(), 4, "header is four rows at {width}");
            assert!(
                rows[0].starts_with('┌') && rows[0].ends_with('┐'),
                "top border must open and close at {width}: {}",
                rows[0]
            );
            for content in &rows[1..3] {
                assert!(
                    content.starts_with('│') && content.ends_with('│'),
                    "content rows must keep both borders at {width}: {content}"
                );
            }
            assert!(
                rows[3].starts_with('├') && rows[3].ends_with('┤'),
                "the header/transcript divider must be a tee, not a closed box, at {width}: {}",
                rows[3]
            );
            assert!(
                !rows[3].contains('└') && !rows[3].contains('┘'),
                "a `└┘` here closes a box the transcript then continues inside, at {width}"
            );
        }
    }

    #[test]
    fn header_shows_the_context_window_and_working_path() {
        let rendered = draw_header(160);
        let content = rendered.lines().nth(1).expect("content row");
        assert!(
            content.contains("fixture-flagship (200K context)"),
            "{content}"
        );
        assert!(content.contains("~/projects/fixture"), "{content}");

        let narrow = draw_header(80);
        let content = narrow.lines().nth(1).expect("content row");
        assert!(content.contains("(200K context)"), "{content}");
        assert!(!content.contains("~/projects"), "{content}");
        assert!(content.ends_with('│'), "{content}");

        let tight = draw_header(40);
        let content = tight.lines().nth(1).expect("content row");
        assert!(!content.contains("context"), "{content}");
    }

    #[test]
    fn context_window_label_reads_in_thousands_and_millions() {
        assert_eq!(context_window_label(200_000), "200K context");
        assert_eq!(context_window_label(128_000), "128K context");
        assert_eq!(context_window_label(1_000_000), "1M context");
        assert_eq!(context_window_label(1_048_576), "1M context");
        assert_eq!(context_window_label(2_500_000), "2.5M context");
        assert_eq!(context_window_label(512), "512 context");
    }

    #[test]
    fn header_context_label_comes_from_the_catalog_only() {
        let model = crate::model_catalog::default_model();
        assert_eq!(
            model_context_window(model),
            crate::model_catalog::find(model).map(|entry| entry.context_window)
        );
        assert_eq!(model_context_window("fixture-unknown-model"), None);
    }

    #[test]
    fn header_snapshot_120_80_40() {
        insta::assert_snapshot!("header_120", draw_header(120));
        insta::assert_snapshot!("header_80", draw_header(80));
        insta::assert_snapshot!("header_40", draw_header(40));
    }

    #[test]
    fn footer_snapshot_120_80_40() {
        insta::assert_snapshot!("footer_120", draw_footer(120, "High", None));
        insta::assert_snapshot!("footer_80", draw_footer(80, "High", None));
        insta::assert_snapshot!("footer_40", draw_footer(40, "High", None));
    }

    /// Token counts and the turn count are the footer's own stats now that the
    /// header and border HUD no longer duplicate them, so neither abbreviates
    /// away to nothing. The sandbox backend moved to `/status`, see
    /// `status_reports_the_sandbox_backend`.
    #[test]
    fn footer_keeps_tokens_and_turns_at_every_width() {
        for width in [120u16, 80, 40] {
            let rendered = draw_footer(width, "High", None);
            assert!(
                rendered.contains("1.2K") && rendered.contains("567"),
                "token counts dropped at {width}: {rendered}"
            );
            assert!(
                rendered.contains("T3"),
                "turn count dropped at {width}: {rendered}"
            );
            assert!(
                rendered.contains("High") || rendered.contains("e:H"),
                "effort dropped at {width}: {rendered}"
            );
            assert!(
                display_width(&rendered) <= width as usize,
                "footer overflows {width} columns: {rendered}"
            );
        }
    }

    /// Regression: at 100 and 60 columns the footer showed neither the cost
    /// readout nor the `/` and quit hints, with no ellipsis to say anything was
    /// hidden, so a user on a normal terminal never learned they existed.
    #[test]
    fn the_cost_and_the_slash_hint_survive_a_normal_terminal_width() {
        for width in [180u16, 120, 100, 60] {
            let rendered = draw_footer(width, "High", None);
            assert!(
                rendered.contains("1.2K") && rendered.contains("567"),
                "cost readout dropped at {width}: {rendered}"
            );
            assert!(
                rendered.contains("/: commands") || rendered.contains("/ cmds"),
                "slash hint dropped at {width}: {rendered}"
            );
            assert!(
                display_width(&rendered) <= width as usize,
                "footer overflows {width} columns: {rendered}"
            );
        }

        // At 60 the row abbreviates rather than dropping, and buys back the
        // quit hint as well.
        let narrow = draw_footer(60, "High", None);
        assert!(narrow.contains("ctrl+d quit"), "{narrow}");
    }

    #[test]
    fn a_wide_footer_reads_in_out_cost_and_turns_with_middle_dots() {
        let statusline = shipped_statusline();
        let messages: Vec<ChatMessage> = Vec::new();
        let cells: Vec<ToolCell> = Vec::new();
        let mut ctx = layout_fixture_ctx(&statusline, &messages, &cells, "High", None);
        ctx.cost_str = "0 credits".to_string();
        let mut terminal =
            Terminal::new(ratatui::backend::TestBackend::new(160, 1)).expect("terminal");
        terminal
            .draw(|frame| render_status_bar(frame, Rect::new(0, 0, 160, 1), &ctx))
            .expect("draw");
        let rendered = buffer_rows(&terminal, 160);

        assert!(
            rendered.contains("in 1.2K · out 567 · 0 credits · T3"),
            "{rendered}"
        );
        assert!(
            !rendered.contains('↑') && !rendered.contains('↓'),
            "{rendered}"
        );
        assert!(rendered.contains("Your key  ctx ["), "{rendered}");
    }

    /// The footer reports the session's own effort, not a hardcoded default.
    #[test]
    fn footer_reports_the_session_effort() {
        let high = draw_footer(120, "High", None);
        assert!(high.contains("High"), "{high}");
        assert!(!high.contains("Medium"), "{high}");
        let max = draw_footer(120, "Max", None);
        assert!(max.contains("Max"), "{max}");
    }

    /// A first Ctrl-C has to say what it did somewhere the user is looking.
    #[test]
    fn footer_shows_a_transient_notice() {
        let rendered = draw_footer(
            120,
            "High",
            Some("nothing to interrupt · Ctrl-C again to exit"),
        );
        assert!(
            rendered.contains("Ctrl-C again to exit"),
            "the notice must reach the status line: {rendered}"
        );
    }

    #[test]
    fn a_first_ctrl_c_explains_itself_in_the_status_line() {
        let mut app = minimal_app();
        let ctrl_c = crossterm::event::KeyEvent::new(
            crossterm::event::KeyCode::Char('c'),
            crossterm::event::KeyModifiers::CONTROL,
        );

        assert!(app.live_notice().is_none(), "no notice before any keypress");
        let action = handle_key_event(&mut app, ctrl_c);
        assert!(matches!(action, InputAction::None));
        assert!(
            app.live_notice()
                .is_some_and(|n| n.contains("Ctrl-C again to exit")),
            "the first Ctrl-C must report what it did, got {:?}",
            app.live_notice()
        );
    }

    #[test]
    fn clearing_a_written_composer_says_so() {
        let mut app = minimal_app();
        app.input = "half a thought".to_string();
        app.cursor = app.input.len();
        handle_key_event(
            &mut app,
            crossterm::event::KeyEvent::new(
                crossterm::event::KeyCode::Char('c'),
                crossterm::event::KeyModifiers::CONTROL,
            ),
        );
        assert!(app.input.is_empty());
        assert!(
            app.live_notice()
                .is_some_and(|n| n.contains("cleared the composer")),
            "clearing the composer must be reported, got {:?}",
            app.live_notice()
        );
    }

    /// Ratatui's own `Wrap` restarts a continuation at column 0, which puts the
    /// text hard against the panel's left border.
    #[test]
    fn wrapped_body_text_keeps_a_left_gutter() {
        let line = Line::from(Span::raw(
            "  unavailable: no credential, so this session runs local or BYOK, run login to see usage",
        ));
        let rows = crate::tui::wrap_styled_line(line, 40, 2);
        assert!(rows.len() > 1, "the fixture must actually wrap");
        for (index, row) in rows.iter().enumerate() {
            let text: String = row.spans.iter().map(|s| s.content.as_ref()).collect();
            assert!(
                text.starts_with("  "),
                "row {index} lost its gutter and sits on the border: {text:?}"
            );
            assert!(
                display_width(&text) <= 40,
                "row {index} overflows the panel: {text:?}"
            );
        }
    }

    const ESCAPE_PAYLOAD: &str = "\u{1b}]52;c;cm0gLXJmIC8=\u{7}\u{1b}[2J\u{1b}[1;1H\u{1b}[31m";

    fn rendered_symbols(terminal: &Terminal<ratatui::backend::TestBackend>) -> String {
        terminal
            .backend()
            .buffer()
            .content()
            .iter()
            .map(|cell| cell.symbol())
            .collect()
    }

    fn assert_no_terminal_escapes(rendered: &str, what: &str) {
        assert!(
            !rendered.contains('\u{1b}'),
            "{what}: an ESC byte reached the frame buffer, which crossterm writes verbatim to the real terminal"
        );
        assert!(
            !rendered.contains("52;c;cm0gLXJmIC8="),
            "{what}: the OSC 52 clipboard payload survived"
        );
        assert!(
            !rendered.contains("[2J"),
            "{what}: the screen-clear CSI survived"
        );
    }

    /// Every externally-sourced string in the transcript (streamed provider
    /// chunks, system message text, and tool-cell summary/output rows)
    /// used to reach the frame buffer verbatim: `Paragraph` only skips
    /// zero-width graphemes and `unicode-width` scores ESC as one column, so
    /// crossterm printed the escape to the operator's terminal.
    #[test]
    fn transcript_frame_strips_model_and_tool_escape_sequences() {
        use ratatui::backend::TestBackend;

        let chat_messages = vec![
            ChatMessage {
                role: ChatRole::Assistant,
                text: format!("assistant {ESCAPE_PAYLOAD}reply"),
            },
            ChatMessage {
                role: ChatRole::System,
                text: format!("system {ESCAPE_PAYLOAD}notice"),
            },
        ];
        let tool_cells = vec![ToolCell {
            call_id: "call-1".to_string(),
            name: "run_command".to_string(),
            summary: format!("echo {ESCAPE_PAYLOAD}safe"),
            state: crate::tui::transcript_cell::TranscriptCellState::Complete,
            output_preview: compact_tool_output_preview(&format!("out {ESCAPE_PAYLOAD}ok")),
            timing: ToolTiming::default(),
            full_output: None,
            accent: None,
            exit_code: None,
            stderr: None,
            edits: Vec::new(),
        }];
        let stream_buffer = format!("streaming {ESCAPE_PAYLOAD}tokens");
        let statusline_cfg = crate::tui::widgets::statusline_setup::StatusLineConfig::default();
        let ctx = FrameCtx {
            workspace_pane: None,
            model_name: "fixture-local-model:latest",
            statusline: &statusline_cfg,
            provider_name: "ollama",
            git_branch: None,
            context_window: None,
            working_path: String::new(),
            total_input_tokens: 10,
            total_output_tokens: 5,
            turn_count: 1,
            context: ContextSnapshot {
                percent: 1,
                used_tokens: 0,
                limit_tokens: 0,
            },
            chrome: quiet_chrome(),
            chat_messages: &chat_messages,
            tool_cells: &tool_cells,
            is_loading: true,
            stream_start: None,
            stream_buffer: &stream_buffer,
            spinner_char: "⠋",
            loading_verb: "Reasoning",
            awaiting_approval: false,
            scroll_offset: 0,
            access_mode: crate::design_system::AccessMode::Local,
            privacy_mode: crate::agent::PrivacyMode::Local,
            mode: InteractionMode::Chat,
            effort_label: "Medium",
            cost_str: "0 credits".to_string(),
            notice: None,
            quit_key: Some("ctrl+d"),
        };

        let mut terminal = Terminal::new(TestBackend::new(120, 60)).expect("terminal");
        terminal
            .draw(|frame| {
                draw_turn_chrome(frame, &ctx);
            })
            .expect("draw");

        let rendered = rendered_symbols(&terminal);
        assert_no_terminal_escapes(&rendered, "transcript frame");
        assert!(
            rendered.contains("streaming") && rendered.contains("tokens"),
            "streamed text must still be shown: {rendered:?}"
        );
    }

    /// The approval and elicitation modals composite an overlay over the chrome;
    /// both the styled path (diff review) and the plain-text path (every other
    /// `InteractiveView`) painted server-supplied text straight into the buffer.
    #[test]
    fn overlay_frame_strips_escape_sequences_from_both_render_paths() {
        use crate::tui::widgets::diff_review::{DiffReviewView, FileDiff};
        use ratatui::backend::TestBackend;

        let chat_messages: Vec<ChatMessage> = Vec::new();
        let tool_cells: Vec<ToolCell> = Vec::new();
        let statusline_cfg = crate::tui::widgets::statusline_setup::StatusLineConfig::default();
        let ctx = FrameCtx {
            workspace_pane: None,
            model_name: "fixture-local-model:latest",
            statusline: &statusline_cfg,
            provider_name: "ollama",
            git_branch: None,
            context_window: None,
            working_path: String::new(),
            total_input_tokens: 0,
            total_output_tokens: 0,
            turn_count: 0,
            context: ContextSnapshot {
                percent: 0,
                used_tokens: 0,
                limit_tokens: 0,
            },
            chrome: quiet_chrome(),
            chat_messages: &chat_messages,
            tool_cells: &tool_cells,
            is_loading: false,
            stream_start: None,
            stream_buffer: "",
            spinner_char: "⠋",
            loading_verb: "Reasoning",
            awaiting_approval: false,
            scroll_offset: 0,
            access_mode: crate::design_system::AccessMode::Local,
            privacy_mode: crate::agent::PrivacyMode::Local,
            mode: InteractionMode::Chat,
            effort_label: "Medium",
            cost_str: "0 credits".to_string(),
            notice: None,
            quit_key: Some("ctrl+d"),
        };

        let diff_review = DiffReviewView::new(vec![FileDiff::new(
            "src/main.rs",
            vec![format!("+ let ok = {ESCAPE_PAYLOAD}true;")],
            1,
            0,
        )]);
        let mut terminal = Terminal::new(TestBackend::new(120, 40)).expect("terminal");
        terminal
            .draw(|frame| {
                let chat_area = draw_turn_chrome(frame, &ctx);
                render_overlay(frame, chat_area, &diff_review, 0);
            })
            .expect("draw");
        assert_no_terminal_escapes(&rendered_symbols(&terminal), "diff review overlay");

        let mut elicitation =
            crate::tui::widgets::elicitation_overlay::ElicitationOverlayState::default();
        elicitation.open(
            format!("evil{ESCAPE_PAYLOAD}server"),
            crate::mcp::elicitation::ElicitationRequest {
                message: format!("Approve {ESCAPE_PAYLOAD}this"),
                requested_schema: serde_json::json!({
                    "properties": {"note": {"type": "string", "default": ESCAPE_PAYLOAD}}
                }),
                mode: crate::mcp::elicitation::ElicitationMode::Form,
                url: None,
                elicitation_id: None,
            },
        );
        terminal
            .draw(|frame| {
                let chat_area = draw_turn_chrome(frame, &ctx);
                render_overlay(frame, chat_area, &elicitation, 0);
            })
            .expect("draw");
        assert_no_terminal_escapes(&rendered_symbols(&terminal), "elicitation overlay");
    }

    /// Always Allow for a command no rule may be saved for would be a button
    /// that always fails, so the modal leaves it out.
    #[test]
    fn approval_modal_offers_always_allow_only_where_a_rule_can_be_saved() {
        use crate::tui::approval_broker::{ApprovalRequest, ApprovalRequestKind};

        let offers = |kind: ApprovalRequestKind| {
            !approval_overlay_for(
                &ApprovalRequest::new(kind, "Allow this?", Vec::new()).saving_always_allow(true),
            )
            .always_allow_unavailable
        };
        let exec = |command: &str| ApprovalRequestKind::Exec {
            command: command.to_string(),
        };

        assert!(offers(exec("cargo test")));
        assert!(
            approval_overlay_for(&ApprovalRequest::new(
                exec("cargo test"),
                "Allow this?",
                Vec::new()
            ))
            .always_allow_unavailable,
            "a request that saves no rule never offers one"
        );
        assert!(!offers(exec("python3 -c 'print(1)'")));
        assert!(!offers(exec("bash -c ls")));
        assert!(!offers(exec("git status && rm -rf ./src")));
        assert!(offers(ApprovalRequestKind::FileWrite {
            path: std::path::PathBuf::from("src/main.rs"),
        }));
    }

    #[test]
    fn the_start_view_hints_are_one_sentence_each_and_never_say_esc_quits() {
        let app = minimal_app();
        let rendered = draw_app(&app, 120, 40);
        for hint in [
            "Choose Local, Your key, or Managed with /model.",
            "Type a message and press Enter to send.",
            "Type / for commands · Shift+Tab to change how much AGI does alone.",
            "Esc clears · Ctrl+D twice to quit · /keys for all keys.",
        ] {
            assert!(rendered.contains(hint), "missing {hint:?}:\n{rendered}");
        }
        assert!(!rendered.contains("Esc to quit"), "{rendered}");
        assert!(!rendered.contains("for example"), "{rendered}");
    }

    #[test]
    fn the_empty_composer_placeholder_is_one_short_hint() {
        let app = minimal_app();
        let rendered = draw_app(&app, 120, 40);
        assert!(
            rendered.contains("Message AGI...  / for commands"),
            "{rendered}"
        );
        assert!(!rendered.contains("Ctrl-J newline"), "{rendered}");
    }

    #[test]
    fn a_commit_approval_names_the_subject_and_declining_it_denies() {
        use crate::tui::approval_broker::{ApprovalRequest, ApprovalRequestKind};
        use crate::tui::widgets::approval_overlay::ApprovalChoice;
        use crate::tui::widgets::interactive::{InteractiveView, KeyAction};

        let message = "fix(routing): read the live snapshot\n\nThe router cached a stale one.";
        let argv = crate::platform::runtime::git::GitOperation::Commit {
            message: message.to_string(),
        }
        .argv()
        .expect("argv");
        let request = ApprovalRequest::new(
            ApprovalRequestKind::Git {
                tool_name: "git_commit".to_string(),
                target: format!("git {}", argv.join(" ")),
            },
            "Run git_commit in /repo?",
            vec![format!("git {}", argv.join(" "))],
        );

        let mut overlay = approval_overlay_for(&request);
        assert_eq!(
            overlay.detail.first().map(String::as_str),
            Some("Commit: fix(routing): read the live snapshot")
        );

        let mut terminal =
            Terminal::new(ratatui::backend::TestBackend::new(120, 30)).expect("terminal");
        terminal
            .draw(|frame| overlay.render_into(frame, frame.area()))
            .expect("draw");
        assert!(
            rendered_symbols(&terminal).contains("Commit: fix(routing): read the live snapshot")
        );

        overlay.handle_key(KeyAction::Char('n'));
        let choice = overlay.result.expect("n answers the prompt");
        assert_eq!(choice, ApprovalChoice::No);
        let decision = approval_choice_to_decision(choice);
        assert!(
            !crate::tools::approval_allows(decision),
            "declining must not let the commit run"
        );
    }

    /// A tool-approval request carries the model's own command line and diff
    /// hunks; the overlay painted them verbatim right above the y/n prompt.
    #[test]
    fn approval_modal_strips_escape_sequences_from_summary_and_detail() {
        use crate::tui::approval_broker::{ApprovalRequest, ApprovalRequestKind};
        use ratatui::backend::TestBackend;

        let request = ApprovalRequest::new(
            ApprovalRequestKind::Exec {
                command: "rm -rf /".to_string(),
            },
            format!("Allow run_command {ESCAPE_PAYLOAD}(safe)?"),
            vec![format!("$ rm -rf / {ESCAPE_PAYLOAD}--dry-run")],
        );

        let overlay = approval_overlay_for(&request);

        let mut terminal = Terminal::new(TestBackend::new(120, 30)).expect("terminal");
        terminal
            .draw(|frame| {
                overlay.render_into(frame, frame.area());
            })
            .expect("draw");
        assert_no_terminal_escapes(&rendered_symbols(&terminal), "approval overlay");
    }

    #[test]
    fn pasted_text_cannot_carry_escapes_into_the_composer() {
        let mut app = minimal_app();
        handle_paste_text(&mut app, &format!("git {ESCAPE_PAYLOAD}push"));

        assert_eq!(app.input, "git push");
        assert_eq!(app.cursor, app.input.len());
    }

    /// The header and status bar are chrome, but their fields are not ours:
    /// the model id comes from a config file the agent can write, and the
    /// branch name from the checkout. Both were painted verbatim.
    #[test]
    fn chrome_frame_strips_escapes_from_header_and_status_bar() {
        use ratatui::backend::TestBackend;

        let model_name = format!("local{ESCAPE_PAYLOAD}model");
        let branch = format!("feature{ESCAPE_PAYLOAD}main");
        let chat_messages: Vec<ChatMessage> = Vec::new();
        let tool_cells: Vec<ToolCell> = Vec::new();
        let statusline_cfg = crate::tui::widgets::statusline_setup::StatusLineConfig {
            show_model: true,
            show_tokens: true,
            show_cost: true,
            show_branch: true,
            show_mode: true,
            show_context: false,
        };
        let ctx = FrameCtx {
            workspace_pane: None,
            model_name: &model_name,
            statusline: &statusline_cfg,
            provider_name: "ollama",
            git_branch: Some(&branch),
            context_window: None,
            working_path: String::new(),
            total_input_tokens: 0,
            total_output_tokens: 0,
            turn_count: 0,
            context: ContextSnapshot {
                percent: 0,
                used_tokens: 0,
                limit_tokens: 0,
            },
            chrome: quiet_chrome(),
            chat_messages: &chat_messages,
            tool_cells: &tool_cells,
            is_loading: true,
            stream_start: None,
            stream_buffer: "",
            spinner_char: "⠋",
            loading_verb: "Reasoning",
            awaiting_approval: false,
            scroll_offset: 0,
            access_mode: crate::design_system::AccessMode::Local,
            privacy_mode: crate::agent::PrivacyMode::Local,
            mode: InteractionMode::Chat,
            effort_label: "Medium",
            cost_str: "0 credits".to_string(),
            notice: None,
            quit_key: Some("ctrl+d"),
        };

        let mut terminal = Terminal::new(TestBackend::new(200, 40)).expect("terminal");
        terminal
            .draw(|frame| {
                draw_turn_chrome(frame, &ctx);
            })
            .expect("draw");

        let rendered = rendered_symbols(&terminal);
        assert_no_terminal_escapes(&rendered, "header and status bar");
        assert!(
            rendered.contains("localmodel"),
            "the model label must still be shown: {rendered:?}"
        );
    }

    /// The composer is repainted every tick from `app.input`, which is not
    /// only keystrokes: paste and the `/continue-with-*` draft both write to
    /// it, so the paint itself is the gate.
    #[test]
    fn composer_and_fallback_banner_frames_strip_escapes() {
        use ratatui::backend::TestBackend;

        let mut app = minimal_app();
        app.input = format!("send {ESCAPE_PAYLOAD}this");
        app.cursor = app.input.len();
        *app.fallback_banner.lock().expect("banner slot") = Some(FallbackBanner {
            from: format!("primary{ESCAPE_PAYLOAD}model"),
            to: format!("backup{ESCAPE_PAYLOAD}model"),
            reason: format!("provider said {ESCAPE_PAYLOAD}overloaded"),
            shown_at: Instant::now(),
        });

        let mut terminal = Terminal::new(TestBackend::new(200, 20)).expect("terminal");
        terminal
            .draw(|frame| {
                let area = frame.area();
                render_input(
                    frame,
                    Rect {
                        x: 0,
                        y: 0,
                        width: area.width,
                        height: 3,
                    },
                    &app,
                );
                render_fallback_banner(
                    frame,
                    Rect {
                        x: 0,
                        y: 4,
                        width: area.width,
                        height: 3,
                    },
                    &app,
                );
            })
            .expect("draw");

        let rendered = rendered_symbols(&terminal);
        assert_no_terminal_escapes(&rendered, "composer and fallback banner");
        assert!(
            rendered.contains("send this"),
            "the composed text must still be shown: {rendered:?}"
        );
        assert!(
            rendered.contains("Falling back"),
            "the fallback banner must still be shown: {rendered:?}"
        );
    }
    fn tool_cell_in(state: crate::tui::transcript_cell::TranscriptCellState) -> ToolCell {
        ToolCell {
            call_id: "call".into(),
            name: "read_file".into(),
            summary: String::new(),
            state,
            output_preview: None,
            timing: ToolTiming::default(),
            full_output: None,
            accent: None,
            exit_code: None,
            stderr: None,
            edits: Vec::new(),
        }
    }

    fn draw_header_for(ctx: &FrameCtx, width: u16) -> String {
        let mut terminal = Terminal::new(ratatui::backend::TestBackend::new(width, HEADER_ROWS))
            .expect("terminal");
        terminal
            .draw(|frame| render_header(frame, Rect::new(0, 0, width, HEADER_ROWS), ctx))
            .expect("draw");
        buffer_rows(&terminal, width)
    }

    fn draw_footer_for(ctx: &FrameCtx, width: u16) -> String {
        let mut terminal =
            Terminal::new(ratatui::backend::TestBackend::new(width, 1)).expect("terminal");
        terminal
            .draw(|frame| render_status_bar(frame, Rect::new(0, 0, width, 1), ctx))
            .expect("draw");
        buffer_rows(&terminal, width)
    }

    #[test]
    fn the_header_counts_what_the_turn_is_doing() {
        use crate::tui::transcript_cell::TranscriptCellState::{Complete, Failed, Running};
        let statusline = shipped_statusline();
        let messages: Vec<ChatMessage> = Vec::new();
        let cells = vec![
            tool_cell_in(Complete),
            tool_cell_in(Complete),
            tool_cell_in(Running),
            tool_cell_in(Failed),
        ];
        let mut ctx = layout_fixture_ctx(&statusline, &messages, &cells, "High", None);
        assert_eq!(
            activity_counts(&ctx),
            ActivityCounts {
                awaiting: 0,
                working: 1,
                completed: 2,
                failed: 1
            }
        );

        ctx.awaiting_approval = true;
        assert_eq!(
            activity_counts(&ctx),
            ActivityCounts {
                awaiting: 1,
                working: 0,
                completed: 2,
                failed: 1
            }
        );
        let header = draw_header_for(&ctx, 120);
        assert!(
            header.contains("1 awaiting input · 0 working · 2 completed · 1 failed"),
            "{header}"
        );
    }

    #[test]
    fn a_turn_still_thinking_before_any_tool_call_counts_as_working() {
        let statusline = shipped_statusline();
        let messages: Vec<ChatMessage> = Vec::new();
        let cells: Vec<ToolCell> = Vec::new();
        let mut ctx = layout_fixture_ctx(&statusline, &messages, &cells, "High", None);
        ctx.is_loading = true;
        assert_eq!(activity_counts(&ctx).working, 1);
        ctx.is_loading = false;
        assert_eq!(activity_counts(&ctx).working, 0);
    }

    #[test]
    fn the_header_shows_the_counts_left_and_the_context_meter_right() {
        let statusline = shipped_statusline();
        let messages: Vec<ChatMessage> = Vec::new();
        let cells: Vec<ToolCell> = Vec::new();
        let ctx = layout_fixture_ctx(&statusline, &messages, &cells, "High", None);
        let header = draw_header_for(&ctx, 120);
        let row = header.lines().nth(2).expect("the status row");
        assert!(
            row.contains("0 awaiting input · 0 working · 0 completed"),
            "{header}"
        );
        assert!(
            row.trim_end_matches('│').trim_end().ends_with("42%"),
            "{header}"
        );
        assert!(row.contains("context ████"), "{header}");
        assert!(
            row.find("awaiting").unwrap() < row.find("context").unwrap(),
            "{header}"
        );
    }

    #[test]
    fn a_narrow_header_shortens_the_counts_before_it_drops_the_meter() {
        let statusline = shipped_statusline();
        let messages: Vec<ChatMessage> = Vec::new();
        let cells: Vec<ToolCell> = Vec::new();
        let ctx = layout_fixture_ctx(&statusline, &messages, &cells, "High", None);
        let sixty = draw_header_for(&ctx, 60);
        assert!(sixty.contains("0 awaiting · 0 working · 0 done"), "{sixty}");
        assert!(sixty.contains("42%"), "{sixty}");
        for width in [60u16, 40, 20] {
            for row in draw_header_for(&ctx, width).lines() {
                assert!(display_width(row) <= width as usize, "{width}: {row}");
            }
        }
    }

    #[test]
    fn the_context_meter_fills_with_the_percentage() {
        assert_eq!(context_meter_label(0), "context ░░░░░░░░░░ 0% ".to_string());
        assert_eq!(
            context_meter_label(50),
            "context █████░░░░░ 50% ".to_string()
        );
        assert_eq!(
            context_meter_label(100),
            "context ██████████ 100% ".to_string()
        );
    }

    #[test]
    fn the_footer_reports_the_browser_pairing_from_the_last_check() {
        use crate::browser_bridge::BrowserAvailability::{
            NotPaired, Paired, PairedNotAnswering, ShellNotRunning,
        };
        let statusline = shipped_statusline();
        let messages: Vec<ChatMessage> = Vec::new();
        let cells: Vec<ToolCell> = Vec::new();
        let mut ctx = layout_fixture_ctx(&statusline, &messages, &cells, "High", None);
        for (state, expected) in [
            (Paired, Some("browser paired · /chrome")),
            (PairedNotAnswering, Some("browser not answering · /chrome")),
            (NotPaired, Some("browser not paired · /chrome")),
            (ShellNotRunning, None),
        ] {
            ctx.chrome.browser = state;
            let footer = draw_footer_for(&ctx, 220);
            match expected {
                Some(text) => assert!(footer.contains(text), "{state:?}: {footer}"),
                None => assert!(!footer.contains("browser"), "{state:?}: {footer}"),
            }
        }
    }

    #[test]
    fn a_narrow_footer_drops_the_browser_label_before_any_indicator() {
        let statusline = shipped_statusline();
        let messages: Vec<ChatMessage> = Vec::new();
        let cells: Vec<ToolCell> = Vec::new();
        let mut ctx = layout_fixture_ctx(&statusline, &messages, &cells, "High", None);
        ctx.chrome.browser = crate::browser_bridge::BrowserAvailability::Paired;
        let footer = draw_footer_for(&ctx, 60);
        assert!(!footer.contains("browser"), "{footer}");
        assert!(footer.contains("T3") && footer.contains("42%"), "{footer}");
    }

    #[test]
    fn the_context_item_shows_used_and_available_tokens_when_it_is_on() {
        let mut statusline = shipped_statusline();
        let messages: Vec<ChatMessage> = Vec::new();
        let cells: Vec<ToolCell> = Vec::new();
        let mut ctx = layout_fixture_ctx(&statusline, &messages, &cells, "High", None);
        ctx.context = ContextSnapshot {
            percent: 42,
            used_tokens: 84_000,
            limit_tokens: 200_000,
        };
        assert!(!draw_footer_for(&ctx, 220).contains("context:"));

        statusline.show_context = true;
        let mut ctx = layout_fixture_ctx(&statusline, &messages, &cells, "High", None);
        ctx.context = ContextSnapshot {
            percent: 42,
            used_tokens: 84_000,
            limit_tokens: 200_000,
        };
        assert!(draw_footer_for(&ctx, 220).contains("context:84.0K/200.0K"));
    }

    fn picker_candidates(ids: &[&str]) -> Vec<(String, crate::design_system::ProviderId)> {
        ids.iter()
            .map(|id| (id.to_string(), crate::design_system::ProviderId::AGICloud))
            .collect()
    }

    #[test]
    fn cycling_steps_to_the_next_model_and_wraps() {
        let models = picker_candidates(&["a", "b", "c"]);
        let any = |_: &str, _| true;
        assert_eq!(next_cycle_model(&models, "a", any).unwrap().0, "b");
        assert_eq!(next_cycle_model(&models, "c", any).unwrap().0, "a");
        assert_eq!(next_cycle_model(&models, "not-listed", any).unwrap().0, "a");
    }

    #[test]
    fn cycling_skips_models_this_session_cannot_run() {
        let models = picker_candidates(&["a", "b", "c"]);
        let only_c = |id: &str, _| id == "c";
        assert_eq!(next_cycle_model(&models, "a", only_c).unwrap().0, "c");
        assert_eq!(next_cycle_model(&models, "c", only_c), None);
        assert_eq!(next_cycle_model(&[], "a", |_: &str, _| true), None);
    }

    #[test]
    fn the_cycle_key_switches_or_says_why_it_did_not() {
        use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
        let mut app = minimal_app();
        let action = handle_key_event(
            &mut app,
            KeyEvent::new(KeyCode::Char('p'), KeyModifiers::ALT),
        );
        assert!(matches!(action, InputAction::None));
        let (notice, _) = app.status_notice.as_ref().expect("a notice");
        assert!(
            notice.starts_with("model: ")
                || notice.starts_with("no other model")
                || notice.starts_with("model switch failed"),
            "{notice}"
        );
        assert!(app.input.is_empty());
    }

    fn edit_cell(
        tool: &str,
        input: serde_json::Value,
        state: crate::tui::transcript_cell::TranscriptCellState,
    ) -> ToolCell {
        ToolCell {
            name: tool.into(),
            summary: "src/x.rs".into(),
            edits: crate::diff_model::proposed_edits(tool, &input),
            ..tool_cell_in(state)
        }
    }

    fn cell_text(cell: &ToolCell) -> Vec<String> {
        tool_cell_lines(cell, "⠋")
            .iter()
            .map(|line| {
                line.spans
                    .iter()
                    .map(|span| span.content.as_ref())
                    .collect()
            })
            .collect()
    }

    #[test]
    fn a_finished_edit_shows_counts_header_summary_and_the_changed_lines() {
        use crate::tui::transcript_cell::TranscriptCellState::Complete;
        let cell = edit_cell(
            "edit_file",
            serde_json::json!({"path": "src/x.rs", "old_string": "a\nold", "new_string": "a\nnew\nmore"}),
            Complete,
        );
        let rows = cell_text(&cell);
        assert!(rows[0].ends_with("  +2 -1"), "{rows:?}");
        assert_eq!(rows[1].trim(), "● Update(src/x.rs)");
        assert_eq!(
            rows[2].trim(),
            "└ Updated src/x.rs with 2 additions and 1 removal"
        );
        assert_eq!(rows[3].trim(), "- old");
        assert_eq!(rows[4].trim(), "+ new");
        assert_eq!(rows[5].trim(), "+ more");
    }

    #[test]
    fn an_edit_that_has_not_finished_shows_no_counts_yet() {
        use crate::tui::transcript_cell::TranscriptCellState::Running;
        let cell = edit_cell(
            "edit_file",
            serde_json::json!({"path": "src/x.rs", "old_string": "a", "new_string": "b"}),
            Running,
        );
        let rows = cell_text(&cell);
        assert_eq!(rows.len(), 1, "{rows:?}");
        assert!(!rows[0].contains("+1"), "{rows:?}");
    }

    #[test]
    fn a_long_edit_shows_a_window_of_lines_and_says_how_many_more() {
        use crate::tui::transcript_cell::TranscriptCellState::Complete;
        let new = (0..30)
            .map(|n| format!("line {n}"))
            .collect::<Vec<_>>()
            .join("\n");
        let cell = edit_cell(
            "edit_file",
            serde_json::json!({"path": "src/x.rs", "old_string": "x", "new_string": new}),
            Complete,
        );
        let rows = cell_text(&cell);
        let changed = rows
            .iter()
            .filter(|row| row.trim_start().starts_with(['+', '-']))
            .count();
        assert_eq!(changed, EDIT_PREVIEW_LINES);
        assert!(
            rows.last().unwrap().contains("… 19 more changed lines"),
            "{rows:?}"
        );
    }

    #[test]
    fn edit_rows_carry_a_band_only_where_the_terminal_can_mix_one() {
        use crate::tui::transcript_cell::TranscriptCellState::Complete;
        let cell = edit_cell(
            "edit_file",
            serde_json::json!({"path": "src/x.rs", "old_string": "old", "new_string": "new"}),
            Complete,
        );
        let lines = tool_cell_lines(&cell, "⠋");
        let bands = crate::tui::widgets::diff_review::diff_bands();
        assert_eq!(lines[3].style.bg, bands.removed);
        assert_eq!(lines[4].style.bg, bands.added);
    }

    #[test]
    fn the_tool_events_keep_the_edit_block_only_for_a_clean_success() {
        use crate::tui::app_event::{ToolStatus, TuiAppEvent};
        let start = |cells: &mut Vec<ToolCell>| {
            apply_tool_event(
                cells,
                TuiAppEvent::ToolStarted {
                    call_id: "c1".into(),
                    name: "edit_file".into(),
                    summary: "src/x.rs".into(),
                    input: serde_json::json!({
                        "path": "src/x.rs", "old_string": "a", "new_string": "b"
                    }),
                },
            );
        };
        let complete = |cells: &mut Vec<ToolCell>, status, output: &str| {
            apply_tool_event(
                cells,
                TuiAppEvent::ToolCompleted {
                    call_id: "c1".into(),
                    name: "edit_file".into(),
                    status,
                    output: output.into(),
                    duration_ms: 5,
                },
            );
        };

        let mut cells = Vec::new();
        start(&mut cells);
        assert_eq!(cells[0].edits.len(), 1);
        complete(
            &mut cells,
            ToolStatus::Succeeded,
            "Successfully edited src/x.rs",
        );
        assert_eq!(cells[0].edits[0].additions(), 1);

        let mut failed = Vec::new();
        start(&mut failed);
        complete(&mut failed, ToolStatus::Failed, "old_string not found");
        assert!(failed[0].edits.is_empty());

        let mut rewritten = Vec::new();
        start(&mut rewritten);
        let note = crate::tools::edited_by_user_note("src/x.rs", "c");
        complete(&mut rewritten, ToolStatus::Succeeded, &note);
        assert!(rewritten[0].edits.is_empty());
    }

    #[test]
    fn the_start_screen_shows_the_version_folder_plan_recent_activity_and_whats_new() {
        let mut app = minimal_app();
        app.start_panel = StartPanel {
            plan: Some("Max 20x".to_string()),
            recent: Arc::new(std::sync::Mutex::new(Some(vec![
                "2h ago  fix the flaky test".to_string(),
                "3d ago  review the migration".to_string(),
            ]))),
        };
        let rendered = draw_app(&app, 120, 40);
        assert!(rendered.contains("Max 20x"), "{rendered}");
        assert!(
            rendered.contains(&format!("Welcome to AGI v{}", env!("CARGO_PKG_VERSION"))),
            "{rendered}"
        );
        assert!(rendered.contains("Folder "), "{rendered}");
        assert!(rendered.contains("Recent activity"), "{rendered}");
        assert!(
            rendered.contains("2h ago  fix the flaky test"),
            "{rendered}"
        );
        assert!(rendered.contains("/resume for more"), "{rendered}");
        assert!(rendered.contains("/help for more"), "{rendered}");
    }

    #[test]
    fn the_start_screen_says_so_when_there_is_no_recent_activity() {
        let mut app = minimal_app();
        app.start_panel = StartPanel::default();
        let reading = draw_app(&app, 120, 40);
        assert!(!reading.contains("Recent activity"), "{reading}");

        app.start_panel.recent = Arc::new(std::sync::Mutex::new(Some(Vec::new())));
        let rendered = draw_app(&app, 120, 40);
        assert!(rendered.contains("No recent activity"), "{rendered}");
        assert!(!rendered.contains("/resume for more"), "{rendered}");
    }

    #[test]
    fn only_a_managed_session_has_a_plan_to_name() {
        assert_eq!(
            StartPanel::new(crate::design_system::AccessMode::Byok).plan,
            None
        );
        assert_eq!(
            StartPanel::new(crate::design_system::AccessMode::Local).plan,
            None
        );
    }

    #[test]
    fn recent_activity_lists_this_folders_newest_sessions_with_their_age() {
        let session = |id: &str, cwd: &str, title: &str, ago_ms: i64, messages: i64| {
            crate::sessions::SessionSummary {
                id: id.into(),
                title: title.into(),
                model: String::new(),
                cwd: cwd.into(),
                git_branch: String::new(),
                created_at: 0,
                updated_at: 10_000_000 - ago_ms,
                total_tokens: 0,
                message_count: messages,
                archived: false,
            }
        };
        let sessions = vec![
            session("a", "/work/app", "newest here", 30_000, 4),
            session("b", "/work/other", "another folder", 40_000, 4),
            session("c", "/work/app", "empty session", 50_000, 0),
            session("d", "/work/app", "two hours back", 7_200_000, 2),
            session("e", "/work/app", "", 90_000_000, 2),
        ];
        assert_eq!(
            recent_session_rows(&sessions, "/work/app", 10_000_000),
            vec![
                "just now  newest here".to_string(),
                "2h ago  two hours back".to_string(),
                "1d ago  (untitled)".to_string(),
            ]
        );
    }

    #[test]
    fn time_ago_picks_the_largest_whole_unit() {
        assert_eq!(time_ago_label(5), "just now");
        assert_eq!(time_ago_label(60), "1m ago");
        assert_eq!(time_ago_label(3_599), "59m ago");
        assert_eq!(time_ago_label(3_600), "1h ago");
        assert_eq!(time_ago_label(172_800), "2d ago");
    }

    #[test]
    fn fast_mode_on_status_carries_the_credit_rate() {
        let priced = crate::model_catalog::catalog()
            .all()
            .iter()
            .find(|model| model.input_price_per_1m > 0.0)
            .expect("the catalog prices at least one model");
        let status = fast_mode_on_status(&priced.id);
        assert!(
            status.starts_with(&format!("ON, using {} for speed · ", priced.id)),
            "{status}"
        );
        assert!(status.contains("credits per 1M tokens"), "{status}");
        assert_eq!(
            fast_mode_on_status("no-such-model-in-the-catalog"),
            "ON, using no-such-model-in-the-catalog for speed"
        );
    }

    fn release_noting(version: &str, summary: Option<&str>) -> crate::update_check::CliRelease {
        crate::update_check::CliRelease {
            version: version.to_string(),
            published_at: "2026-09-12T10:00:00Z".to_string(),
            downloads: Vec::new(),
            release_notes: Some(crate::update_check::CliReleaseNotes {
                summary: summary.map(str::to_string),
                url: "https://example.invalid/notes".to_string(),
            }),
        }
    }

    #[test]
    fn whats_new_is_the_summary_of_the_running_build_on_one_line() {
        let release = release_noting("1.4.0", Some("Faster\nstartup \u{1b}[2Jand\n  edits"));
        assert_eq!(
            whats_new_for(&release, "1.4.0"),
            Some("Faster startup and edits".to_string())
        );
        assert_eq!(whats_new_for(&release, "1.3.0"), None);
        assert_eq!(whats_new_for(&release_noting("1.4.0", None), "1.4.0"), None);
        assert_eq!(
            whats_new_for(&release_noting("1.4.0", Some("  \n ")), "1.4.0"),
            None
        );
    }

    #[test]
    fn the_start_screen_shows_whats_new_when_the_chrome_carries_it() {
        let statusline = shipped_statusline();
        let messages: Vec<ChatMessage> = Vec::new();
        let cells: Vec<ToolCell> = Vec::new();
        let mut ctx = layout_fixture_ctx(&statusline, &messages, &cells, "High", None);
        ctx.chrome.whats_new = Some("Faster startup".to_string());
        let mut terminal =
            Terminal::new(ratatui::backend::TestBackend::new(120, 30)).expect("terminal");
        terminal
            .draw(|frame| render_chat(frame, Rect::new(0, 0, 120, 30), &ctx))
            .expect("draw");
        let rendered = buffer_rows(&terminal, 120);
        assert!(rendered.contains("What's new"), "{rendered}");
        assert!(rendered.contains("Faster startup"), "{rendered}");
    }
}
