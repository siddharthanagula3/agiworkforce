//! User-configurable keyboard bindings for the full-screen CLI.
//!
//! Bindings live under `[ui.keybindings]` in `config.toml`. Only global
//! actions are configurable here; text-editing and confirmation keys stay
//! fixed so a project config cannot silently turn an ordinary character into
//! a send/approve action.

use std::collections::{BTreeMap, HashSet};

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum KeybindingAction {
    Quit,
    CycleMode,
    ClearChat,
    ClearInput,
    OpenPalette,
}

impl KeybindingAction {
    pub const ALL: [Self; 5] = [
        Self::Quit,
        Self::CycleMode,
        Self::ClearChat,
        Self::ClearInput,
        Self::OpenPalette,
    ];

    pub const fn config_key(self) -> &'static str {
        match self {
            Self::Quit => "quit",
            Self::CycleMode => "cycle_mode",
            Self::ClearChat => "clear_chat",
            Self::ClearInput => "clear_input",
            Self::OpenPalette => "open_palette",
        }
    }

    const fn default_binding(self) -> &'static str {
        match self {
            Self::Quit => "esc",
            Self::CycleMode => "shift+tab",
            Self::ClearChat => "ctrl+l",
            Self::ClearInput => "ctrl+c",
            Self::OpenPalette => "/",
        }
    }

    const fn label(self) -> &'static str {
        match self {
            Self::Quit => "Quit",
            Self::CycleMode => "Cycle permission mode",
            Self::ClearChat => "Clear screen",
            Self::ClearInput => "Clear current input",
            Self::OpenPalette => "Open command palette",
        }
    }

    fn from_config_key(value: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|action| action.config_key() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct KeyChord {
    code: KeyCode,
    modifiers: KeyModifiers,
}

impl KeyChord {
    fn matches(&self, event: KeyEvent) -> bool {
        let mut event_modifiers = event.modifiers
            & (KeyModifiers::CONTROL
                | KeyModifiers::ALT
                | KeyModifiers::SHIFT
                | KeyModifiers::SUPER);
        // Crossterm backends disagree on whether BackTab also carries SHIFT.
        // The code already encodes the shifted key, so accept both forms.
        if self.code == KeyCode::BackTab && event.code == KeyCode::BackTab {
            event_modifiers.remove(KeyModifiers::SHIFT);
        }
        let code_matches = match (&self.code, event.code) {
            (KeyCode::Char(expected), KeyCode::Char(actual)) => {
                expected.eq_ignore_ascii_case(&actual)
            }
            (expected, actual) => *expected == actual,
        };
        code_matches && self.modifiers == event_modifiers
    }
}

#[derive(Debug, Clone)]
pub struct Keybindings {
    entries: BTreeMap<&'static str, (String, KeyChord)>,
}

impl Keybindings {
    pub fn from_config(custom: &BTreeMap<String, String>) -> Self {
        let empty = BTreeMap::new();
        let custom = if validate_config(custom).is_ok() {
            custom
        } else {
            &empty
        };
        let mut entries = BTreeMap::new();
        for action in KeybindingAction::ALL {
            let configured = custom
                .get(action.config_key())
                .map(String::as_str)
                .unwrap_or_else(|| action.default_binding());
            let (display, chord) = parse_binding(configured).unwrap_or_else(|_| {
                parse_binding(action.default_binding()).expect("default binding must parse")
            });
            entries.insert(action.config_key(), (display, chord));
        }
        Self { entries }
    }

    pub fn matches(&self, action: KeybindingAction, event: KeyEvent) -> bool {
        self.entries
            .get(action.config_key())
            .is_some_and(|(_, chord)| chord.matches(event))
    }

    pub fn render_help(&self, edit_mode: &str) -> String {
        let mut lines = vec!["Keybindings".to_string()];
        for action in KeybindingAction::ALL {
            let binding = &self.entries[action.config_key()].0;
            lines.push(format!("  {binding:<14} {}", action.label()));
        }
        lines.extend([
            "  Up/Down        Scroll history or navigate overlays".to_string(),
            "  Enter          Send prompt or confirm an overlay".to_string(),
            format!("  REPL editor    {edit_mode}"),
            String::new(),
            "Customize globally or per project in config.toml:".to_string(),
            "  [ui]".to_string(),
            "  edit_mode = \"vi\" # or \"emacs\"".to_string(),
            "  [ui.keybindings]".to_string(),
            "  open_palette = \"ctrl+p\"".to_string(),
            "Actions: quit, cycle_mode, clear_chat, clear_input, open_palette".to_string(),
        ]);
        lines.join("\n")
    }
}

pub fn validate_config(custom: &BTreeMap<String, String>) -> Result<(), String> {
    for (name, binding) in custom {
        let Some(action) = KeybindingAction::from_config_key(name) else {
            return Err(format!(
                "unknown ui.keybindings action `{name}`; expected one of: {}",
                KeybindingAction::ALL
                    .iter()
                    .map(|action| action.config_key())
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        };
        let (_, chord) =
            parse_binding(binding).map_err(|error| format!("ui.keybindings.{name}: {error}"))?;
        if action != KeybindingAction::OpenPalette
            && matches!(chord.code, KeyCode::Char(_))
            && chord.modifiers.is_empty()
        {
            return Err(format!(
                "ui.keybindings.{name} must use ctrl, alt, shift, or super for character keys"
            ));
        }
    }

    let mut seen = HashSet::new();
    for action in KeybindingAction::ALL {
        let value = custom
            .get(action.config_key())
            .map(String::as_str)
            .unwrap_or_else(|| action.default_binding());
        let (_, chord) = parse_binding(value).expect("bindings were parsed above or are defaults");
        if !seen.insert(chord) {
            return Err(format!(
                "ui.keybindings.{} duplicates another effective binding",
                action.config_key()
            ));
        }
    }
    Ok(())
}

pub fn resolved_edit_mode(configured: Option<&str>) -> &'static str {
    if std::env::var("AGIWORKFORCE_VI")
        .is_ok_and(|value| value == "1" || value.eq_ignore_ascii_case("true"))
    {
        return "vi";
    }
    match configured.map(str::trim) {
        Some(value) if value.eq_ignore_ascii_case("vi") => "vi",
        Some(value) if value.eq_ignore_ascii_case("emacs") => "emacs",
        _ if std::env::var("EDITOR").is_ok_and(|editor| {
            editor
                .rsplit('/')
                .next()
                .is_some_and(|name| name.to_ascii_lowercase().contains("vi"))
        }) => "vi",
        _ => "emacs",
    }
}

fn parse_binding(value: &str) -> Result<(String, KeyChord), String> {
    let normalized = value.trim().to_ascii_lowercase();
    if normalized.is_empty() {
        return Err("binding must not be empty".to_string());
    }

    let parts: Vec<&str> = normalized.split('+').collect();
    let Some(key_name) = parts.last().copied() else {
        return Err("binding must include a key".to_string());
    };
    let mut modifiers = KeyModifiers::NONE;
    for modifier in &parts[..parts.len().saturating_sub(1)] {
        let flag = match *modifier {
            "ctrl" | "control" => KeyModifiers::CONTROL,
            "alt" | "option" => KeyModifiers::ALT,
            "shift" => KeyModifiers::SHIFT,
            "super" | "cmd" | "command" => KeyModifiers::SUPER,
            unknown => return Err(format!("unknown modifier `{unknown}`")),
        };
        if modifiers.contains(flag) {
            return Err(format!("modifier `{modifier}` is repeated"));
        }
        modifiers.insert(flag);
    }

    let code = match key_name {
        "esc" | "escape" => KeyCode::Esc,
        "enter" | "return" => KeyCode::Enter,
        "tab" if modifiers == KeyModifiers::SHIFT => {
            modifiers = KeyModifiers::NONE;
            KeyCode::BackTab
        }
        "tab" => KeyCode::Tab,
        "backtab" => KeyCode::BackTab,
        "backspace" => KeyCode::Backspace,
        "delete" | "del" => KeyCode::Delete,
        "home" => KeyCode::Home,
        "end" => KeyCode::End,
        "pageup" => KeyCode::PageUp,
        "pagedown" => KeyCode::PageDown,
        "up" => KeyCode::Up,
        "down" => KeyCode::Down,
        "left" => KeyCode::Left,
        "right" => KeyCode::Right,
        function if function.starts_with('f') => {
            let number = function[1..]
                .parse::<u8>()
                .map_err(|_| format!("unknown key `{key_name}`"))?;
            if !(1..=12).contains(&number) {
                return Err("function key must be between f1 and f12".to_string());
            }
            KeyCode::F(number)
        }
        character if character.chars().count() == 1 => {
            KeyCode::Char(character.chars().next().expect("one character"))
        }
        _ => return Err(format!("unknown key `{key_name}`")),
    };

    Ok((value.trim().to_string(), KeyChord { code, modifiers }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_terminal_events() {
        let bindings = Keybindings::from_config(&BTreeMap::new());
        assert!(bindings.matches(
            KeybindingAction::CycleMode,
            KeyEvent::new(KeyCode::BackTab, KeyModifiers::NONE)
        ));
        assert!(bindings.matches(
            KeybindingAction::CycleMode,
            KeyEvent::new(KeyCode::BackTab, KeyModifiers::SHIFT)
        ));
        assert!(bindings.matches(
            KeybindingAction::ClearChat,
            KeyEvent::new(KeyCode::Char('l'), KeyModifiers::CONTROL)
        ));
    }

    #[test]
    fn custom_bindings_replace_defaults_and_render_active_values() {
        let custom = BTreeMap::from([
            ("open_palette".to_string(), "ctrl+p".to_string()),
            ("quit".to_string(), "ctrl+q".to_string()),
        ]);
        validate_config(&custom).unwrap();
        let bindings = Keybindings::from_config(&custom);
        assert!(bindings.matches(
            KeybindingAction::OpenPalette,
            KeyEvent::new(KeyCode::Char('p'), KeyModifiers::CONTROL)
        ));
        assert!(!bindings.matches(
            KeybindingAction::OpenPalette,
            KeyEvent::new(KeyCode::Char('/'), KeyModifiers::NONE)
        ));
        let help = bindings.render_help("vi");
        assert!(help.contains("ctrl+p"));
        assert!(help.contains("REPL editor    vi"));
    }

    #[test]
    fn validation_rejects_unknown_actions_unsafe_characters_and_duplicates() {
        assert!(validate_config(&BTreeMap::from([(
            "unknown".to_string(),
            "ctrl+m".to_string()
        )]))
        .is_err());
        assert!(validate_config(&BTreeMap::from([("quit".to_string(), "q".to_string())])).is_err());
        assert!(validate_config(&BTreeMap::from([
            ("quit".to_string(), "ctrl+x".to_string()),
            ("clear_chat".to_string(), "ctrl+x".to_string()),
        ]))
        .is_err());
    }
}
