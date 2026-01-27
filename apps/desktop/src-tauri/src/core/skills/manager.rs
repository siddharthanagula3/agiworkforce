//! Skill manager for loading, organizing, and providing skills to the AGI.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use parking_lot::RwLock;
use tracing::{debug, info, warn};

use super::error::{SkillError, SkillResult};
use super::loader::{RequirementCheckResult, SkillLoader, SkillSourceType};
use super::skill::{Skill, SkillSource};

/// Configuration for the skill manager.
#[derive(Debug, Clone)]
pub struct SkillManagerConfig {
    /// Path to the managed skills directory (~/.agiworkforce/skills/).
    pub managed_skills_dir: PathBuf,

    /// Whether to automatically check requirements when loading skills.
    pub check_requirements_on_load: bool,

    /// Whether to include skills that don't meet requirements in the available list.
    pub include_unavailable_skills: bool,
}

impl Default for SkillManagerConfig {
    fn default() -> Self {
        let managed_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("agiworkforce")
            .join("skills");

        Self {
            managed_skills_dir: managed_dir,
            check_requirements_on_load: true,
            include_unavailable_skills: false,
        }
    }
}

/// Manages the loading and organization of skills for the AGI.
///
/// Skills are loaded from multiple sources:
/// - Bundled skills (built into the application)
/// - Managed skills (~/.agiworkforce/skills/)
/// - Workspace skills (<workspace>/skills/)
///
/// The manager provides methods to query available skills, check their
/// requirements, and generate context for the AGI.
#[derive(Debug)]
pub struct SkillManager {
    /// Configuration for the manager.
    config: SkillManagerConfig,

    /// All loaded skills, keyed by name.
    skills: Arc<RwLock<HashMap<String, Skill>>>,

    /// Cached requirement check results.
    requirement_cache: Arc<RwLock<HashMap<String, RequirementCheckResult>>>,

    /// Currently active workspace path for workspace-local skills.
    workspace_path: Arc<RwLock<Option<PathBuf>>>,
}

impl SkillManager {
    /// Creates a new skill manager with default configuration.
    #[must_use]
    pub fn new() -> Self {
        Self::with_config(SkillManagerConfig::default())
    }

    /// Creates a new skill manager with the given configuration.
    #[must_use]
    pub fn with_config(config: SkillManagerConfig) -> Self {
        Self {
            config,
            skills: Arc::new(RwLock::new(HashMap::new())),
            requirement_cache: Arc::new(RwLock::new(HashMap::new())),
            workspace_path: Arc::new(RwLock::new(None)),
        }
    }

    /// Initializes the skill manager by loading bundled and managed skills.
    ///
    /// This should be called once during application startup.
    pub fn initialize(&self) {
        info!("Initializing skill manager");

        // Load bundled skills
        self.load_bundled_skills();

        // Load managed skills
        self.load_managed_skills();

        let skills = self.skills.read();
        info!("Skill manager initialized with {} skills", skills.len());
    }

    /// Loads the bundled skills that come with the application.
    fn load_bundled_skills(&self) {
        let bundled = self.create_bundled_skills();
        let mut skills = self.skills.write();

        for skill in bundled {
            debug!("Loading bundled skill: {}", skill.name);
            skills.insert(skill.name.clone(), skill);
        }
    }

    /// Creates the bundled skills.
    ///
    /// These are skills that are built into the application and always available.
    fn create_bundled_skills(&self) -> Vec<Skill> {
        vec![
            Skill::bundled(
                "file-operations",
                "Read, write, and manipulate files and directories",
                r#"# File Operations

You can perform file operations using the following capabilities:

## Reading Files
- Read the contents of any file the user has access to
- Handle text files, JSON, YAML, and other common formats
- Report file metadata like size and modification time

## Writing Files
- Create new files with specified content
- Modify existing files
- Always confirm with the user before overwriting existing files

## Directory Operations
- List directory contents
- Create new directories
- Move and rename files and directories

## Safety Guidelines
- Never delete files without explicit user confirmation
- Create backups before modifying important files
- Respect file permissions and ownership
"#,
            ),
            Skill::bundled(
                "shell-commands",
                "Execute shell commands and scripts",
                r#"# Shell Commands

You can execute shell commands to accomplish tasks.

## Available Commands
- Run any command available in the user's PATH
- Chain commands using pipes and redirects
- Execute scripts in various languages

## Safety Guidelines
- Preview destructive commands before execution
- Never run commands that could compromise system security
- Avoid commands that require sudo unless explicitly requested
- Always explain what a command will do before running it

## Best Practices
- Use absolute paths when possible
- Handle errors gracefully
- Capture and report both stdout and stderr
"#,
            ),
            Skill::bundled(
                "web-search",
                "Search the web for information",
                r#"# Web Search

You can search the web to find information.

## Capabilities
- Search for current information on any topic
- Find documentation and tutorials
- Look up error messages and solutions

## Usage Guidelines
- Prefer authoritative sources (official docs, reputable sites)
- Verify information from multiple sources when important
- Cite sources when providing information from web searches
- Be aware that search results may be outdated
"#,
            ),
        ]
    }

    /// Loads skills from the managed skills directory.
    fn load_managed_skills(&self) {
        let managed_dir = &self.config.managed_skills_dir;

        if !managed_dir.exists() {
            debug!(
                "Managed skills directory does not exist: {}",
                managed_dir.display()
            );
            return;
        }

        let loaded = SkillLoader::load_from_directory(managed_dir, SkillSourceType::Managed);
        let mut skills = self.skills.write();

        for skill in loaded {
            if let Some(existing) = skills.get(&skill.name) {
                warn!(
                    "Managed skill '{}' shadows existing skill from {:?}",
                    skill.name, existing.source
                );
            }
            skills.insert(skill.name.clone(), skill);
        }
    }

    /// Sets the workspace path and loads workspace-local skills.
    ///
    /// This clears any previously loaded workspace skills and loads skills
    /// from `<workspace>/skills/` if that directory exists.
    pub fn set_workspace(&self, workspace_path: Option<PathBuf>) {
        // Clear existing workspace skills
        {
            let mut skills = self.skills.write();
            skills.retain(|_, skill| !skill.source.is_workspace());
        }

        // Update workspace path
        *self.workspace_path.write() = workspace_path.clone();

        // Load workspace skills if path is provided
        if let Some(path) = workspace_path {
            let skills_dir = path.join("skills");
            if skills_dir.exists() {
                let loaded =
                    SkillLoader::load_from_directory(&skills_dir, SkillSourceType::Workspace);
                let mut skills = self.skills.write();

                for skill in loaded {
                    if let Some(existing) = skills.get(&skill.name) {
                        if !existing.source.is_workspace() {
                            debug!(
                                "Workspace skill '{}' shadows {:?} skill",
                                skill.name, existing.source
                            );
                        }
                    }
                    skills.insert(skill.name.clone(), skill);
                }

                info!(
                    "Loaded {} workspace skills from {}",
                    skills
                        .iter()
                        .filter(|(_, s)| s.source.is_workspace())
                        .count(),
                    skills_dir.display()
                );
            }
        }

        // Clear requirement cache since skills have changed
        self.requirement_cache.write().clear();
    }

    /// Reloads all skills from disk.
    ///
    /// Useful after the user has added or modified skill files.
    pub fn reload(&self) {
        info!("Reloading all skills");

        // Clear all skills
        self.skills.write().clear();
        self.requirement_cache.write().clear();

        // Reload bundled and managed skills
        self.load_bundled_skills();
        self.load_managed_skills();

        // Reload workspace skills if a workspace is set
        let workspace = self.workspace_path.read().clone();
        if workspace.is_some() {
            self.set_workspace(workspace);
        }
    }

    /// Returns all loaded skills.
    #[must_use]
    pub fn all_skills(&self) -> Vec<Skill> {
        self.skills.read().values().cloned().collect()
    }

    /// Returns only skills that meet all their requirements.
    #[must_use]
    pub fn available_skills(&self) -> Vec<Skill> {
        let skills = self.skills.read();
        let mut available = Vec::new();

        for skill in skills.values() {
            if self.is_skill_available(skill) {
                available.push(skill.clone());
            }
        }

        available
    }

    /// Checks if a skill meets all its requirements.
    #[must_use]
    pub fn is_skill_available(&self, skill: &Skill) -> bool {
        self.check_skill_requirements(&skill.name)
            .map(|r| r.satisfied)
            .unwrap_or(false)
    }

    /// Gets a skill by name.
    #[must_use]
    pub fn get_skill(&self, name: &str) -> Option<Skill> {
        self.skills.read().get(name).cloned()
    }

    /// Gets a skill by name, returning an error if not found.
    pub fn require_skill(&self, name: &str) -> SkillResult<Skill> {
        self.get_skill(name)
            .ok_or_else(|| SkillError::SkillNotFound {
                name: name.to_string(),
            })
    }

    /// Checks the requirements for a skill.
    ///
    /// Results are cached to avoid repeated filesystem checks.
    pub fn check_skill_requirements(&self, name: &str) -> Option<RequirementCheckResult> {
        // Check cache first
        {
            let cache = self.requirement_cache.read();
            if let Some(result) = cache.get(name) {
                return Some(result.clone());
            }
        }

        // Get the skill
        let skill = self.skills.read().get(name).cloned()?;

        // Check requirements
        let result = SkillLoader::check_requirements(&skill);

        // Cache the result
        self.requirement_cache
            .write()
            .insert(name.to_string(), result.clone());

        Some(result)
    }

    /// Invalidates the requirement cache for a specific skill or all skills.
    pub fn invalidate_requirement_cache(&self, skill_name: Option<&str>) {
        let mut cache = self.requirement_cache.write();
        match skill_name {
            Some(name) => {
                cache.remove(name);
            }
            None => {
                cache.clear();
            }
        }
    }

    /// Returns skills filtered by source type.
    #[must_use]
    pub fn skills_by_source(&self, source_filter: SkillSourceFilter) -> Vec<Skill> {
        let skills = self.skills.read();
        skills
            .values()
            .filter(|skill| source_filter.matches(&skill.source))
            .cloned()
            .collect()
    }

    /// Generates a context string containing all available skill instructions.
    ///
    /// This is intended to be included in the AGI's system prompt.
    #[must_use]
    pub fn generate_skill_context(&self) -> String {
        let available = self.available_skills();

        if available.is_empty() {
            return String::from("No additional skills are currently available.");
        }

        let mut context = String::from("# Available Skills\n\n");
        context.push_str("The following skills are available to help complete tasks:\n\n");

        for skill in &available {
            context.push_str(&skill.to_context_string());
            context.push_str("\n\n---\n\n");
        }

        context
    }

    /// Generates a brief summary of available skills.
    ///
    /// Useful for quick reference without full instructions.
    #[must_use]
    pub fn generate_skill_summary(&self) -> String {
        let available = self.available_skills();

        if available.is_empty() {
            return String::from("No additional skills available.");
        }

        let mut summary = String::from("Available skills:\n");

        for skill in &available {
            summary.push_str(&format!("- **{}**: {}\n", skill.name, skill.description));
        }

        summary
    }

    /// Adds a skill programmatically.
    ///
    /// This is useful for adding skills at runtime, such as from plugins.
    pub fn add_skill(&self, skill: Skill) {
        let name = skill.name.clone();
        self.skills.write().insert(name.clone(), skill);

        // Invalidate cache for this skill
        self.requirement_cache.write().remove(&name);
    }

    /// Removes a skill by name.
    ///
    /// Returns the removed skill if it existed.
    pub fn remove_skill(&self, name: &str) -> Option<Skill> {
        let skill = self.skills.write().remove(name);
        self.requirement_cache.write().remove(name);
        skill
    }

    /// Returns the number of loaded skills.
    #[must_use]
    pub fn skill_count(&self) -> usize {
        self.skills.read().len()
    }

    /// Returns the number of available skills (meeting requirements).
    #[must_use]
    pub fn available_skill_count(&self) -> usize {
        self.available_skills().len()
    }

    /// Gets the current workspace path.
    #[must_use]
    pub fn workspace_path(&self) -> Option<PathBuf> {
        self.workspace_path.read().clone()
    }

    /// Gets the managed skills directory path.
    #[must_use]
    pub fn managed_skills_dir(&self) -> &Path {
        &self.config.managed_skills_dir
    }

    /// Ensures the managed skills directory exists.
    pub fn ensure_managed_dir_exists(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.config.managed_skills_dir)
    }
}

impl Default for SkillManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Filter for selecting skills by their source.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SkillSourceFilter {
    /// Only bundled skills.
    Bundled,
    /// Only managed skills.
    Managed,
    /// Only workspace skills.
    Workspace,
    /// All skills.
    All,
}

impl SkillSourceFilter {
    /// Checks if a skill source matches this filter.
    #[must_use]
    pub fn matches(&self, source: &SkillSource) -> bool {
        match self {
            Self::Bundled => source.is_bundled(),
            Self::Managed => source.is_managed(),
            Self::Workspace => source.is_workspace(),
            Self::All => true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_skill_file(dir: &Path, skill_name: &str, name: &str, description: &str) {
        let skill_dir = dir.join(skill_name);
        std::fs::create_dir_all(&skill_dir).unwrap();
        let content = format!(
            r#"---
name: {name}
description: {description}
---

Instructions for {name}.
"#
        );
        std::fs::write(skill_dir.join("SKILL.md"), content).unwrap();
    }

    #[test]
    fn test_skill_manager_initialization() {
        let manager = SkillManager::new();
        manager.initialize();

        // Should have bundled skills
        assert!(manager.skill_count() >= 3);

        // Check for specific bundled skills
        assert!(manager.get_skill("file-operations").is_some());
        assert!(manager.get_skill("shell-commands").is_some());
        assert!(manager.get_skill("web-search").is_some());
    }

    #[test]
    fn test_add_and_remove_skill() {
        let manager = SkillManager::new();

        let skill = Skill::bundled("test-skill", "A test skill", "Test instructions");

        manager.add_skill(skill.clone());
        assert!(manager.get_skill("test-skill").is_some());

        let removed = manager.remove_skill("test-skill");
        assert!(removed.is_some());
        assert!(manager.get_skill("test-skill").is_none());
    }

    #[test]
    fn test_workspace_skills() {
        let temp_dir = TempDir::new().unwrap();
        let skills_dir = temp_dir.path().join("skills");
        std::fs::create_dir_all(&skills_dir).unwrap();

        create_skill_file(
            &skills_dir,
            "workspace-skill",
            "workspace-skill",
            "A workspace skill",
        );

        let manager = SkillManager::new();
        manager.initialize();

        let initial_count = manager.skill_count();

        manager.set_workspace(Some(temp_dir.path().to_path_buf()));

        assert!(manager.get_skill("workspace-skill").is_some());
        assert_eq!(manager.skill_count(), initial_count + 1);

        // Clear workspace
        manager.set_workspace(None);
        assert!(manager.get_skill("workspace-skill").is_none());
    }

    #[test]
    fn test_skills_by_source_filter() {
        let manager = SkillManager::new();
        manager.initialize();

        let bundled = manager.skills_by_source(SkillSourceFilter::Bundled);
        assert!(!bundled.is_empty());
        assert!(bundled.iter().all(|s| s.source.is_bundled()));

        let workspace = manager.skills_by_source(SkillSourceFilter::Workspace);
        assert!(workspace.is_empty()); // No workspace set yet
    }

    #[test]
    fn test_generate_skill_context() {
        let manager = SkillManager::new();
        manager.initialize();

        let context = manager.generate_skill_context();

        assert!(context.contains("Available Skills"));
        assert!(context.contains("file-operations"));
    }

    #[test]
    fn test_generate_skill_summary() {
        let manager = SkillManager::new();
        manager.initialize();

        let summary = manager.generate_skill_summary();

        assert!(summary.contains("Available skills:"));
        assert!(summary.contains("file-operations"));
    }

    #[test]
    fn test_requirement_cache() {
        let manager = SkillManager::new();
        manager.initialize();

        // First check populates cache
        let result1 = manager.check_skill_requirements("file-operations");
        assert!(result1.is_some());

        // Second check should use cache
        let result2 = manager.check_skill_requirements("file-operations");
        assert!(result2.is_some());

        // Invalidate and check again
        manager.invalidate_requirement_cache(Some("file-operations"));
        let result3 = manager.check_skill_requirements("file-operations");
        assert!(result3.is_some());
    }

    #[test]
    fn test_require_skill() {
        let manager = SkillManager::new();
        manager.initialize();

        let result = manager.require_skill("file-operations");
        assert!(result.is_ok());

        let result = manager.require_skill("nonexistent-skill");
        assert!(matches!(result, Err(SkillError::SkillNotFound { .. })));
    }

    #[test]
    fn test_reload() {
        let manager = SkillManager::new();
        manager.initialize();

        let count_before = manager.skill_count();

        manager.reload();

        assert_eq!(manager.skill_count(), count_before);
    }

    #[test]
    fn test_skill_source_filter_matches() {
        let bundled = SkillSource::Bundled;
        let managed = SkillSource::Managed {
            path: PathBuf::from("/test"),
        };
        let workspace = SkillSource::Workspace {
            path: PathBuf::from("/workspace"),
        };

        assert!(SkillSourceFilter::Bundled.matches(&bundled));
        assert!(!SkillSourceFilter::Bundled.matches(&managed));
        assert!(!SkillSourceFilter::Bundled.matches(&workspace));

        assert!(SkillSourceFilter::All.matches(&bundled));
        assert!(SkillSourceFilter::All.matches(&managed));
        assert!(SkillSourceFilter::All.matches(&workspace));
    }
}
