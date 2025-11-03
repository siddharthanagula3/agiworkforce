#[cfg(test)]
mod tests {
    use super::super::*;

    #[test]
    fn test_shell_detection() {
        let shells = detect_available_shells();
        // At least one shell should be available (CMD on Windows)
        assert!(!shells.is_empty());

        // Check that all detected shells have valid paths
        for shell in &shells {
            assert!(shell.available);
            assert!(!shell.path.is_empty());
        }
    }

    #[test]
    fn test_default_shell() {
        let default = get_default_shell();
        // Should return either PowerShell or Cmd
        assert!(matches!(default, ShellType::PowerShell | ShellType::Cmd));
    }

    #[test]
    fn test_shell_type_serialization() {
        let shell = ShellType::PowerShell;
        let json = serde_json::to_string(&shell).unwrap();
        assert_eq!(json, r#""powershell""#);

        let deserialized: ShellType = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, ShellType::PowerShell);
    }

    #[test]
    fn test_cmd_shell_serialization() {
        let shell = ShellType::Cmd;
        let json = serde_json::to_string(&shell).unwrap();
        assert_eq!(json, r#""cmd""#);
    }

    #[test]
    fn test_wsl_shell_serialization() {
        let shell = ShellType::Wsl;
        let json = serde_json::to_string(&shell).unwrap();
        assert_eq!(json, r#""wsl""#);
    }

    #[test]
    fn test_gitbash_shell_serialization() {
        let shell = ShellType::GitBash;
        let json = serde_json::to_string(&shell).unwrap();
        assert_eq!(json, r#""gitbash""#);
    }
}
