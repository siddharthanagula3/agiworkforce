//! Stoppable global hotkey hook for AGI Dictation.
//!
//! Replaces the previous non-stoppable listener in
//! `sys/commands/voice_global.rs`: `rdev::listen` is a blocking call with no
//! portable termination API, returning from its callback does NOT terminate
//! the listener, so the old "spawn a new thread per start, flip a flag on
//! stop" design leaked a parked OS listener per restart and, once the shared
//! flag went true again, every leaked listener emitted events (double-fire).
//!
//! Design (plan phase 2, `docs/specs/desktop-global-voice/spec.md`):
//! - The OS listener thread is spawned AT MOST ONCE per process, guarded by a
//!   compare-and-swap. Restarting the hook never spawns a second listener.
//! - `start`/`stop` toggle an emission gate and install/remove the sink under
//!   a mutex. Stopping removes the sink, so emission halts immediately even
//!   though the OS thread stays parked (it is idle and harmless).
//! - Key-repeat is suppressed with an edge detector: holding the key emits
//!   exactly one `Pressed`; releasing emits exactly one `Released`.
//!
//! The dispatch core is separated from the OS thread so the lifecycle rules
//! are unit-testable without an OS input hook (which is unavailable headless
//! and permission-gated on macOS).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use super::accelerator::{ChordTracker, HotkeyChord};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HotkeyEdge {
    Pressed,
    Released,
}

type HotkeySink = Box<dyn Fn(HotkeyEdge) + Send + Sync>;

pub struct GlobalHotkeyHook {
    enabled: AtomicBool,
    key_down: AtomicBool,
    os_listener_spawned: AtomicBool,
    sink: Mutex<Option<HotkeySink>>,
}

impl Default for GlobalHotkeyHook {
    fn default() -> Self {
        Self::new()
    }
}

impl GlobalHotkeyHook {
    pub const fn new() -> Self {
        Self {
            enabled: AtomicBool::new(false),
            key_down: AtomicBool::new(false),
            os_listener_spawned: AtomicBool::new(false),
            sink: Mutex::new(None),
        }
    }

    fn sink_guard(&self) -> std::sync::MutexGuard<'_, Option<HotkeySink>> {
        self.sink
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Enable the hook with `sink`, invoking `spawn_listener` only if the OS
    /// listener thread has never been spawned in this process. Returns `true`
    /// when this call transitioned the hook from disabled to enabled.
    ///
    /// `spawn_listener` is injected so tests can count spawn attempts; the
    /// production wrapper is [`start_os_hook`].
    pub fn start_with(&self, sink: HotkeySink, spawn_listener: impl FnOnce()) -> bool {
        *self.sink_guard() = Some(sink);
        // A fresh enable must not inherit a held-key state from a previous
        // run, or the first release would emit an unmatched `Released`.
        self.key_down.store(false, Ordering::SeqCst);
        let was_enabled = self.enabled.swap(true, Ordering::SeqCst);

        if !self.os_listener_spawned.swap(true, Ordering::SeqCst) {
            spawn_listener();
        }
        !was_enabled
    }

    /// Disable the hook. Emission stops immediately: the gate closes and the
    /// sink is removed, so the parked OS listener cannot reach a subscriber.
    /// Returns `true` when this call transitioned enabled -> disabled.
    pub fn stop(&self) -> bool {
        let was_enabled = self.enabled.swap(false, Ordering::SeqCst);
        *self.sink_guard() = None;
        self.key_down.store(false, Ordering::SeqCst);
        was_enabled
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::SeqCst)
    }

    /// Feed one raw key state observation (`down` = key currently pressed)
    /// into the edge detector. Called from the OS listener thread; public so
    /// tests can drive the lifecycle without an OS hook.
    pub fn dispatch(&self, down: bool) {
        if !self.enabled.load(Ordering::SeqCst) {
            // Track physical state silently so a key held across a stop does
            // not replay a stale edge after the next start.
            self.key_down.store(false, Ordering::SeqCst);
            return;
        }

        let edge = if down {
            if self.key_down.swap(true, Ordering::SeqCst) {
                return; // key-repeat while held, already reported Pressed
            }
            HotkeyEdge::Pressed
        } else {
            if !self.key_down.swap(false, Ordering::SeqCst) {
                return; // release without a matching press, ignore
            }
            HotkeyEdge::Released
        };

        if let Some(sink) = self.sink_guard().as_ref() {
            sink(edge);
        }
    }
}

/// Production entry point: enable `hook` and make sure the single OS listener
/// thread exists. The thread watches `chord` via `rdev::listen` and feeds the
/// chord's own edges into [`GlobalHotkeyHook::dispatch`].
///
/// The chord is fixed for the life of the process because the OS listener is
/// spawned at most once; a later start with a different chord reaches an
/// already-parked listener, so changing the accelerator takes effect on the
/// next launch.
pub fn start_os_hook(
    hook: &'static GlobalHotkeyHook,
    chord: HotkeyChord,
    sink: HotkeySink,
) -> Result<bool, String> {
    let mut spawn_error: Option<String> = None;
    let newly_enabled = hook.start_with(sink, || {
        let spawned = std::thread::Builder::new()
            .name("agi-dictation-hotkey".into())
            .spawn(move || {
                tracing::info!("[dictation] global hotkey listener thread started");
                let tracker = ChordTracker::new(chord);
                let result = rdev::listen(move |event| {
                    let observed = match event.event_type {
                        rdev::EventType::KeyPress(key) => tracker.observe(key, true),
                        rdev::EventType::KeyRelease(key) => tracker.observe(key, false),
                        _ => None,
                    };
                    if let Some(down) = observed {
                        hook.dispatch(down);
                    }
                });
                if let Err(error) = result {
                    tracing::error!("[dictation] rdev::listen error: {:?}", error);
                }
                // If listen() ever returns, the OS hook is gone for this
                // process; allow a future start to spawn a fresh one.
                hook.os_listener_spawned.store(false, Ordering::SeqCst);
                tracing::info!("[dictation] global hotkey listener thread exited");
            });
        if let Err(error) = spawned {
            hook.os_listener_spawned.store(false, Ordering::SeqCst);
            spawn_error = Some(format!("Failed to spawn dictation hotkey thread: {error}"));
        }
    });

    match spawn_error {
        Some(error) => {
            hook.stop();
            Err(error)
        }
        None => Ok(newly_enabled),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;
    use std::sync::Arc;

    fn counting_sink() -> (HotkeySink, Arc<Mutex<Vec<HotkeyEdge>>>) {
        let seen: Arc<Mutex<Vec<HotkeyEdge>>> = Arc::new(Mutex::new(Vec::new()));
        let sink_seen = Arc::clone(&seen);
        let sink: HotkeySink = Box::new(move |edge| {
            sink_seen.lock().expect("sink lock").push(edge);
        });
        (sink, seen)
    }

    #[test]
    fn start_stop_restart_never_stacks_listeners() {
        let hook = GlobalHotkeyHook::new();
        let spawns = AtomicUsize::new(0);

        for _ in 0..3 {
            let (sink, _seen) = counting_sink();
            hook.start_with(sink, || {
                spawns.fetch_add(1, Ordering::SeqCst);
            });
            hook.stop();
        }

        assert_eq!(
            spawns.load(Ordering::SeqCst),
            1,
            "restart must reuse the single OS listener, never spawn another"
        );
    }

    #[test]
    fn dispatch_emits_one_edge_pair_and_suppresses_key_repeat() {
        let hook = GlobalHotkeyHook::new();
        let (sink, seen) = counting_sink();
        hook.start_with(sink, || {});

        // OS key-repeat: multiple down observations while held.
        hook.dispatch(true);
        hook.dispatch(true);
        hook.dispatch(true);
        hook.dispatch(false);

        assert_eq!(
            *seen.lock().expect("seen lock"),
            vec![HotkeyEdge::Pressed, HotkeyEdge::Released]
        );
    }

    #[test]
    fn stop_halts_emission_immediately() {
        let hook = GlobalHotkeyHook::new();
        let (sink, seen) = counting_sink();
        hook.start_with(sink, || {});

        hook.dispatch(true);
        hook.dispatch(false);
        assert_eq!(seen.lock().expect("seen lock").len(), 2);

        hook.stop();
        hook.dispatch(true);
        hook.dispatch(false);

        assert_eq!(
            seen.lock().expect("seen lock").len(),
            2,
            "a stopped hook must not emit even though the OS thread persists"
        );
    }

    #[test]
    fn restart_swaps_the_sink_and_the_old_sink_never_fires_again() {
        let hook = GlobalHotkeyHook::new();
        let (old_sink, old_seen) = counting_sink();
        hook.start_with(old_sink, || {});
        hook.dispatch(true);
        hook.dispatch(false);
        hook.stop();

        let (new_sink, new_seen) = counting_sink();
        hook.start_with(new_sink, || {});
        hook.dispatch(true);
        hook.dispatch(false);

        assert_eq!(old_seen.lock().expect("old lock").len(), 2);
        assert_eq!(
            *new_seen.lock().expect("new lock"),
            vec![HotkeyEdge::Pressed, HotkeyEdge::Released]
        );
    }

    #[test]
    fn release_without_a_matching_press_is_ignored() {
        let hook = GlobalHotkeyHook::new();
        let (sink, seen) = counting_sink();
        hook.start_with(sink, || {});

        // e.g. the key was already held when the hook was enabled.
        hook.dispatch(false);
        assert!(seen.lock().expect("seen lock").is_empty());
    }

    #[test]
    fn key_held_across_a_stop_does_not_replay_a_stale_edge() {
        let hook = GlobalHotkeyHook::new();
        let (sink, _seen) = counting_sink();
        hook.start_with(sink, || {});
        hook.dispatch(true); // held...
        hook.stop(); // ...stopped while held

        let (sink2, seen2) = counting_sink();
        hook.start_with(sink2, || {});
        // The release of the previously held key arrives after restart.
        hook.dispatch(false);
        assert!(
            seen2.lock().expect("seen lock").is_empty(),
            "an unmatched release after restart must not emit"
        );

        hook.dispatch(true);
        hook.dispatch(false);
        assert_eq!(
            *seen2.lock().expect("seen lock"),
            vec![HotkeyEdge::Pressed, HotkeyEdge::Released]
        );
    }
}
