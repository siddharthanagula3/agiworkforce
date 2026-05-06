//! Update verification — see `tauri.conf.json` `updater.pubkey`.
//!
//! # SEV-DESK-14 — module emptied
//!
//! This file previously contained an `UpdateSecurityManager` that verified
//! update signatures with **HMAC-SHA256**. HMAC is symmetric: a client that
//! holds the verification key can also produce valid signatures, so
//! distributing the binary effectively distributed the signing key. The
//! `min_version` downgrade-protection field was parsed but never enforced.
//!
//! Production updates are signed and verified by Tauri's built-in updater
//! (Ed25519 / minisign). Configuration lives in:
//!
//! - `apps/desktop/src-tauri/tauri.conf.json` — `plugins.updater.pubkey`
//! - `apps/desktop/.github/workflows/release-desktop.yml` — `TAURI_PRIVATE_KEY`
//!   stored as a secret, signing happens in CI, never on the developer
//!   machine. The macOS workflow refuses to start when the APPLE_* signing
//!   secrets are missing.
//!
//! No type or function from this module was ever imported outside this file
//! and `sys/security/mod.rs` (verified 2026-05-05). Re-introducing custom
//! signature verification should go through a security review before
//! landing — the platform native verifier is the right primitive.

// Intentionally empty. Do not re-add types here without security review.
