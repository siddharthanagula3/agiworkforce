//! The permission a clipboard read needs before the agent sees a single byte.
//!
//! The clipboard holds password-manager output and recovery codes, so reading
//! it is a sensitive observe action: it starts denied and is answered in the
//! same vocabulary as every other computer-use permission ([`PermissionDecision`]).
//! The gate sits at the read itself, not at each command that reaches it, so a
//! caller added later inherits the refusal instead of having to remember it.

use std::sync::Mutex;

use once_cell::sync::Lazy;

use super::app_permissions::PermissionDecision;

pub const CLIPBOARD_READ_DENIED: &str =
    "Reading the clipboard is denied. The clipboard can hold passwords and recovery codes, \
     so the agent sees it only after you allow this read.";

/// What a granted read is allowed to cover.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Grant {
    /// One read, then back to denied.
    Once,
    /// Every read until the app quits or the grant is revoked.
    Session,
}

static GRANT: Lazy<Mutex<Option<Grant>>> = Lazy::new(|| Mutex::new(None));

/// A user's answer to a clipboard read request.
///
/// `AskEveryTime` has no meaning once the question has been asked, so the two
/// allowing answers map onto the two scopes and everything else revokes.
pub fn record_clipboard_read_decision(decision: PermissionDecision) {
    let grant = match decision {
        PermissionDecision::AllowOnce => Some(Grant::Once),
        PermissionDecision::AlwaysAllow => Some(Grant::Session),
        PermissionDecision::Deny => None,
    };
    set_grant(grant);
}

/// Withdraws whatever was granted. A read after this is denied again.
pub fn revoke_clipboard_read() {
    set_grant(None);
}

/// True while a read would be allowed, without spending a one-shot grant.
pub fn clipboard_read_is_allowed() -> bool {
    read_grant().is_some()
}

/// The check every clipboard read passes through. A one-shot grant is spent
/// here, so an approval cannot be reused for a second read.
pub fn claim_clipboard_read() -> Result<(), String> {
    let mut guard = match GRANT.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    match *guard {
        None => Err(CLIPBOARD_READ_DENIED.to_string()),
        Some(Grant::Once) => {
            *guard = None;
            Ok(())
        }
        Some(Grant::Session) => Ok(()),
    }
}

fn set_grant(grant: Option<Grant>) {
    match GRANT.lock() {
        Ok(mut guard) => *guard = grant,
        Err(poisoned) => *poisoned.into_inner() = grant,
    }
}

fn read_grant() -> Option<Grant> {
    match GRANT.lock() {
        Ok(guard) => *guard,
        Err(poisoned) => *poisoned.into_inner(),
    }
}
