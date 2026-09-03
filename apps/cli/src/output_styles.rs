
use std::path::PathBuf;

/// Identifier of a known output style.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OutputStyle {
    pub name: String,
    pub description: String,
    pub system_prompt: String,
}

impl OutputStyle {
    pub fn default_style() -> Self {
        Self {
            name: "default".into(),
            description: "Direct, concise, precise. The shipped baseline.".into(),
            system_prompt: String::new(),
        }
    }

    pub fn explanatory() -> Self {
        Self {
            name: "explanatory".into(),
            description: "Educational. Adds insight blocks explaining each non-trivial choice."
                .into(),
            system_prompt: include_str!("output_styles/explanatory.md").to_string(),
        }
    }

    pub fn learning() -> Self {
        Self {
            name: "learning".into(),
            description: "Interactive. Completes changes and adds one optional learning exercise."
                .into(),
            system_prompt: include_str!("output_styles/learning.md").to_string(),
        }
    }
}

/// Built-in style catalog. User overrides from
/// `~/.agiworkforce/output-styles/` are layered on top in [`load_all`].
pub fn builtin() -> Vec<OutputStyle> {
    vec![
        OutputStyle::default_style(),
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
                let style = OutputStyle {
                    name: stem.to_string(),
                    description: format!("(user override at {})", path.display()),
                    system_prompt: body,
                };
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
