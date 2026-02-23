//! OS sleep prevention for long-running background agents.
//!
//! Holds a platform-specific guard that prevents the OS from sleeping
//! while a background agent is executing. Dropping the guard re-enables sleep.

/// Prevents the OS from sleeping while this guard is held.
///
/// - **macOS**: spawns `caffeinate -s -w <PID>` -- prevents system sleep,
///   auto-exits when the Tauri process exits (crash-safe, no cleanup needed).
/// - **Windows**: calls `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED
///   | ES_AWAYMODE_REQUIRED)` -- keeps the system awake.
/// - **Other platforms**: no-op.
pub struct SleepPrevention {
    #[cfg(target_os = "macos")]
    _child: Option<std::process::Child>,
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
            Self { _child: child }
        }

        #[cfg(windows)]
        {
            // SAFETY: SetThreadExecutionState is a safe Win32 API that only affects the
            // calling thread's execution state flags. It has no memory safety implications.
            use windows::Win32::System::Power::{
                SetThreadExecutionState, ES_AWAYMODE_REQUIRED, ES_CONTINUOUS, ES_SYSTEM_REQUIRED,
            };
            unsafe {
                SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED);
            }
            Self {}
        }

        #[cfg(not(any(target_os = "macos", windows)))]
        {
            Self {}
        }
    }
}

impl Drop for SleepPrevention {
    fn drop(&mut self) {
        #[cfg(windows)]
        {
            // SAFETY: Resetting the execution state back to ES_CONTINUOUS is safe --
            // it just re-enables normal system idle behavior for the calling thread.
            use windows::Win32::System::Power::{SetThreadExecutionState, ES_CONTINUOUS};
            unsafe {
                SetThreadExecutionState(ES_CONTINUOUS);
            }
        }
        // macOS: caffeinate exits automatically when our PID exits or the child is dropped.
        // Other platforms: no-op.
    }
}
