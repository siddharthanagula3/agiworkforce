// AGI Workforce TUI — ratatui-based full-screen terminal UI
// Built on ratatui rendering modules + AgentSession

#[allow(dead_code, unused_imports)]
mod color;
mod cost_hud;
#[allow(dead_code, unused_imports)]
mod shimmer;
#[allow(dead_code, unused_imports)]
mod terminal_palette;

mod markdown_renderer;
mod tui_app;
pub mod widgets;
pub use tui_app::run;
