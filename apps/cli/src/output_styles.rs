//! Output styles, system-prompt override layer.
//!
//! Six styles ship in-binary; users can drop additional styles into
//! `~/.agiworkforce/output-styles/<name>.md` to override or add new ones.
//! The active style is persisted in `~/.agiworkforce/config.toml` under
//! `[ui] output_style = "<name>"`.
//!
//! Design parity hook: Claude Code ships the same three core styles
//! (default / Explanatory / Learning) plus user/project overrides. We match
//! the shape on purpose, every prompt becomes:
//!
//! ```text
//! <base assistant instructions>
//!
//! <output style preamble>   <-- injected here
//!
//! <project context, memory, ...>
//! ```
//!
//! Slash command: `/output-style [name]` lists or switches.

use std::path::{Path, PathBuf};

/// Identifier of a known output style.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutputStyle {
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub origin: String,
}

const BUILT_IN: &str = "built-in";
const STYLE_MARKER: &str = "## Output style:";

impl OutputStyle {
    pub fn default_style() -> Self {
        Self {
            name: "default".into(),
            description: "No style instructions; the standard assistant behaviour.".into(),
            system_prompt: String::new(),
            origin: BUILT_IN.into(),
        }
    }

    pub fn concise() -> Self {
        Self {
            name: "concise".into(),
            description: "Leads with the result; no preamble, narration or recap.".into(),
            system_prompt: include_str!("output_styles/concise.md").to_string(),
            origin: BUILT_IN.into(),
        }
    }

    pub fn study() -> Self {
        Self {
            name: "study".into(),
            description: "Teaches step by step with questions instead of finished answers.".into(),
            system_prompt: include_str!("output_styles/study.md").to_string(),
            origin: BUILT_IN.into(),
        }
    }

    pub fn proactive() -> Self {
        Self {
            name: "proactive".into(),
            description: "Starts work right away and makes reasonable assumptions.".into(),
            system_prompt: include_str!("output_styles/proactive.md").to_string(),
            origin: BUILT_IN.into(),
        }
    }

    pub fn explanatory() -> Self {
        Self {
            name: "explanatory".into(),
            description: "Educational. Adds insight blocks explaining each non-trivial choice."
                .into(),
            system_prompt: include_str!("output_styles/explanatory.md").to_string(),
            origin: BUILT_IN.into(),
        }
    }

    pub fn learning() -> Self {
        Self {
            name: "learning".into(),
            description: "Interactive. Completes changes and adds one optional learning exercise."
                .into(),
            system_prompt: include_str!("output_styles/learning.md").to_string(),
            origin: BUILT_IN.into(),
        }
    }
}

/// Built-in style catalog. User overrides from
/// `~/.agiworkforce/output-styles/` are layered on top in [`load_all`].
pub fn builtin() -> Vec<OutputStyle> {
    vec![
        OutputStyle::default_style(),
        OutputStyle::proactive(),
        OutputStyle::concise(),
        OutputStyle::explanatory(),
        OutputStyle::learning(),
        OutputStyle::study(),
    ]
}

/// All available styles: built-ins plus any `*.md` file in the user's
/// `~/.agiworkforce/output-styles/` directory. User files with the same
/// name as a built-in override the built-in.
pub fn load_all() -> Vec<OutputStyle> {
    let mut all: Vec<OutputStyle> = builtin();
    if let Some(user_dir) = user_dir() {
        for (_, style) in user_styles(&user_dir) {
            if let Some(slot) = all.iter_mut().find(|s| s.name == style.name) {
                *slot = style;
            } else {
                all.push(style);
            }
        }
    }
    all
}

fn user_styles(dir: &Path) -> Vec<(PathBuf, OutputStyle)> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut paths: Vec<PathBuf> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|s| s.to_str()) == Some("md"))
        .collect();
    paths.sort();
    paths
        .into_iter()
        .filter_map(|path| {
            let stem = path.file_stem()?.to_str()?.to_string();
            let body = std::fs::read_to_string(&path).ok()?;
            let style = parse_user_style(&stem, &body, &path);
            Some((path, style))
        })
        .collect()
}

/// Resolve a style by name, falling back to `default` if unknown.
pub fn resolve(name: &str) -> OutputStyle {
    load_all()
        .into_iter()
        .find(|s| s.name == name)
        .unwrap_or_else(OutputStyle::default_style)
}

fn parse_user_style(stem: &str, source: &str, path: &Path) -> OutputStyle {
    let (frontmatter, body) = split_frontmatter(source);
    let field = |key: &str| {
        frontmatter.lines().find_map(|line| {
            let (name, value) = line.split_once(':')?;
            (name.trim() == key)
                .then(|| value.trim().trim_matches(['"', '\'']).to_string())
                .filter(|value| !value.is_empty())
        })
    };
    let name = selectable_style_name(&field("name").unwrap_or_else(|| stem.to_string()));
    let body = body.trim();
    let system_prompt = if body.starts_with(STYLE_MARKER) {
        body.to_string()
    } else {
        format!("{STYLE_MARKER} {name}\n\n{body}")
    };
    OutputStyle {
        description: field("description").unwrap_or_else(|| "Your own style".to_string()),
        name,
        system_prompt,
        origin: path.display().to_string(),
    }
}

/// `/output-style` reads the first word as the name, so a name written with
/// spaces is listed and selected with hyphens in their place.
fn selectable_style_name(name: &str) -> String {
    name.split_whitespace().collect::<Vec<_>>().join("-")
}

fn split_frontmatter(source: &str) -> (&str, &str) {
    let Some(rest) = source.strip_prefix("---") else {
        return ("", source);
    };
    match rest.split_once("\n---") {
        Some((frontmatter, body)) => (frontmatter, body.trim_start_matches(['-', '\n', '\r'])),
        None => ("", source),
    }
}

pub const COMMAND_ACTIONS: [&str; 4] = ["new", "create", "delete", "remove"];

pub fn is_command_action(name: &str) -> bool {
    COMMAND_ACTIONS.contains(&name)
}

fn valid_style_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 40
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

pub fn create(name: &str, description: &str, instructions: &str) -> Result<PathBuf, String> {
    if !valid_style_name(name) {
        return Err("Name the style with letters, digits, '-' or '_' (up to 40).".to_string());
    }
    if builtin().iter().any(|style| style.name == name) {
        return Err(format!("{name} is a built-in style; choose another name."));
    }
    if is_command_action(name) {
        return Err(format!(
            "{name} is an /output-style command, so a style with that name could not be selected; choose another name."
        ));
    }
    if instructions.trim().is_empty() {
        return Err("Give the style its instructions after the name.".to_string());
    }
    let dir = user_dir().ok_or_else(|| "No config directory for output styles.".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path = dir.join(format!("{name}.md"));
    if path.exists() {
        return Err(format!(
            "{} already exists; edit it or delete it first.",
            path.display()
        ));
    }
    let body = format!(
        "---\nname: {name}\ndescription: {}\n---\n\n{STYLE_MARKER} {name}\n\n{}\n",
        description.trim(),
        instructions.trim()
    );
    std::fs::write(&path, body).map_err(|error| error.to_string())?;
    Ok(path)
}

pub fn delete(name: &str) -> Result<PathBuf, String> {
    delete_in(user_dir().as_deref(), name)
}

fn delete_in(dir: Option<&Path>, name: &str) -> Result<PathBuf, String> {
    let mut matches: Vec<PathBuf> = dir
        .map(user_styles)
        .unwrap_or_default()
        .into_iter()
        .filter(|(_, style)| style.name == name)
        .map(|(path, _)| path)
        .collect();
    match matches.len() {
        0 => Err(format!(
            "No style of yours named {name}; built-in styles cannot be deleted."
        )),
        1 => {
            let path = matches.remove(0);
            std::fs::remove_file(&path).map_err(|error| error.to_string())?;
            Ok(path)
        }
        _ => Err(format!(
            "More than one of your files defines the style {name}: {}. Delete the one you mean from that folder.",
            matches
                .iter()
                .map(|path| path.display().to_string())
                .collect::<Vec<_>>()
                .join(", ")
        )),
    }
}

fn user_dir() -> Option<PathBuf> {
    crate::config::CliConfig::config_dir()
        .ok()
        .map(|home| home.join("output-styles"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_includes_three_styles() {
        let names: Vec<_> = builtin().iter().map(|s| s.name.clone()).collect();
        assert_eq!(
            names,
            vec![
                "default".to_string(),
                "proactive".into(),
                "concise".into(),
                "explanatory".into(),
                "learning".into(),
                "study".into()
            ]
        );
    }

    #[test]
    fn resolve_unknown_falls_back_to_default() {
        assert_eq!(resolve("does-not-exist").name, "default");
    }

    #[test]
    fn explanatory_has_nonempty_prompt() {
        assert!(!OutputStyle::explanatory().system_prompt.is_empty());
    }

    fn write_style(dir: &Path, file: &str, name: &str) -> PathBuf {
        let path = dir.join(file);
        std::fs::write(
            &path,
            format!("---\nname: {name}\n---\n\nKeep answers short.\n"),
        )
        .unwrap();
        path
    }

    #[test]
    fn delete_targets_the_file_behind_the_listed_name() {
        let dir = tempfile::tempdir().unwrap();
        let notes = write_style(dir.path(), "notes.md", "focused");
        let listed: Vec<_> = user_styles(dir.path())
            .into_iter()
            .map(|(_, style)| style.name)
            .collect();
        assert_eq!(listed, vec!["focused".to_string()]);

        assert!(delete_in(Some(dir.path()), "notes").is_err());
        assert!(notes.is_file());

        assert_eq!(delete_in(Some(dir.path()), "focused").unwrap(), notes);
        assert!(!notes.exists());
        assert!(user_styles(dir.path()).is_empty());
    }

    #[test]
    fn a_style_named_with_spaces_is_listed_under_a_name_the_command_can_select() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_style(dir.path(), "pirate.md", "Pirate  Speak");
        let listed: Vec<_> = user_styles(dir.path())
            .into_iter()
            .map(|(_, style)| style.name)
            .collect();
        assert_eq!(listed, vec!["Pirate-Speak".to_string()]);
        assert!(!listed[0].contains(char::is_whitespace));
        assert_eq!(delete_in(Some(dir.path()), "Pirate-Speak").unwrap(), path);
    }

    #[test]
    fn create_refuses_names_the_command_reads_as_actions() {
        for action in COMMAND_ACTIONS {
            let reason = create(action, "Short", "Keep replies short").unwrap_err();
            assert!(reason.contains("/output-style command"), "{reason}");
        }
        assert!(!is_command_action("focused"));
    }

    #[test]
    fn delete_refuses_ambiguous_names_and_builtin_only_entries() {
        let dir = tempfile::tempdir().unwrap();
        let first = write_style(dir.path(), "a.md", "focused");
        let second = write_style(dir.path(), "b.md", "focused");
        let reason = delete_in(Some(dir.path()), "focused").unwrap_err();
        assert!(reason.contains("a.md") && reason.contains("b.md"));
        assert!(first.is_file() && second.is_file());

        assert!(delete_in(Some(dir.path()), "concise").is_err());
        assert!(delete_in(None, "focused").is_err());

        let created = write_style(dir.path(), "matching.md", "matching");
        assert_eq!(delete_in(Some(dir.path()), "matching").unwrap(), created);
    }
}
