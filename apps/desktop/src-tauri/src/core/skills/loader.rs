//! Skill loader for parsing SKILL.md files with YAML frontmatter.

use std::path::Path;

use serde::Deserialize;
use tracing::{debug, warn};
use walkdir::WalkDir;
use which::which;

use super::error::{SkillError, SkillResult};
use super::skill::{Skill, SkillSource};

/// Frontmatter structure for AGI Workforce skill metadata.
#[derive(Debug, Deserialize)]
struct SkillFrontmatter {
    name: String,
    description: String,
    #[serde(default)]
    metadata: Option<SkillMetadata>,
}

/// Metadata container for skill requirements.
#[derive(Debug, Deserialize, Default)]
struct SkillMetadata {
    #[serde(default)]
    agiworkforce: Option<AgiWorkforceMetadata>,
}

/// AGI Workforce specific metadata.
#[derive(Debug, Deserialize, Default)]
struct AgiWorkforceMetadata {
    #[serde(default)]
    requires: Option<RequirementsMetadata>,
    #[serde(default)]
    os: Vec<String>,
}

/// Requirements metadata for binaries and environment variables.
#[derive(Debug, Deserialize, Default)]
struct RequirementsMetadata {
    #[serde(default)]
    bins: Vec<String>,
    #[serde(default)]
    env: Vec<String>,
}

/// Result of checking skill requirements.
#[derive(Debug, Clone)]
pub struct RequirementCheckResult {
    /// Whether all requirements are met.
    pub satisfied: bool,

    /// Missing binary executables.
    pub missing_bins: Vec<String>,

    /// Missing environment variables.
    pub missing_env: Vec<String>,

    /// Whether the current OS is supported.
    pub os_supported: bool,
}

impl RequirementCheckResult {
    /// Creates a result indicating all requirements are met.
    #[must_use]
    pub fn all_satisfied() -> Self {
        Self {
            satisfied: true,
            missing_bins: Vec::new(),
            missing_env: Vec::new(),
            os_supported: true,
        }
    }

    /// Returns a human-readable description of unmet requirements.
    #[must_use]
    pub fn describe_failures(&self) -> Option<String> {
        if self.satisfied {
            return None;
        }

        let mut failures = Vec::new();

        if !self.os_supported {
            failures.push(format!(
                "Current OS '{}' is not supported",
                std::env::consts::OS
            ));
        }

        if !self.missing_bins.is_empty() {
            failures.push(format!(
                "Missing binaries: {}",
                self.missing_bins.join(", ")
            ));
        }

        if !self.missing_env.is_empty() {
            failures.push(format!(
                "Missing environment variables: {}",
                self.missing_env.join(", ")
            ));
        }

        Some(failures.join("; "))
    }
}

/// Loads skills from SKILL.md files.
pub struct SkillLoader;

impl SkillLoader {
    /// Loads all skills from a directory.
    ///
    /// Searches for files named `SKILL.md` (case-insensitive) in the directory
    /// and all subdirectories.
    ///
    /// # Arguments
    ///
    /// * `path` - Directory to search for skill files
    /// * `source_type` - How to classify the loaded skills (Workspace or Managed)
    ///
    /// # Returns
    ///
    /// A vector of successfully parsed skills. Invalid skill files are logged
    /// and skipped rather than causing the entire load to fail.
    pub fn load_from_directory(path: &Path, source_type: SkillSourceType) -> Vec<Skill> {
        if !path.exists() || !path.is_dir() {
            debug!("Skills directory does not exist: {}", path.display());
            return Vec::new();
        }

        let mut skills = Vec::new();

        for entry in WalkDir::new(path)
            .follow_links(true)
            .into_iter()
            .filter_map(Result::ok)
        {
            let file_path = entry.path();

            // Check for SKILL.md files (case-insensitive)
            if let Some(file_name) = file_path.file_name() {
                if file_name.to_string_lossy().eq_ignore_ascii_case("skill.md") {
                    match Self::parse_skill_md(file_path, &source_type) {
                        Ok(skill) => {
                            debug!("Loaded skill '{}' from {}", skill.name, file_path.display());
                            skills.push(skill);
                        }
                        Err(e) => {
                            warn!("Failed to parse skill file {}: {}", file_path.display(), e);
                        }
                    }
                }
            }
        }

        skills
    }

    /// Parses a single SKILL.md file.
    ///
    /// # Arguments
    ///
    /// * `path` - Path to the SKILL.md file
    /// * `source_type` - How to classify the skill source
    ///
    /// # Returns
    ///
    /// The parsed skill, or an error if parsing fails.
    pub fn parse_skill_md(path: &Path, source_type: &SkillSourceType) -> SkillResult<Skill> {
        let content = std::fs::read_to_string(path).map_err(|e| SkillError::ReadError {
            path: path.to_path_buf(),
            source: e,
        })?;

        Self::parse_skill_content(&content, path, source_type)
    }

    /// Parses skill content from a string.
    ///
    /// # Arguments
    ///
    /// * `content` - The full content of the SKILL.md file
    /// * `path` - Path to the file (for error messages and source tracking)
    /// * `source_type` - How to classify the skill source
    fn parse_skill_content(
        content: &str,
        path: &Path,
        source_type: &SkillSourceType,
    ) -> SkillResult<Skill> {
        // Extract YAML frontmatter between --- delimiters
        let (frontmatter_yaml, instructions) = Self::extract_frontmatter(content, path)?;

        // Parse the YAML frontmatter
        let frontmatter: SkillFrontmatter =
            serde_yaml::from_str(&frontmatter_yaml).map_err(|e| SkillError::YamlParseError {
                path: path.to_path_buf(),
                message: e.to_string(),
            })?;

        // Extract requirements from metadata
        let (requires_bins, requires_env, supported_os) =
            Self::extract_requirements(&frontmatter.metadata);

        // Determine the skill source
        let source = match source_type {
            SkillSourceType::Workspace => SkillSource::Workspace {
                path: path.to_path_buf(),
            },
            SkillSourceType::Managed => SkillSource::Managed {
                path: path.to_path_buf(),
            },
        };

        Ok(Skill {
            name: frontmatter.name,
            description: frontmatter.description,
            instructions: instructions.trim().to_string(),
            requires_bins,
            requires_env,
            supported_os,
            source,
        })
    }

    /// Extracts YAML frontmatter and markdown content from a file.
    fn extract_frontmatter(content: &str, path: &Path) -> SkillResult<(String, String)> {
        let content = content.trim();

        // Check for opening ---
        if !content.starts_with("---") {
            return Err(SkillError::MissingFrontmatter {
                path: path.to_path_buf(),
            });
        }

        // Find the closing ---
        let after_first = &content[3..];
        let closing_pos = after_first.find("\n---").ok_or(SkillError::InvalidFormat {
            path: path.to_path_buf(),
            message: "Missing closing '---' for frontmatter".to_string(),
        })?;

        let frontmatter = after_first[..closing_pos].trim().to_string();
        let instructions = after_first[closing_pos + 4..].to_string();

        if frontmatter.is_empty() {
            return Err(SkillError::MissingFrontmatter {
                path: path.to_path_buf(),
            });
        }

        Ok((frontmatter, instructions))
    }

    /// Extracts requirements from parsed metadata.
    fn extract_requirements(
        metadata: &Option<SkillMetadata>,
    ) -> (Vec<String>, Vec<String>, Vec<String>) {
        let Some(meta) = metadata else {
            return (Vec::new(), Vec::new(), Vec::new());
        };

        let Some(agiworkforce) = &meta.agiworkforce else {
            return (Vec::new(), Vec::new(), Vec::new());
        };

        let (bins, env) = if let Some(requires) = &agiworkforce.requires {
            (requires.bins.clone(), requires.env.clone())
        } else {
            (Vec::new(), Vec::new())
        };

        (bins, env, agiworkforce.os.clone())
    }

    /// Checks if all requirements for a skill are met.
    ///
    /// # Arguments
    ///
    /// * `skill` - The skill to check requirements for
    ///
    /// # Returns
    ///
    /// A `RequirementCheckResult` indicating which requirements are met.
    #[must_use]
    pub fn check_requirements(skill: &Skill) -> RequirementCheckResult {
        let mut result = RequirementCheckResult {
            satisfied: true,
            missing_bins: Vec::new(),
            missing_env: Vec::new(),
            os_supported: true,
        };

        // Check OS support
        if !skill.supports_current_os() {
            result.satisfied = false;
            result.os_supported = false;
        }

        // Check required binaries
        for bin in &skill.requires_bins {
            if which(bin).is_err() {
                result.satisfied = false;
                result.missing_bins.push(bin.clone());
            }
        }

        // Check required environment variables
        for env_var in &skill.requires_env {
            if std::env::var(env_var).is_err() {
                result.satisfied = false;
                result.missing_env.push(env_var.clone());
            }
        }

        result
    }

    /// Checks if a binary is available in PATH.
    #[must_use]
    pub fn is_binary_available(binary: &str) -> bool {
        which(binary).is_ok()
    }

    /// Checks if an environment variable is set.
    #[must_use]
    pub fn is_env_var_set(env_var: &str) -> bool {
        std::env::var(env_var).is_ok()
    }
}

/// Indicates where a loaded skill originated.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SkillSourceType {
    /// Skill from workspace-local directory.
    Workspace,
    /// Skill from user-managed directory.
    Managed,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn create_skill_file(dir: &Path, name: &str, content: &str) -> PathBuf {
        let skill_dir = dir.join(name);
        std::fs::create_dir_all(&skill_dir).unwrap();
        let skill_file = skill_dir.join("SKILL.md");
        std::fs::write(&skill_file, content).unwrap();
        skill_file
    }

    #[test]
    fn test_parse_valid_skill() {
        let content = r#"---
name: git-workflow
description: Manage Git repositories and workflows
metadata:
  agiworkforce:
    requires:
      bins: ["git"]
      env: ["GIT_AUTHOR_NAME"]
    os: ["darwin", "linux", "windows"]
---

# Git Workflow Instructions

Use this skill to manage Git repositories.

## Available Commands

- `git status` - Check repository status
- `git commit` - Commit changes
"#;

        let temp_dir = TempDir::new().unwrap();
        let skill_path = create_skill_file(temp_dir.path(), "git-workflow", content);

        let skill = SkillLoader::parse_skill_md(&skill_path, &SkillSourceType::Workspace).unwrap();

        assert_eq!(skill.name, "git-workflow");
        assert_eq!(skill.description, "Manage Git repositories and workflows");
        assert!(skill.instructions.contains("Git Workflow Instructions"));
        assert_eq!(skill.requires_bins, vec!["git"]);
        assert_eq!(skill.requires_env, vec!["GIT_AUTHOR_NAME"]);
        assert_eq!(skill.supported_os, vec!["darwin", "linux", "windows"]);
        assert!(skill.source.is_workspace());
    }

    #[test]
    fn test_parse_minimal_skill() {
        let content = r#"---
name: simple-skill
description: A simple skill without requirements
---

Just some basic instructions.
"#;

        let temp_dir = TempDir::new().unwrap();
        let skill_path = create_skill_file(temp_dir.path(), "simple", content);

        let skill = SkillLoader::parse_skill_md(&skill_path, &SkillSourceType::Managed).unwrap();

        assert_eq!(skill.name, "simple-skill");
        assert_eq!(skill.description, "A simple skill without requirements");
        assert_eq!(skill.instructions, "Just some basic instructions.");
        assert!(skill.requires_bins.is_empty());
        assert!(skill.requires_env.is_empty());
        assert!(skill.supported_os.is_empty());
        assert!(skill.source.is_managed());
    }

    #[test]
    fn test_missing_frontmatter() {
        let content = "Just markdown without frontmatter";

        let temp_dir = TempDir::new().unwrap();
        let skill_path = create_skill_file(temp_dir.path(), "invalid", content);

        let result = SkillLoader::parse_skill_md(&skill_path, &SkillSourceType::Workspace);

        assert!(matches!(result, Err(SkillError::MissingFrontmatter { .. })));
    }

    #[test]
    fn test_invalid_yaml() {
        let content = r#"---
name: [invalid yaml
description: "unclosed bracket
---

Instructions
"#;

        let temp_dir = TempDir::new().unwrap();
        let skill_path = create_skill_file(temp_dir.path(), "invalid-yaml", content);

        let result = SkillLoader::parse_skill_md(&skill_path, &SkillSourceType::Workspace);

        assert!(matches!(result, Err(SkillError::YamlParseError { .. })));
    }

    #[test]
    fn test_load_from_directory() {
        let temp_dir = TempDir::new().unwrap();

        // Create multiple skill files
        let skill1 = r#"---
name: skill-one
description: First skill
---
Instructions for skill one.
"#;
        create_skill_file(temp_dir.path(), "skill-one", skill1);

        let skill2 = r#"---
name: skill-two
description: Second skill
---
Instructions for skill two.
"#;
        create_skill_file(temp_dir.path(), "skill-two", skill2);

        // Create an invalid skill file that should be skipped
        let invalid = "No frontmatter here";
        create_skill_file(temp_dir.path(), "invalid", invalid);

        let skills = SkillLoader::load_from_directory(temp_dir.path(), SkillSourceType::Workspace);

        assert_eq!(skills.len(), 2);
        let names: Vec<&str> = skills.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"skill-one"));
        assert!(names.contains(&"skill-two"));
    }

    #[test]
    fn test_load_from_nonexistent_directory() {
        let skills = SkillLoader::load_from_directory(
            Path::new("/nonexistent/path"),
            SkillSourceType::Workspace,
        );
        assert!(skills.is_empty());
    }

    #[test]
    fn test_check_requirements_no_requirements() {
        let skill = Skill::bundled("simple", "A simple skill", "Instructions");

        let result = SkillLoader::check_requirements(&skill);

        assert!(result.satisfied);
        assert!(result.missing_bins.is_empty());
        assert!(result.missing_env.is_empty());
        assert!(result.os_supported);
    }

    #[test]
    fn test_check_requirements_missing_binary() {
        let skill = Skill::builder("needs-binary")
            .description("Needs a nonexistent binary")
            .instructions("Instructions")
            .requires_bin("nonexistent-binary-that-does-not-exist-12345")
            .build();

        let result = SkillLoader::check_requirements(&skill);

        assert!(!result.satisfied);
        assert!(result
            .missing_bins
            .contains(&"nonexistent-binary-that-does-not-exist-12345".to_string()));
    }

    #[test]
    fn test_check_requirements_missing_env() {
        let skill = Skill::builder("needs-env")
            .description("Needs an env var")
            .instructions("Instructions")
            .requires_env_var("NONEXISTENT_ENV_VAR_FOR_TESTING_12345")
            .build();

        let result = SkillLoader::check_requirements(&skill);

        assert!(!result.satisfied);
        assert!(result
            .missing_env
            .contains(&"NONEXISTENT_ENV_VAR_FOR_TESTING_12345".to_string()));
    }

    #[test]
    fn test_check_requirements_unsupported_os() {
        let skill = Skill::builder("wrong-os")
            .description("Wrong OS")
            .instructions("Instructions")
            .supported_os(vec!["nonexistent-os".to_string()])
            .build();

        let result = SkillLoader::check_requirements(&skill);

        assert!(!result.satisfied);
        assert!(!result.os_supported);
    }

    #[test]
    fn test_requirement_check_result_describe_failures() {
        let result = RequirementCheckResult {
            satisfied: false,
            missing_bins: vec!["git".to_string(), "docker".to_string()],
            missing_env: vec!["API_KEY".to_string()],
            os_supported: false,
        };

        let description = result.describe_failures().unwrap();

        assert!(description.contains("Current OS"));
        assert!(description.contains("Missing binaries: git, docker"));
        assert!(description.contains("Missing environment variables: API_KEY"));
    }

    #[test]
    fn test_requirement_check_result_all_satisfied() {
        let result = RequirementCheckResult::all_satisfied();

        assert!(result.satisfied);
        assert!(result.describe_failures().is_none());
    }

    #[test]
    fn test_case_insensitive_skill_filename() {
        let temp_dir = TempDir::new().unwrap();

        // Create a skill with lowercase filename
        let skill_dir = temp_dir.path().join("my-skill");
        std::fs::create_dir_all(&skill_dir).unwrap();

        let content = r#"---
name: my-skill
description: Test case sensitivity
---
Instructions
"#;
        // Use uppercase SKILL.md
        std::fs::write(skill_dir.join("SKILL.MD"), content).unwrap();

        let skills = SkillLoader::load_from_directory(temp_dir.path(), SkillSourceType::Workspace);

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "my-skill");
    }
}
