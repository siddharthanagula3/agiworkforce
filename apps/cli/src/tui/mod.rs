// AGI Workforce TUI — ratatui-based full-screen terminal UI
// Built on rendering modules from Codex CLI (rebranded) + our AgentSession

#[allow(dead_code, unused_imports)]
mod color;
#[allow(dead_code, unused_imports)]
mod shimmer;
#[allow(dead_code, unused_imports)]
mod terminal_palette;

mod markdown_renderer;
mod tui_app;
pub use tui_app::run;
