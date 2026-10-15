//! OS sleep prevention for long-running background agents.
//!
//! Holds a platform-specific guard that prevents the OS from sleeping
//! while a background agent is executing. Dropping the guard re-enables sleep.

/// Prevents the OS from sleeping while this guard is held.
///
/// - **macOS**: spawns `caffeinate -s -w <PID>` -- prevents system sleep. Dropping
///   the guard ends it; `-w` still ends it if the app exits without dropping.
/// - **Windows**: a dedicated thread calls `SetThreadExecutionState(ES_CONTINUOUS
///   | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED)` and holds it until the guard
///   drops, then clears it. The state belongs to the thread that set it, and an
///   async task moves between threads, so the guard must not set it itself.
/// - **Other platforms**: no-op.
pub struct SleepPrevention {
    #[cfg(target_os = "macos")]
    child: Option<std::process::Child>,
    #[cfg(windows)]
    holder: Option<(std::sync::mpsc::Sender<()>, std::thread::JoinHandle<()>)>,
}

impl SleepPrevention {
    /// Enable sleep prevention. Returns a guard; drop it to re-enable sleep.
    pub fn enable() -> Self {
        #[cfg(target_os = "macos")]
        {
            let pid = std::process::id().to_string();
            let child = std::process::Command::new("caffeinate")
                .args(["-s", "-w", &pid])
                .spawn()
                .map_err(|e| {
                    tracing::warn!("[SleepPrevention] Failed to spawn caffeinate: {e}");
                })
                .ok();
            Self { child }
        }

        #[cfg(windows)]
        {
            let (release, released) = std::sync::mpsc::channel::<()>();
            let holder = std::thread::Builder::new()
                .name("keep-awake".to_string())
                .spawn(move || hold_awake_until(released))
                .map_err(|e| {
                    tracing::warn!("[SleepPrevention] Failed to start the keep-awake thread: {e}");
                })
                .ok()
                .map(|thread| (release, thread));
            Self { holder }
        }

        #[cfg(not(any(target_os = "macos", windows)))]
        {
            Self {}
        }
    }
}

/// Sets the keep-awake state on this thread, waits until the guard drops its
/// sender, and clears the state on the same thread.
#[cfg(windows)]
#[allow(unsafe_code)]
fn hold_awake_until(released: std::sync::mpsc::Receiver<()>) {
    use windows::Win32::System::Power::{
        SetThreadExecutionState, ES_AWAYMODE_REQUIRED, ES_CONTINUOUS, ES_SYSTEM_REQUIRED,
    };
    // SAFETY: SetThreadExecutionState only changes the calling thread's
    // execution state flags and touches no memory.
    unsafe {
        SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED);
    }
    let _ = released.recv();
    // SAFETY: as above; ES_CONTINUOUS alone restores normal idle behaviour.
    unsafe {
        SetThreadExecutionState(ES_CONTINUOUS);
    }
}

impl Drop for SleepPrevention {
    fn drop(&mut self) {
        #[cfg(windows)]
        if let Some((release, thread)) = self.holder.take() {
            drop(release);
            if thread.join().is_err() {
                tracing::warn!("[SleepPrevention] The keep-awake thread panicked");
            }
        }
        #[cfg(target_os = "macos")]
        if let Some(mut child) = self.child.take() {
            if let Err(e) = child.kill() {
                tracing::warn!("[SleepPrevention] Failed to stop caffeinate: {e}");
            }
            let _ = child.wait();
        }
    }
}
