//! Screen Watcher - Continuous Screen Monitoring
//!
//! Provides periodic screenshot capture for AGI screen awareness.
//! The AI uses these screenshots to understand the current screen state
//! and make intelligent decisions about what actions to take.
//!
//! Features:
//! - Configurable capture interval (default: 3 seconds)
//! - Automatic pause when idle (no active tasks)
//! - Memory-efficient circular buffer
//! - Change detection to avoid redundant processing

use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView, ImageFormat};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::{mpsc, Mutex, RwLock};
use tracing::{debug, info, warn};

use super::screen::capture_primary_screen;

/// Default capture interval in milliseconds
const DEFAULT_INTERVAL_MS: u64 = 3000; // 3 seconds

/// Maximum number of screenshots to keep in memory
const MAX_SCREENSHOTS_BUFFER: usize = 10;

/// Maximum resolution for stored screenshots (width or height)
const MAX_SCREENSHOT_DIMENSION: u32 = 1280;

/// Screenshot with metadata
#[derive(Clone, Serialize, Deserialize)]
pub struct ScreenCapture {
    /// Unique ID for this capture
    pub id: String,
    /// Timestamp when captured (unix millis)
    pub timestamp: u64,
    /// Width of the captured image
    pub width: u32,
    /// Height of the captured image
    pub height: u32,
    /// Base64-encoded JPEG image data
    pub image_base64: String,
    /// Hash of the image for change detection
    pub image_hash: u64,
}

/// Screen watcher configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScreenWatcherConfig {
    /// Capture interval in milliseconds (default: 3000)
    pub interval_ms: u64,
    /// Whether change detection is enabled
    pub change_detection: bool,
    /// Minimum time between captures even with changes (ms)
    pub min_interval_ms: u64,
    /// Maximum resolution to store (0 = no limit)
    pub max_resolution: u32,
}

impl Default for ScreenWatcherConfig {
    fn default() -> Self {
        Self {
            interval_ms: DEFAULT_INTERVAL_MS,
            change_detection: true,
            min_interval_ms: 1000,
            max_resolution: MAX_SCREENSHOT_DIMENSION,
        }
    }
}

/// Screen watcher state
struct WatcherState {
    /// Whether the watcher is active
    is_running: AtomicBool,
    /// Whether the watcher is paused
    is_paused: AtomicBool,
    /// Current configuration
    config: RwLock<ScreenWatcherConfig>,
    /// Circular buffer of recent screenshots
    screenshots: RwLock<Vec<ScreenCapture>>,
    /// Hash of the last captured screenshot for change detection
    last_hash: AtomicU64,
    /// Counter for generating unique IDs
    capture_counter: AtomicU64,
}

impl WatcherState {
    fn new() -> Self {
        Self {
            is_running: AtomicBool::new(false),
            is_paused: AtomicBool::new(false),
            config: RwLock::new(ScreenWatcherConfig::default()),
            screenshots: RwLock::new(Vec::with_capacity(MAX_SCREENSHOTS_BUFFER)),
            last_hash: AtomicU64::new(0),
            capture_counter: AtomicU64::new(0),
        }
    }
}

/// Global screen watcher instance
static WATCHER: Lazy<Arc<WatcherState>> = Lazy::new(|| Arc::new(WatcherState::new()));

/// Channel for sending captured screenshots to listeners
static SCREENSHOT_TX: Lazy<Mutex<Option<mpsc::Sender<ScreenCapture>>>> =
    Lazy::new(|| Mutex::new(None));

/// Start the screen watcher with default configuration
pub async fn start_watcher() -> Result<()> {
    start_watcher_with_config(ScreenWatcherConfig::default()).await
}

/// Start the screen watcher with custom configuration
pub async fn start_watcher_with_config(config: ScreenWatcherConfig) -> Result<()> {
    // Check if already running
    if WATCHER.is_running.load(Ordering::SeqCst) {
        info!("[ScreenWatcher] Already running, updating config");
        let mut cfg = WATCHER.config.write().await;
        *cfg = config;
        return Ok(());
    }

    // Update config
    {
        let mut cfg = WATCHER.config.write().await;
        *cfg = config.clone();
    }

    // Mark as running
    WATCHER.is_running.store(true, Ordering::SeqCst);
    WATCHER.is_paused.store(false, Ordering::SeqCst);

    info!(
        "[ScreenWatcher] Starting with interval={}ms, change_detection={}",
        config.interval_ms, config.change_detection
    );

    // Spawn the capture loop
    tokio::spawn(async move {
        capture_loop().await;
    });

    Ok(())
}

/// Stop the screen watcher
pub async fn stop_watcher() {
    info!("[ScreenWatcher] Stopping");
    WATCHER.is_running.store(false, Ordering::SeqCst);
}

/// Pause the screen watcher (keeps it running but skips captures)
pub fn pause_watcher() {
    WATCHER.is_paused.store(true, Ordering::SeqCst);
    debug!("[ScreenWatcher] Paused");
}

/// Resume the screen watcher
pub fn resume_watcher() {
    WATCHER.is_paused.store(false, Ordering::SeqCst);
    debug!("[ScreenWatcher] Resumed");
}

/// Check if the watcher is running
pub fn is_watcher_running() -> bool {
    WATCHER.is_running.load(Ordering::SeqCst)
}

/// Check if the watcher is paused
pub fn is_watcher_paused() -> bool {
    WATCHER.is_paused.load(Ordering::SeqCst)
}

/// Get the latest screenshot if available
pub async fn get_latest_screenshot() -> Option<ScreenCapture> {
    let screenshots = WATCHER.screenshots.read().await;
    screenshots.last().cloned()
}

/// Get all screenshots in the buffer
pub async fn get_recent_screenshots() -> Vec<ScreenCapture> {
    let screenshots = WATCHER.screenshots.read().await;
    screenshots.clone()
}

/// Take an immediate screenshot (bypasses interval)
pub async fn capture_now() -> Result<ScreenCapture> {
    capture_screenshot().await
}

/// Subscribe to screenshot events
pub async fn subscribe() -> mpsc::Receiver<ScreenCapture> {
    let (tx, rx) = mpsc::channel(16);
    let mut sender = SCREENSHOT_TX.lock().await;
    *sender = Some(tx);
    rx
}

/// Main capture loop
async fn capture_loop() {
    let mut last_capture = Instant::now();

    while WATCHER.is_running.load(Ordering::SeqCst) {
        // Check if paused
        if WATCHER.is_paused.load(Ordering::SeqCst) {
            tokio::time::sleep(Duration::from_millis(500)).await;
            continue;
        }

        // Get current config
        let config = WATCHER.config.read().await.clone();

        // Check if enough time has passed
        let elapsed = last_capture.elapsed().as_millis() as u64;
        if elapsed < config.interval_ms {
            let remaining = config.interval_ms - elapsed;
            tokio::time::sleep(Duration::from_millis(remaining.min(100))).await;
            continue;
        }

        // Capture screenshot
        match capture_screenshot().await {
            Ok(screenshot) => {
                // Check for changes if enabled
                let current_hash = screenshot.image_hash;
                let last_hash = WATCHER.last_hash.load(Ordering::SeqCst);

                if config.change_detection && current_hash == last_hash {
                    debug!("[ScreenWatcher] No screen changes detected, skipping");
                } else {
                    // Store in buffer
                    {
                        let mut screenshots = WATCHER.screenshots.write().await;
                        if screenshots.len() >= MAX_SCREENSHOTS_BUFFER {
                            screenshots.remove(0);
                        }
                        screenshots.push(screenshot.clone());
                    }

                    // Update last hash
                    WATCHER.last_hash.store(current_hash, Ordering::SeqCst);

                    // Send to subscribers
                    if let Some(tx) = SCREENSHOT_TX.lock().await.as_ref() {
                        let _ = tx.try_send(screenshot);
                    }
                }

                last_capture = Instant::now();
            }
            Err(e) => {
                warn!("[ScreenWatcher] Capture failed: {}", e);
                // Wait a bit before retrying
                tokio::time::sleep(Duration::from_millis(1000)).await;
            }
        }
    }

    info!("[ScreenWatcher] Capture loop ended");
}

/// Capture a single screenshot
async fn capture_screenshot() -> Result<ScreenCapture> {
    // Capture in a blocking task to not block the async runtime
    let capture_result = tokio::task::spawn_blocking(|| capture_primary_screen())
        .await
        .context("Screenshot task panicked")?
        .context("Failed to capture screen")?;

    let mut image = DynamicImage::ImageRgba8(capture_result.pixels);

    // Resize if needed
    let config = WATCHER.config.read().await;
    if config.max_resolution > 0 {
        let (w, h) = image.dimensions();
        if w > config.max_resolution || h > config.max_resolution {
            image = image.resize(
                config.max_resolution,
                config.max_resolution,
                image::imageops::FilterType::Triangle,
            );
        }
    }

    // Get final dimensions
    let (width, height) = image.dimensions();

    // Compute simple hash for change detection
    let image_hash = compute_image_hash(&image);

    // Encode to JPEG
    let mut buffer = Cursor::new(Vec::new());
    image
        .write_to(&mut buffer, ImageFormat::Jpeg)
        .context("Failed to encode screenshot")?;

    let image_base64 = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        buffer.into_inner(),
    );

    // Generate ID
    let id = format!(
        "sc_{}",
        WATCHER.capture_counter.fetch_add(1, Ordering::SeqCst)
    );

    // Get timestamp
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    Ok(ScreenCapture {
        id,
        timestamp,
        width,
        height,
        image_base64,
        image_hash,
    })
}

/// Compute a simple hash of the image for change detection
fn compute_image_hash(image: &DynamicImage) -> u64 {
    // Downsample to 8x8 and compute average hash
    let small = image.resize_exact(8, 8, image::imageops::FilterType::Nearest);
    let gray = small.to_luma8();

    // Compute average
    let sum: u64 = gray.pixels().map(|p| p.0[0] as u64).sum();
    let avg = (sum / 64) as u8;

    // Build hash
    let mut hash: u64 = 0;
    for (i, pixel) in gray.pixels().enumerate() {
        if pixel.0[0] > avg {
            hash |= 1 << i;
        }
    }

    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_watcher_config() {
        let config = ScreenWatcherConfig::default();
        assert_eq!(config.interval_ms, DEFAULT_INTERVAL_MS);
        assert!(config.change_detection);
    }
}
