//! TypeScript binding export for the protocol crate (restructure Wave 5 stage b).
//!
//! Run via `scripts/generate-protocol-types.mjs`, which sets
//! `TS_RS_EXPORT_DIR` to `packages/types/src/generated/protocol` and then
//! regenerates the barrel. `pnpm check:protocol-types` is the drift guard:
//! it regenerates and fails on any git diff under the generated tree.
//!
//! `export_all_to` walks each root type's dependency graph recursively, so
//! new types reachable from these roots are exported without touching this
//! file. Add a root here only when a type family is NOT reachable from the
//! existing envelopes.

use std::path::Path;

use ts_rs::TS;

#[test]
fn export_typescript_bindings() {
    let dir = std::env::var("TS_RS_EXPORT_DIR").unwrap_or_else(|_| "bindings".to_string());
    let dir = Path::new(&dir);

    // Event envelope — pulls in the bulk of the wire graph (session events,
    // approvals, items, permissions, config views). NOTE: the client->server
    // `Op` envelope does NOT derive TS today (only its payload types do);
    // adding it is tracked follow-up work, not a wiring prerequisite.
    agiworkforce_protocol::protocol::EventMsg::export_all_to(dir).expect("export EventMsg graph");

    // MCP wire types (Tool etc.) — consumed by the agiworkforce-mcp crate
    // plan (stage d) and by TS surfaces via the generated barrel.
    agiworkforce_protocol::mcp::Tool::export_all_to(dir).expect("export mcp Tool graph");
}
