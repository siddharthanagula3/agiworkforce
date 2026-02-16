use image::{DynamicImage, RgbaImage};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use uuid::Uuid;

#[cfg(not(target_os = "macos"))]
use crate::automation::screen::{capture_primary_screen, capture_region, capture_window};
#[cfg(target_os = "macos")]
use crate::automation::screen::{capture_region, capture_window};
use crate::{
    automation::screen::{enumerate_windows, paste_from_clipboard},
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureRecord {
    pub id: String,
    pub conversation_id: Option<i64>,
    pub capture_type: String,
    pub file_path: String,
    pub thumbnail_path: Option<String>,
    pub ocr_text: Option<String>,
    pub ocr_confidence: Option<f32>,
    pub metadata: String,
    pub created_at: i64,
}

#[tauri::command]
pub async fn capture_screen_full(
    app_handle: tauri::AppHandle,
    db: State<'_, AppDatabase>,
    conversation_id: Option<i64>,
) -> Result<CaptureResult, String> {
    tracing::info!("Capturing full screen");

    #[cfg(target_os = "macos")]
    {
        let capture_id = Uuid::new_v4().to_string();
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let pixels = with_hidden_main_window_for_capture(&app_handle, || {
            std::panic::catch_unwind(|| capture_with_macos_screencapture(&["-x"]))
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
pub async fn capture_get_windows() -> Result<Vec<WindowInfo>, String> {
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
pub async fn capture_get_history(
    db: State<'_, AppDatabase>,
    conversation_id: Option<i64>,
    limit: Option<u32>,
) -> Result<Vec<CaptureRecord>, String> {
    tracing::info!("Getting capture history");

    let limit = limit.unwrap_or(50);

    let conn = db.connection()?;

    let captures: Result<Vec<CaptureRecord>, String> = if let Some(conv_id) = conversation_id {
        let mut stmt = conn
            .prepare(
                "SELECT id, conversation_id, capture_type, file_path, thumbnail_path, ocr_text, ocr_confidence, metadata, created_at
                 FROM captures
                 WHERE conversation_id = ?1
                 ORDER BY created_at DESC
                 LIMIT ?2",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let rows = stmt
            .query_map(rusqlite::params![conv_id, limit], |row| {
                Ok(CaptureRecord {
                    id: row.get(0)?,
                    conversation_id: row.get(1)?,
                    capture_type: row.get(2)?,
                    file_path: row.get(3)?,
                    thumbnail_path: row.get(4)?,
                    ocr_text: row.get(5)?,
                    ocr_confidence: row.get(6)?,
                    metadata: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })
            .map_err(|e| format!("Failed to query captures: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect captures: {}", e))
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, conversation_id, capture_type, file_path, thumbnail_path, ocr_text, ocr_confidence, metadata, created_at
                 FROM captures
                 ORDER BY created_at DESC
                 LIMIT ?1",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let rows = stmt
            .query_map(rusqlite::params![limit], |row| {
                Ok(CaptureRecord {
                    id: row.get(0)?,
                    conversation_id: row.get(1)?,
                    capture_type: row.get(2)?,
                    file_path: row.get(3)?,
                    thumbnail_path: row.get(4)?,
                    ocr_text: row.get(5)?,
                    ocr_confidence: row.get(6)?,
                    metadata: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })
            .map_err(|e| format!("Failed to query captures: {}", e))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to collect captures: {}", e))
    };

    captures
}

#[tauri::command]
pub async fn capture_delete(db: State<'_, AppDatabase>, capture_id: String) -> Result<(), String> {
    tracing::info!("Deleting capture: {}", capture_id);

    let conn = db.connection()?;

    let (file_path, thumbnail_path): (String, Option<String>) = conn
        .query_row(
            "SELECT file_path, thumbnail_path FROM captures WHERE id = ?1",
            rusqlite::params![&capture_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Failed to get capture: {}", e))?;

    conn.execute(
        "DELETE FROM captures WHERE id = ?1",
        rusqlite::params![&capture_id],
    )
    .map_err(|e| format!("Failed to delete capture: {}", e))?;

    let _ = std::fs::remove_file(&file_path);
    if let Some(thumb) = thumbnail_path {
        let _ = std::fs::remove_file(&thumb);
    }

    tracing::info!("Capture deleted successfully: {}", capture_id);

    Ok(())
}

#[tauri::command]
pub async fn capture_save_to_clipboard(
    app_handle: tauri::AppHandle,
    capture_id: String,
    db: State<'_, AppDatabase>,
) -> Result<(), String> {
    tracing::info!("Copying capture to clipboard: {}", capture_id);

    let conn = db.connection()?;

    let file_path: String = conn
        .query_row(
            "SELECT file_path FROM captures WHERE id = ?1",
            rusqlite::params![&capture_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to get capture: {}", e))?;

    let img_data = image::open(&file_path)
        .map_err(|e| format!("Failed to load image: {}", e))?
        .to_rgba8();

    let (width, height) = img_data.dimensions();
    let rgba = img_data.into_raw();

    let img = tauri::image::Image::new_owned(rgba, width, height);

    app_handle
        .clipboard()
        .write_image(&img)
        .map_err(|e| format!("Failed to write to clipboard: {}", e))?;

    tracing::info!("Capture copied to clipboard successfully");
    Ok(())
}

#[tauri::command]
pub async fn capture_screen_window(
    app_handle: tauri::AppHandle,
    db: State<'_, AppDatabase>,
    hwnd: String,
    conversation_id: Option<i64>,
) -> Result<CaptureResult, String> {
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

#[tauri::command]
pub async fn capture_from_clipboard(
    app_handle: tauri::AppHandle,
    db: State<'_, AppDatabase>,
    conversation_id: Option<i64>,
) -> Result<CaptureResult, String> {
    tracing::info!("Capturing from clipboard");

    let capture_id = Uuid::new_v4().to_string();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let capture =
        paste_from_clipboard().map_err(|e| format!("Failed to paste from clipboard: {}", e))?;

    let metadata = CaptureMetadata {
        width: capture.pixels.width(),
        height: capture.pixels.height(),
        window_title: Some("Clipboard".to_string()),
        region: None,
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

    tracing::info!("Clipboard captured successfully: {}", capture_id);

    Ok(result)
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
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get data dir: {e}"))?;

    let captures_dir = data_dir.join("captures");
    std::fs::create_dir_all(&captures_dir)
        .map_err(|e| format!("Failed to create captures directory: {e}"))?;

    let file_name = format!("capture_{capture_id}.png");
    let file_path = captures_dir.join(&file_name);
    DynamicImage::ImageRgba8(image.clone())
        .save(&file_path)
        .map_err(|e| format!("Failed to save image: {e}"))?;

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
                // AUDIT-CAPTURE-041 fix: Log errors instead of silently ignoring
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

#[cfg(target_os = "macos")]
fn capture_with_macos_screencapture(args: &[&str]) -> Result<RgbaImage, String> {
    let tmp_path = std::env::temp_dir().join(format!("agi-capture-{}.png", Uuid::new_v4()));
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

    let image = image::open(&tmp_path)
        .map_err(|e| format!("Failed to load captured screenshot: {}", e))?
        .to_rgba8();
    let _ = std::fs::remove_file(&tmp_path);
    Ok(image)
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
    thumbnail
        .save(&thumb_path)
        .map_err(|e| format!("Failed to save thumbnail: {}", e))?;

    Ok(Some(thumb_path))
}
