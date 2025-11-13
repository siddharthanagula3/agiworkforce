use anyhow::{anyhow, Result};
use std::time::Duration;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
    KEYEVENTF_UNICODE, VIRTUAL_KEY, VK_CONTROL, VK_MENU, VK_SHIFT,
};

pub struct KeyboardSimulator {
    typing_delay_ms: u64,
}

#[derive(Debug, Clone)]
pub struct MacroStep {
    pub action: MacroAction,
    pub delay_ms: u64,
}

#[derive(Debug, Clone)]
pub enum MacroAction {
    PressKey(u16),
    ReleaseKey(u16),
    SendText(String),
    Hotkey(Vec<u16>, u16),
}

impl KeyboardSimulator {
    pub fn new() -> Result<Self> {
        Ok(Self {
            typing_delay_ms: 10, // Default 10ms delay between keystrokes
        })
    }

    /// Set typing speed (delay in milliseconds between keystrokes)
    pub fn set_typing_speed(&mut self, delay_ms: u64) {
        self.typing_delay_ms = delay_ms;
    }

    pub async fn send_text(&self, text: &str) -> Result<()> {
        self.send_text_with_delay(text, self.typing_delay_ms).await
    }

    /// Send text with custom delay between keystrokes
    pub async fn send_text_with_delay(&self, text: &str, delay_ms: u64) -> Result<()> {
        for ch in text.chars() {
            self.send_unicode(ch)?;
            if delay_ms > 0 {
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            }
        }
        Ok(())
    }

    /// Record a macro (returns steps that can be replayed)
    /// Note: Full macro recording requires hooking into Windows keyboard events.
    /// This method allows manual macro creation by executing an operation.
    pub fn record_macro<F>(&self, _operation: F) -> Vec<MacroStep>
    where
        F: FnOnce(&Self) -> Result<()>,
    {
        // For now, this is a placeholder - full macro recording would require
        // hooking into Windows keyboard events. This allows manual macro creation.
        vec![]
    }

    /// Play back a recorded macro
    pub async fn play_macro(&self, steps: &[MacroStep]) -> Result<()> {
        for step in steps {
            match &step.action {
                MacroAction::PressKey(key) => {
                    let down = INPUT {
                        r#type: INPUT_KEYBOARD,
                        Anonymous: INPUT_0 {
                            ki: KEYBDINPUT {
                                wVk: VIRTUAL_KEY(*key),
                                wScan: 0,
                                dwFlags: KEYBD_EVENT_FLAGS(0),
                                time: 0,
                                dwExtraInfo: 0,
                            },
                        },
                    };
                    self.dispatch(&mut [down])?;
                }
                MacroAction::ReleaseKey(key) => {
                    let up = INPUT {
                        r#type: INPUT_KEYBOARD,
                        Anonymous: INPUT_0 {
                            ki: KEYBDINPUT {
                                wVk: VIRTUAL_KEY(*key),
                                wScan: 0,
                                dwFlags: KEYEVENTF_KEYUP,
                                time: 0,
                                dwExtraInfo: 0,
                            },
                        },
                    };
                    self.dispatch(&mut [up])?;
                }
                MacroAction::SendText(text) => {
                    self.send_text_with_delay(text, step.delay_ms).await?;
                }
                MacroAction::Hotkey(modifiers, key) => {
                    self.hotkey(modifiers, *key)?;
                }
            }
            if step.delay_ms > 0 {
                tokio::time::sleep(Duration::from_millis(step.delay_ms)).await;
            }
        }
        Ok(())
    }

    /// Press a key down (without releasing)
    pub fn key_down(&self, virtual_key: u8) -> Result<()> {
        let down = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(virtual_key as u16),
                    wScan: 0,
                    dwFlags: KEYBD_EVENT_FLAGS(0),
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        self.dispatch(&mut [down])
    }

    /// Release a key
    pub fn key_up(&self, virtual_key: u8) -> Result<()> {
        let up = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(virtual_key as u16),
                    wScan: 0,
                    dwFlags: KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        self.dispatch(&mut [up])
    }

    pub fn press_key(&self, virtual_key: u16) -> Result<()> {
        let down = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(virtual_key),
                    wScan: 0,
                    dwFlags: KEYBD_EVENT_FLAGS(0),
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        let up = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(virtual_key),
                    wScan: 0,
                    dwFlags: KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        self.dispatch(&mut [down, up])
    }

    pub fn hotkey(&self, modifiers: &[u16], key: u16) -> Result<()> {
        let mut inputs = Vec::new();

        for modifier in modifiers {
            inputs.push(INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(*modifier),
                        wScan: 0,
                        dwFlags: KEYBD_EVENT_FLAGS(0),
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            });
        }

        inputs.push(INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(key),
                    wScan: 0,
                    dwFlags: KEYBD_EVENT_FLAGS(0),
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        });
        inputs.push(INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(key),
                    wScan: 0,
                    dwFlags: KEYEVENTF_KEYUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        });

        for modifier in modifiers.iter().rev() {
            inputs.push(INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(*modifier),
                        wScan: 0,
                        dwFlags: KEYEVENTF_KEYUP,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            });
        }

        self.dispatch(&mut inputs)
    }

    pub fn send_unicode(&self, ch: char) -> Result<()> {
        if ch == '\r' {
            return self.press_key(0x0D);
        }

        let code = ch as u32;
        if code > 0xFFFF {
            // Skip unsupported surrogate pairs for now.
            return Ok(());
        }
        let scan = code as u16;

        let mut inputs = [
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(0),
                        wScan: scan,
                        dwFlags: KEYEVENTF_UNICODE,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
            INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 {
                    ki: KEYBDINPUT {
                        wVk: VIRTUAL_KEY(0),
                        wScan: scan,
                        dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            },
        ];

        self.dispatch(&mut inputs)
    }

    fn dispatch(&self, inputs: &mut [INPUT]) -> Result<()> {
        let sent = unsafe { SendInput(inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent == inputs.len() as u32 {
            Ok(())
        } else {
            Err(anyhow!("SendInput failed to deliver keyboard events"))
        }
    }

    pub fn modifier_key(name: &str) -> Option<u16> {
        match name.to_lowercase().as_str() {
            "ctrl" | "control" => Some(VK_CONTROL.0),
            "alt" => Some(VK_MENU.0),
            "shift" => Some(VK_SHIFT.0),
            _ => None,
        }
    }

    /// Press a key by name (e.g., "Enter", "Escape", "Tab")
    pub async fn press_key_by_name(&self, key_name: &str) -> Result<()> {
        use windows::Win32::UI::Input::KeyboardAndMouse::*;

        let virtual_key = match key_name.to_lowercase().as_str() {
            "enter" | "return" => VK_RETURN.0,
            "escape" | "esc" => VK_ESCAPE.0,
            "tab" => VK_TAB.0,
            "backspace" | "back" => VK_BACK.0,
            "delete" | "del" => VK_DELETE.0,
            "space" => VK_SPACE.0,
            "up" | "arrowup" => VK_UP.0,
            "down" | "arrowdown" => VK_DOWN.0,
            "left" | "arrowleft" => VK_LEFT.0,
            "right" | "arrowright" => VK_RIGHT.0,
            "home" => VK_HOME.0,
            "end" => VK_END.0,
            "pageup" | "pgup" => VK_PRIOR.0,
            "pagedown" | "pgdown" => VK_NEXT.0,
            "insert" | "ins" => VK_INSERT.0,
            "f1" => VK_F1.0,
            "f2" => VK_F2.0,
            "f3" => VK_F3.0,
            "f4" => VK_F4.0,
            "f5" => VK_F5.0,
            "f6" => VK_F6.0,
            "f7" => VK_F7.0,
            "f8" => VK_F8.0,
            "f9" => VK_F9.0,
            "f10" => VK_F10.0,
            "f11" => VK_F11.0,
            "f12" => VK_F12.0,
            _ => {
                return Err(anyhow!("Unsupported key name: {}", key_name));
            }
        };

        self.press_key(virtual_key)?;
        Ok(())
    }
}
