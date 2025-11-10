use anyhow::{anyhow, Result};
use std::ffi::c_void;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL, HWND};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, OpenClipboard, SetClipboardData,
};
use windows::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
};
use windows::Win32::System::Ole::CF_UNICODETEXT;

pub struct ClipboardManager;

impl ClipboardManager {
    pub fn new() -> Result<Self> {
        Ok(Self)
    }

    pub fn get_text(&self) -> Result<String> {
        unsafe {
            OpenClipboard(HWND(0)).map_err(|err| anyhow!("OpenClipboard failed: {err:?}"))?;

            let result = (|| {
                let handle = GetClipboardData(CF_UNICODETEXT.0 as u32)
                    .map_err(|err| anyhow!("GetClipboardData failed: {err:?}"))?;
                if handle.is_invalid() {
                    return Err(anyhow!("Clipboard does not contain text data"));
                }

                let hglobal = HGLOBAL(handle.0 as *mut c_void);
                let ptr = GlobalLock(hglobal);
                if ptr.is_null() {
                    return Err(anyhow!("GlobalLock failed"));
                }

                let pwstr = PCWSTR(ptr as *const u16);
                let text = pwstr.to_string().unwrap_or_default();

                GlobalUnlock(hglobal).map_err(|err| anyhow!("GlobalUnlock failed: {err:?}"))?;

                Ok(text)
            })();

            CloseClipboard().map_err(|err| anyhow!("CloseClipboard failed: {err:?}"))?;

            result
        }
    }

    pub fn set_text(&self, text: &str) -> Result<()> {
        unsafe {
            OpenClipboard(HWND(0)).map_err(|err| anyhow!("OpenClipboard failed: {err:?}"))?;

            let result = (|| {
                EmptyClipboard().map_err(|err| anyhow!("EmptyClipboard failed: {err:?}"))?;

                let encoded: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
                let bytes = encoded.len() * std::mem::size_of::<u16>();

                let handle = GlobalAlloc(GMEM_MOVEABLE, bytes)
                    .map_err(|err| anyhow!("GlobalAlloc failed: {err:?}"))?;
                if handle.is_invalid() {
                    return Err(anyhow!("GlobalAlloc returned invalid handle"));
                }

                let buffer = GlobalLock(handle) as *mut u16;
                if buffer.is_null() {
                    let _ = GlobalFree(handle);
                    return Err(anyhow!("GlobalLock failed"));
                }

                // Verify the allocation size before copying
                let allocated_size = GlobalSize(handle);
                if allocated_size < bytes {
                    GlobalUnlock(handle).ok();
                    let _ = GlobalFree(handle);
                    return Err(anyhow!(
                        "GlobalAlloc allocated insufficient memory: {} bytes requested, {} bytes allocated",
                        bytes,
                        allocated_size
                    ));
                }

                std::ptr::copy_nonoverlapping(encoded.as_ptr(), buffer, encoded.len());
                GlobalUnlock(handle).map_err(|err| anyhow!("GlobalUnlock failed: {err:?}"))?;

                SetClipboardData(CF_UNICODETEXT.0 as u32, HANDLE(handle.0 as isize)).map_err(
                    |err| {
                        let _ = GlobalFree(handle);
                        anyhow!("SetClipboardData failed: {err:?}")
                    },
                )?;

                Ok(())
            })();

            CloseClipboard().map_err(|err| anyhow!("CloseClipboard failed: {err:?}"))?;

            result
        }
    }
}
