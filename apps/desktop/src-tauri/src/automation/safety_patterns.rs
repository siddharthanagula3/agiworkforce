//! Shared dangerous-pattern definitions used by both `safety.rs` (ComputerUseSafety)
//! and `computer_use/safety.rs` (ComputerUseSafetyLayer).
//!
//! This module is the single source of truth for command/text patterns that are
//! considered dangerous in automation contexts.

use regex::Regex;
use std::sync::OnceLock;

/// Dangerous text/command patterns that should be blocked or flagged.
///
/// This is the canonical union of patterns previously defined in
/// `automation::safety` and `automation::computer_use::safety`.
static DANGEROUS_COMMAND_PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();

/// Dangerous keyboard shortcuts that should be blocked.
static DANGEROUS_KEY_COMBOS: OnceLock<Vec<String>> = OnceLock::new();

/// Returns the shared set of dangerous command/text regex patterns.
///
/// The list is initialised once and cached for the lifetime of the process.
pub fn dangerous_command_patterns() -> &'static Vec<Regex> {
    DANGEROUS_COMMAND_PATTERNS.get_or_init(|| {
        vec![
            // Destructive file-system commands
            Regex::new(r"(?i)rm\s+-(?:rf|fr)")
                .expect("safety pattern regex: rm -rf destructive removal"),
            Regex::new(r"(?i)format\s+[a-z]:")
                .expect("safety pattern regex: format drive"),
            Regex::new(r"(?i)del\s+/[fqs]")
                .expect("safety pattern regex: del /f forced delete"),
            Regex::new(r"(?i)\bdeltree\b")
                .expect("safety pattern regex: deltree recursive delete"),
            Regex::new(r"(?i)mkfs")
                .expect("safety pattern regex: mkfs filesystem creation"),
            // Sensitive system paths
            Regex::new(r"(?i)system32")
                .expect("safety pattern regex: system32 path"),
            Regex::new(r"(?i)/etc/passwd")
                .expect("safety pattern regex: /etc/passwd"),
            Regex::new(r"(?i)~/.ssh")
                .expect("safety pattern regex: ~/.ssh directory"),
            // Sensitive data keywords
            Regex::new(r"(?i)password|passwd|credential|api[_-]?key|secret|token")
                .expect("safety pattern regex: sensitive data keywords"),
            // Registry manipulation (Windows)
            Regex::new(r"(?i)regedit|reg\s+delete|reg\s+add")
                .expect("safety pattern regex: Windows registry manipulation"),
            // Privileged destructive commands
            Regex::new(r"(?i)sudo\s+rm|sudo\s+dd")
                .expect("safety pattern regex: sudo destructive commands"),
        ]
    })
}

/// Returns the shared set of dangerous key combinations.
pub fn dangerous_key_combinations() -> &'static Vec<String> {
    DANGEROUS_KEY_COMBOS.get_or_init(|| {
        vec![
            "Alt+F4".to_string(),
            "Ctrl+Alt+Del".to_string(),
            "Win+L".to_string(),
        ]
    })
}

/// Dangerous task-level keywords checked against full task descriptions.
pub const DANGEROUS_TASK_KEYWORDS: &[&str] = &[
    "delete system",
    "format drive",
    "remove windows",
    "steal",
    "hack",
    "crack password",
    "bypass security",
    "disable firewall",
    "disable antivirus",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dangerous_command_patterns_initialise() {
        let patterns = dangerous_command_patterns();
        // Must contain at least the patterns that were in both modules
        assert!(
            patterns.len() >= 9,
            "expected at least 9 patterns, got {}",
            patterns.len()
        );

        // Spot-check a few
        assert!(patterns.iter().any(|p| p.is_match("rm -rf /")));
        assert!(patterns.iter().any(|p| p.is_match("format c:")));
        assert!(patterns.iter().any(|p| p.is_match("del /f /s")));
        assert!(patterns.iter().any(|p| p.is_match("sudo rm -rf /")));
        assert!(patterns.iter().any(|p| p.is_match("/etc/passwd")));
        assert!(patterns.iter().any(|p| p.is_match("~/.ssh")));
    }

    #[test]
    fn test_dangerous_key_combinations() {
        let keys = dangerous_key_combinations();
        assert!(keys.contains(&"Alt+F4".to_string()));
        assert!(keys.contains(&"Ctrl+Alt+Del".to_string()));
        assert!(keys.contains(&"Win+L".to_string()));
    }

    #[test]
    fn test_safe_text_not_flagged() {
        let patterns = dangerous_command_patterns();
        let safe_texts = vec!["Hello world", "npm install", "cargo build", "git push"];
        for text in safe_texts {
            assert!(
                !patterns.iter().any(|p| p.is_match(text)),
                "Safe text '{}' was incorrectly flagged",
                text
            );
        }
    }

    // -------------------------------------------------------------------------
    // Helper: returns true if ANY dangerous pattern matches the given text.
    // -------------------------------------------------------------------------
    fn any_dangerous(text: &str) -> bool {
        dangerous_command_patterns()
            .iter()
            .any(|p| p.is_match(text))
    }

    // =========================================================================
    // Pattern 1: rm -rf  (destructive filesystem removal)
    // =========================================================================

    #[test]
    fn test_rm_rf_malicious_variants() {
        // Standard Unix recursive force removal
        assert!(
            any_dangerous("rm -rf /home/user"),
            "rm -rf should be flagged"
        );
        // Flags in different order
        assert!(
            any_dangerous("rm -fr /tmp/data"),
            "rm -fr should be flagged"
        );
        // Uppercase (case-insensitive)
        assert!(
            any_dangerous("RM -RF /"),
            "RM -RF should be flagged (case insensitive)"
        );
    }

    #[test]
    fn test_rm_rf_benign_not_flagged() {
        // "rm" alone without -rf flags is not matched
        assert!(
            !any_dangerous("rm file.txt"),
            "plain rm should not be flagged"
        );
    }

    // =========================================================================
    // Pattern 2: format <drive>:  (Windows drive format)
    // =========================================================================

    #[test]
    fn test_format_drive_malicious_variants() {
        assert!(any_dangerous("format c:"), "format c: should be flagged");
        assert!(
            any_dangerous("format D:"),
            "format D: should be flagged (upper drive letter)"
        );
        // Case-insensitive on the command itself
        assert!(
            any_dangerous("FORMAT c:"),
            "FORMAT c: should be flagged (case insensitive)"
        );
    }

    #[test]
    fn test_format_drive_benign_not_flagged() {
        // "format" without a Windows drive letter is not matched
        assert!(
            !any_dangerous("format --help"),
            "format --help should not be flagged"
        );
        assert!(
            !any_dangerous("printf 'format your thoughts'"),
            "unrelated format string should not be flagged"
        );
    }

    // =========================================================================
    // Pattern 3: del /f|/q|/s  (Windows forced/quiet/recursive delete)
    // =========================================================================

    #[test]
    fn test_del_slash_flag_malicious_variants() {
        assert!(
            any_dangerous("del /f important.dll"),
            "del /f should be flagged"
        );
        assert!(any_dangerous("del /q log.txt"), "del /q should be flagged");
        assert!(any_dangerous("del /s *.tmp"), "del /s should be flagged");
    }

    #[test]
    fn test_del_slash_flag_benign_not_flagged() {
        // "del" alone (no dangerous flag) is not matched
        assert!(
            !any_dangerous("del myfile.txt"),
            "del without flags should not be flagged"
        );
    }

    // =========================================================================
    // Pattern 4: deltree  (Windows recursive directory deletion)
    // =========================================================================

    #[test]
    fn test_deltree_malicious_variants() {
        assert!(
            any_dangerous("deltree C:\\Windows"),
            "deltree should be flagged"
        );
        assert!(
            any_dangerous("DELTREE /Y C:\\Users"),
            "DELTREE should be flagged (case insensitive)"
        );
        assert!(
            any_dangerous("deltree mydir"),
            "deltree with any arg should be flagged"
        );
    }

    #[test]
    fn test_deltree_benign_not_flagged() {
        // A word that merely contains "deltree" as a substring is still matched
        // by the pattern; the benign check is for entirely unrelated commands.
        assert!(!any_dangerous("ls /tmp"), "ls should not be flagged");
        assert!(
            !any_dangerous("cat deltree_notes.md"),
            "file name with deltree prefix may vary — just ensure unrelated commands are clean"
        );
    }

    // =========================================================================
    // Pattern 5: mkfs  (Linux filesystem creation / format)
    // =========================================================================

    #[test]
    fn test_mkfs_malicious_variants() {
        assert!(
            any_dangerous("mkfs.ext4 /dev/sda1"),
            "mkfs.ext4 should be flagged"
        );
        assert!(
            any_dangerous("mkfs /dev/sdb"),
            "plain mkfs should be flagged"
        );
        assert!(
            any_dangerous("MKFS.FAT /dev/sdc1"),
            "MKFS.FAT should be flagged (case insensitive)"
        );
    }

    #[test]
    fn test_mkfs_benign_not_flagged() {
        assert!(
            !any_dangerous("mkdir /home/user/projects"),
            "mkdir should not be flagged"
        );
        assert!(!any_dangerous("mktemp -d"), "mktemp should not be flagged");
    }

    // =========================================================================
    // Pattern 6: system32  (Windows system directory reference)
    // =========================================================================

    #[test]
    fn test_system32_malicious_variants() {
        assert!(
            any_dangerous("del C:\\Windows\\system32\\kernel32.dll"),
            "system32 path should be flagged"
        );
        assert!(
            any_dangerous("cd %windir%\\System32"),
            "System32 (mixed case) should be flagged"
        );
        assert!(
            any_dangerous("SYSTEM32 is the target"),
            "SYSTEM32 uppercase should be flagged"
        );
    }

    #[test]
    fn test_system32_benign_not_flagged() {
        // Commands that don't mention system32 are safe
        assert!(
            !any_dangerous("cd C:\\Users\\me\\Documents"),
            "normal Windows path should not be flagged"
        );
    }

    // =========================================================================
    // Pattern 7: /etc/passwd  (sensitive Unix credentials file)
    // =========================================================================

    #[test]
    fn test_etc_passwd_malicious_variants() {
        assert!(
            any_dangerous("cat /etc/passwd"),
            "reading /etc/passwd should be flagged"
        );
        assert!(
            any_dangerous("curl localhost/../etc/passwd"),
            "path traversal to /etc/passwd should be flagged"
        );
        assert!(
            any_dangerous("/ETC/PASSWD"),
            "/ETC/PASSWD uppercase should be flagged (case insensitive)"
        );
    }

    #[test]
    fn test_etc_passwd_benign_not_flagged() {
        assert!(
            !any_dangerous("cat /etc/hosts"),
            "/etc/hosts should not be flagged"
        );
        assert!(
            !any_dangerous("ls /etc/"),
            "/etc/ directory listing should not be flagged"
        );
    }

    // =========================================================================
    // Pattern 8: ~/.ssh  (private SSH key directory)
    // =========================================================================

    #[test]
    fn test_ssh_dir_malicious_variants() {
        assert!(
            any_dangerous("cat ~/.ssh/id_rsa"),
            "reading ssh private key should be flagged"
        );
        assert!(
            any_dangerous("cp ~/.ssh/config /tmp"),
            "copying .ssh config should be flagged"
        );
        assert!(
            any_dangerous("~/.SSH/authorized_keys"),
            "~/.SSH uppercase should be flagged (case insensitive)"
        );
    }

    #[test]
    fn test_ssh_dir_benign_not_flagged() {
        assert!(
            !any_dangerous("ssh user@host"),
            "plain ssh command should not be flagged"
        );
        assert!(
            !any_dangerous("ssh-keygen -t ed25519"),
            "ssh-keygen should not be flagged"
        );
    }

    // =========================================================================
    // Pattern 9: sensitive data keywords
    //   (password|passwd|credential|api_key|api-key|apikey|secret|token)
    // =========================================================================

    #[test]
    fn test_sensitive_keywords_malicious_variants() {
        assert!(
            any_dangerous("echo $PASSWORD"),
            "PASSWORD env var reference should be flagged"
        );
        assert!(
            any_dangerous("print(api_key)"),
            "api_key reference should be flagged"
        );
        assert!(
            any_dangerous("store_secret('abc123')"),
            "store_secret call should be flagged"
        );
    }

    #[test]
    fn test_sensitive_keywords_benign_not_flagged() {
        // These do NOT contain any of the sensitive keywords
        assert!(!any_dangerous("ls -la"), "ls -la should not be flagged");
        assert!(
            !any_dangerous("git status"),
            "git status should not be flagged"
        );
        assert!(
            !any_dangerous("cat file.txt"),
            "cat file.txt should not be flagged"
        );
    }

    // =========================================================================
    // Pattern 10: registry manipulation (regedit|reg delete|reg add)
    // =========================================================================

    #[test]
    fn test_registry_malicious_variants() {
        assert!(
            any_dangerous("regedit /s payload.reg"),
            "regedit should be flagged"
        );
        assert!(
            any_dangerous("reg delete HKLM\\Software\\App"),
            "reg delete should be flagged"
        );
        assert!(
            any_dangerous("REG ADD HKCU\\Run /v mal /d mal.exe"),
            "REG ADD should be flagged (case insensitive)"
        );
    }

    #[test]
    fn test_registry_benign_not_flagged() {
        // "reg" alone (e.g. as part of a file name) should not trip the pattern
        // The pattern requires "reg\s+delete" or "reg\s+add" so plain "reg" is fine.
        assert!(
            !any_dangerous("grep -r foo ."),
            "grep -r should not be flagged"
        );
        assert!(
            !any_dangerous("cd /var/log"),
            "cd command should not be flagged"
        );
    }

    // =========================================================================
    // Pattern 11: privileged destructive commands (sudo rm|sudo dd)
    // =========================================================================

    #[test]
    fn test_sudo_destructive_malicious_variants() {
        assert!(
            any_dangerous("sudo rm -rf /var/www"),
            "sudo rm should be flagged"
        );
        assert!(
            any_dangerous("sudo dd if=/dev/zero of=/dev/sda"),
            "sudo dd should be flagged"
        );
        assert!(
            any_dangerous("SUDO RM important_file"),
            "SUDO RM should be flagged (case insensitive)"
        );
    }

    #[test]
    fn test_sudo_destructive_benign_not_flagged() {
        assert!(
            !any_dangerous("sudo apt-get update"),
            "sudo apt-get should not be flagged"
        );
        assert!(
            !any_dangerous("sudo systemctl restart nginx"),
            "sudo systemctl should not be flagged"
        );
    }

    // =========================================================================
    // Case-insensitivity explicit checks for rm, format, and delete patterns
    // =========================================================================

    #[test]
    fn test_case_insensitivity_rm() {
        assert!(
            any_dangerous("RM -RF /tmp"),
            "RM -RF uppercase should match"
        );
        assert!(
            any_dangerous("Rm -Rf /tmp"),
            "Rm -Rf mixed case should match"
        );
        assert!(
            any_dangerous("rM -rF /tmp"),
            "rM -rF mixed case should match"
        );
    }

    #[test]
    fn test_case_insensitivity_format() {
        assert!(
            any_dangerous("Format C:"),
            "Format C: title case should match"
        );
        assert!(
            any_dangerous("FORMAT D:"),
            "FORMAT D: all-caps should match"
        );
        assert!(any_dangerous("fOrMaT e:"), "fOrMaT mixed case should match");
    }

    #[test]
    fn test_case_insensitivity_del() {
        assert!(
            any_dangerous("DEL /F file.txt"),
            "DEL /F uppercase should match"
        );
        assert!(
            any_dangerous("Del /Q file.txt"),
            "Del /Q title case should match"
        );
        assert!(
            any_dangerous("dEl /S *.log"),
            "dEl /S mixed case should match"
        );
    }

    // =========================================================================
    // Common safe shell commands — none should trigger any pattern
    // =========================================================================

    #[test]
    fn test_common_safe_commands_not_flagged() {
        let safe_commands = vec![
            "ls",
            "ls -la",
            "ls /home/user",
            "cat file.txt",
            "cat /var/log/syslog",
            "git status",
            "git diff HEAD",
            "git log --oneline",
            "echo hello world",
            "pwd",
            "cd /tmp",
            "mkdir new_dir",
            "cp source.txt dest.txt",
            "mv old.txt new.txt",
            "touch newfile.txt",
            "chmod 755 script.sh",
            "chown user:group file.txt",
            "ps aux",
            "top",
            "df -h",
            "du -sh /home",
            "find /tmp -name '*.log'",
            "grep 'error' /var/log/app.log",
            "curl https://example.com",
            "wget https://example.com/file.tar.gz",
            "tar -xzf archive.tar.gz",
            "unzip package.zip",
            "npm install",
            "npm run build",
            "cargo build --release",
            "pnpm test",
            "python3 script.py",
            "node server.js",
        ];

        for cmd in safe_commands {
            assert!(
                !any_dangerous(cmd),
                "Safe command '{}' was incorrectly flagged as dangerous",
                cmd
            );
        }
    }
}
