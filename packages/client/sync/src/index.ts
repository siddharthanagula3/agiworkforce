/**
 * @agiworkforce/sync — pure, cross-surface delta-sync apply logic.
 *
 * De-triplicates the apply rules that used to be hand-copied across mobile's
 * cloudSyncEngine.ts (TS/Zustand) and desktop's cloud_sync.rs (Rust/SQLite).
 * Rust cannot import this module — it re-implements the same rules natively
 * and is kept in sync by replaying the golden fixtures under __fixtures__/
 * against both implementations (see cloud_sync.rs's `#[cfg(test)]` fixture
 * replay module). Web is the server; it has no apply side.
 *
 * See docs/plans/cross-device-cloud-sync-design-2026-06-20.md for the
 * original design and each module file for the specific extraction/scope
 * notes (what's fully shared vs. mapping-only vs. surface-owned).
 */
export * from './cursor';
export * from './conversations';
export * from './messages';
export * from './memory';
export * from './projects';
export * from './settings';
