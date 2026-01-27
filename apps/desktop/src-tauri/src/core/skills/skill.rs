//! Core Skill data structures.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Represents the source location of a skill.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum SkillSource {
    /// Skill loaded from workspace-local directory (<workspace>/skills/).
    Workspace { path: PathBuf },

    /// Skill loaded from user-managed directory (~/.agiworkforce/skills/).
    Managed { path: PathBuf },

    /// Skill bundled with the application.
    Bundled,
}

impl SkillSource {
    /// Returns the path if the skill has a file-based source.
    #[must_use]
    pub fn path(&self) -> Option<&PathBuf> {
        match self {
            Self::Workspace { path } | Self::Managed { path } => Some(path),
            Self::Bundled => None,
        }
    }

    /// Returns true if this is a workspace-local skill.
    #[must_use]
    pub fn is_workspace(&self) -> bool {
        matches!(self, Self::Workspace { .. })
    }

    /// Returns true if this is a user-managed skill.
    #[must_use]
    pub fn is_managed(&self) -> bool {
        matches!(self, Self::Managed { .. })
    }

    /// Returns true if this is a bundled skill.
    #[must_use]
    pub fn is_bundled(&self) -> bool {
        matches!(self, Self::Bundled)
    }
}

/// Requirements that must be met for a skill to be available.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRequirements {
    /// Required binary executables that must be in PATH.
    #[serde(default)]
    pub bins: Vec<String>,

    /// Required environment variables that must be set.
    #[serde(default)]
    pub env: Vec<String>,
}

impl SkillRequirements {
    /// Creates empty requirements.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Creates requirements with specified binaries.
    #[must_use]
    pub fn with_bins(bins: Vec<String>) -> Self {
        Self {
            bins,
            ..Default::default()
        }
    }

    /// Creates requirements with specified environment variables.
    #[must_use]
    pub fn with_env(env: Vec<String>) -> Self {
        Self {
            env,
            ..Default::default()
        }
    }

    /// Returns true if there are no requirements.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.bins.is_empty() && self.env.is_empty()
    }
}

/// A skill that the AGI can use to accomplish tasks.
///
/// Skills are loaded from SKILL.md files with YAML frontmatter containing
/// metadata and markdown content providing instructions for the AGI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    /// Unique name/identifier for the skill.
    pub name: String,

    /// Human-readable description of what the skill does.
    pub description: String,

    /// Instructions for the AGI on how to use this skill.
    pub instructions: String,

    /// Binary executables required to use this skill.
    #[serde(default)]
    pub requires_bins: Vec<String>,

    /// Environment variables required to use this skill.
    #[serde(default)]
    pub requires_env: Vec<String>,

    /// Operating systems this skill supports.
    /// Empty means all platforms are supported.
    #[serde(default)]
    pub supported_os: Vec<String>,

    /// Where this skill was loaded from.
    pub source: SkillSource,
}

impl Skill {
    /// Creates a new bundled skill.
    #[must_use]
    pub fn bundled(
        name: impl Into<String>,
        description: impl Into<String>,
        instructions: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            instructions: instructions.into(),
            requires_bins: Vec::new(),
            requires_env: Vec::new(),
            supported_os: Vec::new(),
            source: SkillSource::Bundled,
        }
    }

    /// Creates a builder for constructing a skill.
    #[must_use]
    pub fn builder(name: impl Into<String>) -> SkillBuilder {
        SkillBuilder::new(name)
    }

    /// Returns the requirements for this skill.
    #[must_use]
    pub fn requirements(&self) -> SkillRequirements {
        SkillRequirements {
            bins: self.requires_bins.clone(),
            env: self.requires_env.clone(),
        }
    }

    /// Returns true if this skill supports the current OS.
    #[must_use]
    pub fn supports_current_os(&self) -> bool {
        if self.supported_os.is_empty() {
            return true;
        }

        let current_os = std::env::consts::OS;
        self.supported_os
            .iter()
            .any(|os| os.eq_ignore_ascii_case(current_os))
    }

    /// Returns true if this skill has no special requirements.
    #[must_use]
    pub fn has_no_requirements(&self) -> bool {
        self.requires_bins.is_empty()
            && self.requires_env.is_empty()
            && self.supported_os.is_empty()
    }

    /// Returns a formatted context string for including in AGI prompts.
    #[must_use]
    pub fn to_context_string(&self) -> String {
        let mut context = format!("## Skill: {}\n\n", self.name);
        context.push_str(&format!("**Description:** {}\n\n", self.description));

        if !self.requires_bins.is_empty() {
            context.push_str(&format!(
                "**Required binaries:** {}\n\n",
                self.requires_bins.join(", ")
            ));
        }

        if !self.requires_env.is_empty() {
            context.push_str(&format!(
                "**Required environment variables:** {}\n\n",
                self.requires_env.join(", ")
            ));
        }

        context.push_str("### Instructions\n\n");
        context.push_str(&self.instructions);
        context
    }
}

/// Builder for constructing Skill instances.
#[derive(Debug)]
pub struct SkillBuilder {
    name: String,
    description: Option<String>,
    instructions: Option<String>,
    requires_bins: Vec<String>,
    requires_env: Vec<String>,
    supported_os: Vec<String>,
    source: SkillSource,
}

impl SkillBuilder {
    /// Creates a new skill builder with the given name.
    #[must_use]
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: None,
            instructions: None,
            requires_bins: Vec::new(),
            requires_env: Vec::new(),
            supported_os: Vec::new(),
            source: SkillSource::Bundled,
        }
    }

    /// Sets the skill description.
    #[must_use]
    pub fn description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    /// Sets the skill instructions.
    #[must_use]
    pub fn instructions(mut self, instructions: impl Into<String>) -> Self {
        self.instructions = Some(instructions.into());
        self
    }

    /// Adds required binaries.
    #[must_use]
    pub fn requires_bins(mut self, bins: Vec<String>) -> Self {
        self.requires_bins = bins;
        self
    }

    /// Adds a single required binary.
    #[must_use]
    pub fn requires_bin(mut self, bin: impl Into<String>) -> Self {
        self.requires_bins.push(bin.into());
        self
    }

    /// Adds required environment variables.
    #[must_use]
    pub fn requires_env(mut self, env: Vec<String>) -> Self {
        self.requires_env = env;
        self
    }

    /// Adds a single required environment variable.
    #[must_use]
    pub fn requires_env_var(mut self, env_var: impl Into<String>) -> Self {
        self.requires_env.push(env_var.into());
        self
    }

    /// Sets supported operating systems.
    #[must_use]
    pub fn supported_os(mut self, os: Vec<String>) -> Self {
        self.supported_os = os;
        self
    }

    /// Sets the skill source.
    #[must_use]
    pub fn source(mut self, source: SkillSource) -> Self {
        self.source = source;
        self
    }

    /// Builds the skill.
    ///
    /// # Panics
    ///
    /// Panics if description or instructions are not set.
    #[must_use]
    pub fn build(self) -> Skill {
        Skill {
            name: self.name,
            description: self.description.expect("description is required"),
            instructions: self.instructions.expect("instructions is required"),
            requires_bins: self.requires_bins,
            requires_env: self.requires_env,
            supported_os: self.supported_os,
            source: self.source,
        }
    }

    /// Tries to build the skill, returning None if required fields are missing.
    #[must_use]
    pub fn try_build(self) -> Option<Skill> {
        Some(Skill {
            name: self.name,
            description: self.description?,
            instructions: self.instructions?,
            requires_bins: self.requires_bins,
            requires_env: self.requires_env,
            supported_os: self.supported_os,
            source: self.source,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_skill_builder() {
        let skill = Skill::builder("test-skill")
            .description("A test skill")
            .instructions("Use this skill for testing")
            .requires_bin("git")
            .requires_env_var("API_KEY")
            .supported_os(vec!["darwin".to_string(), "linux".to_string()])
            .source(SkillSource::Bundled)
            .build();

        assert_eq!(skill.name, "test-skill");
        assert_eq!(skill.description, "A test skill");
        assert_eq!(skill.instructions, "Use this skill for testing");
        assert_eq!(skill.requires_bins, vec!["git"]);
        assert_eq!(skill.requires_env, vec!["API_KEY"]);
        assert_eq!(skill.supported_os, vec!["darwin", "linux"]);
        assert!(skill.source.is_bundled());
    }

    #[test]
    fn test_skill_bundled_constructor() {
        let skill = Skill::bundled("my-skill", "Does stuff", "Instructions here");

        assert_eq!(skill.name, "my-skill");
        assert_eq!(skill.description, "Does stuff");
        assert_eq!(skill.instructions, "Instructions here");
        assert!(skill.requires_bins.is_empty());
        assert!(skill.requires_env.is_empty());
        assert!(skill.supported_os.is_empty());
        assert!(skill.source.is_bundled());
    }

    #[test]
    fn test_skill_supports_current_os() {
        // Empty supported_os means all platforms
        let skill = Skill::bundled("any-os", "desc", "inst");
        assert!(skill.supports_current_os());

        // Check with current OS
        let current_os = std::env::consts::OS;
        let skill_with_os = Skill::builder("specific-os")
            .description("desc")
            .instructions("inst")
            .supported_os(vec![current_os.to_string()])
            .build();
        assert!(skill_with_os.supports_current_os());

        // Check with non-matching OS
        let skill_wrong_os = Skill::builder("wrong-os")
            .description("desc")
            .instructions("inst")
            .supported_os(vec!["nonexistent-os".to_string()])
            .build();
        assert!(!skill_wrong_os.supports_current_os());
    }

    #[test]
    fn test_skill_source_methods() {
        let workspace = SkillSource::Workspace {
            path: PathBuf::from("/workspace/skills/test"),
        };
        assert!(workspace.is_workspace());
        assert!(!workspace.is_managed());
        assert!(!workspace.is_bundled());
        assert_eq!(
            workspace.path(),
            Some(&PathBuf::from("/workspace/skills/test"))
        );

        let managed = SkillSource::Managed {
            path: PathBuf::from("/home/user/.agiworkforce/skills/test"),
        };
        assert!(!managed.is_workspace());
        assert!(managed.is_managed());
        assert!(!managed.is_bundled());

        let bundled = SkillSource::Bundled;
        assert!(!bundled.is_workspace());
        assert!(!bundled.is_managed());
        assert!(bundled.is_bundled());
        assert_eq!(bundled.path(), None);
    }

    #[test]
    fn test_skill_requirements() {
        let empty = SkillRequirements::new();
        assert!(empty.is_empty());

        let with_bins = SkillRequirements::with_bins(vec!["git".to_string()]);
        assert!(!with_bins.is_empty());
        assert_eq!(with_bins.bins, vec!["git"]);

        let with_env = SkillRequirements::with_env(vec!["API_KEY".to_string()]);
        assert!(!with_env.is_empty());
        assert_eq!(with_env.env, vec!["API_KEY"]);
    }

    #[test]
    fn test_skill_to_context_string() {
        let skill = Skill::builder("test-skill")
            .description("A test skill for demonstration")
            .instructions("Follow these instructions carefully.")
            .requires_bin("docker")
            .requires_env_var("DOCKER_HOST")
            .build();

        let context = skill.to_context_string();

        assert!(context.contains("## Skill: test-skill"));
        assert!(context.contains("**Description:** A test skill for demonstration"));
        assert!(context.contains("**Required binaries:** docker"));
        assert!(context.contains("**Required environment variables:** DOCKER_HOST"));
        assert!(context.contains("### Instructions"));
        assert!(context.contains("Follow these instructions carefully."));
    }

    #[test]
    fn test_try_build_with_missing_fields() {
        let incomplete =
            Skill::builder("incomplete").description("Has description but no instructions");

        assert!(incomplete.try_build().is_none());
    }
}
