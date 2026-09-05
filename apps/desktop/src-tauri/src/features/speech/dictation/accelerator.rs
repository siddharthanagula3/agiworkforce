//! Accelerator parsing for the global dictation hotkey.
//!
//! The watched key was a hardcoded `rdev::Key::Function`. Both desktop shells
//! now name the chord with one accelerator grammar (`Alt+Shift+V`,
//! `CommandOrControl+Alt+V`), so this module turns that string into the raw
//! `rdev` keys the OS hook actually observes.
//!
//! `rdev` reports physical keys with no modifier state of its own, so the
//! tracker below keeps the held-modifier set itself. Only the chord's main key
//! produces an edge: a press is reported only while every required modifier is
//! held, and a release is always reported so a chord broken modifier-first
//! still ends its session.

use std::collections::BTreeSet;
use std::sync::Mutex;

use rdev::Key;

const ACCELERATOR_SEPARATOR: char = '+';

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum ChordModifier {
    Command,
    Control,
    Alt,
    Shift,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChordParseError {
    Empty,
    NoKey,
    MultipleKeys,
    UnknownToken(String),
}

impl std::fmt::Display for ChordParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Empty => write!(f, "accelerator is empty"),
            Self::NoKey => write!(f, "accelerator has modifiers but no key"),
            Self::MultipleKeys => write!(f, "accelerator names more than one key"),
            Self::UnknownToken(token) => write!(f, "unknown accelerator token: {token}"),
        }
    }
}

/// `CommandOrControl` is the platform's primary modifier, Command on macOS and
/// Control everywhere else, matching the shell accelerator grammar.
fn platform_primary_modifier() -> ChordModifier {
    if cfg!(target_os = "macos") {
        ChordModifier::Command
    } else {
        ChordModifier::Control
    }
}

fn parse_modifier(token: &str) -> Option<ChordModifier> {
    match token {
        "commandorcontrol" | "cmdorctrl" => Some(platform_primary_modifier()),
        "command" | "cmd" | "super" | "meta" => Some(ChordModifier::Command),
        "control" | "ctrl" => Some(ChordModifier::Control),
        "alt" | "option" => Some(ChordModifier::Alt),
        "shift" => Some(ChordModifier::Shift),
        _ => None,
    }
}

fn parse_letter(token: &str) -> Option<Key> {
    let mut chars = token.chars();
    let letter = chars.next()?;
    if chars.next().is_some() {
        return None;
    }
    match letter {
        'a' => Some(Key::KeyA),
        'b' => Some(Key::KeyB),
        'c' => Some(Key::KeyC),
        'd' => Some(Key::KeyD),
        'e' => Some(Key::KeyE),
        'f' => Some(Key::KeyF),
        'g' => Some(Key::KeyG),
        'h' => Some(Key::KeyH),
        'i' => Some(Key::KeyI),
        'j' => Some(Key::KeyJ),
        'k' => Some(Key::KeyK),
        'l' => Some(Key::KeyL),
        'm' => Some(Key::KeyM),
        'n' => Some(Key::KeyN),
        'o' => Some(Key::KeyO),
        'p' => Some(Key::KeyP),
        'q' => Some(Key::KeyQ),
        'r' => Some(Key::KeyR),
        's' => Some(Key::KeyS),
        't' => Some(Key::KeyT),
        'u' => Some(Key::KeyU),
        'v' => Some(Key::KeyV),
        'w' => Some(Key::KeyW),
        'x' => Some(Key::KeyX),
        'y' => Some(Key::KeyY),
        'z' => Some(Key::KeyZ),
        '0' => Some(Key::Num0),
        '1' => Some(Key::Num1),
        '2' => Some(Key::Num2),
        '3' => Some(Key::Num3),
        '4' => Some(Key::Num4),
        '5' => Some(Key::Num5),
        '6' => Some(Key::Num6),
        '7' => Some(Key::Num7),
        '8' => Some(Key::Num8),
        '9' => Some(Key::Num9),
        _ => None,
    }
}

fn parse_named_key(token: &str) -> Option<Key> {
    match token {
        "space" => Some(Key::Space),
        "tab" => Some(Key::Tab),
        "escape" | "esc" => Some(Key::Escape),
        "return" | "enter" => Some(Key::Return),
        "backspace" => Some(Key::Backspace),
        "delete" => Some(Key::Delete),
        "insert" => Some(Key::Insert),
        "home" => Some(Key::Home),
        "end" => Some(Key::End),
        "pageup" => Some(Key::PageUp),
        "pagedown" => Some(Key::PageDown),
        "up" => Some(Key::UpArrow),
        "down" => Some(Key::DownArrow),
        "left" => Some(Key::LeftArrow),
        "right" => Some(Key::RightArrow),
        "capslock" => Some(Key::CapsLock),
        "fn" | "function" => Some(Key::Function),
        "f1" => Some(Key::F1),
        "f2" => Some(Key::F2),
        "f3" => Some(Key::F3),
        "f4" => Some(Key::F4),
        "f5" => Some(Key::F5),
        "f6" => Some(Key::F6),
        "f7" => Some(Key::F7),
        "f8" => Some(Key::F8),
        "f9" => Some(Key::F9),
        "f10" => Some(Key::F10),
        "f11" => Some(Key::F11),
        "f12" => Some(Key::F12),
        _ => None,
    }
}

pub fn modifier_of(key: Key) -> Option<ChordModifier> {
    match key {
        Key::MetaLeft | Key::MetaRight => Some(ChordModifier::Command),
        Key::ControlLeft | Key::ControlRight => Some(ChordModifier::Control),
        Key::Alt | Key::AltGr => Some(ChordModifier::Alt),
        Key::ShiftLeft | Key::ShiftRight => Some(ChordModifier::Shift),
        _ => None,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HotkeyChord {
    key: Key,
    modifiers: BTreeSet<ChordModifier>,
}

impl HotkeyChord {
    pub fn parse(accelerator: &str) -> Result<Self, ChordParseError> {
        let tokens: Vec<String> = accelerator
            .split(ACCELERATOR_SEPARATOR)
            .map(|token| token.trim().to_ascii_lowercase())
            .filter(|token| !token.is_empty())
            .collect();
        if tokens.is_empty() {
            return Err(ChordParseError::Empty);
        }

        let mut modifiers = BTreeSet::new();
        let mut key: Option<Key> = None;
        for token in tokens {
            if let Some(modifier) = parse_modifier(&token) {
                modifiers.insert(modifier);
                continue;
            }
            let parsed = parse_named_key(&token)
                .or_else(|| parse_letter(&token))
                .ok_or_else(|| ChordParseError::UnknownToken(token.clone()))?;
            if key.is_some() {
                return Err(ChordParseError::MultipleKeys);
            }
            key = Some(parsed);
        }

        match key {
            Some(key) => Ok(Self { key, modifiers }),
            None => Err(ChordParseError::NoKey),
        }
    }

    pub fn key(&self) -> Key {
        self.key
    }

    pub fn modifiers(&self) -> &BTreeSet<ChordModifier> {
        &self.modifiers
    }
}

/// Tracks held modifiers so the raw `rdev` key stream can be reduced to the
/// chord's own press/release edges.
pub struct ChordTracker {
    chord: HotkeyChord,
    held: Mutex<BTreeSet<ChordModifier>>,
}

impl ChordTracker {
    pub fn new(chord: HotkeyChord) -> Self {
        Self {
            chord,
            held: Mutex::new(BTreeSet::new()),
        }
    }

    fn held_guard(&self) -> std::sync::MutexGuard<'_, BTreeSet<ChordModifier>> {
        self.held
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Feed one raw key observation. Returns the chord edge it produced, if
    /// any: `Some(true)` when the chord completed, `Some(false)` when its main
    /// key was released.
    pub fn observe(&self, key: Key, down: bool) -> Option<bool> {
        if let Some(modifier) = modifier_of(key) {
            let mut held = self.held_guard();
            if down {
                held.insert(modifier);
            } else {
                held.remove(&modifier);
            }
            return None;
        }

        if key != self.chord.key() {
            return None;
        }
        if !down {
            return Some(false);
        }

        let held = self.held_guard();
        if self.chord.modifiers().is_subset(&held) {
            Some(true)
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chord(accelerator: &str) -> HotkeyChord {
        HotkeyChord::parse(accelerator).expect("parse")
    }

    #[test]
    fn parses_a_modifier_plus_letter_chord() {
        let parsed = chord("Alt+Shift+V");
        assert_eq!(parsed.key(), Key::KeyV);
        assert_eq!(
            parsed.modifiers(),
            &BTreeSet::from([ChordModifier::Alt, ChordModifier::Shift])
        );
    }

    #[test]
    fn parses_the_bare_function_key_the_hook_used_to_hardcode() {
        let parsed = chord("Fn");
        assert_eq!(parsed.key(), Key::Function);
        assert!(parsed.modifiers().is_empty());
    }

    #[test]
    fn is_insensitive_to_case_spacing_and_modifier_order() {
        assert_eq!(chord("alt + shift + v"), chord("Shift+Alt+V"));
    }

    #[test]
    fn resolves_command_or_control_to_the_platform_primary_modifier() {
        let parsed = chord("CommandOrControl+Alt+D");
        assert!(parsed.modifiers().contains(&platform_primary_modifier()));
        assert_eq!(parsed.key(), Key::KeyD);
    }

    #[test]
    fn rejects_accelerators_that_cannot_name_one_key() {
        assert_eq!(HotkeyChord::parse(""), Err(ChordParseError::Empty));
        assert_eq!(HotkeyChord::parse("Alt+Shift"), Err(ChordParseError::NoKey));
        assert_eq!(
            HotkeyChord::parse("Alt+V+B"),
            Err(ChordParseError::MultipleKeys)
        );
        assert_eq!(
            HotkeyChord::parse("Alt+Sparkle"),
            Err(ChordParseError::UnknownToken("sparkle".to_string()))
        );
    }

    #[test]
    fn reports_no_edge_until_every_modifier_is_held() {
        let tracker = ChordTracker::new(chord("Alt+Shift+V"));
        assert_eq!(tracker.observe(Key::KeyV, true), None);
        tracker.observe(Key::Alt, true);
        assert_eq!(tracker.observe(Key::KeyV, true), None);
        tracker.observe(Key::ShiftLeft, true);
        assert_eq!(tracker.observe(Key::KeyV, true), Some(true));
    }

    #[test]
    fn releases_on_the_main_key_even_after_the_modifier_was_let_go_first() {
        let tracker = ChordTracker::new(chord("Alt+Shift+V"));
        tracker.observe(Key::Alt, true);
        tracker.observe(Key::ShiftLeft, true);
        assert_eq!(tracker.observe(Key::KeyV, true), Some(true));

        tracker.observe(Key::ShiftLeft, false);
        assert_eq!(tracker.observe(Key::KeyV, false), Some(false));
    }

    #[test]
    fn ignores_keys_outside_the_chord() {
        let tracker = ChordTracker::new(chord("Alt+Shift+V"));
        tracker.observe(Key::Alt, true);
        tracker.observe(Key::ShiftLeft, true);
        assert_eq!(tracker.observe(Key::KeyB, true), None);
        assert_eq!(tracker.observe(Key::KeyB, false), None);
    }

    #[test]
    fn accepts_either_side_of_a_paired_modifier() {
        let tracker = ChordTracker::new(chord("CommandOrControl+Alt+V"));
        tracker.observe(Key::Alt, true);
        let primary_right = if cfg!(target_os = "macos") {
            Key::MetaRight
        } else {
            Key::ControlRight
        };
        tracker.observe(primary_right, true);
        assert_eq!(tracker.observe(Key::KeyV, true), Some(true));
    }
}
