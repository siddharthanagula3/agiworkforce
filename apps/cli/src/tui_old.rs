use std::io::{self, Stdout};
use std::sync::{Arc, Mutex};
use std::time::Duration;

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
use ratatui::widgets::{Block, Borders, Paragraph, Wrap};
use ratatui::Terminal;

use crate::agent::AgentSession;
use crate::config::CliConfig;
use crate::context::SystemContext;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// How often the event loop polls for input (ms).
const TICK_RATE_MS: u64 = 50;

// ---------------------------------------------------------------------------
// Chat message type for TUI display
// ---------------------------------------------------------------------------

/// A message displayed in the chat area.
struct ChatMessage {
    role: ChatRole,
    text: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ChatRole {
    User,
    Assistant,
    System,
}

// ---------------------------------------------------------------------------
// TUI application state
// ---------------------------------------------------------------------------

/// Full-screen TUI application state.
struct TuiApp {
    /// The underlying agent session (owns the LLM conversation).
    session: AgentSession,
    /// CLI configuration.
    config: CliConfig,
    /// Chat message history for display.
    chat_messages: Vec<ChatMessage>,
    /// Current input buffer (what the user is typing).
    input: String,
    /// Cursor position within the input buffer.
    cursor: usize,
    /// Scroll offset for the chat area (0 = bottom, positive = scrolled up).
    scroll_offset: u16,
    /// Whether the assistant is currently generating a response.
    is_loading: bool,
    /// Spinner tick counter for the loading animation.
    spinner_tick: u8,
    /// Whether the application should exit.
    should_quit: bool,
    /// Current model display name.
    model_name: String,
    /// Current provider display name.
    provider_name: String,
    /// Session turn count.
    turn_count: u32,
    /// Total input tokens consumed.
    total_input_tokens: u32,
    /// Total output tokens consumed.
    total_output_tokens: u32,
}

impl TuiApp {
    fn new(session: AgentSession, config: CliConfig) -> Self {
        let model_name = session.model.clone();
        let provider_name = format!("{:?}", session.provider).to_lowercase();
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
        }
    }

    /// Sync display stats from the agent session.
    fn sync_stats(&mut self) {
        self.turn_count = self.session.turn_count;
        self.total_input_tokens = self.session.total_input_tokens;
        self.total_output_tokens = self.session.total_output_tokens;
        self.model_name = self.session.model.clone();
        self.provider_name = format!("{:?}", self.session.provider).to_lowercase();
    }

    /// Advance the spinner animation.
    fn tick_spinner(&mut self) {
        self.spinner_tick = self.spinner_tick.wrapping_add(1);
    }

    /// Get the current spinner character.
    fn spinner_char(&self) -> &str {
        const FRAMES: &[&str] = &[
            "\u{2840}", "\u{28c0}", "\u{28c4}", "\u{28e4}", "\u{28f0}", "\u{28b0}", "\u{2830}",
            "\u{2810}",
        ];
        FRAMES[(self.spinner_tick as usize) % FRAMES.len()]
    }
}

// ---------------------------------------------------------------------------
// Terminal setup / teardown
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

        // Main layout: header (3 lines), chat (flex), input (3 lines), status (1 line)
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
    })?;

    Ok(())
}

fn render_header(frame: &mut ratatui::Frame, area: Rect, app: &TuiApp) {
    let provider_display = match app.provider_name.as_str() {
        "ollama" => "Local",
        other => other,
    };

    let header_text = Line::from(vec![
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
        Span::raw(" | "),
        Span::styled("Model: ", Style::default().fg(Color::DarkGray)),
        Span::styled(
            &app.model_name,
            Style::default()
                .fg(Color::White)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw(" | "),
        Span::styled(provider_display, Style::default().fg(Color::Green)),
        Span::raw(" | "),
        Span::styled(
            format!("Turns: {}", app.turn_count),
            Style::default().fg(Color::DarkGray),
        ),
    ]);

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::DarkGray))
        .title_bottom(Line::from(vec![Span::styled(
            format!(
                " {}in / {}out ",
                crate::output::format_tokens(app.total_input_tokens),
                crate::output::format_tokens(app.total_output_tokens),
            ),
            Style::default().fg(Color::DarkGray),
        )]));

    let header = Paragraph::new(header_text).block(block);
    frame.render_widget(header, area);
}

fn render_chat(frame: &mut ratatui::Frame, area: Rect, app: &TuiApp) {
    let mut lines: Vec<Line> = Vec::new();

    if app.chat_messages.is_empty() && !app.is_loading {
        // Empty state
        lines.push(Line::from(""));
        lines.push(Line::from(Span::styled(
            "  Welcome to AGI Workforce TUI",
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD),
        )));
        lines.push(Line::from(Span::styled(
            "  Type a message below and press Enter to send.",
            Style::default().fg(Color::DarkGray),
        )));
        lines.push(Line::from(Span::styled(
            "  Press Esc to quit. Up/Down to scroll. Tab to switch model.",
            Style::default().fg(Color::DarkGray),
        )));
    } else {
        for msg in &app.chat_messages {
            // Blank line between messages
            if !lines.is_empty() {
                lines.push(Line::from(""));
            }

            let (role_label, role_style) = match msg.role {
                ChatRole::User => (
                    "You",
                    Style::default()
                        .fg(Color::Green)
                        .add_modifier(Modifier::BOLD),
                ),
                ChatRole::Assistant => (
                    "Assistant",
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                ),
                ChatRole::System => (
                    "System",
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                ),
            };

            lines.push(Line::from(vec![Span::styled(
                format!("  {} ", role_label),
                role_style,
            )]));

            // Render message text with basic formatting
            for text_line in msg.text.lines() {
                let styled = style_message_line(text_line, msg.role);
                lines.push(styled);
            }
        }
    }

    // Loading indicator
    if app.is_loading {
        lines.push(Line::from(""));
        lines.push(Line::from(vec![
            Span::styled(
                format!("  {} ", app.spinner_char()),
                Style::default().fg(Color::Cyan),
            ),
            Span::styled(
                "Thinking...",
                Style::default()
                    .fg(Color::DarkGray)
                    .add_modifier(Modifier::ITALIC),
            ),
        ]));
    }

    // Calculate scroll: show bottom of chat by default
    let visible_height = area.height.saturating_sub(2) as usize; // minus borders
    let total_lines = lines.len();
    let max_scroll = total_lines.saturating_sub(visible_height) as u16;
    let effective_scroll = if app.scroll_offset > max_scroll {
        max_scroll
    } else {
        app.scroll_offset
    };

    // When scroll_offset is 0 we want to show the bottom, so we scroll to max.
    // When scroll_offset > 0 we scroll up from max.
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

/// Apply basic styling to a single line of message text.
fn style_message_line(line: &str, role: ChatRole) -> Line<'static> {
    let indent = "    ";
    let text = format!("{}{}", indent, line);

    // Detect code block fences (lines starting with ```).
    if line.starts_with("```") {
        return Line::from(Span::styled(text, Style::default().fg(Color::DarkGray)));
    }

    let content_style = match role {
        ChatRole::User => Style::default().fg(Color::White),
        ChatRole::Assistant => Style::default().fg(Color::White),
        ChatRole::System => Style::default().fg(Color::Yellow),
    };

    // Parse bold and inline code formatting.
    let spans = parse_inline_formatting(&text, content_style);
    Line::from(spans)
}

/// Parse basic inline markdown formatting (**bold** and `code`).
fn parse_inline_formatting(text: &str, base_style: Style) -> Vec<Span<'static>> {
    let mut spans: Vec<Span<'static>> = Vec::new();
    let mut remaining = text.to_string();
    let bold_style = base_style.add_modifier(Modifier::BOLD);
    let code_style = Style::default().fg(Color::Yellow);

    while !remaining.is_empty() {
        // Check for **bold**
        if let Some(start) = remaining.find("**") {
            if let Some(end) = remaining[start + 2..].find("**") {
                // Push text before bold
                if start > 0 {
                    spans.push(Span::styled(remaining[..start].to_string(), base_style));
                }
                // Push bold text
                let bold_text = &remaining[start + 2..start + 2 + end];
                spans.push(Span::styled(bold_text.to_string(), bold_style));
                remaining = remaining[start + 2 + end + 2..].to_string();
                continue;
            }
        }

        // Check for `code`
        if let Some(start) = remaining.find('`') {
            // Skip triple backticks (handled at line level)
            if remaining[start..].starts_with("```") {
                spans.push(Span::styled(remaining.clone(), base_style));
                break;
            }
            if let Some(end) = remaining[start + 1..].find('`') {
                // Push text before code
                if start > 0 {
                    spans.push(Span::styled(remaining[..start].to_string(), base_style));
                }
                // Push code text
                let code_text = &remaining[start + 1..start + 1 + end];
                spans.push(Span::styled(code_text.to_string(), code_style));
                remaining = remaining[start + 1 + end + 1..].to_string();
                continue;
            }
        }

        // No more formatting found — push the rest
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
        "Type your message..."
    } else {
        &app.input
    };

    let style = if app.input.is_empty() && !app.is_loading {
        Style::default().fg(Color::DarkGray)
    } else {
        Style::default().fg(Color::White)
    };

    let input_line = Line::from(vec![
        Span::styled(
            "> ",
            Style::default()
                .fg(Color::Green)
                .add_modifier(Modifier::BOLD),
        ),
        Span::styled(display_text.to_string(), style),
    ]);

    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::DarkGray))
        .title(" Input ");

    let input_widget = Paragraph::new(input_line).block(block);
    frame.render_widget(input_widget, area);

    // Position cursor (account for border + "> " prefix)
    if !app.is_loading {
        let cursor_x = area.x + 1 + 2 + app.cursor as u16; // border + "> " + cursor pos
        let cursor_y = area.y + 1; // border
        frame.set_cursor_position((cursor_x, cursor_y));
    }
}

fn render_status_bar(frame: &mut ratatui::Frame, area: Rect, app: &TuiApp) {
    let mode = if app.session.plan_mode {
        Span::styled(
            " PLAN ",
            Style::default().fg(Color::Black).bg(Color::Yellow),
        )
    } else {
        Span::styled(" CHAT ", Style::default().fg(Color::Black).bg(Color::Cyan))
    };

    let status = Line::from(vec![
        mode,
        Span::raw(" "),
        Span::styled("[Esc: Quit]", Style::default().fg(Color::DarkGray)),
        Span::raw(" "),
        Span::styled("[Up/Down: Scroll]", Style::default().fg(Color::DarkGray)),
        Span::raw(" "),
        Span::styled("[Ctrl-L: Clear]", Style::default().fg(Color::DarkGray)),
        Span::raw(" "),
        Span::styled("[/help: Commands]", Style::default().fg(Color::DarkGray)),
    ]);

    let bar = Paragraph::new(status).style(Style::default().bg(Color::DarkGray).fg(Color::White));
    frame.render_widget(bar, area);
}

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
}

fn handle_key_event(app: &mut TuiApp, key: KeyEvent) -> InputAction {
    // Don't process input while loading (except quit)
    if app.is_loading {
        if key.code == KeyCode::Esc {
            return InputAction::Quit;
        }
        return InputAction::None;
    }

    match key.code {
        KeyCode::Esc => InputAction::Quit,

        KeyCode::Enter => {
            let text = app.input.trim().to_string();
            if text.is_empty() {
                return InputAction::None;
            }
            app.input.clear();
            app.cursor = 0;
            app.scroll_offset = 0; // reset scroll to bottom
            InputAction::SendMessage(text)
        }

        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            // Ctrl-C: clear input, not quit
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

// ---------------------------------------------------------------------------
// Slash command handling (TUI-local)
// ---------------------------------------------------------------------------

enum TuiSlashResult {
    /// Not a slash command, treat as regular message.
    NotSlash,
    /// Command was handled locally (show a system message).
    SystemMessage(String),
    /// Quit the TUI.
    Quit,
    /// Send as regular prompt (not a recognized slash command).
    SendAsPrompt,
}

fn handle_tui_slash(input: &str, app: &mut TuiApp) -> TuiSlashResult {
    if !input.starts_with('/') {
        return TuiSlashResult::NotSlash;
    }

    let parts: Vec<&str> = input.splitn(2, ' ').collect();
    let cmd = parts[0].to_lowercase();
    let arg = parts.get(1).map(|s| s.trim()).unwrap_or_default();

    match cmd.as_str() {
        "/exit" | "/quit" | "/q" => TuiSlashResult::Quit,

        "/clear" => {
            app.session.clear();
            app.chat_messages.clear();
            app.scroll_offset = 0;
            app.sync_stats();
            TuiSlashResult::SystemMessage("Context cleared. Starting fresh.".to_string())
        }

        "/model" | "/m" => {
            if arg.is_empty() {
                TuiSlashResult::SystemMessage(format!("Current model: {}", app.session.model))
            } else {
                app.session.switch_model(arg);
                app.sync_stats();
                let provider = format!("{:?}", app.session.provider).to_lowercase();
                TuiSlashResult::SystemMessage(format!("Switched to {} ({})", arg, provider))
            }
        }

        "/plan" => {
            app.session.plan_mode = !app.session.plan_mode;
            let status = if app.session.plan_mode { "ON" } else { "OFF" };
            TuiSlashResult::SystemMessage(format!("Plan mode {}", status))
        }

        "/cost" => {
            let cost = crate::output::format_cost(
                &app.session.model,
                app.session.total_input_tokens,
                app.session.total_output_tokens,
            );
            TuiSlashResult::SystemMessage(format!("Turns: {} | {}", app.session.turn_count, cost))
        }

        "/status" => {
            let msg = format!(
                "Version: {}\nModel: {}\nProvider: {:?}\nPlan mode: {}\nTurns: {}\nTokens: {} in / {} out",
                env!("CARGO_PKG_VERSION"),
                app.session.model,
                app.session.provider,
                if app.session.plan_mode { "ON" } else { "OFF" },
                app.session.turn_count,
                app.session.total_input_tokens,
                app.session.total_output_tokens,
            );
            TuiSlashResult::SystemMessage(msg)
        }

        "/help" | "/h" | "/?" => {
            let help = "\
/model <name>  Switch model (e.g. /model gpt-4o)\n\
/plan          Toggle plan mode (read-only tools)\n\
/clear         Clear conversation context\n\
/cost          Show session cost summary\n\
/status        Show version, model, provider info\n\
/help          Show this help\n\
/exit          Exit the TUI\n\
\n\
Keyboard: Esc=Quit  Up/Down=Scroll  Ctrl-L=Clear  Ctrl-C=Clear input";
            TuiSlashResult::SystemMessage(help.to_string())
        }

        _ => {
            // Unknown slash commands: send as regular prompt so the agent can handle
            TuiSlashResult::SendAsPrompt
        }
    }
}

// ---------------------------------------------------------------------------
// Main TUI entry point
// ---------------------------------------------------------------------------

/// Run the full-screen TUI.
///
/// Wraps the existing `AgentSession` and `CliConfig` in a ratatui-based
/// terminal UI. The agent loop, streaming, and tool execution all run through
/// the same `session.send()` path as the REPL.
#[allow(clippy::too_many_arguments)]
pub async fn run(
    config: &mut CliConfig,
    model: &str,
    sys_context: &SystemContext,
    custom_system_prompt: Option<&str>,
    resume_messages: Option<Vec<crate::models::Message>>,
    max_turns: Option<usize>,
    skip_permissions: bool,
    _fallback_model: Option<String>,
    _session_name: Option<String>,
    team_mode: bool,
    auto_approve_safe: bool,
    quiet: bool,
    provider_override: Option<String>,
) -> Result<()> {
    // Build the agent session (same setup as REPL)
    let mut session = AgentSession::new(model, sys_context, custom_system_prompt);
    if let Some(ref provider) = provider_override {
        session.set_provider_override(provider);
    }
    session.max_turns = max_turns;
    session.skip_permissions = skip_permissions;
    session.auto_approve_safe = auto_approve_safe;
    session.quiet = quiet;
    if team_mode {
        session.enable_team_mode();
    }

    // Pre-load messages from a resumed session
    if let Some(messages) = resume_messages {
        for msg in messages {
            session.messages.push(msg);
        }
    }

    // Connect to MCP servers (from .mcp.json + plugin MCP configs)
    let mut mcp_configs = crate::mcp::McpManager::load_configs().unwrap_or_default();

    // Merge plugin MCP server configs into the MCP config map
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

    // Fire SessionStart hook
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

    // Create TUI app state
    let mut app = TuiApp::new(session, config.clone());

    // Set up terminal
    let mut terminal = setup_terminal()?;

    // Main event loop
    let result = run_event_loop(&mut terminal, &mut app).await;

    // Restore terminal before any further output
    restore_terminal(&mut terminal)?;

    // Fire SessionEnd hook
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

    // Shut down MCP servers gracefully
    if let Some(mut mgr) = app.session.take_mcp_manager() {
        mgr.shutdown_all().await;
    }

    // Print session summary to regular terminal
    crate::output::print_session_cost(
        &app.session.model,
        app.session.total_input_tokens,
        app.session.total_output_tokens,
        app.session.turn_count,
    );

    result
}

/// The core event loop: poll for keyboard input, render, send messages.
async fn run_event_loop(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    app: &mut TuiApp,
) -> Result<()> {
    // Initial render
    render(terminal, app)?;

    loop {
        // Poll for events with a tick rate
        if event::poll(Duration::from_millis(TICK_RATE_MS))? {
            if let Event::Key(key) = event::read()? {
                let action = handle_key_event(app, key);

                match action {
                    InputAction::Quit => {
                        app.should_quit = true;
                    }

                    InputAction::SendMessage(text) => {
                        // Check for slash commands first
                        match handle_tui_slash(&text, app) {
                            TuiSlashResult::Quit => {
                                app.should_quit = true;
                            }
                            TuiSlashResult::SystemMessage(msg) => {
                                app.chat_messages.push(ChatMessage {
                                    role: ChatRole::System,
                                    text: msg,
                                });
                            }
                            TuiSlashResult::NotSlash | TuiSlashResult::SendAsPrompt => {
                                // Send as a regular message to the LLM
                                send_message_to_llm(terminal, app, &text).await?;
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

        // Tick spinner when loading
        if app.is_loading {
            app.tick_spinner();
        }

        if app.should_quit {
            break;
        }

        // Render
        render(terminal, app)?;
    }

    Ok(())
}

/// Send user input to the LLM and stream the response back into the TUI.
async fn send_message_to_llm(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    app: &mut TuiApp,
    user_text: &str,
) -> Result<()> {
    // Add user message to chat display
    app.chat_messages.push(ChatMessage {
        role: ChatRole::User,
        text: user_text.to_string(),
    });

    // Show loading state
    app.is_loading = true;
    app.scroll_offset = 0;
    render(terminal, app)?;

    // Collect streaming response into a shared buffer.
    // The TUI cannot do truly incremental rendering during the async send
    // because ratatui owns the terminal. Instead we collect the full response
    // and then display it. For long responses the "Thinking..." spinner shows
    // activity.
    let response_buf = Arc::new(Mutex::new(String::new()));
    let buf_clone = Arc::clone(&response_buf);

    let config_clone = app.config.clone();
    let result = app
        .session
        .send(
            &config_clone,
            user_text,
            Box::new(move |chunk| {
                if let Ok(mut buf) = buf_clone.lock() {
                    buf.push_str(chunk);
                }
            }),
        )
        .await;

    app.is_loading = false;

    match result {
        Ok(turn) => {
            let response_text = if let Ok(buf) = response_buf.lock() {
                if buf.is_empty() {
                    turn.response.clone()
                } else {
                    buf.clone()
                }
            } else {
                turn.response.clone()
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
