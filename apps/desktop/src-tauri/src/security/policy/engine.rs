/// Central policy engine - makes security decisions for all sensitive operations
use super::actions::*;
use super::decisions::*;
use super::scope::*;
use anyhow::Result;
use std::path::Path;

/// Context for policy evaluation
#[derive(Debug, Clone)]
pub struct PolicyContext {
    pub trust_level: TrustLevel,
    pub user_id: Option<String>,
    pub session_id: Option<String>,
}

impl Default for PolicyContext {
    fn default() -> Self {
        Self {
            trust_level: TrustLevel::Normal,
            user_id: None,
            session_id: None,
        }
    }
}

/// The central policy engine
pub struct PolicyEngine {
    scope_manager: ScopeManager,
}

impl PolicyEngine {
    pub fn new() -> Self {
        Self {
            scope_manager: ScopeManager::new(),
        }
    }

    /// Get mutable reference to scope manager for workspace management
    pub fn scope_manager_mut(&mut self) -> &mut ScopeManager {
        &mut self.scope_manager
    }

    /// Get reference to scope manager
    pub fn scope_manager(&self) -> &ScopeManager {
        &self.scope_manager
    }

    /// Evaluate a security action and return a policy decision
    pub fn evaluate(
        &self,
        action: &SecurityAction,
        context: &PolicyContext,
    ) -> Result<PolicyDecision> {
        match action {
            SecurityAction::FileRead { path, .. } => self.evaluate_file_read(path, context),
            SecurityAction::FileWrite {
                path, size_bytes, ..
            } => self.evaluate_file_write(path, *size_bytes, context),
            SecurityAction::FileDelete { path, .. } => self.evaluate_file_delete(path, context),
            SecurityAction::DirectoryCreate { path, .. } => {
                self.evaluate_directory_create(path, context)
            }
            SecurityAction::DirectoryDelete {
                path, recursive, ..
            } => self.evaluate_directory_delete(path, *recursive, context),
            SecurityAction::DirectoryList { path, .. } => {
                self.evaluate_directory_list(path, context)
            }
            SecurityAction::ShellCommand { command, cwd, .. } => {
                self.evaluate_shell_command(command, cwd, context)
            }
            SecurityAction::TerminalSpawn { cwd, .. } => self.evaluate_terminal_spawn(cwd, context),
            SecurityAction::GitOperation {
                operation,
                repository_path,
                ..
            } => self.evaluate_git_operation(operation, repository_path, context),
            SecurityAction::ScreenCapture { save_to_disk, .. } => {
                self.evaluate_screen_capture(*save_to_disk, context)
            }
            SecurityAction::InputSimulation { action_type, .. } => {
                self.evaluate_input_simulation(action_type, context)
            }
            SecurityAction::ClipboardRead => self.evaluate_clipboard_read(context),
            SecurityAction::ClipboardWrite { .. } => self.evaluate_clipboard_write(context),
            SecurityAction::DatabaseConnect { is_local, host, .. } => {
                self.evaluate_database_connect(*is_local, host, context)
            }
            SecurityAction::DatabaseQuery { query_type, .. } => {
                self.evaluate_database_query(query_type, context)
            }
            SecurityAction::NetworkRequest {
                domain,
                is_sensitive_data,
                ..
            } => self.evaluate_network_request(domain, *is_sensitive_data, context),
            SecurityAction::BrowserLaunch { .. } => self.evaluate_browser_launch(context),
            SecurityAction::BrowserNavigate { url, .. } => {
                self.evaluate_browser_navigate(url, context)
            }
            SecurityAction::CredentialRead { service, .. } => {
                self.evaluate_credential_read(service, context)
            }
            SecurityAction::CredentialWrite { service, .. } => {
                self.evaluate_credential_write(service, context)
            }
        }
    }

    // File system evaluations

    fn evaluate_file_read(&self, path: &Path, context: &PolicyContext) -> Result<PolicyDecision> {
        match self.scope_manager.check_path_scope(path, false)? {
            PathScopeResult::InWorkspace { .. } => Ok(PolicyDecision::Allow {
                reason: Some("Reading file in workspace".to_string()),
            }),
            PathScopeResult::InUserHome { .. } => {
                if context.trust_level.is_elevated() {
                    Ok(PolicyDecision::Allow {
                        reason: Some("Reading file in user home (elevated mode)".to_string()),
                    })
                } else {
                    Ok(PolicyDecision::RequireApproval {
                        risk_level: RiskLevel::Medium,
                        reason: format!("Reading file outside workspace: {}", path.display()),
                        allow_remember: true,
                    })
                }
            }
            PathScopeResult::OutsideScope { .. } => {
                if context.trust_level.is_full_system() {
                    Ok(PolicyDecision::RequireApproval {
                        risk_level: RiskLevel::High,
                        reason: format!("Reading system file: {}", path.display()),
                        allow_remember: false,
                    })
                } else {
                    Ok(PolicyDecision::Deny {
                        reason: format!("File {} is outside workspace. Enable Full System mode to access system files.", path.display()),
                        can_elevate: true,
                    })
                }
            }
        }
    }

    fn evaluate_file_write(
        &self,
        path: &Path,
        size_bytes: Option<u64>,
        context: &PolicyContext,
    ) -> Result<PolicyDecision> {
        match self.scope_manager.check_path_scope(path, true)? {
            PathScopeResult::InWorkspace { .. } => {
                // Check file size for potential DOS
                if let Some(size) = size_bytes {
                    if size > 100_000_000 {
                        // 100 MB
                        return Ok(PolicyDecision::RequireApproval {
                            risk_level: RiskLevel::Medium,
                            reason: format!("Writing large file ({} MB)", size / 1_000_000),
                            allow_remember: false,
                        });
                    }
                }

                Ok(PolicyDecision::Allow {
                    reason: Some("Writing file in workspace".to_string()),
                })
            }
            PathScopeResult::InUserHome { .. } => {
                if context.trust_level.is_elevated() {
                    Ok(PolicyDecision::RequireApproval {
                        risk_level: RiskLevel::Medium,
                        reason: format!("Writing file outside workspace: {}", path.display()),
                        allow_remember: true,
                    })
                } else {
                    Ok(PolicyDecision::Deny {
                        reason: format!(
                            "Cannot write to {} - outside workspace. Elevate trust level to allow.",
                            path.display()
                        ),
                        can_elevate: true,
                    })
                }
            }
            PathScopeResult::OutsideScope { .. } => Ok(PolicyDecision::Deny {
                reason: format!("Cannot write to system location: {}", path.display()),
                can_elevate: false,
            }),
        }
    }

    fn evaluate_file_delete(&self, path: &Path, context: &PolicyContext) -> Result<PolicyDecision> {
        match self.scope_manager.check_path_scope(path, true)? {
            PathScopeResult::InWorkspace { .. } => {
                // Always require approval for deletion
                Ok(PolicyDecision::RequireApproval {
                    risk_level: RiskLevel::Medium,
                    reason: format!("Delete file: {}", path.display()),
                    allow_remember: false,
                })
            }
            PathScopeResult::InUserHome { .. } => {
                if context.trust_level.is_elevated() {
                    Ok(PolicyDecision::RequireApproval {
                        risk_level: RiskLevel::High,
                        reason: format!("Delete file outside workspace: {}", path.display()),
                        allow_remember: false,
                    })
                } else {
                    Ok(PolicyDecision::Deny {
                        reason: "Cannot delete files outside workspace in Normal mode".to_string(),
                        can_elevate: true,
                    })
                }
            }
            PathScopeResult::OutsideScope { .. } => Ok(PolicyDecision::Deny {
                reason: "Cannot delete system files".to_string(),
                can_elevate: false,
            }),
        }
    }

    fn evaluate_directory_create(
        &self,
        path: &Path,
        context: &PolicyContext,
    ) -> Result<PolicyDecision> {
        match self.scope_manager.check_path_scope(path, true)? {
            PathScopeResult::InWorkspace { .. } => Ok(PolicyDecision::Allow {
                reason: Some("Creating directory in workspace".to_string()),
            }),
            PathScopeResult::InUserHome { .. } => {
                if context.trust_level.is_elevated() {
                    Ok(PolicyDecision::Allow {
                        reason: Some("Creating directory in user home (elevated)".to_string()),
                    })
                } else {
                    Ok(PolicyDecision::RequireApproval {
                        risk_level: RiskLevel::Medium,
                        reason: format!("Create directory outside workspace: {}", path.display()),
                        allow_remember: true,
                    })
                }
            }
            PathScopeResult::OutsideScope { .. } => Ok(PolicyDecision::Deny {
                reason: "Cannot create directories in system locations".to_string(),
                can_elevate: false,
            }),
        }
    }

    fn evaluate_directory_delete(
        &self,
        path: &Path,
        recursive: bool,
        context: &PolicyContext,
    ) -> Result<PolicyDecision> {
        let risk = if recursive {
            RiskLevel::High
        } else {
            RiskLevel::Medium
        };

        match self.scope_manager.check_path_scope(path, true)? {
            PathScopeResult::InWorkspace { .. } => Ok(PolicyDecision::RequireApproval {
                risk_level: risk,
                reason: if recursive {
                    format!("Recursively delete directory: {}", path.display())
                } else {
                    format!("Delete directory: {}", path.display())
                },
                allow_remember: false,
            }),
            PathScopeResult::InUserHome { .. } | PathScopeResult::OutsideScope { .. } => {
                if context.trust_level.is_full_system() {
                    Ok(PolicyDecision::RequireApproval {
                        risk_level: RiskLevel::Critical,
                        reason: format!("Delete directory outside workspace: {}", path.display()),
                        allow_remember: false,
                    })
                } else {
                    Ok(PolicyDecision::Deny {
                        reason: "Cannot delete directories outside workspace".to_string(),
                        can_elevate: true,
                    })
                }
            }
        }
    }

    fn evaluate_directory_list(
        &self,
        path: &Path,
        context: &PolicyContext,
    ) -> Result<PolicyDecision> {
        match self.scope_manager.check_path_scope(path, false)? {
            PathScopeResult::InWorkspace { .. } => Ok(PolicyDecision::Allow {
                reason: Some("Listing directory in workspace".to_string()),
            }),
            PathScopeResult::InUserHome { .. } => {
                if context.trust_level.is_elevated() {
                    Ok(PolicyDecision::Allow {
                        reason: Some("Listing directory in user home".to_string()),
                    })
                } else {
                    Ok(PolicyDecision::RequireApproval {
                        risk_level: RiskLevel::Low,
                        reason: format!("List directory outside workspace: {}", path.display()),
                        allow_remember: true,
                    })
                }
            }
            PathScopeResult::OutsideScope { .. } => {
                if context.trust_level.is_full_system() {
                    Ok(PolicyDecision::Allow {
                        reason: Some("Listing system directory (full system mode)".to_string()),
                    })
                } else {
                    Ok(PolicyDecision::Deny {
                        reason: "Cannot list system directories in Normal/Elevated mode"
                            .to_string(),
                        can_elevate: true,
                    })
                }
            }
        }
    }

    // Shell and command evaluations

    fn evaluate_shell_command(
        &self,
        command: &str,
        cwd: &Path,
        context: &PolicyContext,
    ) -> Result<PolicyDecision> {
        // Check if command looks dangerous
        let dangerous_patterns = ["rm -rf /", "format ", "del /s", "deltree", "mkfs", "dd if="];

        let command_lower = command.to_lowercase();
        for pattern in &dangerous_patterns {
            if command_lower.contains(pattern) {
                return Ok(PolicyDecision::RequireApproval {
                    risk_level: RiskLevel::Critical,
                    reason: format!("Potentially destructive command: {}", command),
                    allow_remember: false,
                });
            }
        }

        // Check working directory scope
        match self.scope_manager.check_path_scope(cwd, false)? {
            PathScopeResult::InWorkspace { .. } => Ok(PolicyDecision::Allow {
                reason: Some("Running command in workspace".to_string()),
            }),
            PathScopeResult::InUserHome { .. } => {
                if context.trust_level.is_elevated() {
                    Ok(PolicyDecision::Allow {
                        reason: Some("Running command in user home (elevated)".to_string()),
                    })
                } else {
                    Ok(PolicyDecision::RequireApproval {
                        risk_level: RiskLevel::High,
                        reason: format!("Run '{}' outside workspace", command),
                        allow_remember: false,
                    })
                }
            }
            PathScopeResult::OutsideScope { .. } => {
                if context.trust_level.is_full_system() {
                    Ok(PolicyDecision::RequireApproval {
                        risk_level: RiskLevel::Critical,
                        reason: format!("Run '{}' in system directory", command),
                        allow_remember: false,
                    })
                } else {
                    Ok(PolicyDecision::Deny {
                        reason: "Cannot run commands in system directories".to_string(),
                        can_elevate: true,
                    })
                }
            }
        }
    }

    fn evaluate_terminal_spawn(
        &self,
        cwd: &Path,
        context: &PolicyContext,
    ) -> Result<PolicyDecision> {
        match self.scope_manager.check_path_scope(cwd, false)? {
            PathScopeResult::InWorkspace { .. } => Ok(PolicyDecision::Allow {
                reason: Some("Spawning terminal in workspace".to_string()),
            }),
            PathScopeResult::InUserHome { .. } => {
                if context.trust_level.is_elevated() {
                    Ok(PolicyDecision::Allow {
                        reason: Some("Spawning terminal in user home".to_string()),
                    })
                } else {
                    Ok(PolicyDecision::RequireApproval {
                        risk_level: RiskLevel::Medium,
                        reason: format!("Spawn terminal outside workspace: {}", cwd.display()),
                        allow_remember: true,
                    })
                }
            }
            PathScopeResult::OutsideScope { .. } => Ok(PolicyDecision::Deny {
                reason: "Cannot spawn terminal in system directories".to_string(),
                can_elevate: true,
            }),
        }
    }

    fn evaluate_git_operation(
        &self,
        operation: &GitOperationType,
        repo_path: &Path,
        context: &PolicyContext,
    ) -> Result<PolicyDecision> {
        // Git operations that modify remote state are more sensitive
        let is_remote_write = matches!(operation, GitOperationType::Push);

        if is_remote_write {
            return Ok(PolicyDecision::RequireApproval {
                risk_level: RiskLevel::High,
                reason: format!("Git {:?} - pushes to remote repository", operation),
                allow_remember: true,
            });
        }

        // Check repository path scope
        match self.scope_manager.check_path_scope(repo_path, false)? {
            PathScopeResult::InWorkspace { .. } => Ok(PolicyDecision::Allow {
                reason: Some(format!("Git {:?} in workspace", operation)),
            }),
            _ => {
                if context.trust_level.is_elevated() {
                    Ok(PolicyDecision::Allow {
                        reason: Some(format!("Git {:?} (elevated mode)", operation)),
                    })
                } else {
                    Ok(PolicyDecision::RequireApproval {
                        risk_level: RiskLevel::Medium,
                        reason: format!("Git {:?} outside workspace", operation),
                        allow_remember: true,
                    })
                }
            }
        }
    }

    // Automation evaluations

    fn evaluate_screen_capture(
        &self,
        save_to_disk: bool,
        context: &PolicyContext,
    ) -> Result<PolicyDecision> {
        if context.trust_level.is_full_system() {
            Ok(PolicyDecision::Allow {
                reason: Some("Screen capture in full system mode".to_string()),
            })
        } else {
            Ok(PolicyDecision::RequireApproval {
                risk_level: if save_to_disk {
                    RiskLevel::Medium
                } else {
                    RiskLevel::Low
                },
                reason: "Capture screenshot".to_string(),
                allow_remember: true,
            })
        }
    }

    fn evaluate_input_simulation(
        &self,
        _action_type: &InputActionType,
        context: &PolicyContext,
    ) -> Result<PolicyDecision> {
        if context.trust_level.is_full_system() {
            Ok(PolicyDecision::Allow {
                reason: Some("Input simulation in full system mode".to_string()),
            })
        } else {
            Ok(PolicyDecision::RequireApproval {
                risk_level: RiskLevel::Medium,
                reason: "Simulate keyboard/mouse input".to_string(),
                allow_remember: true,
            })
        }
    }

    fn evaluate_clipboard_read(&self, context: &PolicyContext) -> Result<PolicyDecision> {
        if context.trust_level.is_elevated() {
            Ok(PolicyDecision::Allow {
                reason: Some("Clipboard read (elevated mode)".to_string()),
            })
        } else {
            Ok(PolicyDecision::RequireApproval {
                risk_level: RiskLevel::Medium,
                reason: "Read clipboard contents".to_string(),
                allow_remember: true,
            })
        }
    }

    fn evaluate_clipboard_write(&self, _context: &PolicyContext) -> Result<PolicyDecision> {
        Ok(PolicyDecision::Allow {
            reason: Some("Clipboard write is low-risk".to_string()),
        })
    }

    // Database evaluations

    fn evaluate_database_connect(
        &self,
        is_local: bool,
        host: &str,
        context: &PolicyContext,
    ) -> Result<PolicyDecision> {
        if is_local || host == "localhost" || host == "127.0.0.1" {
            Ok(PolicyDecision::Allow {
                reason: Some("Connecting to local database".to_string()),
            })
        } else if context.trust_level.is_elevated() {
            Ok(PolicyDecision::RequireApproval {
                risk_level: RiskLevel::High,
                reason: format!("Connect to external database: {}", host),
                allow_remember: true,
            })
        } else {
            Ok(PolicyDecision::Deny {
                reason: "Cannot connect to external databases in Normal mode".to_string(),
                can_elevate: true,
            })
        }
    }

    fn evaluate_database_query(
        &self,
        query_type: &QueryType,
        _context: &PolicyContext,
    ) -> Result<PolicyDecision> {
        match query_type {
            QueryType::Select => Ok(PolicyDecision::Allow {
                reason: Some("Read-only database query".to_string()),
            }),
            QueryType::Insert | QueryType::Update => Ok(PolicyDecision::Allow {
                reason: Some("Database modification".to_string()),
            }),
            QueryType::Delete | QueryType::Drop | QueryType::Alter => {
                Ok(PolicyDecision::RequireApproval {
                    risk_level: RiskLevel::High,
                    reason: format!("Destructive database operation: {:?}", query_type),
                    allow_remember: false,
                })
            }
            QueryType::Create => Ok(PolicyDecision::Allow {
                reason: Some("Database schema creation".to_string()),
            }),
        }
    }

    // Network evaluations

    fn evaluate_network_request(
        &self,
        domain: &str,
        is_sensitive_data: bool,
        context: &PolicyContext,
    ) -> Result<PolicyDecision> {
        // Known safe domains
        let safe_domains = [
            "api.openai.com",
            "api.anthropic.com",
            "github.com",
            "api.github.com",
        ];

        if safe_domains.iter().any(|d| domain.contains(d)) {
            return Ok(PolicyDecision::Allow {
                reason: Some("Request to known safe API".to_string()),
            });
        }

        if is_sensitive_data {
            if context.trust_level.is_elevated() {
                Ok(PolicyDecision::RequireApproval {
                    risk_level: RiskLevel::High,
                    reason: format!("Sending sensitive data to {}", domain),
                    allow_remember: false,
                })
            } else {
                Ok(PolicyDecision::Deny {
                    reason: "Cannot send sensitive data to external domains in Normal mode"
                        .to_string(),
                    can_elevate: true,
                })
            }
        } else {
            Ok(PolicyDecision::Allow {
                reason: Some("Non-sensitive network request".to_string()),
            })
        }
    }

    // Browser evaluations

    fn evaluate_browser_launch(&self, _context: &PolicyContext) -> Result<PolicyDecision> {
        Ok(PolicyDecision::Allow {
            reason: Some("Browser launch is safe".to_string()),
        })
    }

    fn evaluate_browser_navigate(
        &self,
        url: &str,
        context: &PolicyContext,
    ) -> Result<PolicyDecision> {
        // Check for suspicious URLs
        let suspicious_tlds = [".onion", ".tk", ".ml"];
        if suspicious_tlds.iter().any(|tld| url.contains(tld)) {
            return Ok(PolicyDecision::RequireApproval {
                risk_level: RiskLevel::High,
                reason: format!("Navigate to suspicious URL: {}", url),
                allow_remember: false,
            });
        }

        if context.trust_level.is_elevated() {
            Ok(PolicyDecision::Allow {
                reason: Some("Browser navigation (elevated mode)".to_string()),
            })
        } else {
            Ok(PolicyDecision::Allow {
                reason: Some("Browser navigation".to_string()),
            })
        }
    }

    // Credential evaluations

    fn evaluate_credential_read(
        &self,
        _service: &str,
        context: &PolicyContext,
    ) -> Result<PolicyDecision> {
        if context.trust_level.is_elevated() {
            Ok(PolicyDecision::Allow {
                reason: Some("Reading credentials (elevated mode)".to_string()),
            })
        } else {
            Ok(PolicyDecision::RequireApproval {
                risk_level: RiskLevel::High,
                reason: "Access stored credentials".to_string(),
                allow_remember: true,
            })
        }
    }

    fn evaluate_credential_write(
        &self,
        _service: &str,
        _context: &PolicyContext,
    ) -> Result<PolicyDecision> {
        Ok(PolicyDecision::Allow {
            reason: Some("Storing credentials securely".to_string()),
        })
    }
}

impl Default for PolicyEngine {
    fn default() -> Self {
        Self::new()
    }
}
