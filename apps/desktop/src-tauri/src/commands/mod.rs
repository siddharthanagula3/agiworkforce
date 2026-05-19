// commands/ — Tauri commands organized by feature
//
// This is the target location for Tauri #[tauri::command] functions
// currently living in src/features/ and src/sys/commands/.
//
// Phase 5 skeleton — module not yet declared in lib.rs.
// Commands are migrated progressively. The old module paths
// (crate::features::*, crate::sys::commands::*) are retained as
// re-exports so command registration in lib.rs is unaffected.
//
// LOCKED: Tauri command names (the string in #[tauri::command]) must not
// change — they are called by the frontend via invoke() with string literals.
// Renaming a Rust function is fine only if the command attribute name stays.
