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
mod secret_scrubbing_tests {
    use crate::features::terminal::session_manager::scrub_secrets;

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
