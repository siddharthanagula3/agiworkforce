use crate::error::{Error, Result};
use regex::Regex;
use std::path::Path;
use tracing::{debug, warn};

/// Command safety level
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SafetyLevel {
    Safe,      // Always safe to execute
    Moderate,  // Requires confirmation
    Dangerous, // Highly dangerous, requires explicit permission
    Blocked,   // Never allowed
}

/// Command validator for system automation
pub struct CommandValidator {
    safe_commands: Vec<String>,
    moderate_commands: Vec<String>,
    dangerous_commands: Vec<String>,
    blocked_commands: Vec<String>,
    blocked_patterns: Vec<Regex>,
}

impl Default for CommandValidator {
    fn default() -> Self {
        Self::new()
    }
}

impl CommandValidator {
    pub fn new() -> Self {
        Self {
            // Safe commands (read-only operations)
            safe_commands: vec![
                "ls".to_string(),
                "dir".to_string(),
                "cat".to_string(),
                "type".to_string(),
                "echo".to_string(),
                "pwd".to_string(),
                "cd".to_string(),
                "git status".to_string(),
                "git log".to_string(),
                "git diff".to_string(),
                "git branch".to_string(),
                "npm list".to_string(),
                "node --version".to_string(),
                "python --version".to_string(),
                "cargo --version".to_string(),
                "which".to_string(),
                "where".to_string(),
                "env".to_string(),
                "printenv".to_string(),
            ],
            // Moderate risk commands (modify files but recoverable)
            moderate_commands: vec![
                "mv".to_string(),
                "move".to_string(),
                "cp".to_string(),
                "copy".to_string(),
                "mkdir".to_string(),
                "touch".to_string(),
                "git add".to_string(),
                "git commit".to_string(),
                "git stash".to_string(),
                "npm install".to_string(),
                "npm ci".to_string(),
                "cargo build".to_string(),
            ],
            // Dangerous commands (destructive or system-level)
            dangerous_commands: vec![
                "rm".to_string(),
                "del".to_string(),
                "rmdir".to_string(),
                "curl".to_string(),
                "wget".to_string(),
                "git push".to_string(),
                "git pull".to_string(),
                "npm publish".to_string(),
                "cargo publish".to_string(),
                "ssh".to_string(),
                "scp".to_string(),
                "rsync".to_string(),
                "chmod".to_string(),
                "chown".to_string(),
                "su".to_string(),
                "killall".to_string(),
                "taskkill".to_string(),
            ],
            // Blocked commands (never allowed)
            blocked_commands: vec![
                "sudo".to_string(),
                "sudo su".to_string(),
                "format".to_string(),
                "fdisk".to_string(),
                "mkfs".to_string(),
                "dd".to_string(),
                "rm -rf /".to_string(),
                "del /f /s /q".to_string(),
                ":(){ :|:& };:".to_string(), // Fork bomb
            ],
            // Blocked patterns
            blocked_patterns: vec![
                Regex::new(r"rm\s+-rf\s+/").unwrap(),
                Regex::new(r"del\s+/[fFsS]").unwrap(),
                Regex::new(r"sudo\s+").unwrap(),
                Regex::new(r">\s*/dev/").unwrap(),
                Regex::new(r"mkfs\.").unwrap(),
                Regex::new(r"dd\s+.*of=/dev/").unwrap(),
                Regex::new(r"chmod\s+777").unwrap(),
                Regex::new(r"shutdown").unwrap(),
                Regex::new(r"reboot").unwrap(),
            ],
        }
    }

    /// Validate a command and determine its safety level
    pub fn validate_command(&self, command: &str, args: &[String]) -> Result<SafetyLevel> {
        let full_command = if args.is_empty() {
            command.to_string()
        } else {
            format!("{} {}", command, args.join(" "))
        };

        debug!("Validating command: {}", full_command);

        // Check blocked commands first
        for blocked in &self.blocked_commands {
            if full_command
                .to_lowercase()
                .starts_with(&blocked.to_lowercase())
            {
                warn!("Blocked command detected: {}", full_command);
                return Ok(SafetyLevel::Blocked);
            }
        }

        // Check blocked patterns
        for pattern in &self.blocked_patterns {
            if pattern.is_match(&full_command) {
                warn!("Blocked pattern matched: {}", full_command);
                return Ok(SafetyLevel::Blocked);
            }
        }

        // Check dangerous commands
        for dangerous in &self.dangerous_commands {
            if full_command
                .to_lowercase()
                .starts_with(&dangerous.to_lowercase())
            {
                debug!("Dangerous command detected: {}", full_command);
                return Ok(SafetyLevel::Dangerous);
            }
        }

        // Check moderate commands
        for moderate in &self.moderate_commands {
            if full_command
                .to_lowercase()
                .starts_with(&moderate.to_lowercase())
            {
                debug!("Moderate risk command detected: {}", full_command);
                return Ok(SafetyLevel::Moderate);
            }
        }

        // Check safe commands
        for safe in &self.safe_commands {
            if full_command
                .to_lowercase()
                .starts_with(&safe.to_lowercase())
            {
                debug!("Safe command detected: {}", full_command);
                return Ok(SafetyLevel::Safe);
            }
        }

        // Unknown command defaults to moderate
        debug!("Unknown command, defaulting to moderate: {}", full_command);
        Ok(SafetyLevel::Moderate)
    }

    /// Validate a file path
    pub fn validate_path(&self, path: &str) -> Result<()> {
        debug!("Validating path: {}", path);

        // Check for directory traversal
        if path.contains("..") {
            warn!("Directory traversal detected: {}", path);
            return Err(Error::InvalidPath(
                "Directory traversal is not allowed".to_string(),
            ));
        }

        // Block system directories (Windows)
        let blocked_windows_paths = vec![
            "C:\\Windows",
            "C:\\Program Files",
            "C:\\Program Files (x86)",
            "C:\\ProgramData",
            "C:\\System",
            "C:\\$",
        ];

        for blocked in &blocked_windows_paths {
            if path.to_lowercase().starts_with(&blocked.to_lowercase()) {
                warn!("System directory access blocked: {}", path);
                return Err(Error::InvalidPath(format!(
                    "Access to system directory {} is not allowed",
                    blocked
                )));
            }
        }

        // Block system directories (Unix)
        let blocked_unix_paths = vec![
            "/etc",
            "/sys",
            "/proc",
            "/dev",
            "/boot",
            "/root",
            "/System",
            "/Library/System",
        ];

        for blocked in &blocked_unix_paths {
            if path.starts_with(blocked) {
                warn!("System directory access blocked: {}", path);
                return Err(Error::InvalidPath(format!(
                    "Access to system directory {} is not allowed",
                    blocked
                )));
            }
        }

        // Check if path is absolute
        let path_obj = Path::new(path);
        if !path_obj.is_absolute() {
            debug!("Relative path detected: {}", path);
            // Relative paths are allowed but logged
        }

        Ok(())
    }

    /// Sanitize command arguments to prevent injection
    pub fn sanitize_args(&self, args: &[String]) -> Vec<String> {
        args.iter()
            .map(|arg| {
                // Remove shell metacharacters
                let sanitized = arg
                    .replace('|', "")
                    .replace('&', "")
                    .replace(';', "")
                    .replace('>', "")
                    .replace('<', "")
                    .replace('`', "")
                    .replace('$', "")
                    .replace('(', "")
                    .replace(')', "");

                if sanitized != *arg {
                    warn!("Sanitized argument: {} -> {}", arg, sanitized);
                }

                sanitized
            })
            .collect()
    }

    /// Check if a command is allowed based on safety level and user permissions
    pub fn is_command_allowed(&self, safety_level: SafetyLevel, user_approved: bool) -> bool {
        match safety_level {
            SafetyLevel::Safe => true,
            SafetyLevel::Moderate => user_approved,
            SafetyLevel::Dangerous => user_approved,
            SafetyLevel::Blocked => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_safe_commands() {
        let validator = CommandValidator::new();

        assert_eq!(
            validator.validate_command("ls", &[]).unwrap(),
            SafetyLevel::Safe
        );
        assert_eq!(
            validator
                .validate_command("cat", &["file.txt".to_string()])
                .unwrap(),
            SafetyLevel::Safe
        );
        assert_eq!(
            validator
                .validate_command("git", &["status".to_string()])
                .unwrap(),
            SafetyLevel::Safe
        );
    }

    #[test]
    fn test_validate_moderate_commands() {
        let validator = CommandValidator::new();

        assert_eq!(
            validator
                .validate_command("mv", &["old.txt".to_string(), "new.txt".to_string()])
                .unwrap(),
            SafetyLevel::Moderate
        );
        assert_eq!(
            validator
                .validate_command("mkdir", &["test".to_string()])
                .unwrap(),
            SafetyLevel::Moderate
        );
    }

    #[test]
    fn test_validate_dangerous_commands() {
        let validator = CommandValidator::new();

        assert_eq!(
            validator
                .validate_command("rm", &["file.txt".to_string()])
                .unwrap(),
            SafetyLevel::Dangerous
        );
        assert_eq!(
            validator
                .validate_command("curl", &["http://example.com".to_string()])
                .unwrap(),
            SafetyLevel::Dangerous
        );
        assert_eq!(
            validator
                .validate_command("git", &["push".to_string()])
                .unwrap(),
            SafetyLevel::Dangerous
        );
    }

    #[test]
    fn test_validate_blocked_commands() {
        let validator = CommandValidator::new();

        assert_eq!(
            validator
                .validate_command("sudo", &["ls".to_string()])
                .unwrap(),
            SafetyLevel::Blocked
        );
        assert_eq!(
            validator
                .validate_command("format", &["C:".to_string()])
                .unwrap(),
            SafetyLevel::Blocked
        );
        assert_eq!(
            validator
                .validate_command("rm", &["-rf".to_string(), "/".to_string()])
                .unwrap(),
            SafetyLevel::Blocked
        );
    }

    #[test]
    fn test_validate_path_traversal() {
        let validator = CommandValidator::new();

        assert!(validator.validate_path("../secret/file.txt").is_err());
        assert!(validator
            .validate_path("/home/user/../../etc/passwd")
            .is_err());
    }

    #[test]
    fn test_validate_system_directories() {
        let validator = CommandValidator::new();

        assert!(validator.validate_path("C:\\Windows\\System32").is_err());
        assert!(validator.validate_path("/etc/passwd").is_err());
        assert!(validator.validate_path("/sys/kernel").is_err());
    }

    #[test]
    fn test_validate_safe_paths() {
        let validator = CommandValidator::new();

        assert!(validator
            .validate_path("/home/user/documents/file.txt")
            .is_ok());
        assert!(validator
            .validate_path("C:\\Users\\John\\Documents\\file.txt")
            .is_ok());
        assert!(validator.validate_path("relative/path/file.txt").is_ok());
    }

    #[test]
    fn test_sanitize_args() {
        let validator = CommandValidator::new();

        let args = vec![
            "normal_arg".to_string(),
            "arg|with|pipes".to_string(),
            "arg;with;semicolons".to_string(),
            "arg>with>redirects".to_string(),
        ];

        let sanitized = validator.sanitize_args(&args);

        assert_eq!(sanitized[0], "normal_arg");
        assert_eq!(sanitized[1], "argwithpipes");
        assert_eq!(sanitized[2], "argwithsemicolons");
        assert_eq!(sanitized[3], "argwithredirects");
    }

    #[test]
    fn test_is_command_allowed() {
        let validator = CommandValidator::new();

        assert!(validator.is_command_allowed(SafetyLevel::Safe, false));
        assert!(validator.is_command_allowed(SafetyLevel::Moderate, true));
        assert!(!validator.is_command_allowed(SafetyLevel::Moderate, false));
        assert!(validator.is_command_allowed(SafetyLevel::Dangerous, true));
        assert!(!validator.is_command_allowed(SafetyLevel::Dangerous, false));
        assert!(!validator.is_command_allowed(SafetyLevel::Blocked, true));
        assert!(!validator.is_command_allowed(SafetyLevel::Blocked, false));
    }
}
