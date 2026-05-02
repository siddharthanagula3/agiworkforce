//! Hooks-list view used by `app-server` to render `hooks/list` responses.
//!
//! Stub: the upstream codex-rs implementation walks `HooksConfig` (config-layer
//! stack + plugin hook sources) to produce a flattened list of every registered
//! hook with its source path, matcher, etc. The fuller port is queued behind
//! Sprint 0 (FIX-006a) — for now this returns an empty list so app-server can
//! compile and `hooks/list` simply reports no hooks. Warnings from
//! `HooksConfig.plugin_hook_load_warnings` are still surfaced.
use agiworkforce_protocol::protocol::HookEventName;
use agiworkforce_protocol::protocol::HookHandlerType;
use agiworkforce_protocol::protocol::HookSource;
use agiworkforce_utils_absolute_path::AbsolutePathBuf;

use crate::registry::HooksConfig;

#[derive(Clone, Debug)]
pub struct HookListEntry {
    pub event_name: HookEventName,
    pub handler_type: HookHandlerType,
    pub matcher: Option<String>,
    pub command: Option<String>,
    pub timeout_sec: u64,
    pub status_message: Option<String>,
    pub source_path: AbsolutePathBuf,
    pub source: HookSource,
    pub plugin_id: Option<String>,
    pub display_order: i64,
}

#[derive(Default, Clone, Debug)]
pub struct HooksList {
    pub hooks: Vec<HookListEntry>,
    pub warnings: Vec<String>,
}

pub fn list_hooks(config: HooksConfig) -> HooksList {
    HooksList {
        hooks: Vec::new(),
        warnings: config.plugin_hook_load_warnings,
    }
}
