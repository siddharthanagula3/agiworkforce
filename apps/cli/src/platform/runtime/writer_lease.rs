use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use super::session::validate_summary_text;

pub const WRITER_LEASE_EXTENSION: &str = "writer-lease";
pub const WRITER_LEASE_TTL: std::time::Duration = std::time::Duration::from_secs(120);
pub const WRITER_LEASE_RENEW_INTERVAL: std::time::Duration = std::time::Duration::from_secs(30);
const HOLDER_LABEL_MAX_UTF16: usize = 200;
const HOLDER_ID_MAX_UTF16: usize = 64;
const LEASE_FILE_MAX_BYTES: u64 = 4096;

/// A process's claim on the right to append turns to one managed session.
///
/// The fingerprint check in `ManagedSession::save_to_path` keeps both copies
/// when two writers collide; the lease is what stops them colliding in the
/// first place, and what tells a person which program is writing.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct WriterLease {
    pub holder_id: String,
    pub holder_label: String,
    pub pid: u32,
    pub acquired_at: DateTime<Utc>,
    pub renewed_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

impl WriterLease {
    pub fn is_stale(&self, now: DateTime<Utc>) -> bool {
        now >= self.expires_at || !holder_process_alive(self.pid)
    }

    fn is_valid(&self) -> bool {
        validate_summary_text(&self.holder_id, "writer holder id", HOLDER_ID_MAX_UTF16).is_ok()
            && validate_summary_text(&self.holder_label, "writer label", HOLDER_LABEL_MAX_UTF16)
                .is_ok()
            && self.acquired_at <= self.expires_at
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WriterIdentity {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LeaseClaim {
    Acquired(WriterLease),
    Renewed(WriterLease),
    StaleTakeover {
        lease: WriterLease,
        previous: WriterLease,
    },
    TakenOver {
        lease: WriterLease,
        previous: WriterLease,
    },
    HeldBy(WriterLease),
}

/// The identity every lease this process takes is held under. The first
/// caller names it; a process is one writer however many threads it runs.
pub fn process_writer(label: &str) -> &'static WriterIdentity {
    static IDENTITY: OnceLock<WriterIdentity> = OnceLock::new();
    IDENTITY.get_or_init(|| WriterIdentity {
        id: uuid::Uuid::new_v4().to_string(),
        label: format!("{label} (pid {})", std::process::id()),
    })
}

pub fn lease_path(session_path: &Path) -> PathBuf {
    let mut path = session_path.as_os_str().to_os_string();
    path.push(".");
    path.push(WRITER_LEASE_EXTENSION);
    PathBuf::from(path)
}

/// The current lease, or `None` when nobody holds one. An unreadable or
/// tampered lease file reads as no lease, so it can never lock a user out.
pub fn read(session_path: &Path) -> Option<WriterLease> {
    let path = lease_path(session_path);
    let metadata = fs::metadata(&path).ok()?;
    if metadata.len() > LEASE_FILE_MAX_BYTES {
        return None;
    }
    let lease: WriterLease = serde_json::from_slice(&fs::read(&path).ok()?).ok()?;
    lease.is_valid().then_some(lease)
}

/// Claim, or renew, the lease for `identity`. A live lease held by anyone
/// else is reported rather than taken.
pub fn claim(session_path: &Path, identity: &WriterIdentity) -> Result<LeaseClaim> {
    claim_at(session_path, identity, Utc::now(), false)
}

/// Take the lease whoever holds it. Only for an explicit user decision.
pub fn take_over(session_path: &Path, identity: &WriterIdentity) -> Result<LeaseClaim> {
    claim_at(session_path, identity, Utc::now(), true)
}

/// Give the lease up if `identity` holds it. Returns the lease released.
pub fn release(session_path: &Path, identity: &WriterIdentity) -> Result<Option<WriterLease>> {
    let Some(current) = read(session_path) else {
        return Ok(None);
    };
    if current.holder_id != identity.id {
        return Ok(None);
    }
    match fs::remove_file(lease_path(session_path)) {
        Ok(()) => Ok(Some(current)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error).context("Failed to release the session writer lease"),
    }
}

fn claim_at(
    session_path: &Path,
    identity: &WriterIdentity,
    now: DateTime<Utc>,
    force: bool,
) -> Result<LeaseClaim> {
    let current = read(session_path);
    let acquired_at = match current.as_ref() {
        Some(lease) if lease.holder_id == identity.id => lease.acquired_at,
        _ => now,
    };
    let lease = WriterLease {
        holder_id: identity.id.clone(),
        holder_label: identity.label.clone(),
        pid: std::process::id(),
        acquired_at,
        renewed_at: now,
        expires_at: now
            + chrono::Duration::from_std(WRITER_LEASE_TTL).unwrap_or(chrono::Duration::zero()),
    };

    let claim = match current {
        None => {
            if write_new(session_path, &lease)? {
                return Ok(LeaseClaim::Acquired(lease));
            }
            match read(session_path) {
                Some(winner) if winner.holder_id != identity.id => {
                    return Ok(LeaseClaim::HeldBy(winner))
                }
                Some(_) => return Ok(LeaseClaim::Acquired(lease)),
                None => {
                    replace(session_path, &lease)?;
                    LeaseClaim::Acquired(lease.clone())
                }
            }
        }
        Some(previous) if previous.holder_id == identity.id => {
            replace(session_path, &lease)?;
            LeaseClaim::Renewed(lease.clone())
        }
        Some(previous) if previous.is_stale(now) => {
            replace(session_path, &lease)?;
            LeaseClaim::StaleTakeover {
                lease: lease.clone(),
                previous,
            }
        }
        Some(previous) if force => {
            replace(session_path, &lease)?;
            LeaseClaim::TakenOver {
                lease: lease.clone(),
                previous,
            }
        }
        Some(previous) => return Ok(LeaseClaim::HeldBy(previous)),
    };

    match read(session_path) {
        Some(written) if written.holder_id == identity.id => Ok(claim),
        Some(winner) => Ok(LeaseClaim::HeldBy(winner)),
        None => Ok(claim),
    }
}

fn serialized(lease: &WriterLease) -> Result<Vec<u8>> {
    serde_json::to_vec(lease).context("Failed to serialize the session writer lease")
}

fn write_new(session_path: &Path, lease: &WriterLease) -> Result<bool> {
    let path = lease_path(session_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create {}", parent.display()))?;
    }
    let mut file = match fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => return Ok(false),
        Err(error) => {
            return Err(error)
                .with_context(|| format!("Failed to create writer lease {}", path.display()))
        }
    };
    file.write_all(&serialized(lease)?)
        .with_context(|| format!("Failed to write writer lease {}", path.display()))?;
    Ok(true)
}

fn replace(session_path: &Path, lease: &WriterLease) -> Result<()> {
    let path = lease_path(session_path);
    let dir = path
        .parent()
        .ok_or_else(|| anyhow::anyhow!("writer lease path has no parent"))?;
    let temp = tempfile::NamedTempFile::new_in(dir)
        .with_context(|| format!("Failed to stage writer lease in {}", dir.display()))?;
    fs::write(temp.path(), serialized(lease)?)
        .with_context(|| format!("Failed to stage writer lease {}", temp.path().display()))?;
    temp.persist(&path).map_err(|error| {
        anyhow::anyhow!("Failed to replace writer lease {}: {error}", path.display())
    })?;
    Ok(())
}

#[cfg(unix)]
fn holder_process_alive(pid: u32) -> bool {
    let Ok(pid) = i32::try_from(pid) else {
        return false;
    };
    match nix::sys::signal::kill(nix::unistd::Pid::from_raw(pid), None) {
        Ok(()) => true,
        Err(nix::errno::Errno::ESRCH) => false,
        Err(_) => true,
    }
}

#[cfg(not(unix))]
fn holder_process_alive(_pid: u32) -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn identity(id: &str) -> WriterIdentity {
        WriterIdentity {
            id: id.to_string(),
            label: format!("writer {id}"),
        }
    }

    fn session_path(dir: &Path) -> PathBuf {
        dir.join("thread-1.jsonl")
    }

    #[test]
    fn a_second_writer_is_refused_while_the_first_holds_a_live_lease() {
        let dir = tempdir().expect("tempdir");
        let path = session_path(dir.path());
        let now = Utc::now();

        let first = claim_at(&path, &identity("a"), now, false).expect("first claim");
        assert!(matches!(first, LeaseClaim::Acquired(_)));

        let second = claim_at(&path, &identity("b"), now, false).expect("second claim");
        match second {
            LeaseClaim::HeldBy(holder) => {
                assert_eq!(holder.holder_id, "a");
                assert_eq!(holder.holder_label, "writer a");
            }
            other => panic!("a live lease must not be taken: {other:?}"),
        }

        let renewed = claim_at(&path, &identity("a"), now, false).expect("renew");
        assert!(matches!(renewed, LeaseClaim::Renewed(_)));
    }

    #[test]
    fn a_lease_that_was_not_renewed_expires_and_the_next_writer_takes_it_over() {
        let dir = tempdir().expect("tempdir");
        let path = session_path(dir.path());
        let then = Utc::now();
        claim_at(&path, &identity("a"), then, false).expect("first claim");

        let later = then + chrono::Duration::from_std(WRITER_LEASE_TTL).unwrap();
        match claim_at(&path, &identity("b"), later, false).expect("claim after expiry") {
            LeaseClaim::StaleTakeover { lease, previous } => {
                assert_eq!(lease.holder_id, "b");
                assert_eq!(previous.holder_id, "a");
            }
            other => panic!("an expired lease must be taken over: {other:?}"),
        }
        assert_eq!(read(&path).expect("lease").holder_id, "b");
    }

    #[cfg(unix)]
    #[test]
    fn a_lease_whose_process_is_gone_is_stale_before_it_expires() {
        let dir = tempdir().expect("tempdir");
        let path = session_path(dir.path());
        let now = Utc::now();
        let mut child = std::process::Command::new("true").spawn().expect("spawn");
        let dead_pid = child.id();
        child.wait().expect("reap");
        let orphan = WriterLease {
            holder_id: "crashed".to_string(),
            holder_label: "crashed writer".to_string(),
            pid: dead_pid,
            acquired_at: now,
            renewed_at: now,
            expires_at: now + chrono::Duration::hours(1),
        };
        fs::write(lease_path(&path), serde_json::to_vec(&orphan).unwrap()).unwrap();

        assert!(matches!(
            claim_at(&path, &identity("b"), now, false).expect("claim"),
            LeaseClaim::StaleTakeover { .. }
        ));
    }

    #[test]
    fn explicit_takeover_and_release_hand_the_thread_to_another_writer() {
        let dir = tempdir().expect("tempdir");
        let path = session_path(dir.path());
        let now = Utc::now();
        claim_at(&path, &identity("a"), now, false).expect("first claim");

        match claim_at(&path, &identity("b"), now, true).expect("takeover") {
            LeaseClaim::TakenOver { previous, .. } => assert_eq!(previous.holder_id, "a"),
            other => panic!("an explicit takeover must succeed: {other:?}"),
        }
        assert!(release(&path, &identity("a"))
            .expect("stale release")
            .is_none());
        assert_eq!(read(&path).expect("lease").holder_id, "b");

        assert!(release(&path, &identity("b")).expect("release").is_some());
        assert!(read(&path).is_none());
        assert!(matches!(
            claim_at(&path, &identity("a"), now, false).expect("reclaim"),
            LeaseClaim::Acquired(_)
        ));
    }

    #[test]
    fn a_tampered_lease_never_locks_a_writer_out() {
        let dir = tempdir().expect("tempdir");
        let path = session_path(dir.path());
        fs::write(lease_path(&path), b"{\"holder_id\":\"\\u0000\"}").unwrap();
        assert!(read(&path).is_none());
        assert!(!matches!(
            claim(&path, &identity("a")).expect("claim"),
            LeaseClaim::HeldBy(_)
        ));
    }
}
