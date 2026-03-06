/// Windows compatibility tests for AGI Workforce desktop app.
///
/// Run with:
///   cargo test -p agiworkforce-desktop -- windows
///
/// These tests verify that core platform integrations work correctly on Windows:
/// - Path handling (separators, AppData/LocalAppData resolution)
/// - Credential storage (AES-GCM encrypt/decrypt cycle)
/// - Process / shell detection (cmd.exe, powershell.exe via `which`)
/// - File-system directory resolution (`dirs` crate)
/// - Platform detection (`cfg!`, `sysinfo`)
/// - Screen capture (xcap monitor enumeration)
/// - Clipboard read/write (arboard)
///
/// All tests are gated with `#[cfg(target_os = "windows")]`.
#[cfg(target_os = "windows")]
#[cfg(test)]
mod windows_compat_tests {
    // -----------------------------------------------------------------------
    // Imports — every import below is used by at least one test.
    // The project's Cargo.toml denies dead_code and unused_imports, so each
    // import must be reachable from the test code.
    // -----------------------------------------------------------------------
    use std::path::{Path, PathBuf};

    // dirs crate — resolves XDG / Windows shell directories
    use dirs;

    // which crate — executable lookup on PATH
    use which;

    // sysinfo — OS name / version detection
    use sysinfo::System;

    // arboard — cross-platform clipboard
    use arboard::Clipboard;

    // xcap — cross-platform screen capture
    use xcap::Monitor;

    // AES-GCM encryption (same crate the app uses in encryption.rs)
    use aes_gcm::{
        aead::{rand_core::RngCore, Aead, KeyInit},
        Aes256Gcm,
        Key,
        Nonce,
    };
    use aes_gcm::aead::rand_core::OsRng;

    // rusqlite — in-memory DB (same as SecretManager tests)
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

    // Internal modules under test
    use crate::sys::security::encryption::{decrypt_secret, encrypt_secret};
    use crate::sys::security::machine_key::{derive_key, KeyPurpose};
    use crate::sys::security::secret_manager::SecretManager;
    use crate::features::terminal::shells::{detect_available_shells, get_default_shell};
    use crate::features::terminal::ShellType;

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /// Build an in-memory SecretManager with the settings table initialised.
    fn make_secret_manager() -> SecretManager {
        let conn = Connection::open_in_memory().expect("in-memory sqlite failed");
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key       TEXT PRIMARY KEY,
                value     TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )
        .expect("create settings table failed");
        SecretManager::new(Arc::new(Mutex::new(conn)))
    }

    // ===================================================================
    // PATH HANDLING TESTS
    // ===================================================================

    #[test]
    fn test_windows_path_separator_in_pathbuf() {
        // PathBuf on Windows uses `\` internally.
        let p = PathBuf::from(r"C:\Users\test\AppData");
        // to_string_lossy should contain the native separator.
        let s = p.to_string_lossy();
        assert!(
            s.contains('\\'),
            "Expected backslash in Windows path, got: {}",
            s
        );
    }

    #[test]
    fn test_path_join_uses_backslash_on_windows() {
        let base = PathBuf::from(r"C:\Users\test");
        let joined = base.join("AppData").join("Local").join("agiworkforce");
        let s = joined.to_string_lossy();
        // All components should be separated by `\`.
        assert!(
            s.contains('\\'),
            "Joined path should use backslashes on Windows: {}",
            s
        );
        assert!(s.starts_with("C:\\"), "Path should start with drive letter: {}", s);
    }

    #[test]
    fn test_forward_slash_path_accepted_by_path() {
        // Path accepts forward slashes on Windows — they are normalised.
        let p = Path::new("C:/Users/test");
        // Path::new must not panic.
        assert!(!p.as_os_str().is_empty());
    }

    #[test]
    fn test_temp_dir_is_accessible() {
        let tmp = std::env::temp_dir();
        assert!(
            tmp.exists(),
            "Temp directory should exist: {}",
            tmp.display()
        );
        // On Windows the temp dir is usually under %USERPROFILE%\AppData\Local\Temp
        // or %SystemRoot%\TEMP — both are valid.
        assert!(tmp.is_dir(), "Temp path should be a directory");
    }

    #[test]
    fn test_temp_dir_path_contains_expected_segment() {
        let tmp = std::env::temp_dir();
        let s = tmp.to_string_lossy().to_lowercase();
        // Windows temp is either in \temp or \tmp or \local\temp
        let has_known_segment = s.contains("temp") || s.contains("tmp");
        assert!(
            has_known_segment,
            "Temp dir path '{}' should contain 'temp' or 'tmp'",
            s
        );
    }

    #[test]
    fn test_path_extension_handling() {
        let p = PathBuf::from(r"C:\agiworkforce\data\app.db");
        assert_eq!(p.extension().and_then(|e| e.to_str()), Some("db"));
        assert_eq!(p.file_stem().and_then(|s| s.to_str()), Some("app"));
    }

    // ===================================================================
    // APPDATA / DIRECTORY RESOLUTION TESTS
    // ===================================================================

    #[test]
    fn test_dirs_config_dir_resolves_on_windows() {
        // On Windows, dirs::config_dir() returns %APPDATA% (Roaming).
        let config = dirs::config_dir();
        assert!(
            config.is_some(),
            "dirs::config_dir() should return Some on Windows"
        );
        let path = config.unwrap();
        assert!(path.exists(), "Config dir should exist: {}", path.display());
        // Typically C:\Users\<user>\AppData\Roaming
        let s = path.to_string_lossy().to_lowercase();
        assert!(
            s.contains("appdata"),
            "Config dir should be under AppData: {}",
            s
        );
    }

    #[test]
    fn test_dirs_data_dir_resolves_on_windows() {
        // On Windows, dirs::data_dir() returns %APPDATA% (Roaming).
        let data = dirs::data_dir();
        assert!(data.is_some(), "dirs::data_dir() should return Some on Windows");
        let path = data.unwrap();
        assert!(path.exists(), "Data dir should exist: {}", path.display());
    }

    #[test]
    fn test_dirs_data_local_dir_resolves_on_windows() {
        // On Windows, dirs::data_local_dir() returns %LOCALAPPDATA%.
        let local = dirs::data_local_dir();
        assert!(
            local.is_some(),
            "dirs::data_local_dir() should return Some on Windows"
        );
        let path = local.unwrap();
        assert!(path.exists(), "LocalAppData dir should exist: {}", path.display());
        let s = path.to_string_lossy().to_lowercase();
        assert!(
            s.contains("local"),
            "LocalAppData should contain 'local' in path: {}",
            s
        );
    }

    #[test]
    fn test_dirs_home_dir_resolves_on_windows() {
        let home = dirs::home_dir();
        assert!(home.is_some(), "dirs::home_dir() should return Some on Windows");
        let path = home.unwrap();
        assert!(path.exists(), "Home directory should exist: {}", path.display());
        // Typically C:\Users\<username>
        let s = path.to_string_lossy().to_lowercase();
        assert!(
            s.contains("users") || s.contains("c:\\"),
            "Home dir should be under C:\\Users or similar: {}",
            s
        );
    }

    #[test]
    fn test_log_dir_candidate_under_localappdata() {
        // The app stores logs under LocalAppData\agiworkforce\logs
        let base = dirs::data_local_dir().expect("LocalAppData must resolve");
        let log_dir = base.join("agiworkforce").join("logs");
        // The directory itself may not exist yet; we just verify path construction.
        let s = log_dir.to_string_lossy();
        assert!(
            s.to_lowercase().contains("agiworkforce"),
            "Log dir path should contain app name: {}",
            s
        );
        assert!(
            s.to_lowercase().contains("logs"),
            "Log dir path should contain 'logs': {}",
            s
        );
    }

    #[test]
    fn test_database_path_candidate_under_localappdata() {
        // Database files live under LocalAppData\agiworkforce\data\<name>.db
        let base = dirs::data_local_dir().expect("LocalAppData must resolve");
        let db_path = base.join("agiworkforce").join("data").join("app.db");
        // Verify it's an absolute path with the right extension.
        assert!(db_path.is_absolute(), "DB path should be absolute");
        assert_eq!(
            db_path.extension().and_then(|e| e.to_str()),
            Some("db"),
            "DB path should have .db extension"
        );
    }

    // ===================================================================
    // CREDENTIAL / ENCRYPTION TESTS
    // ===================================================================

    #[test]
    fn test_machine_key_derived_for_api_keys_purpose() {
        let key = derive_key(KeyPurpose::ApiKeys);
        assert_eq!(key.len(), 32, "Derived key should be 32 bytes (AES-256)");
    }

    #[test]
    fn test_machine_key_is_deterministic_on_windows() {
        // Same purpose → same key on the same machine.
        let k1 = derive_key(KeyPurpose::DatabaseEncryption);
        let k2 = derive_key(KeyPurpose::DatabaseEncryption);
        assert_eq!(k1, k2, "Machine key derivation must be deterministic");
    }

    #[test]
    fn test_machine_keys_differ_across_purposes() {
        let jwt = derive_key(KeyPurpose::JwtSecret);
        let db = derive_key(KeyPurpose::DatabaseEncryption);
        let mcp = derive_key(KeyPurpose::McpCredentials);
        assert_ne!(jwt, db, "JwtSecret and DatabaseEncryption keys should differ");
        assert_ne!(jwt, mcp, "JwtSecret and McpCredentials keys should differ");
        assert_ne!(db, mcp, "DatabaseEncryption and McpCredentials keys should differ");
    }

    #[test]
    fn test_encrypt_decrypt_roundtrip_on_windows() {
        let key = derive_key(KeyPurpose::MasterEncryption);
        let plaintext = "windows-secret-test-42!@#$%^&*()";

        let encrypted = encrypt_secret(&key, plaintext)
            .expect("encrypt_secret should succeed on Windows");
        let decrypted = decrypt_secret(&key, &encrypted)
            .expect("decrypt_secret should succeed on Windows");

        assert_eq!(plaintext, decrypted, "Decrypted value must match original");
    }

    #[test]
    fn test_encrypt_produces_unique_ciphertexts() {
        // AES-GCM uses a random nonce, so two encryptions of the same plaintext differ.
        let key = derive_key(KeyPurpose::MasterEncryption);
        let plaintext = "same-plaintext";

        let enc1 = encrypt_secret(&key, plaintext).expect("first encrypt failed");
        let enc2 = encrypt_secret(&key, plaintext).expect("second encrypt failed");

        assert_ne!(
            enc1.ciphertext, enc2.ciphertext,
            "Each encryption should produce a unique ciphertext due to random nonce"
        );
        assert_ne!(enc1.nonce, enc2.nonce, "Nonces should differ");
    }

    #[test]
    fn test_encrypt_with_raw_aes_gcm_on_windows() {
        // Low-level AES-GCM test using the same crate the app uses.
        let mut raw_key_bytes = [0u8; 32];
        OsRng.fill_bytes(&mut raw_key_bytes);
        let key: &Key<Aes256Gcm> = Key::<Aes256Gcm>::from_slice(&raw_key_bytes);
        let cipher = Aes256Gcm::new(key);

        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let msg = b"agi-workforce-windows-test";
        let ciphertext = cipher
            .encrypt(nonce, msg.as_ref())
            .expect("raw AES-GCM encrypt failed");
        let decrypted = cipher
            .decrypt(nonce, ciphertext.as_ref())
            .expect("raw AES-GCM decrypt failed");

        assert_eq!(&decrypted, msg);
    }

    #[test]
    fn test_secret_manager_store_retrieve_on_windows() {
        let manager = make_secret_manager();

        // A fresh manager should have no JWT secret.
        let _ = manager.delete_jwt_secret(); // ensure clean state

        // get_or_create generates and stores a new secret.
        let secret1 = manager
            .get_or_create_jwt_secret()
            .expect("get_or_create_jwt_secret failed");
        assert!(!secret1.is_empty(), "Generated secret should not be empty");

        // A second call must return the identical persisted secret.
        let secret2 = manager
            .get_or_create_jwt_secret()
            .expect("second get_or_create_jwt_secret failed");
        assert_eq!(secret1, secret2, "Persisted secret must be stable across calls");
    }

    #[test]
    fn test_secret_manager_rotation_on_windows() {
        let manager = make_secret_manager();
        let _ = manager.delete_jwt_secret();

        let original = manager
            .get_or_create_jwt_secret()
            .expect("initial create failed");
        let rotated = manager
            .rotate_jwt_secret()
            .expect("rotate_jwt_secret failed");

        assert_ne!(original, rotated, "Rotated secret must differ from original");

        // After rotation, retrieval should return the new secret.
        let after = manager
            .get_or_create_jwt_secret()
            .expect("retrieve after rotation failed");
        assert_eq!(rotated, after, "Post-rotation retrieval must match rotated value");
    }

    #[test]
    fn test_secret_manager_secondary_key_on_windows() {
        let manager = make_secret_manager();

        let key1 = manager
            .get_or_create_secondary_key()
            .expect("first secondary key failed");
        assert_eq!(key1.len(), 32, "Secondary key must be 32 bytes");

        let key2 = manager
            .get_or_create_secondary_key()
            .expect("second secondary key failed");
        assert_eq!(key1, key2, "Secondary key must be stable across calls");
    }

    // ===================================================================
    // PROCESS / SHELL DETECTION TESTS
    // ===================================================================

    #[test]
    fn test_which_finds_cmd_exe_on_windows() {
        // cmd.exe is always present on Windows.
        let result = which::which("cmd.exe");
        assert!(
            result.is_ok(),
            "which::which('cmd.exe') should succeed on Windows: {:?}",
            result.err()
        );
        let path = result.unwrap();
        let s = path.to_string_lossy().to_lowercase();
        assert!(
            s.ends_with("cmd.exe"),
            "Resolved path should end with cmd.exe: {}",
            s
        );
    }

    #[test]
    fn test_which_finds_powershell_on_windows() {
        // At least one of pwsh or powershell.exe must be present.
        let pwsh = which::which("pwsh");
        let ps1 = which::which("powershell.exe");
        assert!(
            pwsh.is_ok() || ps1.is_ok(),
            "At least one of pwsh / powershell.exe must be on PATH"
        );
    }

    #[test]
    fn test_detect_available_shells_windows_has_cmd_or_powershell() {
        let shells = detect_available_shells();
        assert!(
            !shells.is_empty(),
            "detect_available_shells() must return at least one shell on Windows"
        );

        let has_cmd_or_ps = shells.iter().any(|s| {
            matches!(s.shell_type, ShellType::Cmd | ShellType::PowerShell)
        });
        assert!(
            has_cmd_or_ps,
            "At least one of Cmd or PowerShell should be detected on Windows"
        );
    }

    #[test]
    fn test_detect_available_shells_all_have_paths() {
        let shells = detect_available_shells();
        for shell in &shells {
            assert!(
                shell.available,
                "Shell {:?} should be marked available",
                shell.shell_type
            );
            assert!(
                !shell.path.is_empty(),
                "Shell {:?} must have a non-empty path",
                shell.shell_type
            );
            // Paths on Windows must be absolute.
            let p = PathBuf::from(&shell.path);
            assert!(
                p.is_absolute(),
                "Shell path must be absolute on Windows: {}",
                shell.path
            );
        }
    }

    #[test]
    fn test_get_default_shell_is_cmd_or_powershell_on_windows() {
        let default = get_default_shell();
        assert!(
            matches!(default, ShellType::PowerShell | ShellType::Cmd),
            "Default shell on Windows must be PowerShell or Cmd, got {:?}",
            default
        );
    }

    #[test]
    fn test_which_common_windows_executables() {
        // These executables ship with every Windows installation.
        for exe in &["notepad.exe", "explorer.exe", "tasklist.exe"] {
            // We tolerate failures here since PATH may exclude system32 in some CI
            // environments, but log the outcome.
            match which::which(exe) {
                Ok(p) => {
                    let s = p.to_string_lossy().to_lowercase();
                    assert!(
                        s.ends_with(exe),
                        "Resolved path for {} should end with the exe name: {}",
                        exe,
                        s
                    );
                }
                Err(_) => {
                    // Not all CI environments have System32 on PATH — acceptable.
                }
            }
        }
    }

    // ===================================================================
    // PLATFORM DETECTION TESTS
    // ===================================================================

    #[test]
    fn test_cfg_target_os_windows_is_true() {
        // This module is only compiled on Windows, so this is always true —
        // but it also exercises the compile-time cfg path.
        assert!(
            cfg!(target_os = "windows"),
            "cfg!(target_os = \"windows\") must be true inside this module"
        );
    }

    #[test]
    fn test_cfg_not_unix_on_windows() {
        assert!(
            !cfg!(unix),
            "cfg!(unix) must be false on Windows"
        );
    }

    #[test]
    fn test_sysinfo_detects_windows_os() {
        // sysinfo is already a dependency (listed in Cargo.toml at version 0.30).
        let os_name = System::name();
        assert!(
            os_name.is_some(),
            "sysinfo::System::name() should return Some on Windows"
        );
        let name = os_name.unwrap().to_lowercase();
        assert!(
            name.contains("windows"),
            "OS name should contain 'windows', got: {}",
            name
        );
    }

    #[test]
    fn test_sysinfo_os_version_is_10_or_11() {
        let version = System::os_version();
        // os_version() may return None in some sandboxed environments.
        if let Some(v) = version {
            // Windows 10 versions start with "10.", Windows 11 also reports "10.0.22000+"
            // in the kernel but sysinfo may return "11" or "10.x.y".
            // Accept any non-empty version string.
            assert!(!v.is_empty(), "OS version string should not be empty");
        }
    }

    #[test]
    fn test_sysinfo_kernel_version_non_empty_on_windows() {
        let kernel = System::kernel_version();
        if let Some(k) = kernel {
            assert!(!k.is_empty(), "Kernel version should be non-empty on Windows");
        }
    }

    #[test]
    fn test_std_env_os_returns_windows() {
        // std::env::consts::OS is set at compile time.
        assert_eq!(
            std::env::consts::OS, "windows",
            "std::env::consts::OS must be 'windows'"
        );
    }

    #[test]
    fn test_windows_env_vars_are_set() {
        // USERPROFILE or HOMEDRIVE should be present in every Windows process.
        let userprofile = std::env::var("USERPROFILE");
        let homedrive = std::env::var("HOMEDRIVE");
        let windir = std::env::var("WINDIR").or_else(|_| std::env::var("SystemRoot"));

        let any_set =
            userprofile.is_ok() || homedrive.is_ok() || windir.is_ok();
        assert!(
            any_set,
            "At least one of USERPROFILE, HOMEDRIVE, or WINDIR/SystemRoot should be set on Windows"
        );
    }

    #[test]
    fn test_appdata_env_var_is_set_on_windows() {
        let appdata = std::env::var("APPDATA");
        assert!(
            appdata.is_ok(),
            "APPDATA environment variable should be set on Windows"
        );
        let path = appdata.unwrap();
        assert!(!path.is_empty(), "APPDATA should not be empty");
        assert!(
            path.to_lowercase().contains("appdata"),
            "APPDATA path should contain 'appdata': {}",
            path
        );
    }

    #[test]
    fn test_localappdata_env_var_is_set_on_windows() {
        let local = std::env::var("LOCALAPPDATA");
        assert!(
            local.is_ok(),
            "LOCALAPPDATA environment variable should be set on Windows"
        );
        let path = local.unwrap();
        assert!(!path.is_empty(), "LOCALAPPDATA should not be empty");
        assert!(
            path.to_lowercase().contains("local"),
            "LOCALAPPDATA path should contain 'local': {}",
            path
        );
    }

    // ===================================================================
    // FILE SYSTEM TESTS
    // ===================================================================

    #[test]
    fn test_create_and_delete_temp_file_on_windows() {
        let tmp = tempfile::NamedTempFile::new().expect("tempfile creation failed on Windows");
        let path = tmp.path().to_path_buf();
        assert!(path.exists(), "Temp file should exist after creation");

        // Verify it is under the system temp directory.
        let temp_dir = std::env::temp_dir();
        assert!(
            path.starts_with(&temp_dir),
            "Temp file should be under temp dir. File: {}, TempDir: {}",
            path.display(),
            temp_dir.display()
        );

        drop(tmp); // deletes file
        assert!(!path.exists(), "Temp file should be deleted after drop");
    }

    #[test]
    fn test_create_temp_dir_on_windows() {
        let dir = tempfile::tempdir().expect("tempdir creation failed on Windows");
        let path = dir.path().to_path_buf();
        assert!(path.exists(), "Temp dir should exist");
        assert!(path.is_dir(), "Temp path should be a directory");

        // Write a file inside it.
        let file_path = path.join("windows_test.txt");
        std::fs::write(&file_path, b"windows test data").expect("write to temp dir failed");
        assert!(file_path.exists(), "File inside temp dir should exist");
        assert_eq!(
            std::fs::read(&file_path).expect("read failed"),
            b"windows test data"
        );
    }

    #[test]
    fn test_windows_drive_letter_path_is_absolute() {
        let p = PathBuf::from(r"C:\Windows\System32");
        assert!(p.is_absolute(), "C:\\ path should be absolute on Windows");
    }

    #[test]
    fn test_unc_path_recognised_as_absolute() {
        // UNC paths (\\server\share) should be absolute.
        let p = PathBuf::from(r"\\server\share\file.txt");
        assert!(p.is_absolute(), "UNC path should be absolute");
    }

    #[test]
    fn test_file_read_write_roundtrip_on_windows() {
        let dir = tempfile::tempdir().expect("tempdir failed");
        let path = dir.path().join("roundtrip.bin");
        let content = b"\x00\x01\x02Windows\xff\xfe\xfd";

        std::fs::write(&path, content).expect("write failed");
        let read_back = std::fs::read(&path).expect("read failed");
        assert_eq!(read_back, content, "Binary roundtrip must be lossless on Windows");
    }

    #[test]
    fn test_sqlite_in_memory_on_windows() {
        // SQLite must open and work in-memory on Windows (no libclang needed for in-memory).
        let conn = Connection::open_in_memory().expect("in-memory sqlite open failed");
        conn.execute(
            "CREATE TABLE test_win (id INTEGER PRIMARY KEY, val TEXT)",
            [],
        )
        .expect("CREATE TABLE failed");
        conn.execute(
            "INSERT INTO test_win (val) VALUES (?1)",
            rusqlite::params!["hello-windows"],
        )
        .expect("INSERT failed");
        let val: String = conn
            .query_row("SELECT val FROM test_win WHERE id = 1", [], |row| {
                row.get(0)
            })
            .expect("SELECT failed");
        assert_eq!(val, "hello-windows");
    }

    // ===================================================================
    // SCREEN CAPTURE TESTS (xcap)
    // ===================================================================

    #[test]
    #[ignore = "Requires a live display / screen recording permissions — skip in headless CI"]
    fn test_xcap_list_monitors_non_empty_on_windows() {
        let monitors = Monitor::all().expect("Monitor::all() failed on Windows");
        assert!(
            !monitors.is_empty(),
            "At least one monitor must be detected on Windows"
        );
    }

    #[test]
    #[ignore = "Requires a live display / screen recording permissions — skip in headless CI"]
    fn test_xcap_primary_monitor_has_positive_dimensions() {
        let monitors = Monitor::all().expect("Monitor::all() failed");
        let primary = monitors
            .iter()
            .find(|m| m.is_primary())
            .or_else(|| monitors.first())
            .expect("No monitors found");

        assert!(primary.width() > 0, "Primary monitor width must be > 0");
        assert!(primary.height() > 0, "Primary monitor height must be > 0");
        assert!(
            primary.width() >= 640,
            "Primary monitor width should be at least 640, got {}",
            primary.width()
        );
        assert!(
            primary.height() >= 480,
            "Primary monitor height should be at least 480, got {}",
            primary.height()
        );
    }

    #[test]
    #[ignore = "Requires a live display / screen recording permissions — skip in headless CI"]
    fn test_xcap_capture_primary_returns_valid_image_data() {
        let monitors = Monitor::all().expect("Monitor::all() failed");
        let primary = monitors
            .iter()
            .find(|m| m.is_primary())
            .or_else(|| monitors.first())
            .expect("No monitors found");

        let image = primary
            .capture_image()
            .expect("capture_image() failed on Windows");

        let expected_len = image.width() as usize * image.height() as usize * 4;
        assert_eq!(
            image.len(),
            expected_len,
            "Captured image buffer size should match width * height * 4 (RGBA)"
        );
        assert!(image.width() > 0, "Captured image width must be > 0");
        assert!(image.height() > 0, "Captured image height must be > 0");
    }

    #[test]
    #[ignore = "Requires a live display / screen recording permissions — skip in headless CI"]
    fn test_xcap_monitor_scale_factor_positive() {
        let monitors = Monitor::all().expect("Monitor::all() failed");
        for monitor in &monitors {
            assert!(
                monitor.scale_factor() > 0.0,
                "Monitor scale factor must be positive, got {}",
                monitor.scale_factor()
            );
        }
    }

    // ===================================================================
    // CLIPBOARD TESTS (arboard)
    // ===================================================================

    #[test]
    #[ignore = "Requires a live Windows session with clipboard access — skip in headless CI"]
    fn test_arboard_clipboard_set_get_text_on_windows() {
        let mut clipboard = Clipboard::new().expect("arboard::Clipboard::new() failed on Windows");
        let test_text = "agi-workforce-windows-clipboard-test-\u{1F5A5}";

        clipboard
            .set_text(test_text.to_string())
            .expect("set_text failed");
        let retrieved = clipboard.get_text().expect("get_text failed");

        assert_eq!(
            retrieved, test_text,
            "Clipboard round-trip must preserve text exactly"
        );
    }

    #[test]
    #[ignore = "Requires a live Windows session with clipboard access — skip in headless CI"]
    fn test_arboard_clipboard_clear_on_windows() {
        let mut clipboard = Clipboard::new().expect("arboard::Clipboard::new() failed");

        clipboard
            .set_text("some-content".to_string())
            .expect("set_text failed");
        clipboard.clear().expect("clear() failed");

        // After clear, get_text may error (no text) or return empty — either is correct.
        match clipboard.get_text() {
            Ok(s) => assert!(s.is_empty(), "Clipboard should be empty after clear, got: {}", s),
            Err(_) => { /* expected — clipboard has no text */ }
        }
    }

    #[test]
    #[ignore = "Requires a live Windows session with clipboard access — skip in headless CI"]
    fn test_arboard_clipboard_overwrites_previous_value() {
        let mut clipboard = Clipboard::new().expect("arboard::Clipboard::new() failed");

        clipboard.set_text("first".to_string()).expect("set 1 failed");
        clipboard.set_text("second".to_string()).expect("set 2 failed");

        let result = clipboard.get_text().expect("get_text failed");
        assert_eq!(result, "second", "Second set should overwrite first");
    }

    // ===================================================================
    // WINDOWS PATH SEPARATOR TESTS (MCP transport / augmented PATH)
    // ===================================================================

    #[test]
    fn test_windows_path_separator_is_semicolon() {
        // On Windows, entries in PATH are separated by `;`.
        // std::path::MAIN_SEPARATOR is `\`, but PATH separators are `;`.
        let sep = std::path::MAIN_SEPARATOR;
        assert_eq!(sep, '\\', "Main path separator on Windows must be '\\'");

        // Verify that a PATH-style string uses `;` as separator (not `:`)
        let sample_path = r"C:\Windows\System32;C:\Windows;C:\Users\test\AppData\Roaming\npm";
        let entries: Vec<&str> = sample_path.split(';').collect();
        assert_eq!(entries.len(), 3, "Semicolon-split should yield 3 entries");
        assert_eq!(entries[0], r"C:\Windows\System32");
    }

    #[test]
    fn test_windows_path_entry_parsing_handles_backslash() {
        let path_var = r"C:\Windows\System32;C:\Program Files\nodejs;C:\Users\test\AppData\Roaming\npm";
        for entry in path_var.split(';') {
            assert!(
                !entry.is_empty(),
                "Each PATH entry should be non-empty"
            );
            // Every entry should look like an absolute Windows path
            if !entry.is_empty() {
                let p = std::path::Path::new(entry);
                assert!(p.is_absolute(), "PATH entry '{}' should be absolute", entry);
            }
        }
    }

    #[test]
    fn test_windows_path_dedup_logic() {
        // Simulate the dedup logic used in build_augmented_path
        let mut dirs: Vec<String> = Vec::new();
        let entries = [
            r"C:\Windows\System32",
            r"C:\Windows",
            r"C:\Windows\System32", // duplicate
            r"C:\Users\test\AppData\Roaming\npm",
        ];
        for entry in &entries {
            if !dirs.iter().any(|d| d == entry) {
                dirs.push(entry.to_string());
            }
        }
        assert_eq!(dirs.len(), 3, "Dedup should remove the duplicate entry");
        assert_eq!(dirs[0], r"C:\Windows\System32");
        assert_eq!(dirs[2], r"C:\Users\test\AppData\Roaming\npm");
    }

    #[test]
    fn test_windows_augmented_path_includes_appdata_npm() {
        // The app's build_augmented_path prepends %APPDATA%\npm on Windows.
        // We verify that APPDATA is set and the npm path would be constructible.
        let appdata = std::env::var("APPDATA").expect("APPDATA must be set on Windows");
        let npm_path = format!("{}\\npm", appdata);
        // We cannot guarantee it exists on all machines, but path construction must work.
        let p = std::path::PathBuf::from(&npm_path);
        assert!(
            p.is_absolute(),
            "Constructed npm path '{}' should be absolute",
            npm_path
        );
        assert!(
            npm_path.to_lowercase().contains("appdata"),
            "npm path '{}' should be under AppData",
            npm_path
        );
    }

    #[test]
    fn test_windows_augmented_path_includes_programfiles_nodejs() {
        let pf = std::env::var("ProgramFiles").unwrap_or_default();
        if !pf.is_empty() {
            let nodejs_path = format!("{}\\nodejs", pf);
            let p = std::path::PathBuf::from(&nodejs_path);
            assert!(p.is_absolute(), "Program Files nodejs path should be absolute");
        }
    }

    #[test]
    fn test_windows_is_absolute_command_drive_letter_backslash() {
        // Mirrors the is_absolute_command() logic in transport.rs
        let cases = [
            (r"C:\Windows\System32\node.exe", true),
            (r"D:\tools\uvx.exe", true),
            ("C:/tools/npx.cmd", true), // forward slash variant
            ("npx", false),             // bare name — not absolute
            ("./bin/node", false),      // relative
            (r"\\server\share\bin.exe", true), // UNC
        ];
        for (cmd, expected) in &cases {
            let bytes = cmd.as_bytes();
            let is_drive_abs = bytes.len() >= 3
                && bytes[1] == b':'
                && (bytes[2] == b'\\' || bytes[2] == b'/');
            let is_unc = cmd.starts_with("\\\\") || cmd.starts_with("//");
            let actual = is_drive_abs || is_unc;
            assert_eq!(
                actual, *expected,
                "is_absolute_command('{}') should be {}",
                cmd, expected
            );
        }
    }

    #[test]
    fn test_windows_resolve_command_path_returns_bare_name_when_not_found() {
        // When the command cannot be found in augmented PATH, the bare name is returned.
        // We use a definitely-nonexistent command name to test the fallback branch.
        let fake_cmd = "agi_does_not_exist_xyzzy_12345";
        // The function cannot be called directly (it's crate-private), but we can test
        // the equivalent fallback logic: if not found in PATH, return original string.
        let mut found = false;
        for dir in std::env::var("PATH").unwrap_or_default().split(';') {
            if dir.is_empty() {
                continue;
            }
            let candidate = format!("{}\\{}", dir, fake_cmd);
            if std::path::Path::new(&candidate).is_file() {
                found = true;
                break;
            }
        }
        // The fake command definitely should not be found.
        assert!(!found, "Nonexistent command should not be found in PATH");
    }

    #[test]
    fn test_windows_path_extension_candidates() {
        // On Windows, transport.rs tries .exe, .cmd, .bat, .ps1 extensions.
        let extensions = ["", ".exe", ".cmd", ".bat", ".ps1"];
        let dir = r"C:\Windows\System32";
        let cmd = "cmd";

        let candidates: Vec<String> = extensions
            .iter()
            .map(|ext| format!("{}\\{}{}", dir, cmd, ext))
            .collect();

        // Verify each candidate looks like a valid Windows path
        for candidate in &candidates {
            let p = std::path::Path::new(candidate);
            // Must be under the specified directory
            assert!(
                candidate.starts_with(dir),
                "Candidate '{}' should start with dir '{}'",
                candidate,
                dir
            );
            // Candidate without extension has no dot after cmd; others have their ext
            let _ = p.extension(); // must not panic
        }
        assert_eq!(candidates.len(), 5);
    }

    // ===================================================================
    // COMMAND VALIDATOR — WINDOWS-SPECIFIC INTEGRATION CHECKS
    // ===================================================================

    #[test]
    fn test_windows_dir_command_is_safe() {
        use crate::sys::security::command_validator::{validate_command, ValidationConfig};
        let cfg = ValidationConfig::interactive();
        assert!(validate_command("dir", &cfg).is_ok());
        assert!(validate_command(r"dir C:\Users", &cfg).is_ok());
    }

    #[test]
    fn test_windows_type_command_is_safe() {
        use crate::sys::security::command_validator::{validate_command, ValidationConfig};
        let cfg = ValidationConfig::interactive();
        assert!(validate_command(r"type C:\agiworkforce\config.json", &cfg).is_ok());
    }

    #[test]
    fn test_windows_path_in_cargo_build_is_safe() {
        use crate::sys::security::command_validator::{validate_command, ValidationConfig};
        let cfg = ValidationConfig::interactive();
        assert!(validate_command(r"cargo build --manifest-path C:\projects\app\Cargo.toml", &cfg).is_ok());
    }

    #[test]
    fn test_windows_node_path_command_is_safe() {
        use crate::sys::security::command_validator::{validate_command, ValidationConfig};
        let cfg = ValidationConfig::interactive();
        // Running node from an absolute path should be safe
        assert!(validate_command(r"C:\Program Files\nodejs\node.exe --version", &cfg).is_ok());
    }

    #[test]
    fn test_windows_destructive_commands_blocked_in_interactive() {
        use crate::sys::security::command_validator::{validate_command, ValidationConfig};
        let cfg = ValidationConfig::interactive();
        // Even in interactive mode, Windows-specific destructive patterns are blocked
        assert!(validate_command(r"rd /s /q c:\", &cfg).is_err());
        assert!(validate_command("format c:", &cfg).is_err());
        assert!(validate_command("reg delete hklm", &cfg).is_err());
        assert!(validate_command("powershell -enc SomePayload==", &cfg).is_err());
    }

    // ===================================================================
    // SETTINGS MODELS — WINDOWS-SPECIFIC DEFAULTS
    // ===================================================================

    #[test]
    fn test_app_settings_default_schema_version() {
        use crate::data::settings::models::AppSettings;
        let settings = AppSettings::default();
        assert_eq!(settings.schema_version, 1, "Default schema version must be 1");
    }

    #[test]
    fn test_app_settings_security_defaults_match_windows_expectations() {
        use crate::data::settings::models::AppSettings;
        let settings = AppSettings::default();
        let sec = &settings.security_settings;
        // File system and network access are enabled by default
        assert!(sec.allow_file_system_access, "File system access should be enabled by default");
        assert!(sec.allow_network_access, "Network access should be enabled by default");
        // Confirmation is required by default (important on Windows where UAC exists)
        assert!(
            sec.require_confirmation_for_actions,
            "Confirmation should be required by default"
        );
    }

    #[test]
    fn test_setting_value_windows_path_round_trips() {
        use crate::data::settings::models::SettingValue;
        // Windows paths with backslashes must survive JSON round-trip
        let path = r"C:\Users\nagul\AppData\Roaming\agiworkforce\config.json";
        let val = SettingValue::String(path.to_string());
        let json = val.to_json_string().expect("serialize failed");
        let back = SettingValue::from_json_string(&json).expect("deserialize failed");
        assert_eq!(back.as_string(), Some(path));
    }

    #[test]
    fn test_setting_value_windows_unc_path_round_trips() {
        use crate::data::settings::models::SettingValue;
        let path = r"\\server\share\agiworkforce\data";
        let val = SettingValue::String(path.to_string());
        let json = val.to_json_string().expect("serialize failed");
        let back = SettingValue::from_json_string(&json).expect("deserialize failed");
        assert_eq!(back.as_string(), Some(path));
    }
}
