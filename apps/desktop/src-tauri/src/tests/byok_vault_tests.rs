/// Integration tests for the BYOK encrypted key vault.
///
/// These tests exercise the tauri-plugin-stronghold v2.3.1 Stronghold struct
/// directly (the pub surface exposed by the crate) without a running Tauri
/// app. They validate the store/retrieve/delete lifecycle on an on-disk
/// encrypted snapshot using Argon2id key derivation.
///
/// Trust boundary: only BYOK keys are stored here; these tests never touch
/// any cloud or managed-cloud path.
#[cfg(test)]
mod byok_vault_tests {
    use tauri_plugin_stronghold::{stronghold::Stronghold, kdf::KeyDerivation};
    use tempfile::TempDir;

    /// Helper: derive a 32-byte Argon2id key from a password + temp salt file.
    fn derive_key(password: &str, salt_path: &std::path::Path) -> Vec<u8> {
        KeyDerivation::argon2(password, salt_path)
    }

    /// Helper: create a fresh Stronghold snapshot in a temp directory.
    fn open_vault(tmp: &TempDir, password: &str) -> (Stronghold, std::path::PathBuf) {
        let salt_path = tmp.path().join("test.salt");
        let snapshot_path = tmp.path().join("test.stronghold");
        let key = derive_key(password, &salt_path);
        let vault = Stronghold::new(&snapshot_path, key).expect("Stronghold::new failed");
        (vault, snapshot_path)
    }

    /// Round-trip: store a key in the Store, flush to disk, reopen with the
    /// same password, retrieve the value. Verifies encrypt→persist→decrypt.
    #[test]
    fn test_store_retrieve_roundtrip() {
        let tmp = TempDir::new().expect("tempdir");
        let (vault, snapshot_path) = open_vault(&tmp, "test-password-123");

        // Create a client named "byok-keys" (mirrors the TS helper's CLIENT_NAME).
        let client = vault.create_client("byok-keys").expect("create_client");
        let store = client.store();

        // Insert a provider key.
        store
            .insert(
                b"openai".to_vec(),
                b"sk-test-key-value".to_vec(),
                None,
            )
            .expect("store insert");

        // Flush to disk.
        vault.save().expect("save");

        // Reopen with the same password.
        // Note: after save(), use load_client (not get_client) to restore
        // the persisted client from the snapshot.
        let salt_path = tmp.path().join("test.salt");
        let key2 = derive_key("test-password-123", &salt_path);
        let vault2 = Stronghold::new(&snapshot_path, key2).expect("reopen");
        let client2 = vault2.load_client("byok-keys").expect("load_client");
        let store2 = client2.store();

        let retrieved = store2
            .get(b"openai".as_ref())
            .expect("store get")
            .expect("key should exist");

        assert_eq!(retrieved, b"sk-test-key-value".to_vec());
    }

    /// Verify that wrong password fails to decrypt (fail-closed contract).
    #[test]
    fn test_wrong_password_fails() {
        let tmp = TempDir::new().expect("tempdir");
        let (vault, snapshot_path) = open_vault(&tmp, "correct-password");

        let client = vault.create_client("byok-keys").expect("create_client");
        client
            .store()
            .insert(b"anthropic".to_vec(), b"sk-ant-secret".to_vec(), None)
            .expect("insert");
        vault.save().expect("save");

        // Attempt to reopen with wrong password.
        let salt_path = tmp.path().join("test.salt");
        let wrong_key = derive_key("wrong-password", &salt_path);
        let result = Stronghold::new(&snapshot_path, wrong_key);
        // Stronghold must return Err — wrong password cannot decrypt the snapshot.
        assert!(result.is_err(), "wrong password must fail to open the vault");
    }

    /// Verify delete removes the key and subsequent get returns None.
    #[test]
    fn test_delete_removes_key() {
        let tmp = TempDir::new().expect("tempdir");
        let (vault, _) = open_vault(&tmp, "delete-test-pw");

        let client = vault.create_client("byok-keys").expect("create_client");
        let store = client.store();

        store
            .insert(b"xai".to_vec(), b"xai-key-to-delete".to_vec(), None)
            .expect("insert");
        vault.save().expect("save");

        // Delete.
        store.delete(b"xai".as_ref()).expect("delete");
        vault.save().expect("save after delete");

        // Verify gone.
        let result = store.get(b"xai".as_ref()).expect("get after delete");
        assert!(
            result.is_none(),
            "deleted key must not be retrievable"
        );
    }

    /// Verify that a fresh snapshot (no file on disk) is created successfully.
    #[test]
    fn test_new_snapshot_created_on_first_open() {
        let tmp = TempDir::new().expect("tempdir");
        let snapshot_path = tmp.path().join("fresh.stronghold");

        // File must not exist before.
        assert!(!snapshot_path.exists());

        let salt_path = tmp.path().join("fresh.salt");
        let key = derive_key("fresh-password", &salt_path);
        let vault = Stronghold::new(&snapshot_path, key).expect("first open should succeed");
        vault.save().expect("save");

        // File now exists.
        assert!(snapshot_path.exists(), "snapshot file should be created after save");
    }
}
