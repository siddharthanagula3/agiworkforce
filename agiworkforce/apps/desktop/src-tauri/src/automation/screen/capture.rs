use anyhow::{anyhow, Context, Result};
use image::{DynamicImage, RgbaImage};
use screenshots::Screen;
use serde::{Deserialize, Serialize};

use super::dxgi::{list_displays, ScreenInfo};

#[cfg(windows)]
use std::sync::Mutex;
#[cfg(windows)]
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
#[cfg(windows)]
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP,
    HGDIOBJ, SRCCOPY,
};
#[cfg(windows)]
use windows::Win32::System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard};
#[cfg(windows)]
use windows::Win32::System::Memory::{GlobalLock, GlobalUnlock};
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

#[derive(Clone)]
pub struct CapturedRegion {
    pub pixels: RgbaImage,
    pub x: i32,
    pub y: i32,
    pub screen_index: usize,
    pub display: ScreenInfo,
}

pub fn capture_primary_screen() -> Result<CapturedImage> {
    let screens = Screen::all().context("Failed to enumerate displays")?;
    let screen = screens
        .get(0)
        .ok_or_else(|| anyhow!("No displays detected for capture"))?;
    let pixels = screen
        .capture()
        .context("Failed to capture primary screen")?;
    let displays = list_displays()?;
    let display = displays
        .get(0)
        .cloned()
        .ok_or_else(|| anyhow!("Display metadata unavailable"))?;

    Ok(CapturedImage {
        pixels,
        screen_index: 0,
        display,
    })
}

pub fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<CapturedRegion> {
    let target_screen = Screen::from_point(x, y).context("Unable to resolve screen for region")?;
    let pixels = target_screen
        .capture_area(
            x - target_screen.display_info.x,
            y - target_screen.display_info.y,
            width,
            height,
        )
        .context("Failed to capture region")?;

    let displays = list_displays()?;
    let display = displays
        .iter()
        .find(|info| info.id == target_screen.display_info.id)
        .cloned()
        .unwrap_or_else(|| ScreenInfo::from(target_screen.display_info));

    let screen_index = displays
        .iter()
        .position(|info| info.id == display.id)
        .unwrap_or(0);

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

/// Window information for capture
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

/// Enumerate all visible windows using Windows API
#[cfg(windows)]
pub fn enumerate_windows() -> Result<Vec<WindowInfo>> {
    use std::sync::Arc;

    let windows = Arc::new(Mutex::new(Vec::new()));
    let windows_clone = Arc::clone(&windows);

    unsafe {
        // Callback function for EnumWindows
        unsafe extern "system" fn enum_window_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
            let windows = &*(lparam.0 as *const Mutex<Vec<WindowInfo>>);

            // Skip invisible windows
            if IsWindowVisible(hwnd).as_bool() == false {
                return BOOL(1);
            }

            // Get window text (title)
            let mut title_buffer = [0u16; 512];
            let title_len = GetWindowTextW(hwnd, &mut title_buffer);

            // Skip windows with empty titles
            if title_len == 0 {
                return BOOL(1);
            }

            let title = String::from_utf16_lossy(&title_buffer[..title_len as usize]);

            // Skip tool windows
            let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            if (ex_style as u32 & WS_EX_TOOLWINDOW.0) != 0 {
                return BOOL(1);
            }

            // Get window rect
            let mut rect = RECT::default();
            if GetWindowRect(hwnd, &mut rect).is_err() {
                return BOOL(1);
            }

            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;

            // Skip windows with invalid dimensions
            if width <= 0 || height <= 0 {
                return BOOL(1);
            }

            // Get process name
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
                                // Extract just the filename from the full path
                                path.split('\\').last().unwrap_or("Unknown").to_string()
                            }
                            Err(_) => "Unknown".to_string(),
                        }
                    }
                    Err(_) => "Unknown".to_string(),
                }
            } else {
                "Unknown".to_string()
            };

            // Add window to list
            if let Ok(mut windows_guard) = windows.lock() {
                windows_guard.push(WindowInfo {
                    hwnd: hwnd.0 as isize,
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

            BOOL(1) // Continue enumeration
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

/// Non-Windows placeholder
#[cfg(not(windows))]
pub fn enumerate_windows() -> Result<Vec<WindowInfo>> {
    Err(anyhow!("Window enumeration is only supported on Windows"))
}

/// Capture a specific window by HWND
#[cfg(windows)]
pub fn capture_window(hwnd: isize) -> Result<CapturedImage> {
    const CF_BITMAP: u32 = 2;

    unsafe {
        let hwnd = HWND(hwnd as _);

        // Get window rect
        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).context("Failed to get window rect")?;

        let width = (rect.right - rect.left) as u32;
        let height = (rect.bottom - rect.top) as u32;

        if width == 0 || height == 0 {
            return Err(anyhow!("Invalid window dimensions"));
        }

        // Get window DC
        let window_dc = GetDC(hwnd);
        if window_dc.is_invalid() {
            return Err(anyhow!("Failed to get window DC"));
        }

        // Create compatible DC and bitmap
        let mem_dc = CreateCompatibleDC(window_dc);
        if mem_dc.is_invalid() {
            ReleaseDC(hwnd, window_dc);
            return Err(anyhow!("Failed to create compatible DC"));
        }

        let bitmap = CreateCompatibleBitmap(window_dc, width as i32, height as i32);
        if bitmap.is_invalid() {
            DeleteDC(mem_dc);
            ReleaseDC(hwnd, window_dc);
            return Err(anyhow!("Failed to create compatible bitmap"));
        }

        let old_bitmap = SelectObject(mem_dc, bitmap);

        // Copy window contents to bitmap
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
            DeleteObject(bitmap);
            DeleteDC(mem_dc);
            ReleaseDC(hwnd, window_dc);
            return Err(anyhow!("Failed to copy window contents"));
        }

        // Get bitmap bits
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32), // Negative for top-down bitmap
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [std::mem::zeroed(); 1],
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

        // Cleanup
        SelectObject(mem_dc, old_bitmap);
        DeleteObject(bitmap);
        DeleteDC(mem_dc);
        ReleaseDC(hwnd, window_dc);

        if result == 0 {
            return Err(anyhow!("Failed to get bitmap bits"));
        }

        // Convert BGRA to RGBA
        for i in (0..buffer.len()).step_by(4) {
            buffer.swap(i, i + 2); // Swap B and R
        }

        let pixels = RgbaImage::from_raw(width, height, buffer)
            .ok_or_else(|| anyhow!("Failed to create image from raw data"))?;

        let displays = list_displays()?;
        let display = displays
            .get(0)
            .cloned()
            .ok_or_else(|| anyhow!("No display found"))?;

        Ok(CapturedImage {
            pixels,
            screen_index: 0,
            display,
        })
    }
}

/// Non-Windows placeholder
#[cfg(not(windows))]
pub fn capture_window(_hwnd: isize) -> Result<CapturedImage> {
    Err(anyhow!("Window capture is only supported on Windows"))
}

/// Paste image from clipboard
#[cfg(windows)]
pub fn paste_from_clipboard() -> Result<CapturedImage> {
    const CF_BITMAP: u32 = 2;

    unsafe {
        // Open clipboard
        if OpenClipboard(HWND(0)).is_err() {
            return Err(anyhow!("Failed to open clipboard"));
        }

        // Get bitmap handle from clipboard
        let clipboard_data = GetClipboardData(CF_BITMAP);

        if clipboard_data.is_err() || clipboard_data.as_ref().unwrap().is_invalid() {
            CloseClipboard().ok();
            return Err(anyhow!("No bitmap data in clipboard"));
        }

        let bitmap_handle = HBITMAP(clipboard_data.unwrap().0);

        // Get screen DC
        let screen_dc = GetDC(HWND(0));
        if screen_dc.is_invalid() {
            CloseClipboard().ok();
            return Err(anyhow!("Failed to get screen DC"));
        }

        // Create compatible DC
        let mem_dc = CreateCompatibleDC(screen_dc);
        if mem_dc.is_invalid() {
            ReleaseDC(HWND(0), screen_dc);
            CloseClipboard().ok();
            return Err(anyhow!("Failed to create compatible DC"));
        }

        // Select bitmap into DC
        let old_bitmap = SelectObject(mem_dc, HGDIOBJ(bitmap_handle.0));

        // Get bitmap info
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
            bmiColors: [std::mem::zeroed(); 1],
        };

        // Get bitmap dimensions
        if GetDIBits(mem_dc, bitmap_handle, 0, 0, None, &mut bmi, DIB_RGB_COLORS) == 0 {
            SelectObject(mem_dc, old_bitmap);
            DeleteDC(mem_dc);
            ReleaseDC(HWND(0), screen_dc);
            CloseClipboard().ok();
            return Err(anyhow!("Failed to get bitmap info"));
        }

        let width = bmi.bmiHeader.biWidth as u32;
        let height = bmi.bmiHeader.biHeight.abs() as u32;

        if width == 0 || height == 0 {
            SelectObject(mem_dc, old_bitmap);
            DeleteDC(mem_dc);
            ReleaseDC(HWND(0), screen_dc);
            CloseClipboard().ok();
            return Err(anyhow!("Invalid bitmap dimensions"));
        }

        // Set up for bottom-up bitmap
        bmi.bmiHeader.biHeight = -(height as i32);
        bmi.bmiHeader.biCompression = BI_RGB.0;
        bmi.bmiHeader.biBitCount = 32;

        // Allocate buffer for pixel data
        let mut buffer = vec![0u8; (width * height * 4) as usize];

        // Get bitmap bits
        let result = GetDIBits(
            mem_dc,
            bitmap_handle,
            0,
            height,
            Some(buffer.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        // Cleanup
        SelectObject(mem_dc, old_bitmap);
        DeleteDC(mem_dc);
        ReleaseDC(HWND(0), screen_dc);
        CloseClipboard().ok();

        if result == 0 {
            return Err(anyhow!("Failed to get bitmap bits"));
        }

        // Convert BGRA to RGBA
        for i in (0..buffer.len()).step_by(4) {
            buffer.swap(i, i + 2); // Swap B and R
        }

        let pixels = RgbaImage::from_raw(width, height, buffer)
            .ok_or_else(|| anyhow!("Failed to create image from raw data"))?;

        let displays = list_displays()?;
        let display = displays
            .get(0)
            .cloned()
            .ok_or_else(|| anyhow!("No display found"))?;

        Ok(CapturedImage {
            pixels,
            screen_index: 0,
            display,
        })
    }
}

/// Non-Windows placeholder
#[cfg(not(windows))]
pub fn paste_from_clipboard() -> Result<CapturedImage> {
    Err(anyhow!("Clipboard paste is only supported on Windows"))
}
