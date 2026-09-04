//! MCP elicitation types, re-exported from the shared `agiworkforce-mcp`
//! engine so CLI code (the TUI overlay, `tui_handler`) keeps importing them from
//! `crate::mcp::elicitation`.
//!
//! The wire contract (`ElicitationRequest`/`Response`/`Action`/`Mode`) and the
//! [`ElicitationHandler`] trait live in the engine crate. The CLI's concrete UI
//! handler is [`super::tui_handler::TuiElicitationHandler`]; the engine's
//! [`AutoDeclineHandler`] is the safe non-interactive default.

pub use agiworkforce_mcp::elicitation::{
    AutoDeclineHandler, ElicitationAction, ElicitationHandler, ElicitationMode, ElicitationRequest,
    ElicitationResponse, SharedElicitationHandler,
};
