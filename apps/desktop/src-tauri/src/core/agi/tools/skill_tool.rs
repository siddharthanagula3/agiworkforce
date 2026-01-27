//! Skill tool for AGI to use skills dynamically.
//!
//! This module provides tools that allow the AGI to discover and use skills
//! at runtime. Skills provide specialized instructions for common workflows
//! and can be bundled with the application, managed by the user, or specific
//! to a workspace.

use crate::core::skills::{SkillLoader, SkillManager, SkillSourceFilter};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Input parameters for using a skill.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillToolInput {
    /// The name of the skill to use.
    pub skill_name: String,
    /// Additional context for using the skill.
    pub context: Option<String>,
}

/// Tool that allows AGI to use skills.
///
/// This tool provides an interface for the AGI to discover available skills
/// and retrieve their instructions for use in completing tasks.
pub struct SkillTool {
    manager: Arc<SkillManager>,
}

impl SkillTool {
    /// Creates a new skill tool with the given skill manager.
    #[must_use]
    pub fn new(manager: Arc<SkillManager>) -> Self {
        Self { manager }
    }

    /// Gets skill instructions for the AGI.
    ///
    /// Returns the instructions for the specified skill if it exists and
    /// meets all requirements. If the skill exists but requirements are not
    /// satisfied, returns an error message describing what is missing.
    ///
    /// # Arguments
    ///
    /// * `skill_name` - The name of the skill to retrieve instructions for.
    ///
    /// # Returns
    ///
    /// `Some(String)` containing either the skill instructions or an error message,
    /// or `None` if the skill does not exist.
    #[must_use]
    pub fn get_skill_instructions(&self, skill_name: &str) -> Option<String> {
        let skill = self.manager.get_skill(skill_name)?;

        // Check requirements
        let requirements = SkillLoader::check_requirements(&skill);
        if !requirements.satisfied {
            return Some(format!(
                "Skill '{}' is not available: {}",
                skill_name,
                requirements
                    .describe_failures()
                    .unwrap_or_else(|| "Unknown requirement failure".to_string())
            ));
        }

        Some(skill.instructions.clone())
    }

    /// Lists all available skills that meet their requirements.
    ///
    /// Returns a vector of tuples containing the skill name and description
    /// for each skill that is currently available (i.e., all requirements
    /// are satisfied).
    #[must_use]
    pub fn list_available_skills(&self) -> Vec<(String, String)> {
        self.manager
            .skills_by_source(SkillSourceFilter::All)
            .iter()
            .filter(|skill| {
                let requirements = SkillLoader::check_requirements(skill);
                requirements.satisfied
            })
            .map(|skill| (skill.name.clone(), skill.description.clone()))
            .collect()
    }

    /// Gets the underlying skill manager.
    #[must_use]
    pub fn manager(&self) -> &Arc<SkillManager> {
        &self.manager
    }
}

/// Creates the tool definition for skill usage.
///
/// This function returns a JSON schema that describes the `use_skill` tool
/// for integration with LLM function calling interfaces.
#[must_use]
pub fn create_skill_use_tool() -> serde_json::Value {
    serde_json::json!({
        "type": "function",
        "function": {
            "name": "use_skill",
            "description": "Use a skill to accomplish a task. Skills provide specialized instructions for common workflows.",
            "parameters": {
                "type": "object",
                "properties": {
                    "skill_name": {
                        "type": "string",
                        "description": "The name of the skill to use"
                    },
                    "context": {
                        "type": "string",
                        "description": "Additional context for using the skill"
                    }
                },
                "required": ["skill_name"]
            }
        }
    })
}

/// Creates the tool definition for listing skills.
///
/// This function returns a JSON schema that describes the `list_skills` tool
/// for integration with LLM function calling interfaces.
#[must_use]
pub fn create_list_skills_tool() -> serde_json::Value {
    serde_json::json!({
        "type": "function",
        "function": {
            "name": "list_skills",
            "description": "List all available skills that can be used to accomplish tasks.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::skills::Skill;

    #[test]
    fn test_skill_tool_creation() {
        let manager = Arc::new(SkillManager::new());
        let tool = SkillTool::new(manager);
        assert!(tool.list_available_skills().is_empty());
    }

    #[test]
    fn test_skill_tool_with_skills() {
        let manager = Arc::new(SkillManager::new());
        manager.initialize();

        let tool = SkillTool::new(manager);
        let skills = tool.list_available_skills();

        // Bundled skills should be available
        assert!(!skills.is_empty());
    }

    #[test]
    fn test_get_skill_instructions_found() {
        let manager = Arc::new(SkillManager::new());
        manager.initialize();

        let tool = SkillTool::new(manager);

        // file-operations is a bundled skill
        let instructions = tool.get_skill_instructions("file-operations");
        assert!(instructions.is_some());
        assert!(instructions.unwrap().contains("File Operations"));
    }

    #[test]
    fn test_get_skill_instructions_not_found() {
        let manager = Arc::new(SkillManager::new());
        manager.initialize();

        let tool = SkillTool::new(manager);

        let instructions = tool.get_skill_instructions("nonexistent-skill");
        assert!(instructions.is_none());
    }

    #[test]
    fn test_create_skill_use_tool_schema() {
        let schema = create_skill_use_tool();

        assert_eq!(schema["type"], "function");
        assert_eq!(schema["function"]["name"], "use_skill");
        assert!(schema["function"]["parameters"]["properties"]
            .get("skill_name")
            .is_some());
    }

    #[test]
    fn test_create_list_skills_tool_schema() {
        let schema = create_list_skills_tool();

        assert_eq!(schema["type"], "function");
        assert_eq!(schema["function"]["name"], "list_skills");
    }

    #[test]
    fn test_skill_with_unmet_requirements() {
        let manager = Arc::new(SkillManager::new());

        // Add a skill with impossible requirements
        let skill = Skill::builder("impossible-skill")
            .description("A skill with unmet requirements")
            .instructions("These instructions should not be returned")
            .requires_bin("this-binary-does-not-exist-12345")
            .build()
            .expect("Failed to build skill");

        manager.add_skill(skill);

        let tool = SkillTool::new(manager);

        // The skill exists but requirements are not met
        let result = tool.get_skill_instructions("impossible-skill");
        assert!(result.is_some());
        assert!(result.unwrap().contains("not available"));

        // Should not appear in available skills list
        let available = tool.list_available_skills();
        assert!(!available.iter().any(|(name, _)| name == "impossible-skill"));
    }
}
