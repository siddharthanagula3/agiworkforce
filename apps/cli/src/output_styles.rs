//! Output styles, system-prompt override layer.
//!
//! Five styles ship in-binary; users can drop additional styles into
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

use std::path::PathBuf;

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
    ]
}

/// All available styles: built-ins plus any `*.md` file in the user's
/// `~/.agiworkforce/output-styles/` directory. User files with the same
/// name as a built-in override the built-in.
pub fn load_all() -> Vec<OutputStyle> {
    let mut all: Vec<OutputStyle> = builtin();
    if let Some(user_dir) = user_dir() {
        if let Ok(entries) = std::fs::read_dir(&user_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) != Some("md") {
                    continue;
                }
                let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                    continue;
                };
                let Ok(body) = std::fs::read_to_string(&path) else {
                    continue;
                };
                let style = parse_user_style(stem, &body, &path);
                if let Some(slot) = all.iter_mut().find(|s| s.name == style.name) {
                    *slot = style;
                } else {
                    all.push(style);
                }
            }
        }
    }
    all
}

/// Resolve a style by name, falling back to `default` if unknown.
pub fn resolve(name: &str) -> OutputStyle {
    load_all()
        .into_iter()
        .find(|s| s.name == name)
        .unwrap_or_else(OutputStyle::default_style)
}

fn parse_user_style(stem: &str, source: &str, path: &std::path::Path) -> OutputStyle {
    let (frontmatter, body) = split_frontmatter(source);
    let field = |key: &str| {
        frontmatter.lines().find_map(|line| {
            let (name, value) = line.split_once(':')?;
            (name.trim() == key)
                .then(|| value.trim().trim_matches(['"', '\'']).to_string())
                .filter(|value| !value.is_empty())
        })
    };
    let name = field("name").unwrap_or_else(|| stem.to_string());
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

fn split_frontmatter(source: &str) -> (&str, &str) {
    let Some(rest) = source.strip_prefix("---") else {
        return ("", source);
    };
    match rest.split_once("\n---") {
        Some((frontmatter, body)) => (frontmatter, body.trim_start_matches(['-', '\n', '\r'])),
        None => ("", source),
    }
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
    if !valid_style_name(name) {
        return Err(format!("No style named {name}."));
    }
    let path = user_dir()
        .map(|dir| dir.join(format!("{name}.md")))
        .filter(|path| path.is_file())
        .ok_or_else(|| {
            format!("No style of yours named {name}; built-in styles cannot be deleted.")
        })?;
    std::fs::remove_file(&path).map_err(|error| error.to_string())?;
    Ok(path)
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
                "learning".into()
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
}
