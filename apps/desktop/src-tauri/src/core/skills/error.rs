//! Error types for the Skills system.

use std::path::PathBuf;
use thiserror::Error;

/// Errors that can occur when working with skills.
#[derive(Error, Debug)]
pub enum SkillError {
    /// Failed to read a skill file.
    #[error("Failed to read skill file '{path}': {source}")]
    ReadError {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    /// Failed to parse YAML frontmatter in a skill file.
    #[error("Failed to parse YAML frontmatter in '{path}': {message}")]
    YamlParseError { path: PathBuf, message: String },

    /// Missing required frontmatter in a skill file.
    #[error("Missing required frontmatter in skill file '{path}'")]
    MissingFrontmatter { path: PathBuf },

    /// Missing required field in skill frontmatter.
    #[error("Missing required field '{field}' in skill file '{path}'")]
    MissingField { path: PathBuf, field: String },

    /// Invalid skill file format.
    #[error("Invalid skill file format in '{path}': {message}")]
    InvalidFormat { path: PathBuf, message: String },

    /// Directory does not exist or is not accessible.
    #[error("Skills directory not found or inaccessible: '{path}'")]
    DirectoryNotFound { path: PathBuf },

    /// Binary requirement not met.
    #[error("Required binary '{binary}' not found in PATH")]
    MissingBinary { binary: String },

    /// Environment variable requirement not met.
    #[error("Required environment variable '{env_var}' is not set")]
    MissingEnvVar { env_var: String },

    /// OS not supported for this skill.
    #[error("Skill '{skill}' does not support current OS '{os}'")]
    UnsupportedOs { skill: String, os: String },

    /// Skill not found by name.
    #[error("Skill '{name}' not found")]
    SkillNotFound { name: String },

    /// Duplicate skill names detected.
    #[error("Duplicate skill name '{name}' found in '{path1}' and '{path2}'")]
    DuplicateSkill {
        name: String,
        path1: PathBuf,
        path2: PathBuf,
    },

    /// Skill exists but is not available due to unmet requirements.
    #[error("Skill '{name}' is not available: {reason}")]
    SkillNotAvailable { name: String, reason: String },

    /// Invalid slash command format.
    #[error("Invalid slash command: {message}")]
    InvalidSlashCommand { message: String },
}

/// Result type alias for skill operations.
pub type SkillResult<T> = Result<T, SkillError>;
