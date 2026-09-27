use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

pub(crate) const FRAME_INTERVAL: Duration = Duration::from_millis(50);
pub(crate) const SHIMMER_SWEEP: Duration = Duration::from_secs(2);
pub(crate) const STILL_SPINNER: &str = "•";

static REDUCED: AtomicBool = AtomicBool::new(false);

pub(crate) fn set_reduced(reduced: bool) {
    REDUCED.store(reduced, Ordering::Relaxed);
}

pub(crate) fn reduced() -> bool {
    REDUCED.load(Ordering::Relaxed)
}
