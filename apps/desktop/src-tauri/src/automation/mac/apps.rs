#![allow(unsafe_code)]
use std::any::Any;
use std::ffi::{c_void, CStr};
use std::os::raw::c_char;

use anyhow::{anyhow, Result};
use objc::runtime::{objc_autoreleasePoolPop, objc_autoreleasePoolPush, Class, Object, Sel, NO};
use objc::Message;

use crate::automation::computer_use::TargetApp;

const NS_APPLICATION_ACTIVATION_POLICY_REGULAR: isize = 0;
const NS_APPLICATION_ACTIVATE_IGNORING_OTHER_APPS: usize = 1 << 1;

/// Called from worker threads, which have no autorelease pool of their own,
/// so every AppKit object returned here would otherwise leak.
struct AutoreleasePool(*mut c_void);

impl AutoreleasePool {
    fn new() -> Self {
        Self(unsafe { objc_autoreleasePoolPush() })
    }
}

impl Drop for AutoreleasePool {
    fn drop(&mut self) {
        unsafe { objc_autoreleasePoolPop(self.0) }
    }
}

unsafe fn send<R: Any>(receiver: *mut Object, selector: &str) -> Result<R> {
    if receiver.is_null() {
        return Err(anyhow!("{selector} was sent to nil"));
    }
    (*receiver)
        .send_message::<(), R>(Sel::register(selector), ())
        .map_err(|e| anyhow!("{selector} failed: {e}"))
}

fn class(name: &str) -> Result<&'static Class> {
    Class::get(name).ok_or_else(|| anyhow!("{name} is not available in this process"))
}

unsafe fn string(ns_string: *mut Object) -> Option<String> {
    if ns_string.is_null() {
        return None;
    }
    let utf8: *const c_char = send(ns_string, "UTF8String").ok()?;
    if utf8.is_null() {
        return None;
    }
    Some(CStr::from_ptr(utf8).to_string_lossy().into_owned())
}

unsafe fn describe(app: *mut Object) -> Option<TargetApp> {
    let pid: i32 = send(app, "processIdentifier").ok()?;
    if pid <= 0 {
        return None;
    }
    Some(TargetApp {
        pid,
        name: string(send(app, "localizedName").ok()?).unwrap_or_default(),
        bundle_id: string(send(app, "bundleIdentifier").ok()?),
    })
}

unsafe fn running_application(pid: i32) -> Result<*mut Object> {
    let app: *mut Object = class("NSRunningApplication")?
        .send_message::<(i32,), *mut Object>(
            Sel::register("runningApplicationWithProcessIdentifier:"),
            (pid,),
        )
        .map_err(|e| anyhow!("runningApplicationWithProcessIdentifier: failed: {e}"))?;
    if app.is_null() {
        return Err(anyhow!("No app is running with process id {pid}"));
    }
    Ok(app)
}

/// Apps with a Dock presence, the ones a user can name and switch to.
pub fn running_apps() -> Result<Vec<TargetApp>> {
    let _pool = AutoreleasePool::new();
    unsafe {
        let workspace: *mut Object = class("NSWorkspace")?
            .send_message::<(), *mut Object>(Sel::register("sharedWorkspace"), ())
            .map_err(|e| anyhow!("sharedWorkspace failed: {e}"))?;
        let apps: *mut Object = send(workspace, "runningApplications")?;
        let count: usize = send(apps, "count")?;
        let mut running = Vec::with_capacity(count);
        for index in 0..count {
            let app: *mut Object = (*apps)
                .send_message::<(usize,), *mut Object>(Sel::register("objectAtIndex:"), (index,))
                .map_err(|e| anyhow!("objectAtIndex: failed: {e}"))?;
            if app.is_null() {
                continue;
            }
            let policy: isize = send(app, "activationPolicy")?;
            if policy != NS_APPLICATION_ACTIVATION_POLICY_REGULAR {
                continue;
            }
            if let Some(described) = describe(app) {
                running.push(described);
            }
        }
        Ok(running)
    }
}

pub fn running_app(pid: i32) -> Option<TargetApp> {
    let _pool = AutoreleasePool::new();
    unsafe { describe(running_application(pid).ok()?) }
}

pub fn activate(pid: i32) -> Result<()> {
    let _pool = AutoreleasePool::new();
    unsafe {
        let app = running_application(pid)?;
        let activated = (*app)
            .send_message::<(usize,), objc::runtime::BOOL>(
                Sel::register("activateWithOptions:"),
                (NS_APPLICATION_ACTIVATE_IGNORING_OTHER_APPS,),
            )
            .map_err(|e| anyhow!("activateWithOptions: failed: {e}"))?;
        if activated == NO {
            return Err(anyhow!(
                "macOS declined to bring process {pid} to the front"
            ));
        }
    }
    Ok(())
}
