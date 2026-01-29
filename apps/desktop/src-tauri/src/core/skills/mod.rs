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
pub use manager::{
    SkillInvocation, SkillManager, SkillManagerConfig, SkillSourceFilter, SlashCommand,
};
pub use skill::{Skill, SkillBuilder, SkillContextMode, SkillRequirements, SkillSource};

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
        let custom_skill_dir = skills_dir.join("custom-skill");
        std::fs::create_dir_all(&custom_skill_dir).unwrap();
        let custom_skill_content = r#"---
name: custom-skill
description: A custom workspace skill
metadata:
  agiworkforce:
    requires:
      bins: []
    os: ["darwin", "linux", "windows"]
---

# Custom Skill

Use this skill for custom operations.
"#;
        std::fs::write(custom_skill_dir.join("SKILL.md"), custom_skill_content).unwrap();

        // Initialize the manager
        let manager = SkillManager::new();
        manager.initialize();

        let bundled_count = manager.skill_count();
        assert!(bundled_count >= 3, "Should have bundled skills");

        // Set workspace
        manager.set_workspace(Some(temp_dir.path().to_path_buf()));

        // Verify workspace skill was loaded
        let custom_skill = manager.get_skill("custom-skill");
        assert!(custom_skill.is_some(), "custom-skill should be loaded");

        let skill = custom_skill.unwrap();
        assert_eq!(skill.description, "A custom workspace skill");
        assert!(skill.source.is_workspace());

        // Check requirements
        let requirements = manager.check_skill_requirements("custom-skill");
        assert!(requirements.is_some());

        // Generate context
        let context = manager.generate_skill_context();
        assert!(context.contains("custom-skill") || context.contains("file-operations"));

        // Generate summary
        let summary = manager.generate_skill_summary();
        assert!(!summary.is_empty());

        // Clear workspace
        manager.set_workspace(None);
        assert!(manager.get_skill("custom-skill").is_none());
        assert_eq!(manager.skill_count(), bundled_count);
    }

    /// Test that pre-built skill templates are available.
    #[test]
    fn test_prebuilt_skill_templates() {
        let manager = SkillManager::new();
        manager.initialize();

        // Check for pre-built skill templates
        assert!(manager.get_skill("explain-code").is_some());
        assert!(manager.get_skill("create-document").is_some());
        assert!(manager.get_skill("code-review").is_some());
        assert!(manager.get_skill("debug-error").is_some());
        assert!(manager.get_skill("git-workflow").is_some());
        assert!(manager.get_skill("research-topic").is_some());
        assert!(manager.get_skill("refactor-code").is_some());
        assert!(manager.get_skill("write-tests").is_some());

        // Check explain-code has correct configuration
        let explain_code = manager.get_skill("explain-code").unwrap();
        assert!(explain_code.context_mode.is_fork());
        assert!(explain_code.is_tool_allowed("Read"));
        assert!(explain_code.is_tool_allowed("Grep"));
        assert!(explain_code.is_tool_allowed("Glob"));
        assert!(!explain_code.is_tool_allowed("Write"));
    }

    /// Test slash command parsing.
    #[test]
    fn test_slash_command_parsing() {
        let manager = SkillManager::new();
        manager.initialize();

        // Valid slash command with arguments
        let result = manager.parse_slash_command("/explain-code src/main.rs");
        assert!(result.is_some());
        let invocation = result.unwrap().expect("Should parse successfully");
        assert_eq!(invocation.skill_name, "explain-code");
        assert!(invocation.instructions.contains("src/main.rs"));

        // Valid slash command without arguments
        let result = manager.parse_slash_command("/file-operations");
        assert!(result.is_some());
        let invocation = result.unwrap().expect("Should parse successfully");
        assert_eq!(invocation.skill_name, "file-operations");

        // Not a slash command
        let result = manager.parse_slash_command("explain-code src/main.rs");
        assert!(result.is_none());

        // Unknown skill
        let result = manager.parse_slash_command("/unknown-skill args");
        assert!(result.is_none());
    }

    /// Test skill invocation with arguments.
    #[test]
    fn test_skill_invocation() {
        let manager = SkillManager::new();
        manager.initialize();

        let invocation = manager
            .invoke_skill("explain-code", "src/lib.rs")
            .expect("Should invoke successfully");

        assert_eq!(invocation.skill_name, "explain-code");
        assert!(invocation.instructions.contains("src/lib.rs"));
        assert!(invocation.is_fork());
        assert!(invocation.is_tool_allowed("Read"));
        assert!(!invocation.is_tool_allowed("Execute"));
    }

    /// Test get slash commands.
    #[test]
    fn test_get_slash_commands() {
        let manager = SkillManager::new();
        manager.initialize();

        let commands = manager.get_slash_commands();
        assert!(!commands.is_empty());

        // Check that explain-code has arguments
        let explain_code = commands.iter().find(|c| c.name == "explain-code");
        assert!(explain_code.is_some());
        assert!(explain_code.unwrap().has_arguments);
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
            .build()
            .expect("Failed to build skill");

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
            .build()
            .expect("Failed to build skill");

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
