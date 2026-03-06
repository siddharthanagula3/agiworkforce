use anyhow::{anyhow, Context, Result};
use image::{DynamicImage, RgbaImage};
use serde::{Deserialize, Serialize};
use xcap::{Monitor, Window};

use super::dxgi::{list_displays, ScreenInfo};
use super::xcap_lock::lock_xcap;

#[cfg(windows)]
use std::sync::Mutex;
#[cfg(windows)]
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
#[cfg(windows)]
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP,
    HGDIOBJ, RGBQUAD, SRCCOPY,
};
#[cfg(windows)]
use windows::Win32::System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard};
#[cfg(windows)]
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
};
#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowLongPtrW, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId,
    IsWindowVisible, GWL_EXSTYLE, WS_EX_TOOLWINDOW,
};

#[derive(Clone)]
pub struct CapturedImage {
    pub pixels: RgbaImage,
    pub screen_index: usize,
    pub display: ScreenInfo,
}

impl std::fmt::Debug for CapturedImage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CapturedImage")
            .field("width", &self.pixels.width())
            .field("height", &self.pixels.height())
            .field("screen_index", &self.screen_index)
            .field("display", &self.display)
            .finish()
    }
}

#[derive(Clone)]
pub struct CapturedRegion {
    pub pixels: RgbaImage,
    pub x: i32,
    pub y: i32,
    pub screen_index: usize,
    pub display: ScreenInfo,
}

pub fn capture_primary_screen() -> Result<CapturedImage> {
    let _xcap_lock = lock_xcap()?;
    let monitors = Monitor::all().context("Failed to enumerate displays")?;
    let (screen_index, monitor) = monitors
        .iter()
        .enumerate()
        .find(|(_, m)| m.is_primary())
        .or_else(|| monitors.iter().enumerate().next())
        .ok_or_else(|| anyhow!("No displays detected for capture"))?;

    let image = monitor
        .capture_image()
        .context("Failed to capture primary screen")?;

    let pixels = RgbaImage::from_raw(image.width(), image.height(), image.into_raw())
        .ok_or_else(|| anyhow!("Failed to convert captured image"))?;

    let display = ScreenInfo::from_monitor(monitor, screen_index);

    Ok(CapturedImage {
        pixels,
        screen_index,
        display,
    })
}

pub fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<CapturedRegion> {
    let _xcap_lock = lock_xcap()?;
    let monitors = Monitor::all().context("Failed to enumerate displays")?;

    let (screen_index, target_monitor) = monitors
        .iter()
        .enumerate()
        .find(|m| {
            let m = m.1;
            let mx = m.x();
            let my = m.y();
            let mw = m.width() as i32;
            let mh = m.height() as i32;
            x >= mx && x < mx + mw && y >= my && y < my + mh
        })
        .or_else(|| monitors.iter().enumerate().next())
        .ok_or_else(|| anyhow!("Unable to resolve screen for region"))?;

    let full_image = target_monitor
        .capture_image()
        .context("Failed to capture screen")?;
    let full_image = RgbaImage::from_raw(
        full_image.width(),
        full_image.height(),
        full_image.into_raw(),
    )
    .ok_or_else(|| anyhow!("Failed to convert captured region"))?;

    let rel_x = (x - target_monitor.x()).max(0) as u32;
    let rel_y = (y - target_monitor.y()).max(0) as u32;
    let available_width = target_monitor.width().saturating_sub(rel_x);
    let available_height = target_monitor.height().saturating_sub(rel_y);

    let crop_width = width.min(available_width);
    let crop_height = height.min(available_height);

    if crop_width == 0 || crop_height == 0 {
        return Err(anyhow!("Capture region is outside of screen bounds"));
    }

    let pixels =
        image::imageops::crop_imm(&full_image, rel_x, rel_y, crop_width, crop_height).to_image();

    let display = ScreenInfo::from_monitor(target_monitor, screen_index);

    Ok(CapturedRegion {
        pixels,
        x,
        y,
        screen_index,
        display,
    })
}

pub fn create_thumbnail(image: &RgbaImage, max_width: u32, max_height: u32) -> DynamicImage {
    DynamicImage::ImageRgba8(image.clone()).thumbnail(max_width, max_height)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WindowInfo {
    pub hwnd: isize,
    pub title: String,
    pub process_name: String,
    pub rect: WindowRect,
    pub is_visible: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WindowRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[cfg(windows)]
pub fn enumerate_windows() -> Result<Vec<WindowInfo>> {
    use std::sync::Arc;

    let windows = Arc::new(Mutex::new(Vec::new()));
    let windows_clone = Arc::clone(&windows);

    unsafe {
        unsafe extern "system" fn enum_window_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let windows = &*(lparam.0 as *const Mutex<Vec<WindowInfo>>);

            if !IsWindowVisible(hwnd).as_bool() {
                return BOOL(1);
            }

            let mut title_buffer = [0u16; 512];
            let title_len = GetWindowTextW(hwnd, &mut title_buffer);

            if title_len == 0 {
                return BOOL(1);
            }

            let title = String::from_utf16_lossy(&title_buffer[..title_len as usize]);

            let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            if (ex_style as u32 & WS_EX_TOOLWINDOW.0) != 0 {
                return BOOL(1);
            }

            let mut rect = RECT::default();
            if GetWindowRect(hwnd, &mut rect).is_err() {
                return BOOL(1);
            }

            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;

            if width <= 0 || height <= 0 {
                return BOOL(1);
            }

            let mut process_id: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut process_id));

            let process_name = if process_id != 0 {
                match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) {
                    Ok(process_handle) => {
                        use windows::core::PWSTR;
                        use windows::Win32::System::Threading::PROCESS_NAME_WIN32;
                        let mut buffer = [0u16; 512];
                        let mut size = buffer.len() as u32;

                        match QueryFullProcessImageNameW(
                            process_handle,
                            PROCESS_NAME_WIN32,
                            PWSTR(buffer.as_mut_ptr()),
                            &mut size,
                        ) {
                            Ok(_) => {
                                let path = String::from_utf16_lossy(&buffer[..size as usize]);

                                path.split('\\')
                                    .next_back()
                                    .unwrap_or("Unknown")
                                    .to_string()
                            }
                            Err(_) => "Unknown".to_string(),
                        }
                    }
                    Err(_) => "Unknown".to_string(),
                }
            } else {
                "Unknown".to_string()
            };

            if let Ok(mut windows_guard) = windows.lock() {
                windows_guard.push(WindowInfo {
                    hwnd: hwnd.0,
                    title,
                    process_name,
                    rect: WindowRect {
                        x: rect.left,
                        y: rect.top,
                        width,
                        height,
                    },
                    is_visible: true,
                });
            }

            BOOL(1)
        }

        let lparam = LPARAM(&*windows_clone as *const Mutex<Vec<WindowInfo>> as isize);
        EnumWindows(Some(enum_window_proc), lparam).context("Failed to enumerate windows")?;
    }

    let windows = Arc::try_unwrap(windows)
        .map_err(|_| anyhow!("Failed to unwrap Arc"))?
        .into_inner()
        .map_err(|e| anyhow!("Failed to lock mutex: {}", e))?;

    Ok(windows)
}

#[cfg(not(windows))]
pub fn enumerate_windows() -> Result<Vec<WindowInfo>> {
    let windows = Window::all().context("Failed to enumerate windows")?;

    Ok(windows
        .into_iter()
        .filter(|window| !window.is_minimized())
        .filter(|window| window.width() > 0 && window.height() > 0)
        .map(|window| WindowInfo {
            hwnd: window.id() as isize,
            title: window.title().to_string(),
            process_name: window.app_name().to_string(),
            rect: WindowRect {
                x: window.x(),
                y: window.y(),
                width: window.width() as i32,
                height: window.height() as i32,
            },
            is_visible: true,
        })
        .collect())
}

#[cfg(windows)]
pub fn capture_window(hwnd: isize) -> Result<CapturedImage> {
    unsafe {
        let hwnd = HWND(hwnd as _);

        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).context("Failed to get window rect")?;

        let width = (rect.right - rect.left) as u32;
        let height = (rect.bottom - rect.top) as u32;

        if width == 0 || height == 0 {
            return Err(anyhow!("Invalid window dimensions"));
        }

        let window_dc = GetDC(hwnd);
        if window_dc.is_invalid() {
            return Err(anyhow!("Failed to get window DC"));
        }

        let mem_dc = CreateCompatibleDC(window_dc);
        if mem_dc.is_invalid() {
            ReleaseDC(hwnd, window_dc);
            return Err(anyhow!("Failed to create compatible DC"));
        }

        let bitmap = CreateCompatibleBitmap(window_dc, width as i32, height as i32);
        if bitmap.is_invalid() {
            let _ = DeleteDC(mem_dc);
            ReleaseDC(hwnd, window_dc);
            return Err(anyhow!("Failed to create compatible bitmap"));
        }

        let old_bitmap = SelectObject(mem_dc, bitmap);

        if BitBlt(
            mem_dc,
            0,
            0,
            width as i32,
            height as i32,
            window_dc,
            0,
            0,
            SRCCOPY,
        )
        .is_err()
        {
            SelectObject(mem_dc, old_bitmap);
            let _ = DeleteObject(bitmap);
            let _ = DeleteDC(mem_dc);
            ReleaseDC(hwnd, window_dc);
            return Err(anyhow!("Failed to copy window contents"));
        }

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD {
                rgbBlue: 0,
                rgbRed: 0,
                rgbGreen: 0,
                rgbReserved: 0,
            }; 1],
        };

        let mut buffer = vec![0u8; (width * height * 4) as usize];

        let result = GetDIBits(
            mem_dc,
            bitmap,
            0,
            height,
            Some(buffer.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        SelectObject(mem_dc, old_bitmap);
        let _ = DeleteObject(bitmap);
        let _ = DeleteDC(mem_dc);
        ReleaseDC(hwnd, window_dc);

        if result == 0 {
            return Err(anyhow!("Failed to get bitmap bits"));
        }

        for i in (0..buffer.len()).step_by(4) {
            buffer.swap(i, i + 2);
        }

        let pixels = RgbaImage::from_raw(width, height, buffer)
            .ok_or_else(|| anyhow!("Failed to create image from raw data"))?;

        let displays = list_displays()?;
        let display = displays
            .first()
            .cloned()
            .ok_or_else(|| anyhow!("No display found"))?;

        Ok(CapturedImage {
            pixels,
            screen_index: 0,
            display,
        })
    }
}

#[cfg(not(windows))]
pub fn capture_window(hwnd: isize) -> Result<CapturedImage> {
    let windows = Window::all().context("Failed to enumerate windows")?;
    let target = windows
        .into_iter()
        .find(|window| window.id() as isize == hwnd)
        .ok_or_else(|| anyhow!("Window not found"))?;

    let image = target
        .capture_image()
        .context("Failed to capture window image")?;
    let pixels = RgbaImage::from_raw(image.width(), image.height(), image.into_raw())
        .ok_or_else(|| anyhow!("Failed to convert captured image"))?;

    let monitor = target.current_monitor();
    let monitors = Monitor::all().context("Failed to enumerate displays")?;
    let screen_index = monitors
        .iter()
        .position(|m| m.id() == monitor.id())
        .unwrap_or(0);
    let display = ScreenInfo::from_monitor(&monitor, screen_index);

    Ok(CapturedImage {
        pixels,
        screen_index,
        display,
    })
}

#[cfg(windows)]
pub fn paste_from_clipboard() -> Result<CapturedImage> {
    const CF_BITMAP: u32 = 2;

    unsafe {
        if OpenClipboard(HWND(0)).is_err() {
            return Err(anyhow!("Failed to open clipboard"));
        }

        let clipboard_data = GetClipboardData(CF_BITMAP);

        let handle = match clipboard_data {
            Ok(h) if !h.is_invalid() => h,
            _ => {
                CloseClipboard().ok();
                return Err(anyhow!("No bitmap data in clipboard"));
            }
        };

        let bitmap_handle = HBITMAP(handle.0);

        let screen_dc = GetDC(HWND(0));
        if screen_dc.is_invalid() {
            CloseClipboard().ok();
            return Err(anyhow!("Failed to get screen DC"));
        }

        let mem_dc = CreateCompatibleDC(screen_dc);
        if mem_dc.is_invalid() {
            ReleaseDC(HWND(0), screen_dc);
            CloseClipboard().ok();
            return Err(anyhow!("Failed to create compatible DC"));
        }

        let old_bitmap = SelectObject(mem_dc, HGDIOBJ(bitmap_handle.0));

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: 0,
                biHeight: 0,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [RGBQUAD {
                rgbBlue: 0,
                rgbRed: 0,
                rgbGreen: 0,
                rgbReserved: 0,
            }; 1],
        };

        if GetDIBits(mem_dc, bitmap_handle, 0, 0, None, &mut bmi, DIB_RGB_COLORS) == 0 {
            SelectObject(mem_dc, old_bitmap);
            let _ = DeleteDC(mem_dc);
            ReleaseDC(HWND(0), screen_dc);
            CloseClipboard().ok();
            return Err(anyhow!("Failed to get bitmap info"));
        }

        let width = bmi.bmiHeader.biWidth as u32;
        let height = bmi.bmiHeader.biHeight.unsigned_abs();

        if width == 0 || height == 0 {
            SelectObject(mem_dc, old_bitmap);
            let _ = DeleteDC(mem_dc);
            ReleaseDC(HWND(0), screen_dc);
            CloseClipboard().ok();
            return Err(anyhow!("Invalid bitmap dimensions"));
        }

        bmi.bmiHeader.biHeight = -(height as i32);
        bmi.bmiHeader.biCompression = BI_RGB.0;
        bmi.bmiHeader.biBitCount = 32;

        let mut buffer = vec![0u8; (width * height * 4) as usize];

        let result = GetDIBits(
            mem_dc,
            bitmap_handle,
            0,
            height,
            Some(buffer.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        SelectObject(mem_dc, old_bitmap);
        let _ = DeleteDC(mem_dc);
        ReleaseDC(HWND(0), screen_dc);
        CloseClipboard().ok();

        if result == 0 {
            return Err(anyhow!("Failed to get bitmap bits"));
        }

        for i in (0..buffer.len()).step_by(4) {
            buffer.swap(i, i + 2);
        }

        let pixels = RgbaImage::from_raw(width, height, buffer)
            .ok_or_else(|| anyhow!("Failed to create image from raw data"))?;

        let displays = list_displays()?;
        let display = displays
            .first()
            .cloned()
            .ok_or_else(|| anyhow!("No display found"))?;

        Ok(CapturedImage {
            pixels,
            screen_index: 0,
            display,
        })
    }
}

#[cfg(not(windows))]
pub fn paste_from_clipboard() -> Result<CapturedImage> {
    Err(anyhow!("Clipboard paste is only supported on Windows"))
}
