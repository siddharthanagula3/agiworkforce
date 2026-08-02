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
use ratatui::widgets::{Block, Borders, Paragraph, Wrap};
use ratatui::Terminal;

use crate::agent::AgentSession;
use crate::command_registry::{
    registry_from_builtins_skills_and_prompts, CommandRegistry, CommandSource, RegistryCommand,
};
use crate::config::CliConfig;
use crate::context::SystemContext;

use super::{display_width, pad_to_cols, truncate_cols};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TICK_RATE_MS: u64 = 50;
/// Duration the mode-cycle banner is shown after Shift+Tab.
const MODE_BANNER_TTL: Duration = Duration::from_secs(2);

// ---------------------------------------------------------------------------
// Interaction mode (Shift+Tab cycling)
// ---------------------------------------------------------------------------

/// Permission modes available in the TUI, cycling with Shift+Tab.
///
/// Cycle order: Default → Plan → AcceptEdits → BypassPermissions → FullAuto → Default
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum InteractionMode {
    /// Normal conversation mode (maps to `PermissionMode::Default`).
    Chat,
    /// Plan mode — read-only tools, no file edits.
    Plan,
    /// Auto-accept file edits; commands still prompt.
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

    fn label(self) -> &'static str {
        match self {
            Self::Chat => "Default",
            Self::Plan => "Plan",
            Self::AcceptEdits => "AcceptEdits",
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
#[allow(dead_code)]
enum ChatRole {
    User,
    Assistant,
    System,
    Tool,
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
}

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
        TranscriptCellState::Pending => ("•".to_string(), ui_muted()),
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
        } else {
            (
                format!("  {}", cell.summary),
                Style::default().fg(ui_muted()),
            )
        };
        spans.push(Span::styled(text, style));
    }
    let mut lines = vec![Line::from(spans)];
    if let Some(preview) = &cell.output_preview {
        lines.push(Line::from(vec![
            Span::raw("    "),
            Span::styled(preview.clone(), Style::default().fg(ui_muted())),
        ]));
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
    model_name: String,
    provider_name: String,
    turn_count: u32,
    total_input_tokens: u32,
    total_output_tokens: u32,
    mode: InteractionMode,
    /// Detected sandbox backend for the footer indicator.
    /// `None` means sandboxing was explicitly disabled via `--no-sandbox`.
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
    // the OS window title. Applied (emitted via SetTitle) when /title saves.
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
    command_registry: CommandRegistry,
    // Fallback rotation banner — shared with the agent send loop. The banner
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
    fn new(session: AgentSession, config: CliConfig, sandbox_disabled: bool) -> Self {
        // Restore the persisted theme before the first frame. Without this the
        // picker recoloured the running TUI and the choice died at restart.
        let theme_choice = config
            .ui
            .theme
            .as_deref()
            .and_then(super::widgets::theme_picker::ThemeChoice::from_arg)
            .unwrap_or(super::widgets::theme_picker::ThemeChoice::Dark);
        crate::tui::terminal_palette::set_active_theme(theme_choice as u8);

        let model_name = session.model.clone();
        let provider_name = format!("{:?}", session.provider).to_lowercase();

        // Resume support: `run()` loads a resumed session's prior turns into
        // `session.messages`/`session.turn_count` *before* constructing
        // `TuiApp` (see the `resume_messages`/`resume_managed_session` match
        // above), but until now that only fed the model/context-loading
        // state — the transcript pane's own `chat_messages` was always
        // seeded empty, so a resumed TUI launch rendered the blank welcome
        // screen with "Turns: 0" even though the underlying session (and any
        // follow-up prompt) had the full prior history. Hydrate the
        // transcript widget state from the same `session.messages` here so
        // the first render already shows the resumed conversation.
        let turn_count = session.turn_count;
        let chat_messages: Vec<ChatMessage> = session
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
        let git_branch = std::process::Command::new("git")
            .args(["rev-parse", "--abbrev-ref", "HEAD"])
            .output()
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

        let sandbox_type = if sandbox_disabled {
            None
        } else {
            Some(crate::sandbox::SandboxType::detect())
        };

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
            model_name,
            provider_name,
            turn_count,
            total_input_tokens: 0,
            total_output_tokens: 0,
            mode: InteractionMode::Chat,
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
            },
            terminal_title_config:
                super::widgets::terminal_title_setup::TerminalTitleConfig::default(),
            effort: crate::design_system::Effort::Medium,
            theme_picker: super::widgets::theme_picker::ThemePickerState::default(),
            theme_choice,
            mode_banner_shown_at: None,
            stream_buffer: String::new(),
            stream_start: None,
            git_branch,
            command_registry,
            fallback_banner: Arc::new(std::sync::Mutex::new(None)),
            active_overlay: None,
            overlay_scroll: 0,
            tool_cells: Vec::new(),
            mcp_elicitation_handler: Arc::new(crate::mcp::tui_handler::TuiElicitationHandler::new()),
        }
    }

    /// Install the fallback banner sink on the underlying session. Idempotent
    /// — calling twice replaces the previous sink.
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

    fn sync_stats(&mut self) {
        self.turn_count = self.session.turn_count;
        self.total_input_tokens = self.session.total_input_tokens;
        self.total_output_tokens = self.session.total_output_tokens;
        self.model_name = self.session.model.clone();
        self.provider_name = format!("{:?}", self.session.provider).to_lowercase();
    }

    fn spinner_char(&self) -> &str {
        spinner_frame(self.spinner_tick)
    }

    /// AGI Agent loading verb — stable within a turn, rotating across turns.
    /// Our own words; deliberately not copied from any reference CLI.
    fn loading_verb(&self) -> &'static str {
        loading_verb_for(self.turn_count)
    }

    fn context_percent(&self) -> u8 {
        context_percent_for(
            &self.model_name,
            self.total_input_tokens,
            self.total_output_tokens,
        )
    }

    pub fn open_overlay(
        &mut self,
        view: Box<dyn crate::tui::widgets::interactive::InteractiveView>,
    ) {
        self.overlay_scroll = 0;
        self.active_overlay = Some(view);
    }

    /// Route a key to the active overlay. Returns `true` when the overlay
    /// consumed the key (caller must not forward it to the composer), `false`
    /// when there is no active overlay.
    fn dispatch_key_to_overlay(&mut self, key: crossterm::event::KeyEvent) -> bool {
        let Some(ov) = self.active_overlay.as_mut() else {
            return false;
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
            ViewAction::SideAction(tag) if tag.starts_with("slash:") => {
                let name = tag.trim_start_matches("slash:");
                self.input = format!("/{name}");
                self.cursor = self.input.len();
                self.overlay_scroll = 0;
                self.active_overlay = None;
            }
            ViewAction::Submit(_) => {
                // Apply the overlay's committed result (was previously dropped —
                // the root cause of every generic overlay "saving" nothing).
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
        true
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
            }
            OverlayResult::SkillsDisabled(names) => {
                // Persist the disabled set; discover_skills() then skips them for
                // every consumer (prompt injection, registry, tools).
                let set: std::collections::HashSet<String> = names.into_iter().collect();
                let _ = crate::skills::save_disabled_skills(&set);
            }
            OverlayResult::Memory(settings) => {
                // Persist; the memory pipeline (extract/prune/consolidate) reads it.
                if let Ok(home) = crate::config::CliConfig::config_dir() {
                    let _ = crate::memory_pipeline::save_memory_settings(
                        &home,
                        settings.auto_memory,
                        settings.decay_threshold_days,
                        settings.max_facts,
                    );
                }
            }
            OverlayResult::DiffApproved(paths) => {
                // Stage the approved files (reversible via `git reset`). Rejected /
                // skipped files are deliberately left untouched — never auto-discard
                // the user's working-tree changes.
                let staged = paths
                    .iter()
                    .filter(|path| {
                        std::process::Command::new("git")
                            .arg("add")
                            .arg("--")
                            .arg(path)
                            .status()
                            .map(|s| s.success())
                            .unwrap_or(false)
                    })
                    .count();
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

    /// Emit the OS window title from the current config + live session data. Called
    /// on /title save (best-effort — a title-set escape never affects the screen).
    fn emit_terminal_title(&self) {
        let cwd = std::env::current_dir()
            .ok()
            .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
            .unwrap_or_default();
        let session_id: String = self.session.runtime_session_id.chars().take(8).collect();
        if let Some(title) = build_terminal_title(
            &self.terminal_title_config,
            &session_id,
            &self.model_name,
            &cwd,
            self.git_branch.as_deref(),
        ) {
            let _ = std::io::stdout().execute(crossterm::terminal::SetTitle(title));
        }
    }
}

/// Build the OS window-title string from the enabled fields. `None` when no field
/// is enabled (so the caller does not set an empty title). Pure — unit-tested.
fn build_terminal_title(
    cfg: &crate::tui::widgets::terminal_title_setup::TerminalTitleConfig,
    session_id: &str,
    model: &str,
    cwd: &str,
    branch: Option<&str>,
) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    if cfg.show_session_id && !session_id.is_empty() {
        parts.push(format!("#{session_id}"));
    }
    if cfg.show_model && !model.is_empty() {
        parts.push(model.to_string());
    }
    if cfg.show_cwd && !cwd.is_empty() {
        parts.push(cwd.to_string());
    }
    if cfg.show_branch {
        if let Some(b) = branch {
            parts.push(format!("⎇ {b}"));
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(format!("agi — {}", parts.join(" · ")))
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
    }
}

/// Render a keyboard-navigable approval modal and return the user's choice.
///
/// The agent turn is parked on the broker (`request().await`) while this runs,
/// so a synchronous key loop here cannot starve it. This intentionally touches
/// only `terminal` + local overlay state — never `TuiApp` — so it composes with
/// the `&mut app.session` borrow held by the in-flight agent future. To avoid
/// blanking the surrounding UI (header/cost-HUD/transcript/composer/status),
/// each frame first redraws the normal in-turn chrome via `draw_turn_chrome`
/// (the same helper `render_turn_frame` uses) and then layers the approval
/// overlay on top *within the same `terminal.draw` closure* — mirroring how
/// `render()` composites `active_overlay`/pickers on top of the main frame.
fn run_tui_approval_modal(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    ctx: &FrameCtx,
    request: &crate::tui::approval_broker::ApprovalRequest,
) -> Result<crate::tui::widgets::approval_overlay::ApprovalChoice> {
    use crate::tui::widgets::approval_overlay::{ApprovalChoice, ApprovalOverlayState};
    use crate::tui::widgets::interactive::{InteractiveView, ViewAction};

    let mut overlay = ApprovalOverlayState::default();
    overlay.open(request.summary.clone(), request.detail.clone());

    loop {
        terminal.draw(|frame| {
            let chat_area = draw_turn_chrome(frame, ctx);
            // Drawn last within the same closure so it composites on top of
            // the chrome that was just painted, instead of replacing it.
            overlay.render_into(frame, chat_area);
        })?;

        if event::poll(Duration::from_millis(TICK_RATE_MS))? {
            match event::read()? {
                Event::Key(key) => match overlay.handle_key(crossterm_to_keyaction(key)) {
                    ViewAction::Submit(_) | ViewAction::Close => {
                        // Force a full chrome-only redraw before returning
                        // control to the main loop so no stale overlay
                        // fragments can linger in the terminal's diff state.
                        terminal.draw(|frame| {
                            draw_turn_chrome(frame, ctx);
                        })?;
                        return Ok(overlay.result.unwrap_or(ApprovalChoice::No));
                    }
                    ViewAction::Continue | ViewAction::SideAction(_) => {}
                },
                Event::Paste(_) => {}
                _ => {}
            }
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
            for character in text.chars() {
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
            render_overlay(frame, chat_area, &overlay, 0);
        })?;
        if event::poll(Duration::from_millis(TICK_RATE_MS))? {
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
            render_overlay(frame, chat_area, &overlay, 0);
        })?;
        if event::poll(Duration::from_millis(TICK_RATE_MS))? {
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

fn setup_terminal() -> Result<Terminal<CrosstermBackend<Stdout>>> {
    enable_raw_mode()?;
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

    // Dynamic input height: border(2) + content rows (1..=8)
    let input_height = 2 + composer_content_rows(&app.input);
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),            // header
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

    // Live cost HUD anchored to the top-right; sits on top of the header
    // border so it never steals real-estate from the chat area.
    let hud = super::cost_hud::CostHud {
        in_tokens: app.total_input_tokens,
        out_tokens: app.total_output_tokens,
        cache_read: app.session.total_cache_read_tokens,
        cache_creation: app.session.total_cache_creation_tokens,
        reasoning_tokens: app.session.total_reasoning_tokens,
        context_used: app.total_input_tokens as u64 + app.total_output_tokens as u64,
        context_window: crate::model_catalog::context_window(&app.model_name) as u64,
    };
    super::cost_hud::render(frame, area, &hud, &app.model_name);

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
/// `&mut app.session`, so it can only consume a `FrameCtx` of disjoint fields —
/// never `&app`. Mirrors `render`'s layout (header / chat / composer / status)
/// minus the picker/overlay/HUD layers, which are never active mid-turn. This is
/// what makes streamed output, the animated spinner, and the stall hint visible
/// during a turn instead of appearing all at once when it ends.
fn render_turn_frame(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    ctx: &FrameCtx,
) -> Result<()> {
    terminal.draw(|frame| {
        draw_turn_chrome(frame, ctx);
    })?;
    Ok(())
}

/// Draws the header/chat/composer-hint/status chrome shared by the live
/// in-turn frame (`render_turn_frame`) and the tool-approval modal
/// (`run_tui_approval_modal`), which layers its overlay on top of this within
/// the same `terminal.draw` closure instead of replacing it. Returns the chat
/// area (`chunks[1]`) so callers can composite additional content over it.
fn draw_turn_chrome(frame: &mut ratatui::Frame, ctx: &FrameCtx) -> Rect {
    let area = frame.area();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3), // header
            Constraint::Min(5),    // chat area
            Constraint::Length(3), // composer (disabled during a turn)
            Constraint::Length(1), // status bar
        ])
        .split(area);

    render_header(frame, chunks[0], ctx);
    render_chat(frame, chunks[1], ctx);

    let hint = Paragraph::new(Line::from(Span::styled(
        "  … working — Esc or Ctrl-C to cancel",
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
    FRAMES[(tick as usize) % FRAMES.len()]
}

/// AGI loading verb for a given turn — stable within a turn, rotating across.
fn loading_verb_for(turn_count: u32) -> &'static str {
    const VERBS: &[&str] = &[
        "Synthesizing",
        "Architecting",
        "Orchestrating",
        "Reasoning",
        "Computing",
        "Composing",
        "Analyzing",
        "Assembling",
        "Crafting",
        "Deliberating",
        "Formulating",
        "Strategizing",
        "Calibrating",
        "Resolving",
        "Distilling",
        "Engineering",
    ];
    VERBS[(turn_count as usize) % VERBS.len()]
}

/// Context-window usage percent (0..=100) for a model + token counts.
fn context_percent_for(model_name: &str, in_tokens: u32, out_tokens: u32) -> u8 {
    let ctx_window = crate::model_catalog::context_window(model_name) as u64;
    if ctx_window == 0 {
        return 0;
    }
    let used = in_tokens as u64 + out_tokens as u64;
    ((used * 100) / ctx_window).min(100) as u8
}

/// Disjoint snapshot of the fields the header/chat/status renderers read. Built
/// either from `&TuiApp` (normal frame) or field-by-field during a turn (live
/// frame) — the latter is why these are owned/borrowed values rather than
/// `&TuiApp`: while the send future holds `&mut app.session`, the renderers may
/// only touch fields *other* than `session`, so they can't take `&app`.
struct FrameCtx<'a> {
    model_name: &'a str,
    provider_name: &'a str,
    git_branch: Option<&'a str>,
    total_input_tokens: u32,
    total_output_tokens: u32,
    turn_count: u32,
    context_percent: u8,
    chat_messages: &'a [ChatMessage],
    tool_cells: &'a [ToolCell],
    is_loading: bool,
    stream_start: Option<Instant>,
    stream_buffer: &'a str,
    spinner_char: &'a str,
    loading_verb: &'a str,
    scroll_offset: u16,
    access_mode: crate::design_system::AccessMode,
    /// Session privacy boundary (governs whether a send is allowed). Distinct
    /// from `access_mode`, which only reflects where the active model routes.
    privacy_mode: crate::agent::PrivacyMode,
    mode: InteractionMode,
    effort_label: &'a str,
    sandbox_type: Option<crate::sandbox::SandboxType>,
    cost_str: String,
    /// Which statusline fields the user has enabled (model/tokens/cost/branch/mode).
    statusline: &'a super::widgets::statusline_setup::StatusLineConfig,
}

impl<'a> FrameCtx<'a> {
    fn from_app(app: &'a TuiApp) -> Self {
        FrameCtx {
            model_name: &app.model_name,
            statusline: &app.statusline_config,
            provider_name: &app.provider_name,
            git_branch: app.git_branch.as_deref(),
            total_input_tokens: app.total_input_tokens,
            total_output_tokens: app.total_output_tokens,
            turn_count: app.turn_count,
            context_percent: app.context_percent(),
            chat_messages: &app.chat_messages,
            tool_cells: &app.tool_cells,
            is_loading: app.is_loading,
            stream_start: app.stream_start,
            stream_buffer: &app.stream_buffer,
            spinner_char: app.spinner_char(),
            loading_verb: app.loading_verb(),
            scroll_offset: app.scroll_offset,
            access_mode: provider_access_mode(&app.session.provider),
            privacy_mode: app.session.privacy_mode,
            mode: app.mode,
            effort_label: app.effort.label(),
            sandbox_type: app.sandbox_type,
            cost_str: crate::output::format_cost(
                &app.session.model,
                app.session.total_input_tokens,
                app.session.total_output_tokens,
            ),
        }
    }
}

fn render_header(frame: &mut ratatui::Frame, area: Rect, ctx: &FrameCtx) {
    use crate::tui::terminal_palette::{ui_accent, ui_brand, ui_danger, ui_muted};
    let provider_display = match ctx.provider_name {
        "ollama" => "Local",
        other => other,
    };

    let mut spans = vec![
        Span::styled(
            " AGI ",
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
        Span::raw(" │ "),
        Span::styled(provider_display, Style::default().fg(ui_accent())),
    ];

    if let Some(branch) = ctx.git_branch {
        spans.push(Span::raw(" │ "));
        spans.push(Span::styled(
            format!(" {branch}"),
            Style::default().fg(ui_muted()),
        ));
    }

    spans.push(Span::raw(" │ "));
    spans.push(Span::styled(
        format!("{}% ctx", ctx.context_percent),
        Style::default().fg(if ctx.context_percent > 80 {
            ui_danger()
        } else {
            ui_muted()
        }),
    ));

    let header_text = Line::from(spans);

    let tokens_text = format!(
        " {}in / {}out │ Turns: {} ",
        crate::output::format_tokens(ctx.total_input_tokens),
        crate::output::format_tokens(ctx.total_output_tokens),
        ctx.turn_count,
    );

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(ui_muted()))
        .title_bottom(Line::from(Span::styled(
            tokens_text,
            Style::default().fg(ui_muted()),
        )));

    let header = Paragraph::new(header_text).block(block);
    frame.render_widget(header, area);
}

fn render_chat(frame: &mut ratatui::Frame, area: Rect, ctx: &FrameCtx) {
    use crate::tui::terminal_palette::{ui_accent, ui_brand, ui_cloud, ui_muted, ui_success};
    let mut lines: Vec<Line> = Vec::new();

    if ctx.chat_messages.is_empty() && !ctx.is_loading {
        use crate::design_system::AccessMode;
        // Access-mode colors match the status-bar chip so the visual identity is
        // consistent across the app.
        let (mode_label, mode_color) = match ctx.access_mode {
            AccessMode::Local => ("local · on-device & private", ui_success()),
            AccessMode::Byok => ("your own key · BYOK", ui_accent()),
            AccessMode::Cloud => ("AGI cloud subscription", ui_cloud()),
        };

        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled(
            "  Welcome to AGI",
            Style::default().fg(ui_brand()).add_modifier(Modifier::BOLD),
        )));
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
        lines.push(Line::from(Span::styled(
            "  Choose Local, BYOK, or Cloud with /model.",
            Style::default().fg(ui_muted()),
        )));
        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled(
            "  Type a message and press Enter to send.",
            Style::default().fg(ui_muted()),
        )));
        lines.push(Line::from(Span::styled(
            "  Type / for commands · Shift+Tab to switch modes · Esc to quit.",
            Style::default().fg(ui_muted()),
        )));
    } else {
        for msg in ctx.chat_messages {
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
                ChatRole::System => (
                    "  ℹ ",
                    Style::default()
                        .fg(ui_accent())
                        .add_modifier(Modifier::BOLD),
                ),
                ChatRole::Tool => ("  ▸ ", Style::default().fg(ui_accent())),
            };

            // Render prefix line
            lines.push(Line::from(Span::styled(prefix.to_string(), prefix_style)));

            // Use full markdown renderer for assistant messages
            if msg.role == ChatRole::Assistant {
                let md_lines = super::markdown_renderer::render_markdown(&msg.text);
                lines.extend(md_lines);
            } else {
                // Simple rendering for user/system/tool messages
                for text_line in msg.text.lines() {
                    let style = match msg.role {
                        ChatRole::User => Style::default(),
                        ChatRole::System => Style::default(),
                        ChatRole::Tool => Style::default().fg(ui_muted()),
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
        let status = if stalled {
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
            for line in ctx
                .stream_buffer
                .lines()
                .rev()
                .take(40)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
            {
                lines.push(Line::from(Span::styled(
                    format!("    {line}"),
                    Style::default(),
                )));
            }
        }
    }

    // Scroll
    let visible_height = area.height.saturating_sub(2) as usize;
    let total_lines = lines.len();
    let max_scroll = total_lines.saturating_sub(visible_height) as u16;
    let effective_scroll = ctx.scroll_offset.min(max_scroll);
    let scroll_pos = max_scroll.saturating_sub(effective_scroll);

    let block = Block::default()
        .borders(Borders::LEFT | Borders::RIGHT)
        .border_style(Style::default().fg(ui_muted()));

    let chat = Paragraph::new(lines)
        .block(block)
        .wrap(Wrap { trim: false })
        .scroll((scroll_pos, 0));

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

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(ui_muted()))
        .title(format!(" {} ", app.mode.label()));

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
                "Message AGI...  Enter to send · Shift+Enter for newline · / for commands",
                Style::default().fg(ui_muted()),
            ),
        ]);
        let widget = Paragraph::new(placeholder_line).block(block);
        frame.render_widget(widget, area);
        // Position cursor after prompt character
        let cursor_x = area.x + 1 + prompt_width;
        let cursor_y = area.y + 1;
        frame.set_cursor_position((cursor_x, cursor_y));
        return;
    }

    // Multiline: split input by '\n' and render each line.
    let style = Style::default();
    let prompt_style = Style::default()
        .fg(app.mode.color())
        .add_modifier(Modifier::BOLD);

    let lines_text: Vec<&str> = app.input.split('\n').collect();
    let lines: Vec<Line> = lines_text
        .iter()
        .enumerate()
        .map(|(i, &text)| {
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
        })
        .collect();

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
        let cursor_y = area.y + 1 + cursor_row as u16;
        frame.set_cursor_position((cursor_x, cursor_y));
    }
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
        banner.from, banner.to, banner.reason
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
/// chip. Presentation only — mirrors the model-picker grouping and never
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

fn render_status_bar(frame: &mut ratatui::Frame, area: Rect, ctx: &FrameCtx) {
    use crate::tui::terminal_palette::{
        ui_accent, ui_cloud, ui_danger, ui_muted, ui_on_dark, ui_on_light, ui_status_bar_bg,
        ui_success,
    };
    let badge_fg = if ctx.mode == InteractionMode::Chat {
        ui_on_dark()
    } else {
        ui_on_light()
    };
    let mode_span = Span::styled(
        format!(" {} ", ctx.mode.label()),
        Style::default().fg(badge_fg).bg(ctx.mode.color()),
    );

    let cost_str = ctx.cost_str.clone();

    let effort_str = format!("effort:{}", ctx.effort_label);

    // Sandbox indicator: positive when a sandbox backend is active, critical otherwise.
    let (sandbox_label, sandbox_color) = match ctx.sandbox_type {
        Some(crate::sandbox::SandboxType::MacosSeatbelt) => ("sandbox: seatbelt", ui_success()),
        Some(crate::sandbox::SandboxType::LinuxBubblewrap) => ("sandbox: bwrap", ui_success()),
        Some(crate::sandbox::SandboxType::LinuxLandlock) => ("sandbox: landlock", ui_success()),
        Some(crate::sandbox::SandboxType::WindowsRestrictedToken) => ("sandbox: win", ui_success()),
        Some(crate::sandbox::SandboxType::None) | None => ("no sandbox", ui_danger()),
    };

    // Access-mode chip: always show whether the active model is reached via
    // LOCAL (on-device), BYOK (your own key), or CLOUD (managed subscription).
    // Keeps AGI's core differentiator visible at all times. Purely a label —
    // it reflects the active provider, it never changes routing.
    let access_span = {
        use crate::agent::PrivacyMode;
        use crate::design_system::AccessMode;
        let tier = match ctx.access_mode {
            AccessMode::Local => "local",
            AccessMode::Byok => "byok",
            AccessMode::Cloud => "cloud",
        };
        // The session privacy mode governs whether a send is allowed; the access
        // tier only reflects where the active model routes. A Local session with
        // an off-device model is BLOCKED — surface the mismatch in danger color
        // so the session mode is visible. (Previously the chip showed only the
        // tier — e.g. "byok" — which hid that the session was Local and left
        // users confused about why sends were refused.)
        if ctx.privacy_mode == PrivacyMode::Local && ctx.access_mode != AccessMode::Local {
            Span::styled(
                format!("◉ local≠{tier}"),
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
                format!("◉ {tier}"),
                Style::default().fg(color).add_modifier(Modifier::BOLD),
            )
        }
    };

    // Context-usage fill bar with escalating color (green → accent → red).
    let ctx_pct = ctx.context_percent;
    let bar_w = 8usize;
    let filled = ((ctx_pct as usize * bar_w) / 100).min(bar_w);
    let ctx_color = if ctx_pct >= 85 {
        ui_danger()
    } else if ctx_pct >= 60 {
        ui_accent()
    } else {
        ui_success()
    };
    let ctx_str = format!(
        "ctx [{}{}] {ctx_pct:>3}%",
        "█".repeat(filled),
        "░".repeat(bar_w - filled),
    );

    // Essential items, highest priority first. The `mode` badge is toggled by the
    // /statusline "mode" field (default on); access-tier and the context bar are
    // always shown (not user-configurable).
    let sl = ctx.statusline;
    let mut spans: Vec<Span> = Vec::new();
    if sl.show_mode {
        spans.push(mode_span);
        spans.push(Span::raw(" "));
    }
    spans.push(access_span);
    spans.push(Span::raw("  "));
    spans.push(Span::styled(ctx_str, Style::default().fg(ctx_color)));
    spans.push(Span::raw("  "));

    // Optional items in descending priority — added only while they fit, so a
    // narrow terminal drops the low-priority hints instead of hard-clipping the
    // important indicators on the right. The model/tokens/cost/branch fields are
    // gated by /statusline (model/tokens/branch default off, cost default on).
    let mut optional: Vec<Span> = Vec::new();
    if sl.show_model {
        optional.push(Span::styled(
            format!("model:{}", ctx.model_name),
            Style::default().fg(ui_muted()),
        ));
    }
    if sl.show_tokens {
        optional.push(Span::styled(
            format!("↑{} ↓{}", ctx.total_input_tokens, ctx.total_output_tokens),
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
    if sl.show_cost {
        optional.push(Span::styled(cost_str, Style::default().fg(ui_muted())));
    }
    optional.push(Span::styled(
        sandbox_label.to_string(),
        Style::default().fg(sandbox_color),
    ));
    optional.push(Span::styled(effort_str, Style::default().fg(ui_muted())));
    optional.push(Span::styled(
        "Shift+Tab: mode".to_string(),
        Style::default().fg(ui_muted()),
    ));
    optional.push(Span::styled(
        "/: commands".to_string(),
        Style::default().fg(ui_muted()),
    ));
    optional.push(Span::styled(
        "Esc: quit".to_string(),
        Style::default().fg(ui_muted()),
    ));
    let avail = area.width as usize;
    let mut used: usize = spans.iter().map(|s| display_width(&s.content)).sum();
    for opt in optional {
        let w = display_width(&opt.content) + 2;
        if used + w <= avail {
            spans.push(opt);
            spans.push(Span::raw("  "));
            used += w;
        } else {
            break;
        }
    }

    let bar = Paragraph::new(Line::from(spans))
        .style(Style::default().bg(ui_status_bar_bg()).fg(ui_on_dark()));
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
    // Prefer a view's styled lines (e.g. the diff review's +/- coloring); fall
    // back to the plain text render for every other overlay.
    let lines: Vec<Line> = match ov.render_styled() {
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
    // Each InteractiveView already renders its own complete ASCII box (with a
    // title row), so size the overlay to that content and draw it WITHOUT an
    // extra ratatui border. Previously this wrapped the already-boxed text in
    // Block::borders(ALL), producing a double box (outer themed frame + the
    // widget's own `┌─ … ─┐`).
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
    let para = Paragraph::new(lines).scroll((scroll, 0));
    frame.render_widget(para, overlay_area);
}

// render_model_picker was replaced by super::widgets::model_picker::render
// (called directly from the render() fn above)

// ---------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------

enum InputAction {
    None,
    SendMessage(String),
    Quit,
    ScrollUp,
    ScrollDown,
    ClearChat,
    CycleMode,
}

fn handle_key_event(app: &mut TuiApp, key: KeyEvent) -> InputAction {
    // Overlay intercepts every key first.
    if app.dispatch_key_to_overlay(key) {
        return InputAction::None;
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
            return InputAction::Quit;
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
        return InputAction::Quit;
    }
    if app
        .keybindings
        .matches(crate::keybindings::KeybindingAction::CycleMode, key)
    {
        return InputAction::CycleMode;
    }
    if app
        .keybindings
        .matches(crate::keybindings::KeybindingAction::ClearInput, key)
    {
        app.input.clear();
        app.cursor = 0;
        return InputAction::None;
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
            let text = app.input.trim().to_string();
            if text.is_empty() {
                return InputAction::None;
            }
            app.input.clear();
            app.cursor = 0;
            app.scroll_offset = 0;
            InputAction::SendMessage(text)
        }

        KeyCode::Char(c) => {
            insert_char_at_cursor(&mut app.input, &mut app.cursor, c);
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

        // Up/Down: navigate within multiline composer when applicable,
        // otherwise scroll the chat area.
        KeyCode::Up => {
            if composer_move_up(app) {
                InputAction::None
            } else {
                InputAction::ScrollUp
            }
        }
        KeyCode::Down => {
            if composer_move_down(app) {
                InputAction::None
            } else {
                InputAction::ScrollDown
            }
        }

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
        // Already on the first line — let the event fall through to scroll chat.
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
/// Idempotent — skips prompts already registered by name (matching
/// `CommandRegistry::find`), so it's safe to call both at `TuiApp`
/// construction time (when MCP servers connected synchronously before the
/// background attach was spawned, or not at all) and again once the
/// background `mcp_attach_join` task finishes and injects the manager via
/// `session.set_mcp_manager`. Without the second call, `/mcp:<server>:<prompt>`
/// stayed permanently absent from `app.command_registry` — and therefore from
/// the command popup's candidate list — for the overwhelmingly common case
/// where MCP finishes connecting *after* the TUI has already started (the
/// whole point of the non-blocking background attach).
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
        ("memories", "Configure auto-memory settings"),
        ("skills-toggle", "Enable or disable individual skills"),
        ("title", "Configure the terminal window title"),
        ("diff-review", "Review changed files hunk by hunk"),
    ] {
        if !cmds.iter().any(|c| c.name == name) {
            cmds.push(PopupCmd::new(name, desc));
        }
    }

    app.open_overlay(Box::new(CommandPopup::new(cmds)));
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
    insert_str_at_cursor(&mut app.input, &mut app.cursor, text);
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
                Err(err) => format!("Model switch failed: {err}"),
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
            app.chat_messages.push(ChatMessage {
                role: ChatRole::System,
                text: format!("Effort set to {}", effort.label()),
            });
            InputAction::None
        }
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
            crate::tui::terminal_palette::set_active_theme(choice as u8);
            // Persist so the choice survives a restart.
            let _ = app.config.persist_theme_project(choice.slug());
            app.input.clear();
            app.cursor = 0;
            app.chat_messages.push(ChatMessage {
                role: ChatRole::System,
                text: format!("Theme set to {}", choice.label()),
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
/// entire (trimmed) text is the trigger phrase — never by a fuzzy substring
/// buried in conversational prose. This prevents a user who merely *discusses*
/// those words (e.g. "don't give me no prompts about this") from silently
/// disabling tool-approval prompts for the rest of the session. The
/// non-escalating modes (Plan, Chat) — which only restrict or normalize
/// behavior — keep the more permissive natural-language matching.
fn detect_mode_intent(text: &str) -> Option<InteractionMode> {
    let lower = text.to_lowercase();
    // Normalize to the bare command phrase: trim surrounding whitespace and a
    // single leading slash so both "/yolo" and "yolo mode" map to one trigger.
    let exact = lower.trim();
    let exact = exact.strip_prefix('/').unwrap_or(exact).trim();

    // Plan mode triggers — non-escalating (read-only), natural language allowed.
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

    // Accept edits mode — escalating: require the message to BE the command.
    if matches!(
        exact,
        "accept edits"
            | "accept-edits"
            | "auto accept"
            | "auto-accept"
            | "accept all edits"
            | "accept edits mode"
            | "yolo"
            | "yolo mode"
    ) {
        return Some(InteractionMode::AcceptEdits);
    }

    // Bypass permissions — escalating: require the message to BE the command.
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

    // FullAuto — escalating: require the message to BE the command.
    if matches!(
        exact,
        "full auto" | "fullauto" | "full-auto" | "full auto mode" | "full-auto mode"
    ) {
        return Some(InteractionMode::FullAuto);
    }

    // Back to chat mode — non-escalating (de-escalates), natural language allowed.
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
fn apply_mode(app: &mut TuiApp, mode: InteractionMode) {
    app.mode = mode;
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
}

fn mode_description(mode: InteractionMode) -> &'static str {
    match mode {
        InteractionMode::Chat => "Normal conversation mode",
        InteractionMode::Plan => {
            "Plan mode — read-only tools only, no file edits. Model will plan before acting."
        }
        InteractionMode::AcceptEdits => {
            "Safe, read-only operations run automatically; writes and commands still require approval."
        }
        InteractionMode::BypassPermissions => {
            "Bypass — all tool prompts skipped. Use with caution!"
        }
        InteractionMode::FullAuto => {
            "FullAuto — no prompts, no confirmations. Extreme caution required!"
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
    RunLogin,
    RunLogout,
    /// Leave the TUI, run the interactive voice loop, then re-enter.
    RunVoice(String),
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
            app.session.clear();
            app.chat_messages.clear();
            app.scroll_offset = 0;
            app.sync_stats();
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
                match app.session.switch_model(arg) {
                    Ok(()) => {
                        app.sync_stats();
                        let provider = format!("{:?}", app.session.provider).to_lowercase();
                        SlashResult::SystemMessage(format!("Switched to {} ({})", arg, provider))
                    }
                    Err(err) => SlashResult::SystemMessage(format!("Model switch failed: {err}")),
                }
            }
        }

        "/plan" => {
            let new_mode = if app.mode == InteractionMode::Plan {
                InteractionMode::Chat
            } else {
                InteractionMode::Plan
            };
            apply_mode(app, new_mode);
            SlashResult::SystemMessage(format!("{} — {}", app.mode.label(), mode_description(app.mode)))
        }

        "/cost" => {
            let cost = crate::output::format_cost(
                &app.session.model,
                app.session.total_input_tokens,
                app.session.total_output_tokens,
            );
            SlashResult::SystemMessage(format!("Turns: {} │ {}", app.session.turn_count, cost))
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
                    "No fallback chain set. Restart with -m a,b,c to enable."
                        .to_string(),
                ),
            }
        }

        "/replay" => SlashResult::SystemMessage(
            "Session replay: drop to shell and run\n  agi session list\n  agi session fork <id> --at-turn N --as <name>\n(Inline turn picker coming in v0.2.)"
                .to_string(),
        ),

        "/insights" => {
            let sid = app
                .session
                .managed_session_id()
                .unwrap_or("(no session)");
            SlashResult::SystemMessage(format!(
                "Inspect this session as JSONL events:\n  agi exec --json-events --session {} \"<prompt>\" | jq",
                sid
            ))
        }

        "/status" => {
            let msg = format!(
                "Version: {}\nModel: {}\nProvider: {:?}\nMode: {}\nTurns: {}\nTokens: {} in / {} out\nContext: {}%",
                env!("CARGO_PKG_VERSION"),
                app.session.model,
                app.session.provider,
                app.mode.label(),
                app.session.turn_count,
                app.session.total_input_tokens,
                app.session.total_output_tokens,
                app.context_percent(),
            );
            SlashResult::SystemMessage(msg)
        }

        "/context" => {
            let ctx = crate::model_catalog::context_window(&app.model_name);
            let used = app.total_input_tokens + app.total_output_tokens;
            SlashResult::SystemMessage(format!(
                "Context: {}% used ({} / {} tokens)",
                app.context_percent(), used, ctx
            ))
        }

        "/fast" => {
            match app.session.toggle_fast_mode(None) {
                Ok(()) => {
                    app.sync_stats();
                    let status = if app.session.fast_mode {
                        format!("ON — using {} for speed", app.session.model)
                    } else {
                        format!("OFF — back to {}", app.session.model)
                    };
                    SlashResult::SystemMessage(format!("Fast mode {status}"))
                }
                Err(err) => SlashResult::SystemMessage(format!("Fast mode failed: {err}")),
            }
        }

        "/new" => {
            app.session.clear();
            app.chat_messages.clear();
            app.scroll_offset = 0;
            app.sync_stats();
            SlashResult::SystemMessage("Started new conversation.".to_string())
        }

        "/models" | "/providers" => {
            let models_output = crate::model_catalog::catalog()
                .all()
                .iter()
                .map(|m| {
                    let flags = format!(
                        "{}{}{}",
                        if m.supports_tools { "T" } else { " " },
                        if m.supports_vision { "V" } else { " " },
                        if m.supports_reasoning { "R" } else { " " },
                    );
                    format!(
                        "  {} [{}] {:>6}K ctx  ${:.2}/${:.2}",
                        pad_to_cols(&m.id, 32),
                        flags,
                        m.context_window / 1000,
                        m.input_price_per_1m,
                        m.output_price_per_1m,
                    )
                })
                .collect::<Vec<_>>()
                .join("\n");
            SlashResult::SystemMessage(format!(
                "Available models:\n{models_output}\n\nLive local discovery: run `agi models scan` or `agi models status`."
            ))
        }

        "/config" => {
            SlashResult::SystemMessage(app.config.display())
        }

        "/diff" => {
            let diff_output = std::process::Command::new("git")
                .args(["diff", "--stat"])
                .output()
                .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                .unwrap_or_else(|_| "Failed to run git diff".to_string());
            if diff_output.trim().is_empty() {
                SlashResult::SystemMessage("No changes (working tree clean).".to_string())
            } else {
                SlashResult::SystemMessage(format!("Git diff:\n{diff_output}"))
            }
        }

        "/copy" => {
            if let Some(last) = app.chat_messages.iter().rev().find(|m| m.role == ChatRole::Assistant) {
                // Try to copy to clipboard
                #[cfg(not(target_os = "android"))]
                {
                    match arboard::Clipboard::new().and_then(|mut cb| cb.set_text(&last.text)) {
                        Ok(()) => SlashResult::SystemMessage("Copied last response to clipboard.".to_string()),
                        Err(_) => SlashResult::SystemMessage("Clipboard not available. Response:\n".to_string() + &last.text),
                    }
                }
                #[cfg(target_os = "android")]
                SlashResult::SystemMessage("Clipboard not available on this platform.".to_string())
            } else {
                SlashResult::SystemMessage("No assistant response to copy.".to_string())
            }
        }

        "/login" => SlashResult::RunLogin,

        "/logout" => SlashResult::RunLogout,

        "/feedback" | "/bug" => {
            SlashResult::SystemMessage("Report issues at: https://github.com/agiworkforce/agiworkforce/issues".to_string())
        }

        "/help" | "/h" | "/?" => {
            SlashResult::SystemMessage(crate::command_registry::format_command_help(
                &app.command_registry,
                crate::command_registry::ShortcutHelp::Tui,
            ))
        }

        // ── Session management ──
        "/compact" => SlashResult::RunCompact(arg.to_string()),

        "/history" | "/sessions" => {
            crate::repl::handle_history();
            SlashResult::SystemMessage("Sessions listed above.".to_string())
        }

        "/resume" => {
            if arg.is_empty() {
                SlashResult::SystemMessage("Usage: /resume <session_id>".to_string())
            } else {
                crate::repl::handle_load(arg, &mut app.session);
                app.sync_stats();
                SlashResult::SystemMessage(format!("Resumed session: {arg}"))
            }
        }

        // Both arms report the outcome themselves rather than trusting the
        // handler's `output::print_*` — stdout is not visible under the
        // alternate screen, so an unconditional "Session saved." would be a
        // false claim whenever the write was refused.
        "/fork" | "/branch" => {
            if !app.session.session_persistence_enabled() {
                SlashResult::SystemMessage(
                    "Cannot branch — this run was started with --no-session-persistence, so no session file exists to fork."
                        .to_string(),
                )
            } else {
                crate::repl::handle_branch(arg, &mut app.session);
                app.sync_stats();
                SlashResult::SystemMessage("Session forked.".to_string())
            }
        }

        "/save" => {
            if !app.session.session_persistence_enabled() {
                SlashResult::SystemMessage(
                    "Cannot save — this run was started with --no-session-persistence, so nothing is written to disk."
                        .to_string(),
                )
            } else {
                crate::repl::handle_save(&mut app.session);
                app.sync_stats();
                SlashResult::SystemMessage("Session saved.".to_string())
            }
        }

        "/rename" => {
            if arg.is_empty() {
                SlashResult::SystemMessage("Usage: /rename <session_id> <new_title>".to_string())
            } else {
                crate::repl::handle_rename(arg);
                SlashResult::SystemMessage(format!("Renamed: {arg}"))
            }
        }

        "/export" => {
            crate::repl::handle_export(if arg.is_empty() { "markdown" } else { arg }, &app.session);
            SlashResult::SystemMessage("Exported above.".to_string())
        }

        "/rewind" => {
            crate::repl::handle_rewind(arg, &mut app.session);
            SlashResult::SystemMessage("Rewound to previous checkpoint.".to_string())
        }

        // ── Tools & plugins ──
        "/mcp" => {
            use crate::tui::widgets::screen_renderers::{
                McpScope, McpServerSummary, McpStatus, render_mcp_list,
            };
            let scopes = if let Some(tools) = app.session.mcp_info() {
                // Group tools by server name into a single scope.
                let mut server_names: Vec<String> =
                    tools.iter().map(|t| t.server_name.clone()).collect();
                server_names.sort();
                server_names.dedup();
                let servers: Vec<McpServerSummary> = server_names
                    .iter()
                    .map(|name| {
                        let tool_count =
                            tools.iter().filter(|t| &t.server_name == name).count();
                        McpServerSummary {
                            name: name.clone(),
                            status: McpStatus::Connected,
                            tool_count: Some(tool_count),
                        }
                    })
                    .collect();
                vec![McpScope {
                    label: "Connected servers".to_string(),
                    servers,
                }]
            } else {
                vec![]
            };
            SlashResult::SystemMessage(render_mcp_list(&scopes))
        }

        "/permissions" | "/perms" | "/approvals" => {
            // The TUI previously opened a FAKE hardcoded "Approve action?" overlay
            // with no real pending tool call, and its choice was dropped — a dead
            // interface. Real allow/deny/session rule management lives in the REPL
            // (repl::registry::handle_permissions). Point the user at the working
            // commands instead of showing a fake prompt. (Inline TUI rule editing
            // is tracked as CLI-TUI-OVERLAY-SUBMIT-DROP.)
            SlashResult::SystemMessage(
                "Manage tool permissions with these commands (run in the REPL — `agi --no-tui`):\n  \
                 /permissions                      show current allow/deny/session rules\n  \
                 /permissions allow <prefix>       always allow a command prefix\n  \
                 /permissions deny <prefix>        always deny a command prefix\n  \
                 /permissions session <prefix>     allow for this session only\n  \
                 /permissions remove <allow|deny|session> <prefix>\n  \
                 /permissions reset                clear all rules"
                    .into(),
            )
        }

        "/agents" => {
            // No arg → open interactive picker; simple name → quick-invoke;
            // management subcommands (list/show/create/validate/help) → text output.
            let is_management_subcommand = matches!(
                arg.split_whitespace().next().unwrap_or(""),
                "" | "list" | "ls" | "show" | "view" | "inspect" | "path" | "where"
                    | "new" | "create" | "init" | "validate" | "doctor" | "check"
                    | "help" | "-h" | "--help"
            );
            if arg.is_empty() {
                // Open interactive agent picker overlay
                app.agent_picker.open();
                SlashResult::SystemMessage(String::new())
            } else if is_management_subcommand {
                SlashResult::SystemMessage(crate::agents::render_agents_command(arg))
            } else {
                // Treat as quick-invoke: /agents <name>
                match crate::agents::find_agent(arg) {
                    Some(def) => {
                        def.apply_to_session(&mut app.session);
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
            crate::repl::handle_init_project();
            SlashResult::SystemMessage("Project initialized.".to_string())
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

        "/hooks" => {
            let hooks = crate::hooks::load_hooks().unwrap_or_default();
            let msg = crate::hooks::format_hooks_list(&hooks);
            SlashResult::SystemMessage(msg)
        }

        "/plugin" | "/plugins" | "/marketplace" | "/market" => {
            use crate::tui::widgets::screen_renderers::{
                PluginGroup, PluginSummary, PluginTab, render_plugin,
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
            SlashResult::SystemMessage(render_plugin(PluginTab::Installed, &installed, &errors))
        }

        // ── Memory ──
        "/memory" | "/mem" => {
            crate::repl::handle_memory(arg);
            SlashResult::SystemMessage("Memory shown above.".to_string())
        }

        // ── Voice ──
        // The slash handler is sync and `run_voice_mode` is async, which is why
        // this used to print "Voice mode requires the REPL" over a complete
        // implementation. It does not require the REPL — it requires leaving the
        // alt-screen, which is exactly what RunLogin/RunAdvisor already do.
        "/voice" | "/v" => {
            let lang = if arg.is_empty() { "en" } else { arg };
            if crate::voice::is_valid_language(lang) {
                SlashResult::RunVoice(lang.to_string())
            } else {
                let langs = crate::voice::supported_languages();
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
                // Direct-set: /theme dark|light|ansi|solarized-dark|solarized-light|colorblind
                use super::widgets::theme_picker::ThemeChoice;
                match ThemeChoice::from_arg(arg) {
                    Some(choice) => {
                        app.theme_choice = choice;
                        crate::tui::terminal_palette::set_active_theme(choice as u8);
                        let _ = app.config.persist_theme_project(choice.slug());
                        SlashResult::SystemMessage(format!("Theme set to {}", choice.label()))
                    }
                    None => SlashResult::SystemMessage(format!(
                        "Unknown theme: '{arg}'. Available: dark | light | ansi | solarized-dark | solarized-light | colorblind"
                    )),
                }
            }
        }

        // ── Side query ──
        "/btw" => {
            if arg.is_empty() {
                SlashResult::SystemMessage("Usage: /btw <question> — ask a side question".to_string())
            } else {
                // Send as a prompt but mark as side query
                SlashResult::SendAsPrompt
            }
        }

        // ── Context (alias) ──
        "/ctx" => {
            let ctx = crate::model_catalog::context_window(&app.model_name);
            let used = app.total_input_tokens + app.total_output_tokens;
            SlashResult::SystemMessage(format!(
                "Context: {}% used ({} / {} tokens)",
                app.context_percent(), used, ctx
            ))
        }

        // ── Review ──
        "/review" => {
            // Trigger code review by sending a review prompt to the LLM
            let review_prompt = if arg.is_empty() {
                "Please review my current code changes. Run `git diff` to see what changed, then analyze for bugs, security issues, and improvements.".to_string()
            } else {
                format!("Please review the code related to: {arg}. Look for bugs, security issues, and improvements.")
            };
            SlashResult::SendPrompt(review_prompt)
        }

        "/effort" | "/e" => {
            if arg.is_empty() {
                // Open the interactive effort picker overlay.
                app.effort_picker.open(app.effort);
                SlashResult::SystemMessage(String::new()) // picker handles confirmation
            } else {
                // Direct-set: /effort low|medium|high|max
                let new_effort = match arg.to_lowercase().as_str() {
                    "low" | "l" => Some(crate::design_system::Effort::Low),
                    "medium" | "med" | "m" => Some(crate::design_system::Effort::Medium),
                    "high" | "h" => Some(crate::design_system::Effort::High),
                    "max" => Some(crate::design_system::Effort::Max),
                    _ => None,
                };
                match new_effort {
                    Some(e) => {
                        app.effort = e;
                        SlashResult::SystemMessage(format!("Effort set to {}", e.label()))
                    }
                    None => SlashResult::SystemMessage(format!(
                        "Unknown effort level '{arg}'. Use: low | medium | high | max"
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
                turn_count: app.session.turn_count,
                model: app.session.model.clone(),
            };
            SlashResult::SystemMessage(render_usage(&usage))
        }

        // ── New interactive overlays ──

        "/memories" => {
            use crate::tui::widgets::memories_settings::{MemoriesSettingsView, MemorySettings};
            // Seed from the persisted settings; save commits back via take_result.
            let (auto_memory, decay_threshold_days, max_facts) =
                crate::config::CliConfig::config_dir()
                    .map(|home| crate::memory_pipeline::load_memory_settings(&home))
                    .unwrap_or((true, 30, 500));
            let view = MemoriesSettingsView::new(MemorySettings {
                auto_memory,
                decay_threshold_days,
                max_facts,
            });
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
            let status_out = std::process::Command::new("git")
                .args(["status", "--porcelain"])
                .output()
                .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                .unwrap_or_default();
            let changed_paths: Vec<String> = status_out
                .lines()
                .filter_map(|line| {
                    let path = line.get(3..)?;
                    if path.is_empty() { None } else { Some(path.to_string()) }
                })
                .collect();
            if changed_paths.is_empty() {
                SlashResult::SystemMessage("No changed files (working tree clean).".into())
            } else {
                // For each changed file, run `git diff HEAD -- <path>` to get real hunks.
                // Untracked files use an empty diff body (no HEAD revision to compare).
                let files: Vec<FileDiff> = changed_paths.iter().map(|path| {
                    let diff_text = std::process::Command::new("git")
                        .args(["diff", "HEAD", "--", path])
                        .output()
                        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                        .unwrap_or_default();
                    let mut additions = 0usize;
                    let mut deletions = 0usize;
                    let mut hunks: Vec<String> = Vec::new();
                    for line in diff_text.lines() {
                        if line.starts_with('+') && !line.starts_with("+++") {
                            additions += 1;
                            hunks.push(line.to_string());
                        } else if line.starts_with('-') && !line.starts_with("---") {
                            deletions += 1;
                            hunks.push(line.to_string());
                        } else if line.starts_with("@@") {
                            hunks.push(line.to_string());
                        }
                    }
                    FileDiff::new(path.as_str(), hunks, additions, deletions)
                }).collect();
                let view = DiffReviewView::new(files);
                app.open_overlay(Box::new(view));
                SlashResult::SystemMessage(
                    "Diff review (\u{2191}\u{2193} navigate \u{00b7} y approve \u{00b7} n reject \u{00b7} s skip \u{00b7} Enter done \u{00b7} Esc close)".into(),
                )
            }
        }

        "/focus" => {
            SlashResult::SystemMessage("Focus mode: hide chrome and maximize composer width. Currently controlled via --no-status-bar flag at startup.".into())
        }

        "/advisor" => {
            if arg.is_empty() {
                SlashResult::SystemMessage(
                    "Usage: /advisor <question> — consult a catalog-selected advisor model".into(),
                )
            } else {
                SlashResult::RunAdvisor(arg.to_string())
            }
        }

        "/team-onboarding" | "/onboarding" => {
            let path = std::path::PathBuf::from(std::env::var("HOME").unwrap_or_default())
                .join(".claude")
                .join("team-onboarding.md");
            if path.exists() {
                match std::fs::read_to_string(&path) {
                    Ok(content) => SlashResult::SystemMessage(format!("# Team onboarding\n\n{content}")),
                    Err(e) => SlashResult::SystemMessage(format!("Failed to read {}: {e}", path.display())),
                }
            } else {
                SlashResult::SystemMessage(format!(
                    "No team-onboarding guide found at {}. Run `agi onboarding` to generate one.",
                    path.display()
                ))
            }
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
            SlashResult::SystemMessage(
                "Pricing & extra usage:\n  https://agiworkforce.com/pricing\nLocal + BYOK: free forever.\nManaged cloud: public alpha, open to signed-in users with metered plan usage.".into()
            )
        }

        "/remote-env" => {
            let mut lines = vec!["# Remote-env defaults".to_string()];
            for key in ["AGIWORKFORCE_API_BASE", "AGIWORKFORCE_PROXY", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"] {
                let v = std::env::var(key).unwrap_or_else(|_| "<unset>".into());
                lines.push(format!("{key} = {v}"));
            }
            SlashResult::SystemMessage(lines.join("\n"))
        }

        "/keybindings" | "/keys" => SlashResult::SystemMessage(app.keybindings.render_help(
            crate::keybindings::resolved_edit_mode(app.config.ui.edit_mode.as_deref()),
        )),

        _ => {
            if let Some(prompt) = crate::custom_commands::expand_custom_slash_invocation(input) {
                return SlashResult::SendPrompt(prompt);
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
                    app.input = prompt;
                    app.cursor = app.input.len();
                    SlashResult::SystemMessage(format!(
                        "Drafted {} continuation for provider `{provider}`. Review the exact payload before pressing Enter; edits require a fresh preview.",
                        match destination {
                            crate::agent::PrivacyMode::Byok => "BYOK",
                            crate::agent::PrivacyMode::Managed => "Managed Cloud",
                            crate::agent::PrivacyMode::Local => "Local",
                        }
                    ))
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
        "/output-style" if !arg.trim().is_empty() => {
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
    _fallback_model: Option<String>,
    _session_name: Option<String>,
    team_mode: bool,
    auto_approve_safe: bool,
    quiet: bool,
    provider_override: Option<String>,
    permission_mode: crate::cli_options::PermissionMode,
    auto_approve_plan: bool,
    sandbox_disabled: bool,
    allowed_tools: Vec<String>,
    disallowed_tools: Vec<String>,
    mcp_config_options: crate::mcp::McpConfigLoadOptions,
    agent_name: Option<String>,
    auto_route_seed: Option<crate::routing::classify::AutoRouteSeed>,
) -> Result<()> {
    let effective_provider_override = crate::models::selection_provider_override(
        model,
        &config.default.model,
        &config.default.provider,
        provider_override.as_deref(),
    );
    let mut session = AgentSession::new_checked(
        model,
        sys_context,
        custom_system_prompt,
        effective_provider_override,
    )?;
    session.apply_ui_config(config);
    session.max_turns = max_turns;
    session.skip_permissions = skip_permissions;
    session.auto_approve_safe = auto_approve_safe;
    session.quiet = quiet;
    // Sprint B4: thread the initial permission mode + headless
    // auto-approve flag so the TUI launch path matches `--mode plan`
    // semantics from `repl::run_repl` and `run_oneshot`.
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
                eprintln!("Agent '{}' loaded.", agent_def.name);
            }
            None => {
                eprintln!(
                    "Warning: agent '{}' not found. Run /agents to list available agents.",
                    name
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

    // Do NOT block TUI startup on MCP connect / OAuth. Spawn the connect
    // (including any browser-OAuth dance) on a background task; the resulting
    // manager is injected into the session once it's ready (drained
    // non-blockingly in the event loop). This stops the default TUI from hanging
    // up to OAUTH_INTERACTIVE_TIMEOUT at launch when a repo `.mcp.json` declares
    // an HTTP-OAuth server. Mirrors the REPL's P0-1 fix; until the manager is
    // ready, turns simply run without MCP tools.
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
    // `/models` endpoint — no key needed) so the model picker can list current
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
            session_id: None,
            model: Some(model.to_string()),
            tool_name: None,
            tool_args: None,
            tool_output: None,
            message: None,
            tool_execution: None,
        },
    )
    .await;

    let mut app = TuiApp::new(session, config.clone(), sandbox_disabled);
    app.mcp_elicitation_handler = mcp_elicitation_handler;
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
    let mut terminal = setup_terminal()?;

    let result = run_event_loop(&mut terminal, &mut app, &mut mcp_attach_join).await;

    // Abort the background MCP attach if it never finished (e.g. OAuth still
    // pending) so it can't keep a browser-wait or connection alive after exit.
    if let Some(handle) = mcp_attach_join.take() {
        handle.abort();
    }

    restore_terminal(&mut terminal)?;

    if let Err(error) = app.session.finalize_memory(&app.config).await {
        crate::output::print_warn(&format!("Session memory extraction failed: {error:#}"));
    }

    // Session end hooks
    crate::hooks::run_hooks(
        &hooks_config,
        crate::hooks::HookEvent::SessionEnd,
        &crate::hooks::HookInput {
            event: "SessionEnd".to_string(),
            session_id: None,
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
        &app.session.model,
        app.session.total_input_tokens,
        app.session.total_output_tokens,
        app.session.turn_count,
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
        // Inject the MCP manager once the background attach finishes — without
        // blocking the UI. Until then, turns simply run without MCP tools.
        if mcp_attach_join
            .as_ref()
            .map(|h| h.is_finished())
            .unwrap_or(false)
        {
            if let Some(handle) = mcp_attach_join.take() {
                if let Ok(Some(mgr)) = handle.await {
                    app.session.set_mcp_manager(mgr);
                    // `TuiApp::new` only saw whatever MCP prompts were
                    // available *before* this background attach finished
                    // (almost always none — that's the whole point of not
                    // blocking startup on it). Refresh the command registry
                    // now so `/mcp:<server>:<prompt>` becomes dispatchable
                    // and shows up in the `/` command popup as soon as the
                    // servers are actually connected.
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

        if event::poll(Duration::from_millis(TICK_RATE_MS))? {
            let action = match event::read()? {
                Event::Key(key) => handle_key_event(app, key),
                Event::Paste(text) => {
                    handle_paste_text(app, &text);
                    InputAction::None
                }
                _ => InputAction::None,
            };

            match action {
                InputAction::Quit => {
                    let hcfg = app.session.hooks_config().clone();
                    crate::hooks::run_hooks(
                        &hcfg,
                        crate::hooks::HookEvent::Stop,
                        &crate::hooks::HookInput {
                            event: "Stop".to_string(),
                            session_id: None,
                            model: Some(app.session.model.clone()),
                            tool_name: None,
                            tool_args: None,
                            tool_output: None,
                            message: Some("Esc".to_string()),
                            tool_execution: None,
                        },
                    )
                    .await;
                    app.should_quit = true;
                }

                InputAction::CycleMode => {
                    let new_mode = app.mode.next();
                    apply_mode(app, new_mode);
                    // Stamp the banner so it shows for MODE_BANNER_TTL seconds.
                    app.mode_banner_shown_at = Some(Instant::now());
                    let mut msg = format!("{} — {}", app.mode.label(), mode_description(app.mode));
                    if new_mode == InteractionMode::BypassPermissions {
                        msg.push_str("\n\n  WARNING: All tool confirmations are bypassed!");
                        msg.push_str(
                            "\n  This means commands will execute without asking you first.",
                        );
                        msg.push_str("\n  Press Shift+Tab again to advance to FullAuto, or cycle back to Default.");
                    }
                    if new_mode == InteractionMode::FullAuto {
                        msg.push_str(
                            "\n\n  WARNING: Full-auto mode — no prompts, no confirmations.",
                        );
                        msg.push_str("\n  Use with extreme caution in trusted environments only.");
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
                            session_id: None,
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

                InputAction::SendMessage(text) => {
                    // Detect natural language mode switches.
                    let mut handled_as_mode_command = false;
                    if let Some(new_mode) = detect_mode_intent(&text) {
                        apply_mode(app, new_mode);
                        let hcfg = app.session.hooks_config().clone();
                        crate::hooks::run_hooks(
                            &hcfg,
                            crate::hooks::HookEvent::PlanModeChanged,
                            &crate::hooks::HookInput {
                                event: "PlanModeChanged".to_string(),
                                session_id: None,
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
                            text: format!("{} — {}", app.mode.label(), mode_description(app.mode)),
                        });
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
                            SlashResult::RunLogin => {
                                // Leave TUI, run interactive login, re-enter TUI
                                restore_terminal(terminal)?;
                                let result =
                                    crate::auth::interactive_login_for_provider(None).await;
                                *terminal = setup_terminal()?;
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
                            SlashResult::RunVoice(lang) => {
                                // Voice owns the terminal (it prints prompts and
                                // reads audio state), so drop the alt-screen for
                                // the duration and restore it after — the same
                                // shape as RunLogin above.
                                restore_terminal(terminal)?;
                                let result = crate::voice::run_voice_mode(
                                    &mut app.session,
                                    &app.config,
                                    &lang,
                                )
                                .await;
                                *terminal = setup_terminal()?;
                                app.sync_stats();
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text: match result {
                                        Ok(()) => "Voice session ended.".to_string(),
                                        Err(e) => format!("Voice mode failed: {e}"),
                                    },
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
                            SlashResult::RunLogout => {
                                let mut store = crate::auth::load_auth().unwrap_or_default();
                                store.entries.clear();
                                let _ = crate::auth::save_auth(&store);
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text: "Logged out from all providers.".to_string(),
                                });
                            }
                            SlashResult::NotSlash | SlashResult::SendAsPrompt => {
                                send_message(terminal, app, &text).await?;
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
                                    require_confirmation: false,
                                    auto_approve_safe: true,
                                    quiet: true,
                                    approval_callback: None,
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

                InputAction::ClearChat => {
                    app.session.clear();
                    app.chat_messages.clear();
                    app.tool_cells.clear();
                    app.scroll_offset = 0;
                    app.sync_stats();
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
            ..
        } => {
            cells.push(ToolCell {
                call_id,
                name,
                summary,
                state: TranscriptCellState::Running,
                output_preview: None,
            });
        }
        TuiAppEvent::ToolCompleted {
            call_id,
            status,
            output,
            ..
        } => {
            if let Some(cell) = cells.iter_mut().find(|c| c.call_id == call_id) {
                cell.state = match status {
                    ToolStatus::Failed => TranscriptCellState::Failed,
                    ToolStatus::Cancelled => TranscriptCellState::Cancelled,
                    _ => TranscriptCellState::Complete,
                };
                cell.output_preview = compact_tool_output_preview(&output);
            }
        }
        _ => {}
    }
}

fn compact_tool_output_preview(output: &str) -> Option<String> {
    let line = output
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())?;
    const MAX_COLS: usize = 96;
    Some(truncate_cols(line, MAX_COLS))
}

async fn send_message(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    app: &mut TuiApp,
    user_text: &str,
) -> Result<()> {
    let hooks_cfg = app.session.hooks_config().clone();
    crate::hooks::run_hooks(
        &hooks_cfg,
        crate::hooks::HookEvent::UserPromptSubmit,
        &crate::hooks::HookInput {
            event: "UserPromptSubmit".to_string(),
            session_id: None,
            model: Some(app.session.model.clone()),
            tool_name: None,
            tool_args: None,
            tool_output: None,
            message: Some(user_text.to_string()),
            tool_execution: None,
        },
    )
    .await;

    app.chat_messages.push(ChatMessage {
        role: ChatRole::User,
        text: user_text.to_string(),
    });

    app.is_loading = true;
    app.scroll_offset = 0;
    app.stream_buffer.clear();
    app.tool_cells.clear();
    app.stream_start = Some(Instant::now());
    render(terminal, app)?;

    let response_buf = Arc::new(Mutex::new(String::new()));
    let buf_for_callback = Arc::clone(&response_buf);
    let buf_for_display = Arc::clone(&response_buf);

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

    // Stream tool lifecycle events into a local cell list during the turn, then
    // surface them in the transcript after it ends. Drained in the select! loop
    // below into a local Vec (never `app`) so it can't conflict with the
    // `&mut app.session` borrow the turn future holds. A live mid-turn spinner
    // needs the spawned agent-task model (future work); for now the cells appear
    // once the turn completes — already a large win over invisible tool calls.
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
    let turn_cost_str = crate::output::format_cost(
        &app.session.model,
        app.session.total_input_tokens,
        app.session.total_output_tokens,
    );

    let result = {
        let callback = Box::new(move |chunk: &str| {
            if let Ok(mut buf) = buf_for_callback.lock() {
                buf.push_str(chunk);
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
                            model_name: &app.model_name,
                            statusline: &app.statusline_config,
                            provider_name: &app.provider_name,
                            git_branch: app.git_branch.as_deref(),
                            total_input_tokens: app.total_input_tokens,
                            total_output_tokens: app.total_output_tokens,
                            turn_count: app.turn_count,
                            context_percent: context_percent_for(
                                &app.model_name,
                                app.total_input_tokens,
                                app.total_output_tokens,
                            ),
                            chat_messages: &app.chat_messages,
                            tool_cells: &tool_cells,
                            is_loading: app.is_loading,
                            stream_start: app.stream_start,
                            stream_buffer: &app.stream_buffer,
                            spinner_char: spinner_frame(app.spinner_tick),
                            loading_verb: loading_verb_for(app.turn_count),
                            scroll_offset: app.scroll_offset,
                            access_mode: turn_access_mode,
                            privacy_mode: turn_privacy_mode,
                            mode: app.mode,
                            effort_label: app.effort.label(),
                            sandbox_type: app.sandbox_type,
                            cost_str: turn_cost_str.clone(),
                        };
                        let choice = run_tui_approval_modal(terminal, &approval_ctx, &req)?;
                        broker
                            .complete(req.id, approval_choice_to_decision(choice))
                            .await;
                        if matches!(
                            choice,
                            crate::tui::widgets::approval_overlay::ApprovalChoice::DenyAll
                        ) {
                            // Stop prompting for the rest of this turn.
                            broker.deny_all_remaining().await;
                        }
                    }
                }
                Some(ev) = tool_rx.recv() => {
                    apply_tool_event(&mut tool_cells, ev);
                }
                _ = tokio::time::sleep(std::time::Duration::from_millis(80)) => {
                    // The UI is parked during a turn (the send future holds a &mut
                    // borrow of the session), so this tick is the only place we can
                    // honor a cancel keystroke. Poll non-blockingly; Esc or Ctrl-C
                    // aborts by breaking out, which drops `send_fut` and cancels the
                    // in-flight stream.
                    if crossterm::event::poll(std::time::Duration::ZERO)? {
                        if let crossterm::event::Event::Key(key) = crossterm::event::read()? {
                            let cancel = key.code == crossterm::event::KeyCode::Esc
                                || (key.code == crossterm::event::KeyCode::Char('c')
                                    && key
                                        .modifiers
                                        .contains(crossterm::event::KeyModifiers::CONTROL));
                            if cancel {
                                break None;
                            }
                        }
                    }

                    // Live redraw. Pull the latest streamed text into a disjoint
                    // `app` field, advance the spinner, mirror tool cells, then
                    // draw a frame built entirely from fields *other* than
                    // `app.session` (still borrowed by `send_fut`).
                    if let Ok(b) = buf_for_display.lock() {
                        app.stream_buffer = b.clone();
                    }
                    app.spinner_tick = app.spinner_tick.wrapping_add(1);
                    let ctx = FrameCtx {
                        model_name: &app.model_name,
                        statusline: &app.statusline_config,
                        provider_name: &app.provider_name,
                        git_branch: app.git_branch.as_deref(),
                        total_input_tokens: app.total_input_tokens,
                        total_output_tokens: app.total_output_tokens,
                        turn_count: app.turn_count,
                        context_percent: context_percent_for(
                            &app.model_name,
                            app.total_input_tokens,
                            app.total_output_tokens,
                        ),
                        chat_messages: &app.chat_messages,
                        tool_cells: &tool_cells,
                        is_loading: app.is_loading,
                        stream_start: app.stream_start,
                        stream_buffer: &app.stream_buffer,
                        spinner_char: spinner_frame(app.spinner_tick),
                        loading_verb: loading_verb_for(app.turn_count),
                        scroll_offset: app.scroll_offset,
                        access_mode: turn_access_mode,
                        privacy_mode: turn_privacy_mode,
                        mode: app.mode,
                        effort_label: app.effort.label(),
                        sandbox_type: app.sandbox_type,
                        cost_str: turn_cost_str.clone(),
                    };
                    render_turn_frame(terminal, &ctx)?;

                    // MCP servers may also elicit input MID-turn: the engine's
                    // read-loop parks awaiting the response, so the queue must
                    // be driven here too (the idle-loop drain at the top of
                    // `run_app` only runs between turns). Mirrors the approval
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
    app.tool_cells = tool_cells;

    // Copy final streamed content into stream_buffer for last render
    if let Ok(buf) = buf_for_display.lock() {
        app.stream_buffer = buf.clone();
    }

    app.is_loading = false;
    app.stream_start = None;

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

            app.sync_stats();
        }
        Some(Err(e)) => {
            app.chat_messages.push(ChatMessage {
                role: ChatRole::System,
                text: format!("Error: {:#}", e),
            });
        }
        None => {
            // Cancelled mid-stream (Esc / Ctrl-C). Keep whatever streamed so far
            // and reconcile session history so the next turn stays a valid
            // user→assistant sequence.
            let partial = app.stream_buffer.clone();
            app.session.finalize_cancelled_turn(&partial);
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
    fn accept_edits_description_matches_safe_tool_approval_behavior() {
        assert_eq!(
            mode_description(InteractionMode::AcceptEdits),
            "Safe, read-only operations run automatically; writes and commands still require approval."
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
        // data leaves the device — must NOT read as Local).
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
    /// must produce an observable "denied" tool result and never touch disk —
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
                require_confirmation: true,
                auto_approve_safe: false,
                quiet: true,
                approval_callback: Some(callback),
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
                require_confirmation: true,
                auto_approve_safe: false,
                quiet: true,
                approval_callback: Some(callback),
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
                require_confirmation: true,
                auto_approve_safe: false,
                quiet: true,
                approval_callback: Some(callback),
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

        // The denied tool observed Deny: it failed and never touched disk —
        // proving the two decisions were routed per-request, not swapped.
        assert!(!deny_success, "denied tool must report failure");
        assert!(!deny_exists, "denied tool must not create its file on disk");
    }

    // Build the thinnest possible TuiApp without touching the filesystem or
    // spawning terminals — we only test the overlay slot, not the TUI render.
    fn minimal_app() -> TuiApp {
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
        let config = crate::config::CliConfig::default();
        TuiApp::new(session, config, true /* sandbox_disabled */)
    }

    /// Regression: `/voice` in the TUI printed "Voice mode requires the REPL
    /// (not TUI). Run: agi --no-tui --voice-lang en" on top of a complete,
    /// working 1,186-line implementation. Voice never needed the REPL — it
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

        // An unsupported language is rejected in place, listing what works —
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

        // Down — consumed by overlay, not forwarded
        let consumed = app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::Down));
        assert!(consumed);
        assert!(app.active_overlay.is_some(), "overlay stays open on Down");

        // Enter — overlay should close and slot cleared
        let consumed = app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::Enter));
        assert!(consumed);
        assert!(app.active_overlay.is_none(), "overlay cleared after Submit");
    }

    #[test]
    fn closed_overlay_is_cleared_on_esc() {
        let mut app = minimal_app();
        app.open_overlay(Box::new(StubView::new(false)));
        assert!(app.active_overlay.is_some());

        let consumed = app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::Esc));
        assert!(consumed);
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
        assert!(consumed);
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
            Some("agi — some-model · myrepo · ⎇ main".to_string())
        );
        let only_id = TerminalTitleConfig {
            show_session_id: true,
            show_model: false,
            show_cwd: false,
            show_branch: false,
        };
        assert_eq!(
            build_terminal_title(&only_id, "abcdef12", "m", "c", Some("b")),
            Some("agi — #abcdef12".to_string())
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
        assert!(!consumed, "no overlay → dispatch returns false");
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

    #[test]
    fn slash_palette_selection_fills_composer_once() {
        let mut app = minimal_app();
        app.open_overlay(Box::new(SlashActionView));

        let consumed = app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::Enter));

        assert!(consumed);
        assert!(app.active_overlay.is_none());
        assert_eq!(app.input, "/plan");
        assert_eq!(app.cursor, app.input.len());
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
        assert!(consumed);
        assert_eq!(app.overlay_scroll, 5);

        let consumed = app.dispatch_key_to_overlay(make_key(crossterm::event::KeyCode::PageUp));
        assert!(consumed);
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
            "plugin",
            "plugins",
            "marketplace",
            "market",
            "memory",
            "mem",
            "voice",
            "v",
            "theme",
            "btw",
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
            "focus",
            "advisor",
            "team-onboarding",
            "onboarding",
            "terminal-setup",
            "shell-setup",
            "reload-plugins",
            "extra-usage",
            "pricing",
            "remote-env",
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
    /// same `terminal.draw` closure — mirroring how `render()` composites
    /// `active_overlay`/pickers over the main frame instead of replacing it.
    ///
    /// This exercises the exact draw sequence `run_tui_approval_modal` performs
    /// (`draw_turn_chrome` then `overlay.render_into` in one `terminal.draw`)
    /// against a `TestBackend` and asserts the rendered buffer contains BOTH
    /// the chrome (header title + a distinctive transcript message) AND the
    /// approval box, proving compositing rather than full-frame replacement.
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
            model_name: "gemma4:e4b",
            statusline: &statusline_cfg,
            provider_name: "ollama",
            git_branch: None,
            total_input_tokens: 10,
            total_output_tokens: 5,
            turn_count: 1,
            context_percent: 1,
            chat_messages: &chat_messages,
            tool_cells: &tool_cells,
            is_loading: true,
            stream_start: None,
            stream_buffer: "",
            spinner_char: "⠋",
            loading_verb: "Reasoning",
            scroll_offset: 0,
            access_mode: crate::design_system::AccessMode::Local,
            privacy_mode: crate::agent::PrivacyMode::Local,
            mode: InteractionMode::Chat,
            effort_label: "Medium",
            sandbox_type: None,
            cost_str: "$0.00".to_string(),
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
            rendered.contains("gemma4:e4b"),
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
}
