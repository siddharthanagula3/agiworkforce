use once_cell::sync::Lazy;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Arc;

const UNKNOWN: u8 = 0;
const GRANTED: u8 = 1;
const WITHDRAWN: u8 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConsentDecision {
    Unknown,
    Granted,
    Withdrawn,
}

/// DPDP consent gate for analytics egress. Cloned handles share one atomic, so a
/// withdrawal recorded on any handle stops emission everywhere in the process
/// immediately, without restarting the collector. `Unknown` is the construction
/// default and denies emission: consent must be positively recorded, never
/// assumed from an enabled config flag.
#[derive(Debug, Clone)]
pub struct TelemetryConsent {
    state: Arc<AtomicU8>,
}

impl Default for TelemetryConsent {
    fn default() -> Self {
        Self {
            state: Arc::new(AtomicU8::new(UNKNOWN)),
        }
    }
}

impl TelemetryConsent {
    pub fn decision(&self) -> ConsentDecision {
        match self.state.load(Ordering::SeqCst) {
            GRANTED => ConsentDecision::Granted,
            WITHDRAWN => ConsentDecision::Withdrawn,
            _ => ConsentDecision::Unknown,
        }
    }

    pub fn is_granted(&self) -> bool {
        self.state.load(Ordering::SeqCst) == GRANTED
    }

    pub fn grant(&self) {
        self.state.store(GRANTED, Ordering::SeqCst);
    }

    pub fn withdraw(&self) {
        self.state.store(WITHDRAWN, Ordering::SeqCst);
    }

    pub fn set(&self, granted: bool) {
        if granted {
            self.grant();
        } else {
            self.withdraw();
        }
    }
}

static PROCESS_CONSENT: Lazy<TelemetryConsent> = Lazy::new(TelemetryConsent::default);

pub fn process_consent() -> TelemetryConsent {
    PROCESS_CONSENT.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_unknown_and_denies() {
        let consent = TelemetryConsent::default();

        assert_eq!(consent.decision(), ConsentDecision::Unknown);
        assert!(!consent.is_granted());
    }

    #[test]
    fn grant_then_withdraw_flips_the_gate() {
        let consent = TelemetryConsent::default();

        consent.grant();
        assert!(consent.is_granted());

        consent.withdraw();
        assert!(!consent.is_granted());
        assert_eq!(consent.decision(), ConsentDecision::Withdrawn);
    }

    #[test]
    fn clones_share_one_decision() {
        let consent = TelemetryConsent::default();
        let handle = consent.clone();

        consent.grant();
        assert!(handle.is_granted());

        handle.set(false);
        assert!(!consent.is_granted());
    }

    #[test]
    fn process_consent_starts_denied() {
        assert!(!process_consent().is_granted());
    }
}
