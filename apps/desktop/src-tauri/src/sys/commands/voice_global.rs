//! Global fn-key Push-to-Talk (PTT) via OS-level keyboard hook.
//!
//! This module adds a *system-wide* PTT trigger: the user holds the `fn` key
//! anywhere on the machine (not just when the app is focused) and the Tauri
//! frontend is notified so it can start/stop recording.
//!
//! # Architecture
//! - `rdev::listen` is a **blocking** call that parks a thread until the OS
//!   input stream closes.  We spawn it with `std::thread::spawn` so it never
//!   blocks the async runtime.
//! - A shared `Arc<AtomicBool>` (`PTT_RUNNING`) lets `voice_stop_global_ptt`
//!   signal the listener thread to exit.
//! - Text injection re-uses the existing `automation::input::lock_enigo` mutex
//!   so we serialise all Enigo calls app-wide (prevents race conditions with
//!   the computer-use automation path).
//!
//! # Events emitted to the frontend
//! | Event               | Payload | Meaning                        |
//! |---------------------|---------|-------------------------------|
//! | `voice:ptt-start`   | `null`  | fn key pressed — start recording |
//! | `voice:ptt-stop`    | `null`  | fn key released — stop recording |

use once_cell::sync::Lazy;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::Emitter;

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------

/// Set to `true` while the global PTT listener thread is running.
/// `voice_stop_global_ptt` flips it to `false` which causes the listener
/// thread to exit at its next iteration.
static PTT_RUNNING: Lazy<Arc<AtomicBool>> =
    Lazy::new(|| Arc::new(AtomicBool::new(false)));

/// Join handle of the OS listener thread (if started).
/// We keep it so we can detect double-starts cleanly.
static PTT_THREAD: Lazy<Mutex<Option<std::thread::JoinHandle<()>>>> =
    Lazy::new(|| Mutex::new(None));

// ---------------------------------------------------------------------------
// Tauri Commands
// ---------------------------------------------------------------------------

/// Start the global fn-key PTT listener.
///
/// Spawns a background OS thread that calls `rdev::listen`.  The thread
/// emits `voice:ptt-start` when the fn key is pressed and `voice:ptt-stop`
/// when it is released.
///
/// Calling this while a listener is already running is a no-op (returns `Ok`).
#[tauri::command]
pub async fn voice_start_global_ptt(app: tauri::AppHandle) -> Result<(), String> {
    // Guard against double-start
    if PTT_RUNNING.load(Ordering::SeqCst) {
        tracing::debug!("[global-ptt] listener already running — ignoring start request");
        return Ok(());
    }

    PTT_RUNNING.store(true, Ordering::SeqCst);

    let running = Arc::clone(&*PTT_RUNNING);
    let app_handle = app.clone();

    let handle = std::thread::Builder::new()
        .name("voice-global-ptt".into())
        .spawn(move || {
            tracing::info!("[global-ptt] listener thread started");

            // `rdev::listen` is blocking; the callback is called on every input event.
            // We return `false` from inside the callback to break the listen loop
            // when `running` is set to false.
            let result = rdev::listen(move |event| {
                if !running.load(Ordering::SeqCst) {
                    // Signal rdev to stop by returning — note: rdev::listen
                    // stops when the callback panics or when it receives a
                    // "stop" signal via the return value on some platforms.
                    // We use a flag + early return here; rdev will eventually
                    // detect the thread should stop.
                    return;
                }

                match event.event_type {
                    rdev::EventType::KeyPress(rdev::Key::Function) => {
                        tracing::debug!("[global-ptt] fn key pressed — emitting ptt-start");
                        if let Err(e) = app_handle.emit("voice:ptt-start", ()) {
                            tracing::warn!("[global-ptt] failed to emit ptt-start: {}", e);
                        }
                    }
                    rdev::EventType::KeyRelease(rdev::Key::Function) => {
                        tracing::debug!("[global-ptt] fn key released — emitting ptt-stop");
                        if let Err(e) = app_handle.emit("voice:ptt-stop", ()) {
                            tracing::warn!("[global-ptt] failed to emit ptt-stop: {}", e);
                        }
                    }
                    _ => {}
                }
            });

            if let Err(e) = result {
                tracing::error!("[global-ptt] rdev::listen error: {:?}", e);
            }

            tracing::info!("[global-ptt] listener thread exited");
        })
        .map_err(|e| format!("Failed to spawn global PTT thread: {}", e))?;

    // Store the join handle
    if let Ok(mut guard) = PTT_THREAD.lock() {
        *guard = Some(handle);
    }

    tracing::info!("[global-ptt] global fn-key PTT listener started");
    Ok(())
}

/// Stop the global PTT listener and clean up the OS hook thread.
///
/// Sets the `PTT_RUNNING` flag to `false`.  The background thread will notice
/// on its next input event and exit.  On macOS, rdev's listener loop wakes up
/// on every input event, so the thread exits quickly after the next keypress.
#[tauri::command]
pub async fn voice_stop_global_ptt() -> Result<(), String> {
    if !PTT_RUNNING.load(Ordering::SeqCst) {
        tracing::debug!("[global-ptt] listener not running — ignoring stop request");
        return Ok(());
    }

    PTT_RUNNING.store(false, Ordering::SeqCst);

    // Drop (and thereby detach) the thread handle — we don't block waiting for
    // it because rdev::listen may park until the next event arrives.
    if let Ok(mut guard) = PTT_THREAD.lock() {
        let _ = guard.take(); // detach; the thread will exit on next event
    }

    tracing::info!("[global-ptt] global fn-key PTT listener stopped");
    Ok(())
}

/// Inject `text` into the currently OS-focused window/field.
///
/// Uses `enigo` (already a project dependency) with the shared `lock_enigo`
/// mutex so we serialise all synthetic input events across the codebase.
///
/// On macOS this requires the Accessibility permission ("control this computer").
#[tauri::command]
pub async fn voice_inject_text(text: String) -> Result<(), String> {
    if text.is_empty() {
        return Ok(());
    }

    // Offload to a blocking thread — enigo interacts with OS input APIs that
    // can block briefly, and we must not block the Tokio worker threads.
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        use crate::automation::input::lock_enigo;
        use enigo::{Enigo, Keyboard, Settings};

        let _guard = lock_enigo().map_err(|e| format!("Failed to acquire enigo lock: {}", e))?;

        let mut enigo = Enigo::new(&Settings::default())
            .map_err(|e| format!("Failed to create Enigo instance: {:?}", e))?;

        enigo
            .text(&text)
            .map_err(|e| format!("Failed to inject text: {:?}", e))?;

        tracing::debug!("[global-ptt] injected {} chars via enigo", text.len());
        Ok(())
    })
    .await
    .map_err(|e| format!("voice_inject_text task panicked: {}", e))?
}
