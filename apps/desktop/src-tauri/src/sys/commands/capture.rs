use image::{DynamicImage, RgbaImage};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use uuid::Uuid;

use crate::{
    automation::screen::{
        capture_primary_screen, capture_region, capture_window, enumerate_windows,
        paste_from_clipboard,
    },
    sys::commands::AppDatabase,
    ui::overlay::{dispatch_overlay_animation, ensure_overlay_ready, OverlayAnimation},
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
    ensure_overlay_ready(&app_handle);

    let capture_id = Uuid::new_v4().to_string();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let capture =
        capture_primary_screen().map_err(|e| format!("Failed to capture primary screen: {e}"))?;

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

    {
        let conn = db.connection()?;
        let _ = dispatch_overlay_animation(&app_handle, &conn, OverlayAnimation::ScreenshotFlash);
    }

    tracing::info!("Screen captured successfully: {}", capture_id);

    Ok(result)
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
    ensure_overlay_ready(&app_handle);

    let capture_id = Uuid::new_v4().to_string();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let capture = capture_region(x, y, width, height)
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

    {
        let conn = db.connection()?;
        let region_animation = OverlayAnimation::RegionHighlight {
            x,
            y,
            width: actual_width as i32,
            height: actual_height as i32,
        };
        let _ = dispatch_overlay_animation(&app_handle, &conn, region_animation);
        let _ = dispatch_overlay_animation(&app_handle, &conn, OverlayAnimation::ScreenshotFlash);
    }

    tracing::info!("Region captured successfully: {}", capture_id);

    Ok(result)
}

#[tauri::command]
pub async fn capture_get_windows() -> Result<Vec<WindowInfo>, String> {
    tracing::info!("Getting available windows");

    let windows = enumerate_windows().map_err(|e| format!("Failed to enumerate windows: {}", e))?;

    Ok(windows
        .into_iter()
        .map(|w| WindowInfo {
            handle: w.hwnd.to_string(),
            title: w.title,
            process: w.process_name,
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
                "SELECT id, conversation_id, capture_type, file_path, thumbnail_path, ocr_text, ocr_confidence, metadata, created_a
                 FROM captures
                 WHERE conversation_id = ?1
                 ORDER BY created_at DESC
                 LIMIT ?2",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let rows = stm
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
                "SELECT id, conversation_id, capture_type, file_path, thumbnail_path, ocr_text, ocr_confidence, metadata, created_a
                 FROM captures
                 ORDER BY created_at DESC
                 LIMIT ?1",
            )
            .map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let rows = stm
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
    ensure_overlay_ready(&app_handle);

    let capture_id = Uuid::new_v4().to_string();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let hwnd_val: isize = hwnd
        .parse()
        .map_err(|e| format!("Invalid window handle: {}", e))?;

    let capture =
        capture_window(hwnd_val).map_err(|e| format!("Failed to capture window: {}", e))?;

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

    {
        let conn = db.connection()?;
        let _ = dispatch_overlay_animation(&app_handle, &conn, OverlayAnimation::ScreenshotFlash);
    }

    tracing::info!("Window captured successfully: {}", capture_id);

    Ok(result)
}

#[tauri::command]
pub async fn capture_from_clipboard(
    app_handle: tauri::AppHandle,
    db: State<'_, AppDatabase>,
    conversation_id: Option<i64>,
) -> Result<CaptureResult, String> {
    tracing::info!("Capturing from clipboard");
    ensure_overlay_ready(&app_handle);

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

    {
        let conn = db.connection()?;
        let _ = dispatch_overlay_animation(&app_handle, &conn, OverlayAnimation::ScreenshotFlash);
    }

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
