//! Skills system for AGI Workforce.
//!
//! Skills provide reusable instructions and capabilities that the AGI can use
//! to accomplish tasks. Skills are loaded from SKILL.md files with YAML frontmatter
//! containing metadata and markdown content providing instructions.
//!
//! # Skill Sources
//!
//! Skills can come from three sources:
//!
//! - **Bundled**: Built into the application, always available
//! - **Managed**: User-installed skills in `~/.agiworkforce/skills/`
//! - **Workspace**: Project-specific skills in `<workspace>/skills/`
//!
//! # SKILL.md Format
//!
//! Skill files use YAML frontmatter followed by markdown instructions:
//!
//! ```markdown
//! ---
//! name: skill-name
//! description: What the skill does
//! metadata:
//!   agiworkforce:
//!     requires:
//!       bins: ["git", "docker"]
//!       env: ["API_KEY"]
//!     os: ["darwin", "linux", "windows"]
//! ---
//!
//! # Skill Instructions
//!
//! Instructions for the AI...
//! ```
//!
//! # Example Usage
//!
//! ```rust,no_run
//! use agiworkforce_desktop::core::skills::{SkillManager, SkillLoader};
//! use std::path::PathBuf;
//!
//! // Create and initialize the skill manager
//! let manager = SkillManager::new();
//! manager.initialize();
//!
//! // Set a workspace to load workspace-local skills
//! manager.set_workspace(Some(PathBuf::from("/path/to/workspace")));
//!
//! // Get available skills for AGI context
//! let context = manager.generate_skill_context();
//!
//! // Check if a specific skill is available
//! if let Some(skill) = manager.get_skill("git-workflow") {
//!     let requirements = manager.check_skill_requirements(&skill.name);
//!     if requirements.map(|r| r.satisfied).unwrap_or(false) {
//!         println!("Skill is available: {}", skill.name);
//!     }
//! }
//! ```

mod error;
mod loader;
mod manager;
mod skill;

pub use error::{SkillError, SkillResult};
pub use loader::{RequirementCheckResult, SkillLoader, SkillSourceType};
pub use manager::{SkillManager, SkillManagerConfig, SkillSourceFilter};
pub use skill::{Skill, SkillBuilder, SkillRequirements, SkillSource};

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::TempDir;

    /// Integration test for the full skills workflow.
    #[test]
    fn test_full_skills_workflow() {
        // Create a temporary workspace with skills
        let temp_dir = TempDir::new().unwrap();
        let skills_dir = temp_dir.path().join("skills");
        std::fs::create_dir_all(&skills_dir).unwrap();

        // Create a workspace skill
        let git_skill_dir = skills_dir.join("git-workflow");
        std::fs::create_dir_all(&git_skill_dir).unwrap();
        let git_skill_content = r#"---
name: git-workflow
description: Manage Git repositories and version control
metadata:
  agiworkforce:
    requires:
      bins: ["git"]
    os: ["darwin", "linux", "windows"]
---

# Git Workflow

Use this skill for Git operations.

## Commands
- `git status` - Check status
- `git commit` - Commit changes
"#;
        std::fs::write(git_skill_dir.join("SKILL.md"), git_skill_content).unwrap();

        // Initialize the manager
        let manager = SkillManager::new();
        manager.initialize();

        let bundled_count = manager.skill_count();
        assert!(bundled_count >= 3, "Should have bundled skills");

        // Set workspace
        manager.set_workspace(Some(temp_dir.path().to_path_buf()));

        // Verify workspace skill was loaded
        let git_skill = manager.get_skill("git-workflow");
        assert!(git_skill.is_some(), "git-workflow skill should be loaded");

        let skill = git_skill.unwrap();
        assert_eq!(
            skill.description,
            "Manage Git repositories and version control"
        );
        assert!(skill.source.is_workspace());
        assert_eq!(skill.requires_bins, vec!["git"]);

        // Check requirements
        let requirements = manager.check_skill_requirements("git-workflow");
        assert!(requirements.is_some());

        // Generate context
        let context = manager.generate_skill_context();
        assert!(context.contains("git-workflow") || context.contains("file-operations"));

        // Generate summary
        let summary = manager.generate_skill_summary();
        assert!(!summary.is_empty());

        // Clear workspace
        manager.set_workspace(None);
        assert!(manager.get_skill("git-workflow").is_none());
        assert_eq!(manager.skill_count(), bundled_count);
    }

    /// Test that skill sources work correctly.
    #[test]
    fn test_skill_sources() {
        let bundled = SkillSource::Bundled;
        assert!(bundled.is_bundled());
        assert!(!bundled.is_managed());
        assert!(!bundled.is_workspace());
        assert!(bundled.path().is_none());

        let managed = SkillSource::Managed {
            path: PathBuf::from("/home/user/.agiworkforce/skills/test"),
        };
        assert!(!managed.is_bundled());
        assert!(managed.is_managed());
        assert!(!managed.is_workspace());
        assert!(managed.path().is_some());

        let workspace = SkillSource::Workspace {
            path: PathBuf::from("/workspace/skills/test"),
        };
        assert!(!workspace.is_bundled());
        assert!(!workspace.is_managed());
        assert!(workspace.is_workspace());
        assert!(workspace.path().is_some());
    }

    /// Test skill builder.
    #[test]
    fn test_skill_builder() {
        let skill = Skill::builder("custom-skill")
            .description("A custom skill")
            .instructions("Do something custom")
            .requires_bin("custom-tool")
            .requires_env_var("CUSTOM_TOKEN")
            .supported_os(vec!["darwin".to_string()])
            .source(SkillSource::Bundled)
            .build();

        assert_eq!(skill.name, "custom-skill");
        assert_eq!(skill.description, "A custom skill");
        assert_eq!(skill.instructions, "Do something custom");
        assert_eq!(skill.requires_bins, vec!["custom-tool"]);
        assert_eq!(skill.requires_env, vec!["CUSTOM_TOKEN"]);
        assert_eq!(skill.supported_os, vec!["darwin"]);
    }

    /// Test requirement checking.
    #[test]
    fn test_requirement_checking() {
        // Create a skill with impossible requirements
        let skill = Skill::builder("impossible-skill")
            .description("Impossible to satisfy")
            .instructions("Never available")
            .requires_bin("this-binary-does-not-exist-anywhere-12345")
            .requires_env_var("THIS_ENV_VAR_IS_NOT_SET_12345")
            .supported_os(vec!["nonexistent-os".to_string()])
            .build();

        let result = SkillLoader::check_requirements(&skill);

        assert!(!result.satisfied);
        assert!(!result.os_supported);
        assert!(!result.missing_bins.is_empty());
        assert!(!result.missing_env.is_empty());

        let description = result.describe_failures().unwrap();
        assert!(description.contains("not supported"));
        assert!(description.contains("Missing binaries"));
        assert!(description.contains("Missing environment variables"));
    }
}
