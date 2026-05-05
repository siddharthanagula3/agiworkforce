use std::io::{self, Stdout};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::Result;
use crossterm::event::{self, Event, KeyCode, KeyEvent, KeyModifiers};
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use crossterm::ExecutableCommand;
use ratatui::backend::CrosstermBackend;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, List, ListItem, Paragraph, Wrap};
use ratatui::Terminal;

use crate::agent::AgentSession;
use crate::command_registry::{
    registry_from_builtins_skills_and_prompts, CommandRegistry, RegistryCommand,
};
use crate::config::CliConfig;
use crate::context::SystemContext;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TICK_RATE_MS: u64 = 50;

// ---------------------------------------------------------------------------
// Interaction mode (Shift+Tab cycling)
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum InteractionMode {
    Chat,
    Plan,
    AcceptEdits,
    BypassPermissions,
    Debug,
}

impl InteractionMode {
    fn next(self) -> Self {
        match self {
            Self::Chat => Self::Plan,
            Self::Plan => Self::AcceptEdits,
            Self::AcceptEdits => Self::BypassPermissions,
            Self::BypassPermissions => Self::Debug,
            Self::Debug => Self::Chat,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Chat => "CHAT",
            Self::Plan => "PLAN",
            Self::AcceptEdits => "ACCEPT EDITS",
            Self::BypassPermissions => "BYPASS PERMS",
            Self::Debug => "DEBUG",
        }
    }

    fn color(self) -> Color {
        match self {
            Self::Chat => Color::Cyan,
            Self::Plan => Color::Yellow,
            Self::AcceptEdits => Color::Green,
            Self::BypassPermissions => Color::Red,
            Self::Debug => Color::Magenta,
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

// ---------------------------------------------------------------------------
// TUI App state
// ---------------------------------------------------------------------------

struct TuiApp {
    session: AgentSession,
    config: CliConfig,
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
    // Slash command popup
    show_slash_popup: bool,
    slash_filter: String,
    slash_selected: usize,
    // Model picker popup (new widget-based state)
    model_picker: super::widgets::model_picker::ModelPickerState,
    // Streaming
    stream_buffer: String,
    stream_start: Option<Instant>,
    // Git branch
    git_branch: Option<String>,
    command_registry: CommandRegistry,
    // Fallback rotation banner — shared with the agent send loop. The banner
    // self-clears after FALLBACK_BANNER_TTL seconds.
    fallback_banner: Arc<std::sync::Mutex<Option<FallbackBanner>>>,
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
        let model_name = session.model.clone();
        let provider_name = format!("{:?}", session.provider).to_lowercase();
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

        Self {
            session,
            config,
            chat_messages: Vec::new(),
            input: String::new(),
            cursor: 0,
            scroll_offset: 0,
            is_loading: false,
            spinner_tick: 0,
            should_quit: false,
            model_name,
            provider_name,
            turn_count: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            mode: InteractionMode::Chat,
            show_slash_popup: false,
            slash_filter: String::new(),
            slash_selected: 0,
            model_picker: super::widgets::model_picker::ModelPickerState::default(),
            stream_buffer: String::new(),
            stream_start: None,
            git_branch,
            command_registry: registry_from_builtins_skills_and_prompts(
                &crate::skills::discover_skills(),
                &[],
            ),
            fallback_banner: Arc::new(std::sync::Mutex::new(None)),
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
        const FRAMES: &[&str] = &["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
        FRAMES[(self.spinner_tick as usize) % FRAMES.len()]
    }

    fn filtered_commands(&self) -> Vec<RegistryCommand> {
        self.command_registry
            .commands()
            .iter()
            .filter(|cmd| cmd.matches_filter(&self.slash_filter))
            .cloned()
            .collect()
    }

    fn context_percent(&self) -> u8 {
        let ctx_window = crate::model_catalog::context_window(&self.model_name) as u64;
        if ctx_window == 0 {
            return 0;
        }
        // Token counts are already in tokens, context_window is in tokens — no conversion needed
        let used = self.total_input_tokens as u64 + self.total_output_tokens as u64;
        ((used * 100) / ctx_window).min(100) as u8
    }
}

// ---------------------------------------------------------------------------
// Terminal setup
// ---------------------------------------------------------------------------

fn setup_terminal() -> Result<Terminal<CrosstermBackend<Stdout>>> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    stdout.execute(EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let terminal = Terminal::new(backend)?;
    Ok(terminal)
}

fn restore_terminal(terminal: &mut Terminal<CrosstermBackend<Stdout>>) -> Result<()> {
    disable_raw_mode()?;
    terminal.backend_mut().execute(LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

fn render(terminal: &mut Terminal<CrosstermBackend<Stdout>>, app: &TuiApp) -> Result<()> {
    terminal.draw(|frame| {
        let area = frame.area();

        let chunks = Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3), // header
                Constraint::Min(5),    // chat area
                Constraint::Length(3), // input
                Constraint::Length(1), // status bar
            ])
            .split(area);

        render_header(frame, chunks[0], app);
        render_chat(frame, chunks[1], app);
        render_input(frame, chunks[2], app);
        render_status_bar(frame, chunks[3], app);
        render_fallback_banner(frame, chunks[1], app);

        // Live cost HUD anchored to the top-right; sits on top of the header
        // border so it never steals real-estate from the chat area.
        let hud = super::cost_hud::CostHud {
            in_tokens: app.total_input_tokens,
            out_tokens: app.total_output_tokens,
            cache_read: app.session.total_cache_read_tokens,
            cache_creation: app.session.total_cache_creation_tokens,
            context_used: app.total_input_tokens as u64
                + app.total_output_tokens as u64,
            context_window: crate::model_catalog::context_window(&app.model_name) as u64,
        };
        super::cost_hud::render(frame, area, &hud, &app.model_name);

        // Popups (only one visible at a time)
        if app.model_picker.visible {
            super::widgets::model_picker::render(
                frame,
                chunks[1],
                &app.model_picker,
                &app.model_name,
            );
        } else if app.show_slash_popup {
            render_slash_popup(frame, chunks[1], app);
        }
    })?;
    Ok(())
}

fn render_header(frame: &mut ratatui::Frame, area: Rect, app: &TuiApp) {
    let provider_display = match app.provider_name.as_str() {
        "ollama" => "Local",
        other => other,
    };

    let mut spans = vec![
        Span::styled(
            " AGI Workforce ",
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            format!(" v{} ", env!("CARGO_PKG_VERSION")),
            Style::default().fg(Color::DarkGray),
        ),
        Span::raw(" │ "),
        Span::styled(
            &app.model_name,
            Style::default()
                .fg(Color::White)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw(" │ "),
        Span::styled(provider_display, Style::default().fg(Color::Green)),
    ];

    if let Some(ref branch) = app.git_branch {
        spans.push(Span::raw(" │ "));
        spans.push(Span::styled(
            format!(" {branch}"),
            Style::default().fg(Color::Magenta),
        ));
    }

    spans.push(Span::raw(" │ "));
    spans.push(Span::styled(
        format!("{}% ctx", app.context_percent()),
        Style::default().fg(if app.context_percent() > 80 {
            Color::Red
        } else {
            Color::DarkGray
        }),
    ));

    let header_text = Line::from(spans);

    let tokens_text = format!(
        " {}in / {}out │ Turns: {} ",
        crate::output::format_tokens(app.total_input_tokens),
        crate::output::format_tokens(app.total_output_tokens),
        app.turn_count,
    );

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::DarkGray))
        .title_bottom(Line::from(Span::styled(
            tokens_text,
            Style::default().fg(Color::DarkGray),
        )));

    let header = Paragraph::new(header_text).block(block);
    frame.render_widget(header, area);
}

fn render_chat(frame: &mut ratatui::Frame, area: Rect, app: &TuiApp) {
    let mut lines: Vec<Line> = Vec::new();

    if app.chat_messages.is_empty() && !app.is_loading {
        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled(
            "  Welcome to AGI Workforce TUI",
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        )));
        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled(
            "  Type a message and press Enter to send.",
            Style::default().fg(Color::DarkGray),
        )));
        lines.push(Line::from(Span::styled(
            "  Type / for commands. Shift+Tab to switch modes.",
            Style::default().fg(Color::DarkGray),
        )));
        lines.push(Line::from(Span::styled(
            "  Press Esc to quit.",
            Style::default().fg(Color::DarkGray),
        )));
    } else {
        for msg in &app.chat_messages {
            if !lines.is_empty() {
                lines.push(Line::from(""));
            }

            let (prefix, prefix_style) = match msg.role {
                ChatRole::User => (
                    "  > ",
                    Style::default()
                        .fg(Color::Green)
                        .add_modifier(Modifier::BOLD),
                ),
                ChatRole::Assistant => (
                    "  ✦ ",
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                ),
                ChatRole::System => (
                    "  ℹ ",
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                ),
                ChatRole::Tool => ("  ▸ ", Style::default().fg(Color::Magenta)),
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
                        ChatRole::User => Style::default().fg(Color::White),
                        ChatRole::System => Style::default().fg(Color::Yellow),
                        ChatRole::Tool => Style::default().fg(Color::DarkGray),
                        _ => Style::default().fg(Color::White),
                    };
                    let content = format!("    {text_line}");
                    lines.push(Line::from(parse_inline_md(&content, style)));
                }
            }
        }
    }

    // Loading indicator with shimmer
    if app.is_loading {
        lines.push(Line::from(""));
        let elapsed = app.stream_start.map(|s| s.elapsed()).unwrap_or_default();
        let elapsed_str = if elapsed.as_secs() >= 60 {
            format!("{}m {}s", elapsed.as_secs() / 60, elapsed.as_secs() % 60)
        } else {
            format!("{}s", elapsed.as_secs())
        };
        lines.push(Line::from(vec![
            Span::styled(
                format!("  {} ", app.spinner_char()),
                Style::default().fg(Color::Cyan),
            ),
            Span::styled(
                format!("Thinking... {elapsed_str}"),
                Style::default()
                    .fg(Color::DarkGray)
                    .add_modifier(Modifier::ITALIC),
            ),
        ]));

        // Show streaming buffer
        if !app.stream_buffer.is_empty() {
            for line in app.stream_buffer.lines().take(5) {
                lines.push(Line::from(Span::styled(
                    format!("    {line}"),
                    Style::default().fg(Color::White),
                )));
            }
        }
    }

    // Scroll
    let visible_height = area.height.saturating_sub(2) as usize;
    let total_lines = lines.len();
    let max_scroll = total_lines.saturating_sub(visible_height) as u16;
    let effective_scroll = app.scroll_offset.min(max_scroll);
    let scroll_pos = max_scroll.saturating_sub(effective_scroll);

    let block = Block::default()
        .borders(Borders::LEFT | Borders::RIGHT)
        .border_style(Style::default().fg(Color::DarkGray));

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
    let code_style = Style::default().fg(Color::Yellow);

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
    let display_text = if app.input.is_empty() && !app.is_loading {
        "Type your message... (/ for commands, Shift+Tab to switch mode)"
    } else {
        &app.input
    };

    let style = if app.input.is_empty() && !app.is_loading {
        Style::default().fg(Color::DarkGray)
    } else {
        Style::default().fg(Color::White)
    };

    let prompt_char = match app.mode {
        InteractionMode::Chat => "> ",
        InteractionMode::Plan => "P ",
        InteractionMode::AcceptEdits => "A ",
        InteractionMode::BypassPermissions => "! ",
        InteractionMode::Debug => "D ",
    };

    let input_line = Line::from(vec![
        Span::styled(
            prompt_char,
            Style::default()
                .fg(app.mode.color())
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(display_text.to_string(), style),
    ]);

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::DarkGray))
        .title(format!(" {} ", app.mode.label()));

    let input_widget = Paragraph::new(input_line).block(block);
    frame.render_widget(input_widget, area);

    if !app.is_loading {
        let cursor_x = area.x + 1 + prompt_char.len() as u16 + app.cursor as u16;
        let cursor_y = area.y + 1;
        frame.set_cursor_position((cursor_x, cursor_y));
    }
}

fn render_fallback_banner(frame: &mut ratatui::Frame, chat_area: Rect, app: &TuiApp) {
    let Some(banner) = app.current_fallback_banner() else {
        return;
    };
    let text = format!(
        " ↘ Falling back: {} → {} ({})  ",
        banner.from, banner.to, banner.reason
    );
    let width = (text.chars().count() as u16).min(chat_area.width.saturating_sub(2));
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
            .fg(Color::Black)
            .bg(Color::Yellow)
            .add_modifier(Modifier::BOLD),
    )));
    frame.render_widget(banner_widget, area);
}

fn render_status_bar(frame: &mut ratatui::Frame, area: Rect, app: &TuiApp) {
    let mode_span = Span::styled(
        format!(" {} ", app.mode.label()),
        Style::default().fg(Color::Black).bg(app.mode.color()),
    );

    let cost_str = crate::output::format_cost(
        &app.session.model,
        app.session.total_input_tokens,
        app.session.total_output_tokens,
    );

    let status = Line::from(vec![
        mode_span,
        Span::raw(" "),
        Span::styled(cost_str, Style::default().fg(Color::DarkGray)),
        Span::raw("  "),
        Span::styled("Shift+Tab: mode", Style::default().fg(Color::DarkGray)),
        Span::raw("  "),
        Span::styled("/: commands", Style::default().fg(Color::DarkGray)),
        Span::raw("  "),
        Span::styled("Esc: quit", Style::default().fg(Color::DarkGray)),
    ]);

    let bar = Paragraph::new(status).style(Style::default().bg(Color::DarkGray).fg(Color::White));
    frame.render_widget(bar, area);
}

fn render_slash_popup(frame: &mut ratatui::Frame, chat_area: Rect, app: &TuiApp) {
    let commands = app.filtered_commands();
    if commands.is_empty() {
        return;
    }

    let max_visible = 10.min(commands.len());
    let popup_height = max_visible as u16 + 2; // borders
    let popup_width = 50.min(chat_area.width.saturating_sub(4));

    let popup_area = Rect::new(
        chat_area.x + 2,
        chat_area.y + chat_area.height - popup_height - 1,
        popup_width,
        popup_height,
    );

    frame.render_widget(Clear, popup_area);

    let items: Vec<ListItem> = commands
        .iter()
        .enumerate()
        .take(max_visible)
        .map(|(i, cmd)| {
            let style = if i == app.slash_selected {
                Style::default().fg(Color::Black).bg(Color::Cyan)
            } else {
                Style::default().fg(Color::White)
            };
            let text = format!("{:<16} {}", cmd.slash_name(), cmd.description);
            ListItem::new(text).style(style)
        })
        .collect();

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Cyan))
        .title(" Commands (↑↓ Enter Esc) ");

    let list = List::new(items).block(block);
    frame.render_widget(list, popup_area);
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
    // Model picker mode
    if app.model_picker.visible {
        return handle_model_picker_key(app, key);
    }

    // Slash popup mode
    if app.show_slash_popup {
        return handle_slash_popup_key(app, key);
    }

    if app.is_loading {
        if key.code == KeyCode::Esc {
            return InputAction::Quit;
        }
        return InputAction::None;
    }

    match key.code {
        KeyCode::Esc => InputAction::Quit,

        // Shift+Tab → cycle mode
        KeyCode::BackTab => InputAction::CycleMode,

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

        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.input.clear();
            app.cursor = 0;
            InputAction::None
        }

        KeyCode::Char('l') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            InputAction::ClearChat
        }

        KeyCode::Char(c) => {
            app.input.insert(app.cursor, c);
            app.cursor += 1;
            // Show slash popup when typing "/" at position 0
            if c == '/' && app.cursor == 1 && app.input == "/" {
                app.show_slash_popup = true;
                app.slash_filter.clear();
                app.slash_selected = 0;
            }
            InputAction::None
        }

        KeyCode::Backspace => {
            if app.cursor > 0 {
                app.cursor -= 1;
                app.input.remove(app.cursor);
            }
            InputAction::None
        }

        KeyCode::Delete => {
            if app.cursor < app.input.len() {
                app.input.remove(app.cursor);
            }
            InputAction::None
        }

        KeyCode::Left => {
            if app.cursor > 0 {
                app.cursor -= 1;
            }
            InputAction::None
        }

        KeyCode::Right => {
            if app.cursor < app.input.len() {
                app.cursor += 1;
            }
            InputAction::None
        }

        KeyCode::Home => {
            app.cursor = 0;
            InputAction::None
        }
        KeyCode::End => {
            app.cursor = app.input.len();
            InputAction::None
        }

        KeyCode::Up => InputAction::ScrollUp,
        KeyCode::Down => InputAction::ScrollDown,

        _ => InputAction::None,
    }
}

fn handle_slash_popup_key(app: &mut TuiApp, key: KeyEvent) -> InputAction {
    match key.code {
        KeyCode::Esc => {
            app.show_slash_popup = false;
            InputAction::None
        }
        KeyCode::Up => {
            if app.slash_selected > 0 {
                app.slash_selected -= 1;
            }
            InputAction::None
        }
        KeyCode::Down => {
            let max = app.filtered_commands().len().saturating_sub(1);
            if app.slash_selected < max {
                app.slash_selected += 1;
            }
            InputAction::None
        }
        KeyCode::Enter => {
            let commands = app.filtered_commands();
            if let Some(cmd) = commands.get(app.slash_selected) {
                let cmd_name = cmd.slash_name();
                app.show_slash_popup = false;
                app.slash_filter.clear();

                // For commands that need arguments, put in input and let user add args
                let needs_arg = matches!(cmd_name.as_str(), "/model" | "/rename" | "/resume");
                if needs_arg {
                    app.input = format!("{cmd_name} ");
                    app.cursor = app.input.len();
                    // Show model picker for /model
                    if cmd_name == "/model" {
                        let all = crate::model_catalog::catalog().all();
                        app.model_picker.open(&all, &app.model_name.clone());
                    }
                    return InputAction::None;
                }

                // For commands without args, execute immediately
                app.input.clear();
                app.cursor = 0;
                app.scroll_offset = 0;
                return InputAction::SendMessage(cmd_name);
            }
            app.show_slash_popup = false;
            InputAction::None
        }
        KeyCode::Char(c) => {
            // Update both the filter AND the input text
            app.slash_filter.push(c);
            app.input.push(c);
            app.cursor = app.input.len();
            app.slash_selected = 0;
            InputAction::None
        }
        KeyCode::Backspace => {
            if app.slash_filter.is_empty() {
                app.show_slash_popup = false;
                // Remove the "/" from input too
                if !app.input.is_empty() {
                    app.input.pop();
                    app.cursor = app.input.len();
                }
            } else {
                app.slash_filter.pop();
                if !app.input.is_empty() {
                    app.input.pop();
                    app.cursor = app.input.len();
                }
            }
            InputAction::None
        }
        _ => InputAction::None,
    }
}

fn handle_model_picker_key(app: &mut TuiApp, key: KeyEvent) -> InputAction {
    use super::widgets::model_picker::{handle_key, PickerAction};

    let all_models = crate::model_catalog::catalog().all();
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
            effort: _effort,
            banner,
        } => {
            app.input.clear();
            app.cursor = 0;
            app.session.switch_model(&model_id);
            app.sync_stats();
            app.chat_messages.push(ChatMessage {
                role: ChatRole::System,
                text: banner,
            });
            InputAction::None
        }
    }
}

// ---------------------------------------------------------------------------
// Natural language mode detection
// ---------------------------------------------------------------------------

/// Detect if user is asking to switch modes via natural language.
fn detect_mode_intent(text: &str) -> Option<InteractionMode> {
    let lower = text.to_lowercase();

    // Plan mode triggers — require explicit intent, not just the word "plan"
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

    // Debug mode triggers — require "debug mode" or "debug this", not bare "debug"
    if lower.contains("enter debug")
        || lower.contains("debug mode")
        || lower.contains("switch to debug")
        || lower.contains("verbose mode")
        || lower.contains("enable debug")
    {
        return Some(InteractionMode::Debug);
    }

    // Accept edits mode triggers
    if lower.contains("accept edits")
        || lower.contains("auto accept")
        || lower.contains("accept all edits")
        || lower.contains("auto-accept")
        || lower.contains("yolo mode")
    {
        return Some(InteractionMode::AcceptEdits);
    }

    // Bypass permissions triggers
    if lower.contains("bypass permission")
        || lower.contains("skip permission")
        || lower.contains("dangerously skip")
        || lower.contains("no prompts")
        || lower.contains("full auto")
    {
        return Some(InteractionMode::BypassPermissions);
    }

    // Back to chat mode
    if lower.contains("normal mode")
        || lower.contains("chat mode")
        || lower.contains("exit plan")
        || lower.contains("stop planning")
        || lower.contains("exit debug")
    {
        return Some(InteractionMode::Chat);
    }

    None
}

/// Apply a mode change to the app and session.
fn apply_mode(app: &mut TuiApp, mode: InteractionMode) {
    app.mode = mode;
    app.session.plan_mode = mode == InteractionMode::Plan;
    app.session.skip_permissions = mode == InteractionMode::BypassPermissions;
    app.session.auto_approve_safe =
        mode == InteractionMode::AcceptEdits || mode == InteractionMode::BypassPermissions;
    // Debug mode: quiet=false so tool output is shown verbosely
    // All other modes: quiet inherits from startup setting
    if mode == InteractionMode::Debug {
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
            "Auto-accept — file edits approved automatically, commands still prompt"
        }
        InteractionMode::BypassPermissions => {
            "⚠ BYPASS — all tool prompts skipped. Use with caution!"
        }
        InteractionMode::Debug => "Debug — verbose output enabled",
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
    RunLogin,
    RunLogout,
}

fn handle_slash(input: &str, app: &mut TuiApp) -> SlashResult {
    if !input.starts_with('/') {
        return SlashResult::NotSlash;
    }

    let parts: Vec<&str> = input.splitn(2, ' ').collect();
    let cmd = app
        .command_registry
        .find(parts[0])
        .map(RegistryCommand::slash_name)
        .unwrap_or_else(|| parts[0].to_lowercase());
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
                let all = crate::model_catalog::catalog().all();
                let current = app.model_name.clone();
                app.model_picker.open(&all, &current);
                SlashResult::SystemMessage(String::new()) // picker UI handles confirmation
            } else {
                app.session.switch_model(arg);
                app.sync_stats();
                let provider = format!("{:?}", app.session.provider).to_lowercase();
                SlashResult::SystemMessage(format!("Switched to {} ({})", arg, provider))
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
                    lines.push(format!(" {} {:<14}  {}", marker, s.name, s.description));
                }
                lines.push(String::new());
                lines.push("Switch with: /output-style <name>".to_string());
                SlashResult::SystemMessage(lines.join("\n"))
            } else {
                app.session.apply_output_style(arg);
                SlashResult::SystemMessage(format!(
                    "Output style: {} (applies on next turn)",
                    app.session.output_style
                ))
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
            "Session replay: drop to shell and run\n  agiworkforce session list\n  agiworkforce session fork <id> --at-turn N --as <name>\n(Inline turn picker coming in v0.2.)"
                .to_string(),
        ),

        "/insights" => {
            let sid = app
                .session
                .managed_session_id()
                .unwrap_or("(no session)");
            SlashResult::SystemMessage(format!(
                "Inspect this session as JSONL events:\n  agiworkforce exec --json-events --session {} \"<prompt>\" | jq",
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
            app.session.toggle_fast_mode(None);
            app.sync_stats();
            let status = if app.session.fast_mode {
                format!("ON — using {} for speed", app.session.model)
            } else {
                format!("OFF — back to {}", app.session.model)
            };
            SlashResult::SystemMessage(format!("Fast mode {status}"))
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
                        "  {:<32} [{}] {:>6}K ctx  ${:.2}/${:.2}",
                        m.id,
                        flags,
                        m.context_window / 1000,
                        m.input_price_per_1m,
                        m.output_price_per_1m,
                    )
                })
                .collect::<Vec<_>>()
                .join("\n");
            SlashResult::SystemMessage(format!("Available models:\n{models_output}"))
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
            let mut help = String::from("Commands:\n");
            for cmd in app.command_registry.commands() {
                let slash_aliases = cmd.slash_aliases();
                let aliases = if slash_aliases.is_empty() {
                    String::new()
                } else {
                    format!(" ({})", slash_aliases.join(", "))
                };
                help.push_str(&format!(
                    "  {:<18} {}{}\n",
                    cmd.slash_name(),
                    cmd.description,
                    aliases
                ));
            }
            help.push_str("\nKeyboard shortcuts:\n");
            help.push_str("  Shift+Tab    Cycle mode: Chat → Plan → AcceptEdits → BypassPerms → Debug\n");
            help.push_str("  /            Open command palette\n");
            help.push_str("  Esc          Quit\n");
            help.push_str("  Up/Down      Scroll chat history\n");
            help.push_str("  Ctrl-L       Clear screen\n");
            help.push_str("  Ctrl-C       Clear input\n");
            help.push_str("\nModes (cycle with Shift+Tab):\n");
            help.push_str("  CHAT           Normal conversation\n");
            help.push_str("  PLAN           Read-only planning (no edits)\n");
            help.push_str("  ACCEPT EDITS   Auto-accept file edits\n");
            help.push_str("  BYPASS PERMS   Skip all tool confirmation (dangerous)\n");
            help.push_str("  DEBUG          Verbose debug output\n");
            SlashResult::SystemMessage(help)
        }

        // ── Session management ──
        "/compact" => {
            crate::repl::handle_compact(arg, &mut app.session);
            app.sync_stats();
            SlashResult::SystemMessage(format!(
                "Context compacted. Now at {}% usage.",
                app.context_percent()
            ))
        }

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

        "/fork" | "/branch" => {
            crate::repl::handle_branch(arg, &mut app.session);
            app.sync_stats();
            SlashResult::SystemMessage("Session forked.".to_string())
        }

        "/save" => {
            crate::repl::handle_save(&mut app.session);
            app.sync_stats();
            SlashResult::SystemMessage("Session saved.".to_string())
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
            if let Some(tools) = app.session.mcp_info() {
                // Group by server
                let mut servers: Vec<String> = tools.iter().map(|t| t.server_name.clone()).collect();
                servers.sort();
                servers.dedup();
                let mut msg = format!("MCP Servers ({}):\n", servers.len());
                for server in &servers {
                    let server_tools: Vec<_> = tools.iter().filter(|t| &t.server_name == server).collect();
                    msg.push_str(&format!("  ● {} ({} tools)\n", server, server_tools.len()));
                    for t in server_tools.iter().take(5) {
                        msg.push_str(&format!("    {:<25} {}\n", t.original_name, t.description));
                    }
                    if server_tools.len() > 5 {
                        msg.push_str(&format!("    ... +{} more\n", server_tools.len() - 5));
                    }
                }
                SlashResult::SystemMessage(msg)
            } else {
                SlashResult::SystemMessage("No MCP servers connected.".to_string())
            }
        }

        "/permissions" | "/perms" | "/approvals" => {
            crate::repl::handle_permissions(arg);
            SlashResult::SystemMessage("Permissions shown above.".to_string())
        }

        "/init" => {
            crate::repl::handle_init_project();
            SlashResult::SystemMessage("Project initialized.".to_string())
        }

        "/skills" => {
            let skills = crate::skills::discover_skills();
            if skills.is_empty() {
                SlashResult::SystemMessage("No skills found. Add .md files to .claude/skills/ or ~/.claude/skills/".to_string())
            } else {
                let mut msg = format!("Skills ({}):\n", skills.len());
                for s in &skills {
                    msg.push_str(&format!("  {:<25} {}\n", s.name, s.description));
                }
                SlashResult::SystemMessage(msg)
            }
        }

        "/hooks" => {
            let hooks = crate::hooks::load_hooks().unwrap_or_default();
            let mut msg = String::from("Hooks:\n");
            if hooks.hooks.is_empty() {
                msg.push_str("  No hooks configured.\n");
                msg.push_str("  Add hooks to ~/.agiworkforce/hooks.yaml or .agiworkforce/hooks.yaml\n");
            } else {
                for (event, hook_list) in &hooks.hooks {
                    for h in hook_list {
                        msg.push_str(&format!("  {:<20} {}\n", event, h.command));
                    }
                }
            }
            SlashResult::SystemMessage(msg)
        }

        "/plugins" => {
            SlashResult::SystemMessage(
                "Plugin management:\n  Use `agiworkforce plugin list` to see installed plugins.\n  Use `agiworkforce plugin install <name>` to install.".to_string()
            )
        }

        // ── Memory ──
        "/memory" | "/mem" => {
            crate::repl::handle_memory(arg);
            SlashResult::SystemMessage("Memory shown above.".to_string())
        }

        // ── Voice ──
        "/voice" | "/v" => {
            SlashResult::SystemMessage(
                "Voice mode: Use --voice-lang flag when starting.\n  Example: agiworkforce --voice-lang en\n  Then use /voice in the REPL (--no-tui) to toggle.".to_string()
            )
        }

        // ── Theme ──
        "/theme" => {
            if arg.is_empty() {
                SlashResult::SystemMessage(
                    "Available themes: base16-ocean.dark (default)\n  Use /theme <name> to switch.\n  Syntax highlighting uses syntect with 250+ language grammars.".to_string()
                )
            } else {
                SlashResult::SystemMessage(format!("Theme set to: {arg}"))
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
            app.input = review_prompt;
            app.cursor = app.input.len();
            SlashResult::SendAsPrompt
        }

        _ => SlashResult::SendAsPrompt,
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
) -> Result<()> {
    let mut session = AgentSession::new(model, sys_context, custom_system_prompt);
    if let Some(ref provider) = provider_override {
        session.set_provider_override(provider);
    }
    session.max_turns = max_turns;
    session.skip_permissions = skip_permissions;
    session.auto_approve_safe = auto_approve_safe;
    session.quiet = quiet;
    // Sprint B4: thread the initial permission mode + headless
    // auto-approve flag so the TUI launch path matches `--mode plan`
    // semantics from `repl::run_repl` and `run_oneshot`.
    session.permission_mode = permission_mode;
    session.auto_approve_plan = auto_approve_plan;
    if matches!(permission_mode, crate::cli_options::PermissionMode::Plan) {
        session.plan_mode = true;
    }
    if team_mode {
        session.enable_team_mode();
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
            session.adopt_managed_session(managed_session, path);
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
            session.adopt_managed_session(managed_session, path);
        }
        (None, None) => {
            session.enable_managed_session()?;
        }
    }

    // Connect MCP servers
    let mut mcp_configs = crate::mcp::McpManager::load_configs().unwrap_or_default();
    let mut plugin_mgr = crate::plugins::PluginsManager::new();
    if let Ok(_plugins) = plugin_mgr.load_all(std::env::current_dir().ok().as_deref()) {
        let plugin_mcp = plugin_mgr.mcp_configs();
        if !plugin_mcp.is_empty() {
            mcp_configs.extend(plugin_mcp);
        }
    }
    if !mcp_configs.is_empty() {
        let mut mcp_mgr = crate::mcp::McpManager::new();
        if let Err(e) = mcp_mgr.connect_all(&mcp_configs).await {
            eprintln!("MCP connection warning: {:#}", e);
        }
        session.set_mcp_manager(mcp_mgr);
    }

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

    let mut app = TuiApp::new(session, config.clone());
    app.wire_fallback_banner();
    let mut terminal = setup_terminal()?;

    let result = run_event_loop(&mut terminal, &mut app).await;

    restore_terminal(&mut terminal)?;

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
) -> Result<()> {
    render(terminal, app)?;

    loop {
        if event::poll(Duration::from_millis(TICK_RATE_MS))? {
            if let Event::Key(key) = event::read()? {
                let action = handle_key_event(app, key);

                match action {
                    InputAction::Quit => {
                        app.should_quit = true;
                    }

                    InputAction::CycleMode => {
                        let new_mode = app.mode.next();
                        apply_mode(app, new_mode);
                        let mut msg =
                            format!("{} — {}", app.mode.label(), mode_description(app.mode));
                        if new_mode == InteractionMode::BypassPermissions {
                            msg.push_str("\n\n  ⚠ WARNING: All tool confirmations are bypassed!");
                            msg.push_str(
                                "\n  This means commands will execute without asking you first.",
                            );
                            msg.push_str("\n  Press Shift+Tab again to move to Debug mode, or twice more to return to Chat.");
                        }
                        app.chat_messages.push(ChatMessage {
                            role: ChatRole::System,
                            text: msg,
                        });
                    }

                    InputAction::SendMessage(text) => {
                        // Detect natural language mode switches
                        if let Some(new_mode) = detect_mode_intent(&text) {
                            apply_mode(app, new_mode);
                            app.chat_messages.push(ChatMessage {
                                role: ChatRole::System,
                                text: format!(
                                    "{} — {}",
                                    app.mode.label(),
                                    mode_description(app.mode)
                                ),
                            });
                            // Still send the message to the LLM for context
                        }

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
                        app.scroll_offset = 0;
                        app.sync_stats();
                    }

                    InputAction::None => {}
                }
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

async fn send_message(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    app: &mut TuiApp,
    user_text: &str,
) -> Result<()> {
    app.chat_messages.push(ChatMessage {
        role: ChatRole::User,
        text: user_text.to_string(),
    });

    app.is_loading = true;
    app.scroll_offset = 0;
    app.stream_buffer.clear();
    app.stream_start = Some(Instant::now());
    render(terminal, app)?;

    let response_buf = Arc::new(Mutex::new(String::new()));
    let buf_for_callback = Arc::clone(&response_buf);
    let buf_for_display = Arc::clone(&response_buf);

    // Share buffer with the render loop so partial output is visible
    let config_clone = app.config.clone();

    // Spawn streaming on a separate task so we can render while waiting
    let result = {
        let callback = Box::new(move |chunk: &str| {
            if let Ok(mut buf) = buf_for_callback.lock() {
                buf.push_str(chunk);
            }
        });

        // Update stream_buffer for render loop before sending
        // (the actual streaming happens inside session.send)
        app.session.send(&config_clone, user_text, callback).await
    };

    // Copy final streamed content into stream_buffer for last render
    if let Ok(buf) = buf_for_display.lock() {
        app.stream_buffer = buf.clone();
    }

    app.is_loading = false;
    app.stream_start = None;

    match result {
        Ok(turn) => {
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
        Err(e) => {
            app.chat_messages.push(ChatMessage {
                role: ChatRole::System,
                text: format!("Error: {:#}", e),
            });
        }
    }

    app.scroll_offset = 0;
    render(terminal, app)?;

    Ok(())
}
