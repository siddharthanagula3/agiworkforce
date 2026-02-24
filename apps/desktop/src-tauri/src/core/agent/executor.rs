use super::*;
use crate::automation::{
    input::{lock_enigo, KeyboardSimulator, MouseSimulator},
    AutomationService,
};
use crate::sys::security::command_validator::{validate_command, ValidationConfig};

use anyhow::Result;
use enigo::Key;
use std::sync::Arc;
use std::time::Instant;
use tokio::time::timeout;

pub struct TaskExecutor {
    automation: Arc<AutomationService>,
}

impl TaskExecutor {
    pub fn new(automation: Arc<AutomationService>) -> Result<Self> {
        Ok(Self { automation })
    }

    pub async fn execute_step(
        &self,
        step: &TaskStep,
        vision: &VisionAutomation,
    ) -> Result<StepResult> {
        let start = Instant::now();
        tracing::info!(
            "[Executor] Executing step {}: {}",
            step.id,
            step.description
        );

        let result = timeout(step.timeout, self.execute_action(&step.action, vision)).await;

        match result {
            Ok(Ok(action_result)) => {
                let duration = start.elapsed();
                Ok(StepResult {
                    step_id: step.id.clone(),
                    success: true,
                    result: Some(action_result),
                    error: None,
                    screenshot_path: None,
                    duration,
                })
            }
            Ok(Err(e)) => {
                let duration = start.elapsed();
                Ok(StepResult {
                    step_id: step.id.clone(),
                    success: false,
                    result: None,
                    error: Some(e.to_string()),
                    screenshot_path: None,
                    duration,
                })
            }
            Err(_) => {
                let duration = start.elapsed();
                Ok(StepResult {
                    step_id: step.id.clone(),
                    success: false,
                    result: None,
                    error: Some(format!("Step timed out after {:?}", step.timeout)),
                    screenshot_path: None,
                    duration,
                })
            }
        }
    }

    async fn execute_action(&self, action: &Action, vision: &VisionAutomation) -> Result<String> {
        match action {
            Action::Screenshot { region } => {
                let path = vision.capture_screenshot(region.clone()).await?;
                Ok(format!("Screenshot saved to {}", path))
            }
            Action::Click { target } => {
                self.click_target(target, vision).await?;
                Ok("Click performed".to_string())
            }
            Action::Type { target, text } => {
                self.click_target(target, vision).await?;
                let mut keyboard = KeyboardSimulator::new()?;
                keyboard.send_text(text).await?;
                Ok(format!("Typed: {}", text))
            }
            Action::Navigate { url } => {
                // BUG-07 fix: validate URL before handing to OS open to prevent
                // command injection and ensure the call is to a real web URL.
                // Full CDP-controlled navigation requires wiring PlaywrightBridge
                // into the executor (architectural TODO); OS-level open is the
                // current fallback and must at least be sanitised.
                let parsed = url::Url::parse(url)
                    .map_err(|_| anyhow::anyhow!("Invalid URL: {}", url))?;
                if !matches!(parsed.scheme(), "http" | "https") {
                    return Err(anyhow::anyhow!(
                        "Blocked URL scheme '{}': only http/https are permitted",
                        parsed.scheme()
                    ));
                }
                let safe_url = parsed.as_str();

                tracing::warn!(
                    "[Executor] Navigate uses OS-level open; \
                     subsequent CDP actions will target a different window. \
                     Wire PlaywrightBridge into TaskExecutor to fix BUG-07 fully."
                );

                #[cfg(target_os = "windows")]
                {
                    use std::process::Command;
                    // Quote the URL to prevent shell metacharacter injection
                    // via &, |, ^ etc. in cmd.exe
                    let quoted = format!("start \"\" \"{}\"", safe_url.replace('"', ""));
                    Command::new("cmd")
                        .args(["/C", &quoted])
                        .spawn()
                        .map_err(|e| anyhow::anyhow!("Failed to open browser: {}", e))?;
                }

                #[cfg(target_os = "linux")]
                {
                    use std::process::Command;
                    Command::new("xdg-open")
                        .arg(safe_url)
                        .spawn()
                        .map_err(|e| anyhow::anyhow!("Failed to open browser: {}", e))?;
                }

                #[cfg(target_os = "macos")]
                {
                    use std::process::Command;
                    Command::new("open")
                        .arg(safe_url)
                        .spawn()
                        .map_err(|e| anyhow::anyhow!("Failed to open browser: {}", e))?;
                }

                Ok(format!("Opened browser to {}", safe_url))
            }
            Action::WaitForElement {
                target,
                timeout: wait_timeout,
            } => {
                vision.wait_for_element(target, *wait_timeout).await?;
                Ok("Element appeared".to_string())
            }
            Action::ExecuteCommand { command, args } => {
                use tokio::process::Command;
                use tokio::time::{timeout, Duration};

                // BUG-02 fix: validate through CommandValidator before spawning
                let full_command = if args.is_empty() {
                    command.clone()
                } else {
                    format!("{} {}", command, args.join(" "))
                };
                validate_command(&full_command, &ValidationConfig::oneshot())
                    .map_err(|e| anyhow::anyhow!("Command blocked by security validator: {}", e))?;

                tracing::info!("Executing command: {} {:?}", command, args);

                let mut cmd = Command::new(command);
                cmd.args(args);

                let result = timeout(Duration::from_secs(30), cmd.output()).await;

                match result {
                    Ok(Ok(output)) => {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        let status = output.status;

                        if status.success() {
                            tracing::debug!("Command succeeded: {}", stdout);
                            Ok(format!(
                                "Command executed successfully\nOutput: {}",
                                stdout.trim()
                            ))
                        } else {
                            tracing::warn!("Command failed with status {:?}: {}", status, stderr);
                            Err(anyhow::anyhow!(
                                "Command failed with status {:?}\nError: {}",
                                status,
                                stderr
                            ))
                        }
                    }
                    Ok(Err(e)) => {
                        tracing::error!("Failed to execute command: {}", e);
                        Err(anyhow::anyhow!("Failed to execute command: {}", e))
                    }
                    Err(_) => {
                        tracing::error!("Command execution timed out after 30 seconds");
                        Err(anyhow::anyhow!(
                            "Command execution timed out after 30 seconds"
                        ))
                    }
                }
            }
            Action::ReadFile { path } => {
                // BUG-01 fix: canonicalize and reject sensitive system paths
                let canonical = Self::validate_file_path(path)?;
                let content = std::fs::read_to_string(&canonical)?;
                Ok(format!("Read {} bytes from {}", content.len(), canonical.display()))
            }
            Action::WriteFile { path, content } => {
                // BUG-01 fix: validate destination before writing
                let canonical = Self::validate_write_path(path)?;
                std::fs::write(&canonical, content)?;
                Ok(format!("Wrote {} bytes to {}", content.len(), canonical.display()))
            }
            Action::SearchText { query } => {
                let elements = vision.search_text(query).await?;
                Ok(format!(
                    "Found {} elements matching '{}'",
                    elements.len(),
                    query
                ))
            }
            Action::Scroll { direction, amount } => {
                // BUG-03 fix: map direction to a signed delta — positive = up, negative = down
                let delta = match direction {
                    ScrollDirection::Up => *amount,
                    ScrollDirection::Down => -(*amount),
                    ScrollDirection::Left | ScrollDirection::Right => {
                        return Err(anyhow::anyhow!(
                            "Horizontal scroll ({:?}) is not yet supported",
                            direction
                        ));
                    }
                };
                #[cfg(target_os = "macos")]
                let perm_msg = "Mouse automation requires Input Monitoring permission. \
                    Grant it in System Settings \u{2192} Privacy & Security \u{2192} Input Monitoring.";
                #[cfg(not(target_os = "macos"))]
                let perm_msg = "Mouse automation requires input automation permission. \
                    Please grant the necessary permissions in your system settings.";

                self.automation.mouse.lock().await
                    .as_mut()
                    .ok_or_else(|| anyhow::anyhow!("{}", perm_msg))?
                    .scroll(delta)?;
                Ok(format!("Scrolled {:?} by {}", direction, amount))
            }
            Action::PressKey { keys } => {
                tracing::info!("Pressing key combination: {:?}", keys);

                let key_parts: Vec<String> = if keys.len() == 1 && keys[0].contains('+') {
                    keys[0].split('+').map(|s| s.trim().to_string()).collect()
                } else {
                    keys.clone()
                };

                let mut modifiers = Vec::new();
                let mut main_key = None;

                for (i, part) in key_parts.iter().enumerate() {
                    let is_last = i == key_parts.len() - 1;

                    match part.to_lowercase().as_str() {
                        "ctrl" | "control" => modifiers.push(Key::Control),
                        "alt" => modifiers.push(Key::Alt),
                        "shift" => modifiers.push(Key::Shift),
                        "win" | "windows" | "super" | "meta" => modifiers.push(Key::Meta),
                        key_str if is_last => {
                            main_key = Some(self.parse_key_string(key_str)?);
                        }
                        _ => {
                            return Err(anyhow::anyhow!("Unknown key or modifier: {}", part));
                        }
                    }
                }

                if main_key.is_none() && key_parts.len() == 1 {
                    main_key = Some(self.parse_key_string(&key_parts[0])?);
                }

                let main_key = main_key.ok_or_else(|| anyhow::anyhow!("No main key specified"))?;

                if modifiers.is_empty() {
                    use enigo::{Enigo, Keyboard, Settings};
                    let _enigo_lock = lock_enigo()?;
                    let mut enigo =
                        Enigo::new(&Settings::default()).map_err(|e| anyhow::anyhow!("{}", e))?;
                    enigo
                        .key(main_key, enigo::Direction::Click)
                        .map_err(|e| anyhow::anyhow!("{}", e))?;
                } else {
                    use enigo::{Enigo, Keyboard, Settings};
                    let _enigo_lock = lock_enigo()?;
                    let mut enigo =
                        Enigo::new(&Settings::default()).map_err(|e| anyhow::anyhow!("{}", e))?;

                    for modifier in &modifiers {
                        enigo
                            .key(*modifier, enigo::Direction::Press)
                            .map_err(|e| anyhow::anyhow!("{}", e))?;
                    }

                    enigo
                        .key(main_key, enigo::Direction::Click)
                        .map_err(|e| anyhow::anyhow!("{}", e))?;

                    for modifier in modifiers.iter().rev() {
                        enigo
                            .key(*modifier, enigo::Direction::Release)
                            .map_err(|e| anyhow::anyhow!("{}", e))?;
                    }
                }

                Ok(format!("Pressed key combination: {:?}", keys))
            }
        }
    }

    async fn click_target(&self, target: &ClickTarget, vision: &VisionAutomation) -> Result<()> {
        match target {
            ClickTarget::Coordinates { x, y } => {
                let mut mouse = MouseSimulator::new()?;
                mouse.move_to_smooth(*x, *y, 200).await?;
                mouse.click(*x, *y, crate::automation::input::MouseButton::Left)?;
                Ok(())
            }
            ClickTarget::UIAElement { element_id } => {
                self.automation.native.set_focus(element_id)?;
                self.automation.native.invoke(element_id)?;
                Ok(())
            }
            ClickTarget::ImageMatch {
                image_path,
                threshold,
            } => {
                let (x, y) = vision.find_image(image_path, *threshold).await?;
                let mut mouse = MouseSimulator::new()?;
                mouse.move_to_smooth(x, y, 200).await?;
                mouse.click(x, y, crate::automation::input::MouseButton::Left)?;
                Ok(())
            }
            ClickTarget::TextMatch { text, fuzzy } => {
                let matches = vision.find_text(text, *fuzzy).await?;
                if let Some((x, y, _)) = matches.first() {
                    let mut mouse = MouseSimulator::new()?;
                    mouse.move_to_smooth(*x, *y, 200).await?;
                    mouse.click(*x, *y, crate::automation::input::MouseButton::Left)?;
                    Ok(())
                } else {
                    Err(anyhow::anyhow!("Text '{}' not found", text))
                }
            }
        }
    }

    /// BUG-01 fix: validate a read path — must exist and must not be a protected system dir.
    fn validate_file_path(path: &str) -> Result<std::path::PathBuf> {
        if path.contains('\0') {
            return Err(anyhow::anyhow!("Invalid path: contains null bytes"));
        }
        let canonical = std::fs::canonicalize(path)
            .map_err(|e| anyhow::anyhow!("Path inaccessible: {}", e))?;
        Self::check_blocked_prefix(&canonical)?;
        Ok(canonical)
    }

    /// BUG-01 fix: validate a write path — file may not exist yet, so we
    /// canonicalize the longest existing ancestor to defeat symlink bypasses,
    /// then re-append the non-existent tail before checking blocked prefixes.
    fn validate_write_path(path: &str) -> Result<std::path::PathBuf> {
        if path.contains('\0') {
            return Err(anyhow::anyhow!("Invalid path: contains null bytes"));
        }
        let p = std::path::Path::new(path);
        // Reject any path component that is ".."
        for component in p.components() {
            if component == std::path::Component::ParentDir {
                return Err(anyhow::anyhow!("Path traversal rejected: '..' not allowed"));
            }
        }
        let resolved = if p.is_absolute() {
            p.to_path_buf()
        } else {
            std::env::current_dir()?.join(p)
        };

        // Walk up from the full path until we find an existing ancestor,
        // canonicalize it (resolving symlinks), then re-append the tail.
        let mut tail: Vec<std::ffi::OsString> = Vec::new();
        let mut tmp = resolved.as_path();
        let real = loop {
            match std::fs::canonicalize(tmp) {
                Ok(canon) => {
                    let mut r = canon;
                    for part in tail.iter().rev() {
                        r.push(part);
                    }
                    break r;
                }
                Err(_) => {
                    if let Some(name) = tmp.file_name() {
                        tail.push(name.to_owned());
                        tmp = tmp.parent().unwrap_or(tmp);
                    } else {
                        break tmp.to_path_buf();
                    }
                }
            }
        };

        Self::check_blocked_prefix(&real)?;
        Ok(real)
    }

    fn check_blocked_prefix(path: &std::path::Path) -> Result<()> {
        #[cfg(not(target_os = "windows"))]
        const BLOCKED: &[&str] = &[
            "/etc", "/proc", "/sys", "/dev", "/boot", "/root",
            "/usr", "/var", "/sbin", "/bin",
        ];

        #[cfg(target_os = "windows")]
        const BLOCKED: &[&str] = &[
            "C:\\Windows",
            "C:\\Program Files",
            "C:\\Program Files (x86)",
            "C:\\ProgramData",
            "C:\\Users\\Default",
        ];

        for prefix in BLOCKED {
            if path.starts_with(prefix) {
                return Err(anyhow::anyhow!(
                    "Access denied: '{}' is a protected system path",
                    path.display()
                ));
            }
        }

        // Block sensitive directories under the user's home directory
        if let Some(home) = dirs::home_dir() {
            let home_blocked = vec![
                home.join(".ssh"),
                home.join(".gnupg"),
                home.join(".config"),
            ];

            #[cfg(target_os = "macos")]
            let home_blocked = {
                let mut v = home_blocked;
                v.push(home.join("Library"));
                v
            };

            for prefix in &home_blocked {
                if path.starts_with(prefix) {
                    return Err(anyhow::anyhow!(
                        "Access denied: '{}' is a protected user path",
                        path.display()
                    ));
                }
            }
        }

        Ok(())
    }

    fn parse_key_string(&self, key_str: &str) -> Result<Key> {
        let key = match key_str.to_lowercase().as_str() {
            "enter" | "return" => Key::Return,
            "esc" | "escape" => Key::Escape,
            "tab" => Key::Tab,
            "space" | "spacebar" => Key::Space,
            "backspace" | "back" => Key::Backspace,
            "delete" | "del" => Key::Delete,
            "home" => Key::Home,
            "end" => Key::End,
            "pageup" | "pgup" => Key::PageUp,
            "pagedown" | "pgdn" => Key::PageDown,
            // BUG-06 fix: Insert is only available on Windows/Linux in enigo 0.6;
            // macOS has no hardware Insert key so return an error on that platform.
            "insert" | "ins" => {
                #[cfg(any(
                    target_os = "windows",
                    all(unix, not(target_os = "macos"))
                ))]
                {
                    Key::Insert
                }
                #[cfg(not(any(
                    target_os = "windows",
                    all(unix, not(target_os = "macos"))
                )))]
                {
                    return Err(anyhow::anyhow!(
                        "Insert key is not supported on this platform"
                    ));
                }
            }

            "up" | "uparrow" => Key::UpArrow,
            "down" | "downarrow" => Key::DownArrow,
            "left" | "leftarrow" => Key::LeftArrow,
            "right" | "rightarrow" => Key::RightArrow,

            "f1" => Key::F1,
            "f2" => Key::F2,
            "f3" => Key::F3,
            "f4" => Key::F4,
            "f5" => Key::F5,
            "f6" => Key::F6,
            "f7" => Key::F7,
            "f8" => Key::F8,
            "f9" => Key::F9,
            "f10" => Key::F10,
            "f11" => Key::F11,
            "f12" => Key::F12,

            s if s.len() == 1 => {
                let c = s.chars().next().unwrap();
                if c.is_ascii_alphanumeric() || c.is_ascii_punctuation() {
                    Key::Unicode(c)
                } else {
                    return Err(anyhow::anyhow!("Unsupported key character: {}", c));
                }
            }

            _ => return Err(anyhow::anyhow!("Unknown key: {}", key_str)),
        };

        Ok(key)
    }
}
