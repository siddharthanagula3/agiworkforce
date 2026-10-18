use image::RgbaImage;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, State};
use uuid::Uuid;

#[cfg(not(target_os = "macos"))]
use crate::automation::screen::{capture_primary_screen, capture_region, capture_window};
#[cfg(target_os = "macos")]
use crate::automation::screen::{capture_region, capture_window};
use crate::{
    automation::computer_use::{prepare_screenshot_dir, write_screenshot},
    automation::screen::enumerate_windows,
    sys::commands::AppDatabase,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureType {
    Fullscreen,
    Window,
    Region,
}

impl CaptureType {
    fn as_str(&self) -> &str {
        match self {
            CaptureType::Fullscreen => "fullscreen",
            CaptureType::Window => "window",
            CaptureType::Region => "region",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureMetadata {
    pub width: u32,
    pub height: u32,
    pub window_title: Option<String>,
    pub region: Option<Region>,
    pub screen_index: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Region {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureResult {
    pub id: String,
    pub path: String,
    pub thumbnail_path: Option<String>,
    pub capture_type: CaptureType,
    pub metadata: CaptureMetadata,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowInfo {
    pub handle: String,
    pub title: String,
    pub process: String,
    pub bounds: Option<WindowBounds>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

const CAPTURE_CONFIRM_LABEL: &str = "Take Picture";
const CAPTURE_REQUEST: &str = "screen-capture";
const CAPTURE_DECLINED_MESSAGE: &str =
    "The screen capture was not confirmed, so no picture was taken.";

/// One capture question at a time, and a wait after a no that grows while
/// the noes keep coming.
static CAPTURE_DECISIONS: crate::sys::native_confirm::ConfirmGate =
    crate::sys::native_confirm::ConfirmGate::new();

/// Set by the user's yes to the question below and kept until the app quits.
/// It covers captures asked for from the window and nothing else: it is not
/// computer-use consent, and a capture taken for a model still needs that.
static CAPTURE_CONFIRMED_THIS_RUN: AtomicBool = AtomicBool::new(false);

fn capture_question() -> crate::sys::native_confirm::NativeConfirm {
    crate::sys::native_confirm::NativeConfirm {
        title: "Take a picture of your screen?".to_string(),
        body: "It goes into the chat you are writing. You will not be asked again until you quit AGI Workforce.".to_string(),
        confirm_label: CAPTURE_CONFIRM_LABEL.to_string(),
    }
}

/// What every command here passes before it looks at the screen or lists what
/// is on it. A click on the capture button reaches these commands exactly as
/// a script in the window would, so the first capture of an app run is
/// confirmed in a native dialog, and the Screenshots switch in Settings,
/// Capabilities, which the window cannot turn on by itself, is honoured every
/// time.
async fn ensure_capture_allowed(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(off) =
        crate::sys::commands::capabilities::capability_refusal(app, "ui_screenshot").await
    {
        return Err(off);
    }
    if CAPTURE_CONFIRMED_THIS_RUN.load(Ordering::SeqCst) {
        return Ok(());
    }
    let confirmed = CAPTURE_DECISIONS
        .confirm(app, CAPTURE_REQUEST, capture_question())
        .await
        .map_err(|held| held.message())?;
    if !confirmed {
        return Err(CAPTURE_DECLINED_MESSAGE.to_string());
    }
    CAPTURE_CONFIRMED_THIS_RUN.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub async fn capture_screen_full(
    app_handle: tauri::AppHandle,
    db: State<'_, AppDatabase>,
    conversation_id: Option<i64>,
) -> Result<CaptureResult, String> {
    ensure_capture_allowed(&app_handle).await?;
    tracing::info!("Capturing full screen");

    #[cfg(target_os = "macos")]
    {
        let capture_id = Uuid::new_v4().to_string();
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let captures_dir = private_captures_dir(&app_handle)?;
        let pixels = with_hidden_main_window_for_capture(&app_handle, || {
            std::panic::catch_unwind(|| capture_with_macos_screencapture(&["-x"], &captures_dir))
                .map_err(|_| "Capture backend panicked while capturing full screen".to_string())?
        })?;
        let metadata = CaptureMetadata {
            width: pixels.width(),
            height: pixels.height(),
            window_title: None,
            region: None,
            screen_index: None,
        };

        let result = persist_capture(
            &app_handle,
            &db,
            &capture_id,
            CaptureType::Fullscreen,
            &pixels,
            &metadata,
            conversation_id,
            timestamp,
        )?;

        tracing::info!(
            "Screen captured successfully (macOS native): {}",
            capture_id
        );
        return Ok(result);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let capture_id = Uuid::new_v4().to_string();
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let capture = std::panic::catch_unwind(capture_primary_screen)
            .map_err(|_| "Capture backend panicked while capturing full screen".to_string())?
            .map_err(|e| format!("Failed to capture primary screen: {e}"))?;

        let metadata = CaptureMetadata {
            width: capture.pixels.width(),
            height: capture.pixels.height(),
            window_title: None,
            region: None,
            screen_index: Some(capture.screen_index),
        };

        let result = persist_capture(
            &app_handle,
            &db,
            &capture_id,
            CaptureType::Fullscreen,
            &capture.pixels,
            &metadata,
            conversation_id,
            timestamp,
        )?;

        tracing::info!("Screen captured successfully: {}", capture_id);
        return Ok(result);
    }

    #[allow(unreachable_code)]
    Err("Unsupported platform for capture_screen_full".to_string())
}

#[tauri::command]
pub async fn capture_screen_region(
    app_handle: tauri::AppHandle,
    db: State<'_, AppDatabase>,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    conversation_id: Option<i64>,
) -> Result<CaptureResult, String> {
    ensure_capture_allowed(&app_handle).await?;
    tracing::info!("Capturing screen region: ({x}, {y}) {width}x{height}");

    #[cfg(target_os = "macos")]
    {
        let capture_id = Uuid::new_v4().to_string();
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        // Use the provided region coordinates instead of interactive picker.
        let capture = with_hidden_main_window_for_capture(&app_handle, || {
            std::panic::catch_unwind(|| capture_region(x, y, width, height))
                .map_err(|_| "Capture backend panicked while capturing region".to_string())?
                .map_err(|e| format!("Failed to capture region: {e}"))
        })?;

        let actual_width = capture.pixels.width();
        let actual_height = capture.pixels.height();

        let metadata = CaptureMetadata {
            width: actual_width,
            height: actual_height,
            window_title: None,
            region: Some(Region {
                x,
                y,
                width: actual_width,
                height: actual_height,
            }),
            screen_index: Some(capture.screen_index),
        };

        let result = persist_capture(
            &app_handle,
            &db,
            &capture_id,
            CaptureType::Region,
            &capture.pixels,
            &metadata,
            conversation_id,
            timestamp,
        )?;

        tracing::info!(
            "Region captured successfully (macOS native): {}",
            capture_id
        );
        return Ok(result);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let capture_id = Uuid::new_v4().to_string();
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let capture = std::panic::catch_unwind(|| capture_region(x, y, width, height))
            .map_err(|_| "Capture backend panicked while capturing region".to_string())?
            .map_err(|e| format!("Failed to capture region: {e}"))?;

        let actual_width = capture.pixels.width();
        let actual_height = capture.pixels.height();

        let metadata = CaptureMetadata {
            width: actual_width,
            height: actual_height,
            window_title: None,
            region: Some(Region {
                x,
                y,
                width: actual_width,
                height: actual_height,
            }),
            screen_index: Some(capture.screen_index),
        };

        let result = persist_capture(
            &app_handle,
            &db,
            &capture_id,
            CaptureType::Region,
            &capture.pixels,
            &metadata,
            conversation_id,
            timestamp,
        )?;

        tracing::info!("Region captured successfully: {}", capture_id);
        return Ok(result);
    }

    #[allow(unreachable_code)]
    Err("Unsupported platform for capture_screen_region".to_string())
}

#[tauri::command]
pub async fn capture_get_windows(app_handle: tauri::AppHandle) -> Result<Vec<WindowInfo>, String> {
    ensure_capture_allowed(&app_handle).await?;
    tracing::info!("Getting available windows");

    let windows = std::panic::catch_unwind(enumerate_windows)
        .map_err(|_| "Capture backend panicked while enumerating windows".to_string())?
        .map_err(|e| format!("Failed to enumerate windows: {}", e))?;

    Ok(windows
        .into_iter()
        .map(|w| WindowInfo {
            handle: w.hwnd.to_string(),
            title: w.title,
            process: w.process_name,
            bounds: Some(WindowBounds {
                x: w.rect.x,
                y: w.rect.y,
                width: w.rect.width,
                height: w.rect.height,
            }),
        })
        .collect())
}

#[tauri::command]
pub async fn capture_screen_window(
    app_handle: tauri::AppHandle,
    db: State<'_, AppDatabase>,
    hwnd: String,
    conversation_id: Option<i64>,
) -> Result<CaptureResult, String> {
    ensure_capture_allowed(&app_handle).await?;
    tracing::info!("Capturing window: {}", hwnd);

    #[cfg(target_os = "macos")]
    {
        let capture_id = Uuid::new_v4().to_string();
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        // Use the provided window handle instead of interactive picker.
        let hwnd_val: isize = hwnd
            .parse()
            .map_err(|e| format!("Invalid window handle: {}", e))?;

        let capture = with_hidden_main_window_for_capture(&app_handle, || {
            std::panic::catch_unwind(|| capture_window(hwnd_val))
                .map_err(|_| "Capture backend panicked while capturing window".to_string())?
                .map_err(|e| format!("Failed to capture window: {e}"))
        })?;

        let window_title = crate::automation::screen::enumerate_windows()
            .ok()
            .and_then(|windows| {
                windows
                    .iter()
                    .find(|w| w.hwnd == hwnd_val)
                    .map(|w| w.title.clone())
            });

        let metadata = CaptureMetadata {
            width: capture.pixels.width(),
            height: capture.pixels.height(),
            window_title,
            region: None,
            screen_index: Some(capture.screen_index),
        };

        let result = persist_capture(
            &app_handle,
            &db,
            &capture_id,
            CaptureType::Window,
            &capture.pixels,
            &metadata,
            conversation_id,
            timestamp,
        )?;

        tracing::info!(
            "Window captured successfully (macOS native): {}",
            capture_id
        );
        return Ok(result);
    }

    #[cfg(not(target_os = "macos"))]
    {
        let capture_id = Uuid::new_v4().to_string();
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let hwnd_val: isize = hwnd
            .parse()
            .map_err(|e| format!("Invalid window handle: {}", e))?;

        let capture = std::panic::catch_unwind(|| capture_window(hwnd_val))
            .map_err(|_| "Capture backend panicked while capturing window".to_string())?
            .map_err(|e| format!("Failed to capture window: {}", e))?;

        let window_title = enumerate_windows().ok().and_then(|windows| {
            windows
                .iter()
                .find(|w| w.hwnd == hwnd_val)
                .map(|w| w.title.clone())
        });

        let metadata = CaptureMetadata {
            width: capture.pixels.width(),
            height: capture.pixels.height(),
            window_title,
            region: None,
            screen_index: Some(capture.screen_index),
        };

        let result = persist_capture(
            &app_handle,
            &db,
            &capture_id,
            CaptureType::Window,
            &capture.pixels,
            &metadata,
            conversation_id,
            timestamp,
        )?;

        tracing::info!("Window captured successfully: {}", capture_id);
        return Ok(result);
    }

    #[allow(unreachable_code)]
    Err("Unsupported platform for capture_screen_window".to_string())
}

#[allow(clippy::too_many_arguments)]
fn persist_capture(
    app_handle: &tauri::AppHandle,
    db: &State<'_, AppDatabase>,
    capture_id: &str,
    capture_type: CaptureType,
    image: &RgbaImage,
    metadata: &CaptureMetadata,
    conversation_id: Option<i64>,
    timestamp: i64,
) -> Result<CaptureResult, String> {
    let captures_dir = private_captures_dir(app_handle)?;

    let file_name = format!("capture_{capture_id}.png");
    let file_path = captures_dir.join(&file_name);
    write_screenshot(&file_path, image).map_err(|e| format!("Failed to save image: {e}"))?;

    let thumbnail_path = generate_thumbnail(image, &captures_dir, capture_id)?;

    let metadata_json = serde_json::to_string(metadata)
        .map_err(|e| format!("Failed to serialize metadata: {e}"))?;

    let file_path_str = file_path.to_string_lossy().into_owned();
    let thumbnail_path_str = thumbnail_path
        .as_ref()
        .map(|p| p.to_string_lossy().into_owned());

    db.conn.lock()
        .map_err(|e| format!("Failed to lock database: {e}"))?
        .execute(
            "INSERT INTO captures (id, conversation_id, capture_type, file_path, thumbnail_path, metadata, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                capture_id,
                conversation_id,
                capture_type.as_str(),
                file_path_str,
                thumbnail_path_str,
                &metadata_json,
                timestamp,
            ],
        )
        .map_err(|e| format!("Failed to insert capture: {e}"))?;

    Ok(CaptureResult {
        id: capture_id.to_string(),
        path: file_path.to_string_lossy().into_owned(),
        thumbnail_path: thumbnail_path.map(|p| p.to_string_lossy().into_owned()),
        capture_type,
        metadata: metadata.clone(),
        created_at: timestamp,
    })
}

#[cfg(target_os = "macos")]
struct WindowRestoreGuard {
    app_handle: tauri::AppHandle,
    was_visible: bool,
}

#[cfg(target_os = "macos")]
impl WindowRestoreGuard {
    fn new(app_handle: &tauri::AppHandle) -> Self {
        let mut was_visible = false;
        if let Some(window) = app_handle.get_webview_window("main") {
            if window.is_visible().unwrap_or(false) {
                was_visible = true;
                if let Err(e) = window.hide() {
                    tracing::warn!("Failed to hide main window before capture: {}", e);
                }
                std::thread::sleep(std::time::Duration::from_millis(120));
            }
        }
        Self {
            app_handle: app_handle.clone(),
            was_visible,
        }
    }

    fn restore(&self) {
        if self.was_visible {
            if let Some(window) = self.app_handle.get_webview_window("main") {
                if let Err(e) = window.show() {
                    tracing::error!("Failed to show main window after capture: {}", e);
                }
                if let Err(e) = window.set_focus() {
                    tracing::error!("Failed to focus main window after capture: {}", e);
                }
            }
        }
    }
}

#[cfg(target_os = "macos")]
impl Drop for WindowRestoreGuard {
    fn drop(&mut self) {
        self.restore();
    }
}

#[cfg(target_os = "macos")]
fn with_hidden_main_window_for_capture<T, F>(
    app_handle: &tauri::AppHandle,
    action: F,
) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String>,
{
    let _guard = WindowRestoreGuard::new(app_handle);
    let result = action();
    // Explicitly restore before returning (guard will also restore on drop if this fails)
    _guard.restore();
    result
}

/// The app's own captures folder, readable by its owner only. A user's
/// screenshots stay here, and never pass through the shared temp directory.
fn private_captures_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let captures_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get data dir: {e}"))?
        .join("captures");
    prepare_screenshot_dir(&captures_dir)
        .map_err(|e| format!("Failed to create captures directory: {e}"))?;
    Ok(captures_dir)
}

#[cfg(target_os = "macos")]
fn capture_with_macos_screencapture(
    args: &[&str],
    captures_dir: &Path,
) -> Result<RgbaImage, String> {
    let tmp_path = captures_dir.join(format!(".pending-{}.png", Uuid::new_v4()));
    let output_path = tmp_path
        .to_str()
        .ok_or_else(|| "Invalid temporary capture path".to_string())?;

    let status = Command::new("screencapture")
        .args(args)
        .arg(output_path)
        .status()
        .map_err(|e| format!("Failed to run macOS screencapture: {}", e))?;

    if !status.success() {
        return Err(
            "Screen capture was cancelled or failed. Check Screen Recording permission."
                .to_string(),
        );
    }

    let loaded = image::open(&tmp_path);
    let _ = std::fs::remove_file(&tmp_path);
    Ok(loaded
        .map_err(|e| format!("Failed to load captured screenshot: {}", e))?
        .to_rgba8())
}

fn generate_thumbnail(
    image: &image::RgbaImage,
    output_dir: &Path,
    capture_id: &str,
) -> Result<Option<PathBuf>, String> {
    const THUMB_WIDTH: u32 = 200;
    const THUMB_HEIGHT: u32 = 150;

    let (width, height) = image.dimensions();
    let aspect_ratio = width as f32 / height as f32;
    let (thumb_w, thumb_h) = if aspect_ratio > (THUMB_WIDTH as f32 / THUMB_HEIGHT as f32) {
        (THUMB_WIDTH, (THUMB_WIDTH as f32 / aspect_ratio) as u32)
    } else {
        ((THUMB_HEIGHT as f32 * aspect_ratio) as u32, THUMB_HEIGHT)
    };

    let thumbnail = image::imageops::resize(
        image,
        thumb_w,
        thumb_h,
        image::imageops::FilterType::Lanczos3,
    );

    let thumb_name = format!("thumb_{}.png", capture_id);
    let thumb_path = output_dir.join(&thumb_name);
    write_screenshot(&thumb_path, &thumbnail)
        .map_err(|e| format!("Failed to save thumbnail: {}", e))?;

    Ok(Some(thumb_path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_capture_button_is_one_the_native_dialog_can_ask_with() {
        assert!(crate::sys::native_confirm::can_ask_with(
            CAPTURE_CONFIRM_LABEL
        ));
        let question = capture_question();
        assert_eq!(question.confirm_label, CAPTURE_CONFIRM_LABEL);
        assert_eq!(question.title, "Take a picture of your screen?");
        assert!(question.body.contains("until you quit"));
    }

    /// The yes for a capture is its own: nothing here reads or grants
    /// computer-use consent.
    #[test]
    fn a_capture_yes_is_kept_apart_from_computer_use_consent() {
        let source = include_str!("capture.rs");
        let gate = source
            .split("async fn ensure_capture_allowed(")
            .nth(1)
            .and_then(|rest| rest.split("\n}\n").next())
            .expect("ensure_capture_allowed");

        assert!(gate.contains("capability_refusal(app, \"ui_screenshot\")"));
        assert!(
            gate.find("CAPTURE_DECISIONS").expect("asks")
                < gate
                    .find("CAPTURE_CONFIRMED_THIS_RUN.store(true")
                    .expect("remembers")
        );
        for name in ["require_consent", "consent_is_live", "persist_consent"] {
            let mention = format!("{name}(");
            assert_eq!(
                source.matches(mention.as_str()).count(),
                0,
                "capture.rs must not touch computer-use consent through {name}"
            );
        }
    }

    /// Each capture command is callable by whatever runs in the window, so
    /// each passes the switch and the confirmation before anything else.
    #[test]
    fn every_capture_command_passes_the_switch_and_the_confirmation_first() {
        let source = include_str!("capture.rs");
        let commands: Vec<&str> = source
            .split("#[tauri::command]\npub async fn ")
            .skip(1)
            .collect();
        let names: Vec<&str> = commands
            .iter()
            .filter_map(|command| command.split('(').next())
            .collect();
        assert_eq!(
            names,
            [
                "capture_screen_full",
                "capture_screen_region",
                "capture_get_windows",
                "capture_screen_window",
            ],
            "a command added here needs a place in this test"
        );

        for command in commands {
            let name = command.split('(').next().unwrap_or_default();
            let body = command
                .split_once(" {\n")
                .map(|(_, body)| body)
                .unwrap_or_default();
            assert!(
                body.trim_start()
                    .starts_with("ensure_capture_allowed(&app_handle).await?;"),
                "{name} must pass the capture gate before anything else"
            );
        }
    }
}
