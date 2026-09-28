use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

const UNDO_DEPTH: usize = 200;
const PASTE_COLLAPSE_CHARS: usize = 800;
const PASTE_COLLAPSE_LINES: usize = 3;

#[derive(Default)]
pub(crate) struct ComposerUndo {
    undo: Vec<(String, usize)>,
    redo: Vec<(String, usize)>,
    restored: Option<String>,
    typing_run: bool,
}

impl ComposerUndo {
    pub(crate) fn observe(&mut self, before: (String, usize), after: &str) {
        if self.restored.as_deref() == Some(after) {
            self.restored = None;
            return;
        }
        self.restored = None;
        if before.0 == after {
            return;
        }
        let single_word_char = typed_word_char(&before, after);
        let continues_run = single_word_char && self.typing_run;
        self.typing_run = single_word_char;
        if continues_run {
            return;
        }
        self.redo.clear();
        self.undo.push(before);
        if self.undo.len() > UNDO_DEPTH {
            self.undo.remove(0);
        }
    }

    pub(crate) fn undo(&mut self, input: &str, cursor: usize) -> Option<(String, usize)> {
        let previous = self.undo.pop()?;
        self.redo.push((input.to_string(), cursor));
        self.typing_run = false;
        self.restored = Some(previous.0.clone());
        Some(previous)
    }

    pub(crate) fn redo(&mut self, input: &str, cursor: usize) -> Option<(String, usize)> {
        let next = self.redo.pop()?;
        self.undo.push((input.to_string(), cursor));
        self.typing_run = false;
        self.restored = Some(next.0.clone());
        Some(next)
    }

    pub(crate) fn reset(&mut self) {
        *self = Self::default();
    }
}

fn typed_word_char(before: &(String, usize), after: &str) -> bool {
    let (head, tail) = before.0.split_at(floor_boundary(&before.0, before.1));
    let Some(typed) = after
        .strip_prefix(head)
        .and_then(|rest| rest.strip_suffix(tail))
    else {
        return false;
    };
    let mut chars = typed.chars();
    matches!((chars.next(), chars.next()), (Some(c), None) if !c.is_whitespace())
}

fn floor_boundary(text: &str, index: usize) -> usize {
    let mut index = index.min(text.len());
    while !text.is_char_boundary(index) {
        index -= 1;
    }
    index
}

pub(crate) fn is_undo_key(key: KeyEvent) -> bool {
    let control = key.modifiers.contains(KeyModifiers::CONTROL);
    let alt = key.modifiers.contains(KeyModifiers::ALT);
    control
        && !alt
        && match key.code {
            KeyCode::Char('_') | KeyCode::Char('7') => true,
            KeyCode::Char('-') => key.modifiers.contains(KeyModifiers::SHIFT),
            _ => false,
        }
}

pub(crate) fn is_redo_key(key: KeyEvent) -> bool {
    let control = key.modifiers.contains(KeyModifiers::CONTROL);
    let shift = key.modifiers.contains(KeyModifiers::SHIFT);
    let alt = key.modifiers.contains(KeyModifiers::ALT);
    match key.code {
        KeyCode::Char('z') | KeyCode::Char('Z') => control && shift,
        KeyCode::Char('_') | KeyCode::Char('7') => control && alt,
        _ => false,
    }
}

pub(crate) fn is_external_editor_key(key: KeyEvent) -> bool {
    key.modifiers.contains(KeyModifiers::CONTROL)
        && matches!(key.code, KeyCode::Char('e') | KeyCode::Char('g'))
}

#[derive(Default)]
pub(crate) struct PastedTexts {
    entries: Vec<String>,
}

impl PastedTexts {
    pub(crate) fn collapse(&mut self, text: &str) -> Option<String> {
        let lines = text.lines().count();
        if text.chars().count() <= PASTE_COLLAPSE_CHARS && lines <= PASTE_COLLAPSE_LINES {
            return None;
        }
        self.entries.push(text.to_string());
        Some(placeholder(self.entries.len(), lines))
    }

    pub(crate) fn expand(&self, text: &str) -> String {
        let mut expanded = text.to_string();
        for (index, content) in self.entries.iter().enumerate().rev() {
            let token = placeholder(index + 1, content.lines().count());
            expanded = expanded.replace(&token, content);
        }
        expanded
    }

    pub(crate) fn clear(&mut self) {
        self.entries.clear();
    }
}

fn placeholder(number: usize, lines: usize) -> String {
    format!("[Pasted text #{number} +{lines} lines]")
}

pub(crate) fn edit_in_external_editor(draft: &str) -> anyhow::Result<String> {
    let editor = std::env::var("VISUAL")
        .ok()
        .or_else(|| std::env::var("EDITOR").ok())
        .filter(|editor| !editor.trim().is_empty())
        .unwrap_or_else(|| "vi".to_string());
    let mut words = editor.split_whitespace();
    let program = words
        .next()
        .ok_or_else(|| anyhow::anyhow!("No editor is set; set VISUAL or EDITOR."))?;
    let path = std::env::temp_dir().join(format!("agi-prompt-{}.md", uuid::Uuid::new_v4()));
    std::fs::write(&path, draft)?;
    let status = std::process::Command::new(program)
        .args(words)
        .arg(&path)
        .status();
    let edited = std::fs::read_to_string(&path);
    let _ = std::fs::remove_file(&path);
    let status = status.map_err(|error| anyhow::anyhow!("Could not start {program}: {error}"))?;
    if !status.success() {
        anyhow::bail!("{program} exited without saving the prompt ({status}).");
    }
    Ok(edited?.trim_end_matches('\n').to_string())
}
