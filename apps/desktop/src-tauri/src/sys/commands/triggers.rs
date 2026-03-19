//! Re-exports for event trigger Tauri commands.
//!
//! The implementation lives in `crate::core::agent::triggers`. This module
//! bridges it into the `sys::commands` namespace so all commands are registered
//! from a single location in `lib.rs`.

pub use crate::core::agent::triggers::{
    get_trigger_executions, list_triggers, register_trigger, toggle_trigger, unregister_trigger,
    update_trigger,
};
