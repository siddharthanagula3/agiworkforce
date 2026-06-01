// AGI Workforce TUI — ratatui-based full-screen terminal UI
// Built on ratatui rendering modules + AgentSession

#[allow(dead_code, unused_imports)]
mod color;
pub(crate) mod app_event;
pub(crate) mod approval_broker;
mod cost_hud;
pub(crate) mod icons;
pub(crate) mod pane_view;
#[allow(dead_code, unused_imports)]
mod shimmer;
#[allow(dead_code, unused_imports)]
mod terminal_palette;
pub(crate) mod transcript_cell;

mod markdown_renderer;
mod tui_app;
pub mod widgets;
pub use tui_app::run;
