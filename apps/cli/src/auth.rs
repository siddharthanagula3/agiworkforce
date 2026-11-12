use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};

use crate::terminal_style as ts;

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AuthEntry {
    #[serde(rename = "oauth")]
    OAuth {
        refresh: String,
        access: String,
        expires: i64, // Unix timestamp milliseconds
    },
    #[serde(rename = "api")]
    ApiKey { key: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AuthStore {
    #[serde(flatten)]
    pub entries: HashMap<String, AuthEntry>,
}

/// Auth status for a single provider, returned by `auth_status()`.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AuthStatusEntry {
    pub provider: String,
    pub auth_type: String,
    pub status: String,
    pub expires_in: Option<String>,
    /// Whether a refresh token is available for this entry.
    pub has_refresh_token: bool,
    /// Whether the auth file has secure permissions (Unix 0o600).
    pub permissions_secure: bool,
    /// When this credential was last read out of the credential store and used,
    /// from the local credential-use trail, or the environment variable it is
    /// read from. `None` means it has not been used since the trail began.
    pub last_used: Option<String>,
}

// ──────────────────────────────────────────────────────────────────────────────
// File Permission Helpers
// ──────────────────────────────────────────────────────────────────────────────

/// On Unix, restrict file to owner-only read/write (0o600).
#[cfg(all(unix, test))]
fn set_file_permissions(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let perms = std::fs::Permissions::from_mode(0o600);
    std::fs::set_permissions(path, perms)?;
    Ok(())
}

/// Check whether auth.json has secure permissions (owner-only on Unix).
/// Returns `true` if permissions are secure, `false` otherwise.
/// On non-Unix platforms, always returns `true`.
#[cfg(unix)]
pub fn check_file_permissions_secure(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    match std::fs::metadata(path) {
        Ok(meta) => {
            let mode = meta.permissions().mode();
            // Check that group and other have no access bits
            (mode & 0o077) == 0
        }
        Err(_) => false,
    }
}

#[cfg(not(unix))]
pub fn check_file_permissions_secure(_path: &Path) -> bool {
    true
}

// ──────────────────────────────────────────────────────────────────────────────
// Storage
// ──────────────────────────────────────────────────────────────────────────────

fn auth_path() -> Result<PathBuf> {
    Ok(crate::config::CliConfig::config_dir()?.join("auth.json"))
}

const AUTH_KEYRING_SERVICE: &str = "com.agiworkforce.cli.auth";
const AUTH_INDEX_VERSION: u8 = 2;
const AUTH_INDEX_STORAGE: &str = "os-keyring";

/// Non-secret discovery metadata. Keyring APIs do not provide a portable way
/// to enumerate accounts, so auth.json retains provider names only; credential
/// material lives in one OS-keyring entry per provider.
#[derive(Debug, Serialize, Deserialize)]
struct AuthKeyringIndex {
    version: u8,
    storage: String,
    providers: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    removing: Vec<String>,
    #[serde(default)]
    scope: Option<String>,
}

pub fn credential_storage_label() -> &'static str {
    if crate::secure_store::uses_keychain() {
        "OS credential store"
    } else if crate::secure_store::keyring_disabled() {
        "owner-only credential file (OS keyring explicitly disabled)"
    } else {
        "owner-only credential file"
    }
}

fn auth_keyring_account(provider: &str) -> String {
    let digest = Sha256::digest(provider.as_bytes());
    format!("provider:{}", crate::hex::encode(&digest))
}

/// The OS credential store, behind a seam so the persistence rules can be
/// tested without a real keychain.
///
/// Every method returns a `Result`. A store that denies access, which is what
/// an unsigned or unattended binary sees on macOS, has to surface as an error
/// the caller reports; degrading to a plaintext file would quietly undo the
/// reason these credentials moved off disk in the first place.
trait CredentialStore {
    fn scope(&self) -> &str {
        AUTH_KEYRING_SERVICE
    }

    fn get(&self, account: &str) -> Result<Option<String>>;
    fn set(&self, account: &str, secret: &str) -> Result<()>;
    fn delete(&self, account: &str) -> Result<()>;
}

struct OsKeyring {
    service: String,
}

impl OsKeyring {
    fn for_config_root() -> Result<Self> {
        Ok(Self {
            service: crate::secure_store::keychain_service(AUTH_KEYRING_SERVICE)?,
        })
    }

    fn unscoped() -> Self {
        Self {
            service: AUTH_KEYRING_SERVICE.to_string(),
        }
    }

    fn entry(&self, account: &str) -> Result<keyring::Entry> {
        keyring::Entry::new(&self.service, account)
            .context("Could not open the OS credential store")
    }
}

impl CredentialStore for OsKeyring {
    fn scope(&self) -> &str {
        &self.service
    }

    fn get(&self, account: &str) -> Result<Option<String>> {
        match self.entry(account)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error).context(
                "The OS credential store would not return the saved credential. Unlock it and approve its prompt. Where it cannot unlock (an SSH session, a container), run `agi login` with AGIWORKFORCE_NO_KEYRING=1 to keep credentials in an owner-only file, or `agi logout` to clear the saved sign-in",
            ),
        }
    }

    fn set(&self, account: &str, secret: &str) -> Result<()> {
        self.entry(account)?
            .set_password(secret)
            .context("The OS credential store refused to save the credential")
    }

    fn delete(&self, account: &str) -> Result<()> {
        match self.entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => {
                Err(error).context("The OS credential store refused to remove the credential")
            }
        }
    }
}

fn parse_auth_keyring_index(data: &str) -> Option<AuthKeyringIndex> {
    let index = serde_json::from_str::<AuthKeyringIndex>(data).ok()?;
    let valid_version = match index.version {
        1 => index.scope.is_none(),
        AUTH_INDEX_VERSION => index
            .scope
            .as_deref()
            .is_some_and(|scope| !scope.is_empty()),
        _ => false,
    };
    (valid_version && index.storage == AUTH_INDEX_STORAGE).then_some(index)
}

fn write_owner_only_file(path: &Path, data: &str) -> Result<()> {
    crate::secure_store::write_owner_only(path, data.as_bytes())
}

/// Read the file store, which holds credential material in the clear. The mode
/// is a precondition, not a report: a file other accounts can read is refused.
fn read_file_store(path: &Path, data: &str) -> Result<AuthStore> {
    if !check_file_permissions_secure(path) {
        bail!(
            "{} holds credentials in the clear and is readable by other accounts on this machine. \
             Run `agi login` to replace it (keys saved in it must be entered again), or run \
             `chmod 600 {}` once you know who has read it.",
            path.display(),
            path.display()
        );
    }
    serde_json::from_str(data).context(
        "auth.json is not a credential file this agi can read; run `agi login` to replace it",
    )
}

fn sign_in_command(provider: &str) -> String {
    if provider == "managed_cloud" || is_agiworkforce_login_provider(Some(provider)) {
        "agi login".to_string()
    } else {
        format!("agi login {provider}")
    }
}

/// Credentials saved before config roots had keychain services of their own sit
/// under the shared service. A root adopts the ones its own index names, once,
/// and never removes them there, where the default root may still read them.
fn adopt_unscoped_credentials(
    scoped: &dyn CredentialStore,
    unscoped: &dyn CredentialStore,
    index: &AuthKeyringIndex,
) -> Result<()> {
    for provider in &index.providers {
        let account = auth_keyring_account(provider);
        if scoped
            .get(&account)
            .with_context(|| format!("Could not read the saved {provider} credential"))?
            .is_some()
        {
            continue;
        }
        if let Some(secret) = unscoped
            .get(&account)
            .with_context(|| format!("Could not read the saved {provider} credential"))?
        {
            scoped.set(&account, &secret).with_context(|| {
                format!("Could not move the saved {provider} credential to this config root")
            })?;
        }
    }
    Ok(())
}

/// A credential the store no longer holds is an error, unless `missing_signs_out`
/// says that provider is simply signed out. Any other store failure is always
/// an error, so a caller never saves over credentials it could not read.
fn load_keyring_auth(
    credentials: &dyn CredentialStore,
    index: AuthKeyringIndex,
    missing_signs_out: bool,
) -> Result<AuthStore> {
    let mut entries = HashMap::with_capacity(index.providers.len());
    for provider in index.providers {
        let held = credentials
            .get(&auth_keyring_account(&provider))
            .with_context(|| format!("Could not read the saved {provider} credential"))?;
        let secret = match held {
            Some(secret) => secret,
            None if missing_signs_out => continue,
            None => bail!(
                "The saved {provider} credential is missing from the OS credential store; run `{}` to replace it",
                sign_in_command(&provider)
            ),
        };
        let entry = serde_json::from_str::<AuthEntry>(&secret).with_context(|| {
            format!(
                "Saved {provider} credential is invalid; run `{}` to replace it",
                sign_in_command(&provider)
            )
        })?;
        entries.insert(provider, entry);
    }
    Ok(AuthStore { entries })
}

fn recover_keyring_auth(
    credentials: &dyn CredentialStore,
    providers: Vec<String>,
) -> (AuthStore, BTreeSet<String>) {
    let mut store = AuthStore::default();
    let mut unreadable = BTreeSet::new();
    for provider in providers {
        match credentials.get(&auth_keyring_account(&provider)) {
            Ok(None) => {}
            Ok(Some(secret)) => match serde_json::from_str::<AuthEntry>(&secret) {
                Ok(entry) => {
                    store.entries.insert(provider, entry);
                }
                Err(_) => {
                    unreadable.insert(provider);
                }
            },
            Err(_) => {
                unreadable.insert(provider);
            }
        }
    }
    (store, unreadable)
}

// Another root's index names credentials this root must never adopt, so a
// sign-in here starts empty and replaces that index.
fn recover_keyring_auth_for_root(
    credentials: &dyn CredentialStore,
    unscoped: &dyn CredentialStore,
    index: AuthKeyringIndex,
) -> (AuthStore, BTreeSet<String>) {
    let legacy = index.version == 1 && index.scope.is_none();
    if !legacy && index.scope.as_deref() != Some(credentials.scope()) {
        return (AuthStore::default(), BTreeSet::new());
    }
    if legacy {
        let _ = adopt_unscoped_credentials(credentials, unscoped, &index);
    }
    recover_keyring_auth(credentials, index.providers)
}

fn load_keyring_auth_for_root(
    credentials: &dyn CredentialStore,
    unscoped: &dyn CredentialStore,
    path: &Path,
    mut index: AuthKeyringIndex,
    missing_signs_out: bool,
) -> Result<AuthStore> {
    let legacy = index.version == 1 && index.scope.is_none();
    if !legacy && index.scope.as_deref() != Some(credentials.scope()) {
        bail!(
            "The credential index belongs to another config root; run `agi login` to sign in here, and enter provider keys saved under that root again"
        );
    }
    if legacy {
        adopt_unscoped_credentials(credentials, unscoped, &index)?;
    }
    let store = load_keyring_auth(
        credentials,
        AuthKeyringIndex {
            version: index.version,
            storage: index.storage.clone(),
            providers: index.providers.clone(),
            removing: Vec::new(),
            scope: index.scope.clone(),
        },
        missing_signs_out,
    )?;
    if legacy {
        index.version = AUTH_INDEX_VERSION;
        index.scope = Some(credentials.scope().to_string());
        let data =
            serde_json::to_string_pretty(&index).context("Failed to serialize auth index")?;
        write_owner_only_file(path, &data)?;
    }
    Ok(store)
}

fn save_keyring_auth(
    credentials: &dyn CredentialStore,
    path: &Path,
    store: &AuthStore,
) -> Result<()> {
    first_removal_failure(write_keyring_auth(
        credentials,
        path,
        store,
        &BTreeSet::new(),
    )?)
}

fn first_removal_failure(failures: Vec<(String, anyhow::Error)>) -> Result<()> {
    if let Some((provider, error)) = failures.into_iter().next() {
        return Err(error.context(format!("Could not remove the saved {provider} credential")));
    }
    Ok(())
}

// Only an index this root wrote, or a legacy one it adopts on load, proves which
// accounts in its keychain service are its own to delete.
fn index_owned_by(index: &AuthKeyringIndex, credentials: &dyn CredentialStore) -> bool {
    match index.scope.as_deref() {
        Some(scope) => scope == credentials.scope(),
        None => index.version == 1,
    }
}

fn write_keyring_auth(
    credentials: &dyn CredentialStore,
    path: &Path,
    store: &AuthStore,
    kept: &BTreeSet<String>,
) -> Result<Vec<(String, anyhow::Error)>> {
    let previous_providers = std::fs::read_to_string(path)
        .ok()
        .and_then(|data| parse_auth_keyring_index(&data))
        .filter(|index| index_owned_by(index, credentials))
        .map(|index| {
            index
                .providers
                .into_iter()
                .chain(index.removing)
                .collect::<BTreeSet<_>>()
        })
        .unwrap_or_default();
    let written_providers = store.entries.keys().cloned().collect::<BTreeSet<_>>();

    // Credentials are committed to the store before the index names them, so a
    // failure anywhere leaves the previous index in place rather than a file
    // that promises credentials the store does not hold.
    for provider in &written_providers {
        let entry = store
            .entries
            .get(provider)
            .context("Credential index changed during save")?;
        let secret = serde_json::to_string(entry).context("Failed to serialize credential")?;
        credentials
            .set(&auth_keyring_account(provider), &secret)
            .with_context(|| {
                format!("Could not save the {provider} credential in the OS credential store")
            })?;
    }

    let current_providers = written_providers
        .union(kept)
        .cloned()
        .collect::<BTreeSet<_>>();
    let removed: Vec<String> = previous_providers
        .difference(&current_providers)
        .cloned()
        .collect();
    let providers: Vec<String> = current_providers.into_iter().collect();

    // The index stops naming a provider before its credential is deleted and
    // keeps listing it as removing until the deletion is confirmed: an
    // interrupted removal then neither leaves an index naming a deleted
    // credential nor forgets one still held.
    let mut failures = Vec::new();
    if !removed.is_empty() {
        write_auth_index(credentials, path, &providers, &removed)?;
        for provider in removed {
            if let Err(error) = credentials.delete(&auth_keyring_account(&provider)) {
                failures.push((provider, error));
            }
        }
    }
    let pending: Vec<String> = failures
        .iter()
        .map(|(provider, _)| provider.clone())
        .collect();
    write_auth_index(credentials, path, &providers, &pending)?;
    Ok(failures)
}

fn write_auth_index(
    credentials: &dyn CredentialStore,
    path: &Path,
    providers: &[String],
    removing: &[String],
) -> Result<()> {
    let index = AuthKeyringIndex {
        version: AUTH_INDEX_VERSION,
        storage: AUTH_INDEX_STORAGE.to_string(),
        providers: providers.to_vec(),
        removing: removing.to_vec(),
        scope: Some(credentials.scope().to_string()),
    };
    let data = serde_json::to_string_pretty(&index).context("Failed to serialize auth index")?;
    write_owner_only_file(path, &data)
}

fn adopt_legacy_credential(store: &mut AuthStore, content: &str) -> Result<bool> {
    if ["managed_cloud", "agiworkforce"].iter().any(|key| {
        store.entries.get(*key).is_some_and(|entry| match entry {
            AuthEntry::OAuth { access, .. } => !access.is_empty(),
            AuthEntry::ApiKey { key } => !key.is_empty(),
        })
    }) {
        return Ok(false);
    }
    let token = crate::tier_cache::jwt_from_legacy_auth_toml(content)
        .context("The legacy credential could not be parsed")?;
    store.entries.insert(
        "managed_cloud".to_string(),
        AuthEntry::ApiKey { key: token },
    );
    Ok(true)
}

fn apply_auth_transaction<T>(
    store: &mut AuthStore,
    change: impl FnOnce(&mut AuthStore) -> Result<T>,
    persist: impl FnOnce(&AuthStore) -> Result<()>,
    committed: impl FnOnce(&T),
) -> Result<T> {
    let before = store.entries.clone();
    let result = change(store)?;
    if store.entries != before {
        persist(store)?;
    }
    committed(&result);
    Ok(result)
}

fn apply_replacing_transaction<T>(
    store: &mut AuthStore,
    unreadable: &mut BTreeSet<String>,
    change: impl FnOnce(&mut AuthStore, &mut BTreeSet<String>) -> Result<T>,
    persist: impl FnOnce(&AuthStore, &BTreeSet<String>) -> Result<()>,
    committed: impl FnOnce(&T),
) -> Result<T> {
    let entries_before = store.entries.clone();
    let unreadable_before = unreadable.clone();
    let result = change(store, unreadable)?;
    unreadable.retain(|provider| !store.entries.contains_key(provider));
    if store.entries != entries_before || *unreadable != unreadable_before {
        persist(store, unreadable)?;
    }
    committed(&result);
    Ok(result)
}

impl AuthStore {
    fn mutation_lock() -> Result<std::fs::File> {
        let dir = crate::config::CliConfig::config_dir()?;
        std::fs::create_dir_all(&dir).context("Failed to create config directory")?;
        let mut options = std::fs::OpenOptions::new();
        options.create(true).truncate(false).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = options
            .open(dir.join("auth-mutation.lock"))
            .context("Failed to open the credential mutation lock")?;
        file.lock().context("Failed to lock credential mutations")?;
        Ok(file)
    }

    pub fn load() -> Result<Self> {
        let _lock = Self::mutation_lock()?;
        Self::load_unlocked()
    }

    // The callback holds the mutation lock and must not re-enter AuthStore.
    pub(crate) fn with_snapshot<T>(read: impl FnOnce(Result<Self>) -> T) -> Result<T> {
        let _lock = Self::mutation_lock()?;
        Ok(read(Self::load_unlocked()))
    }

    pub fn transaction<T>(change: impl FnOnce(&mut Self) -> Result<T>) -> Result<T> {
        Self::transaction_with_commit(change, |_| {})
    }

    // Both callbacks run under the mutation lock and must not re-enter AuthStore.
    // Keyring persistence is serialized, but its multiple writes cannot roll back.
    pub fn transaction_with_commit<T>(
        change: impl FnOnce(&mut Self) -> Result<T>,
        committed: impl FnOnce(&T),
    ) -> Result<T> {
        let _lock = Self::mutation_lock()?;
        let mut store = Self::load_unlocked()?;
        apply_auth_transaction(&mut store, change, Self::save_unlocked, committed)
    }

    // Sign-in and sign-out must work when saved credentials cannot be read. The
    // second argument names credentials the store would not return: a name left
    // there stays in the index unread, a name removed from it is signed out.
    // Both callbacks run under the mutation lock and must not re-enter AuthStore.
    pub fn transaction_replacing_unreadable<T>(
        change: impl FnOnce(&mut Self, &mut BTreeSet<String>) -> Result<T>,
        committed: impl FnOnce(&T),
    ) -> Result<T> {
        let _lock = Self::mutation_lock()?;
        let (mut store, mut unreadable) = Self::load_replacing_unlocked()?;
        apply_replacing_transaction(
            &mut store,
            &mut unreadable,
            change,
            Self::save_replacing_unlocked,
            committed,
        )
    }

    fn load_unlocked() -> Result<Self> {
        let mut store = Self::load_current_unlocked()?;
        store.migrate_legacy_unlocked(&BTreeSet::new(), false)?;
        Ok(store)
    }

    fn load_replacing_unlocked() -> Result<(Self, BTreeSet<String>)> {
        let path = auth_path()?;
        let (mut store, unreadable) = match std::fs::read_to_string(&path) {
            Ok(data) => match parse_auth_keyring_index(&data) {
                Some(index) => recover_keyring_auth_for_root(
                    &OsKeyring::for_config_root()?,
                    &OsKeyring::unscoped(),
                    index,
                ),
                None => (
                    read_file_store(&path, &data).unwrap_or_default(),
                    BTreeSet::new(),
                ),
            },
            Err(_) => (Self::default(), BTreeSet::new()),
        };
        store.migrate_legacy_unlocked(&unreadable, true)?;
        Ok((store, unreadable))
    }

    fn migrate_legacy_unlocked(&mut self, kept: &BTreeSet<String>, replacing: bool) -> Result<()> {
        let legacy = crate::config::CliConfig::config_dir()?.join("auth.toml");
        if !legacy
            .try_exists()
            .context("Failed to inspect the legacy credential")?
        {
            return Ok(());
        }
        let adopted = if check_file_permissions_secure(&legacy) {
            std::fs::read_to_string(&legacy)
                .context("Failed to read the legacy credential")
                .and_then(|content| adopt_legacy_credential(self, &content))
        } else {
            Err(anyhow::anyhow!(
                "The legacy credential file is not owner-only; refusing migration"
            ))
        };
        match adopted {
            Ok(true) if replacing => self.save_replacing_unlocked(kept)?,
            Ok(true) => self.save_unlocked()?,
            Ok(false) => {}
            Err(error) if replacing => {
                let aside = set_aside_unreadable(&legacy)?;
                crate::output::print_warn(&format!(
                    "{} could not be used ({error:#}), so it was moved to {} and is no longer read. Delete it once you no longer need it.",
                    legacy.display(),
                    aside.display()
                ));
                return Ok(());
            }
            Err(error) => return Err(error),
        }
        std::fs::remove_file(&legacy).context("Failed to remove the migrated credential")
    }

    fn load_current_unlocked() -> Result<Self> {
        let path = auth_path()?;
        if !path
            .try_exists()
            .context("Failed to inspect the credential index")?
        {
            return Ok(Self::default());
        }
        let data = std::fs::read_to_string(&path).context("Failed to read auth.json")?;
        if let Some(index) = parse_auth_keyring_index(&data) {
            let keyring = OsKeyring::for_config_root()?;
            if crate::secure_store::uses_keychain() {
                return load_keyring_auth_for_root(
                    &keyring,
                    &OsKeyring::unscoped(),
                    &path,
                    index,
                    false,
                );
            }
            // A Linux install upgraded from the kernel keyring may find it
            // emptied by a reboot; a credential it no longer holds is signed
            // out, not a failure that blocks signing in again.
            let store =
                load_keyring_auth_for_root(&keyring, &OsKeyring::unscoped(), &path, index, true)?;
            store.save_unlocked()?;
            return Ok(store);
        }

        // One-time migration from the legacy owner-readable JSON file. We do
        // not silently fall back to plaintext when the OS keyring fails; an
        // explicit headless opt-out is required for that compatibility mode.
        let store = read_file_store(&path, &data)?;
        if crate::secure_store::uses_keychain() {
            save_keyring_auth(&OsKeyring::for_config_root()?, &path, &store).context(
                "Could not migrate auth.json into the OS keyring; set AGIWORKFORCE_NO_KEYRING=1 only in a trusted headless environment to retain the owner-only file store",
            )?;
        }
        Ok(store)
    }

    fn save_unlocked(&self) -> Result<()> {
        let dir = crate::config::CliConfig::config_dir()?;
        std::fs::create_dir_all(&dir).context("Failed to create config directory")?;
        let path = auth_path()?;
        if !crate::secure_store::uses_keychain() {
            let data =
                serde_json::to_string_pretty(self).context("Failed to serialize auth store")?;
            return write_owner_only_file(&path, &data);
        }
        save_keyring_auth(&OsKeyring::for_config_root()?, &path, self).context(KEYRING_SAVE_REFUSED)
    }

    fn save_replacing_unlocked(&self, kept: &BTreeSet<String>) -> Result<()> {
        if !crate::secure_store::uses_keychain() {
            self.save_unlocked()?;
            for provider in kept {
                crate::output::print_warn(&dropped_from_file_store(provider));
            }
            return Ok(());
        }
        let dir = crate::config::CliConfig::config_dir()?;
        std::fs::create_dir_all(&dir).context("Failed to create config directory")?;
        let undeleted =
            write_keyring_auth(&OsKeyring::for_config_root()?, &auth_path()?, self, kept)
                .context(KEYRING_SAVE_REFUSED)?;
        for (provider, error) in undeleted {
            crate::output::print_warn(&kept_by_keychain(&provider, &error));
        }
        Ok(())
    }
}

fn dropped_from_file_store(provider: &str) -> String {
    format!(
        "{provider} is signed out here: its saved credential could not be read, and the owner-only credential file cannot keep a credential it could not read. Run `{}` to enter it again.",
        sign_in_command(provider)
    )
}

fn kept_by_keychain(provider: &str, error: &anyhow::Error) -> String {
    format!(
        "{provider} is signed out here, but the OS credential store would not delete its saved credential ({error:#}). The next saved sign-in tries again."
    )
}

fn set_aside_unreadable(path: &Path) -> Result<PathBuf> {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("credential");
    let aside = path.with_file_name(format!(
        "{name}.unreadable-{}",
        chrono::Utc::now().format("%Y%m%dT%H%M%S%.3fZ")
    ));
    std::fs::rename(path, &aside)
        .with_context(|| format!("Could not move the unreadable {} aside", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&aside, std::fs::Permissions::from_mode(0o600)).with_context(
            || {
                format!(
                    "Moved the unreadable credential file to {}, but could not make it owner-only",
                    aside.display()
                )
            },
        )?;
    }
    Ok(aside)
}

const KEYRING_SAVE_REFUSED: &str = "Could not persist credentials in the OS keyring; set AGIWORKFORCE_NO_KEYRING=1 only in a trusted headless environment to use an owner-only file";

// ──────────────────────────────────────────────────────────────────────────────
// Credential-use trail
// ──────────────────────────────────────────────────────────────────────────────

const CREDENTIAL_USE_LOG: &str = "credential-use.jsonl";
const CREDENTIAL_USE_LOG_MAX_ENTRIES: usize = 500;

/// One occasion a stored credential was read out of the credential store and
/// turned into an outbound token, or written into it.
///
/// "This account is only used when you say so" is a claim, and a claim with no
/// record behind it cannot be checked. Nothing here is a secret: the provider
/// name, what it was used for, and when.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialUse {
    pub at_ms: i64,
    pub provider: String,
    pub purpose: String,
}

fn credential_use_log_path() -> Result<PathBuf> {
    Ok(crate::config::CliConfig::config_dir()?.join(CREDENTIAL_USE_LOG))
}

/// Append one credential use to the local trail. Best effort: a CLI run must
/// not fail because its audit file is unwritable, and the caller has already
/// decided the use is legitimate.
pub fn record_credential_use(provider: &str, purpose: &str) {
    let Ok(path) = credential_use_log_path() else {
        return;
    };
    let mut entries = read_credential_uses(&path);
    entries.push(CredentialUse {
        at_ms: chrono::Utc::now().timestamp_millis(),
        provider: provider.to_string(),
        purpose: purpose.to_string(),
    });
    if entries.len() > CREDENTIAL_USE_LOG_MAX_ENTRIES {
        entries.drain(..entries.len() - CREDENTIAL_USE_LOG_MAX_ENTRIES);
    }
    let serialized = entries
        .iter()
        .filter_map(|entry| serde_json::to_string(entry).ok())
        .collect::<Vec<_>>()
        .join("\n");
    let _ = write_owner_only_file(&path, &format!("{serialized}\n"));
}

fn read_credential_uses(path: &Path) -> Vec<CredentialUse> {
    let Ok(data) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    data.lines()
        .filter_map(|line| serde_json::from_str::<CredentialUse>(line).ok())
        .collect()
}

/// Every recorded credential use, oldest first.
pub fn credential_uses() -> Vec<CredentialUse> {
    credential_use_log_path()
        .map(|path| read_credential_uses(&path))
        .unwrap_or_default()
}

fn last_credential_use(uses: &[CredentialUse], provider: &str) -> Option<i64> {
    uses.iter()
        .filter(|use_| use_.provider == provider)
        .map(|use_| use_.at_ms)
        .max()
}

/// Free-function wrapper for `AuthStore::load()` (used by models.rs integration).
pub fn load_auth() -> Result<AuthStore> {
    AuthStore::load()
}

/// Format a duration in milliseconds into a human-readable string like "expires in 2h 30m"
/// or "expired 5m ago" for negative values.
fn format_duration_ms(ms: i64) -> String {
    if ms == 0 {
        return "expired".to_string();
    }
    let (prefix, suffix, abs_ms) = if ms > 0 {
        ("expires in ", "", ms)
    } else {
        ("expired ", " ago", -ms)
    };
    let total_secs = abs_ms / 1000;
    let hours = total_secs / 3600;
    let mins = (total_secs % 3600) / 60;
    let duration = if hours > 0 {
        format!("{}h {}m", hours, mins)
    } else if mins > 0 {
        format!("{}m", mins)
    } else {
        format!("{}s", total_secs)
    };
    format!("{}{}{}", prefix, duration, suffix)
}

/// Returns the current auth status for all configured providers.
pub fn auth_status() -> Result<Vec<AuthStatusEntry>> {
    let store = AuthStore::load()?;
    let now_ms = chrono::Utc::now().timestamp_millis();
    let perms_secure = auth_path()
        .map(|path| {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|data| parse_auth_keyring_index(&data))
                .is_some()
                || check_file_permissions_secure(&path)
        })
        .unwrap_or(false);
    let results = auth_status_from_store(&store, now_ms, perms_secure, &credential_uses());
    Ok(with_environment_auth_status(results, |name| {
        std::env::var(name).ok()
    }))
}

fn with_environment_auth_status(
    mut results: Vec<AuthStatusEntry>,
    variable: impl Fn(&str) -> Option<String>,
) -> Vec<AuthStatusEntry> {
    results.extend(environment_auth_status(variable));
    results.sort_by(|a, b| a.provider.cmp(&b.provider));
    results
}

fn environment_auth_status(variable: impl Fn(&str) -> Option<String>) -> Vec<AuthStatusEntry> {
    std::iter::once((AGIWORKFORCE_AUTH_KEY, "AGIWORKFORCE_JWT"))
        .chain(
            API_KEY_PROVIDERS
                .iter()
                .map(|provider| (provider.id, provider.env_var)),
        )
        .filter_map(|(provider, env_var)| {
            variable(env_var)
                .filter(|value| !value.trim().is_empty())
                .map(|_| AuthStatusEntry {
                    provider: provider.to_string(),
                    auth_type: "env".to_string(),
                    status: "active".to_string(),
                    expires_in: None,
                    has_refresh_token: false,
                    permissions_secure: true,
                    last_used: Some(format!("from {env_var}")),
                })
        })
        .collect()
}

/// Core status logic, separated from disk I/O for testability.
fn auth_status_from_store(
    store: &AuthStore,
    now_ms: i64,
    permissions_secure: bool,
    uses: &[CredentialUse],
) -> Vec<AuthStatusEntry> {
    let mut results = Vec::new();

    for (provider, entry) in &store.entries {
        let last_used = last_credential_use(uses, provider)
            .map(|at_ms| format_duration_ms(at_ms - now_ms).replace("expired", "used"));
        let status_entry = match entry {
            AuthEntry::OAuth {
                expires, refresh, ..
            } => {
                // Determine token type label from provider name
                let auth_type = match provider.as_str() {
                    "agiworkforce" => "AGI OAuth".to_string(),
                    "managed_cloud" => "AGI OAuth".to_string(),
                    "copilot" => "Copilot OAuth".to_string(),
                    _ => "oauth".to_string(),
                };

                let has_refresh = !refresh.is_empty();

                let (status, expires_in) = if *expires <= 0 {
                    // expires=0 means no expiry info (e.g. copilot GitHub token)
                    ("unknown".to_string(), None)
                } else {
                    // Sanity check: reject expiry timestamps more than 2 years in the future
                    // (OAuth tokens rarely live longer; this catches clock skew or tampering)
                    let max_reasonable = now_ms + (2 * 365 * 24 * 3600 * 1000);
                    if *expires > max_reasonable {
                        (
                            "unknown".to_string(),
                            Some("expiry too far in future".to_string()),
                        )
                    } else {
                        let remaining = *expires - now_ms;
                        if remaining <= 0 {
                            let display = format_duration_ms(remaining);
                            ("expired".to_string(), Some(display))
                        } else {
                            let display = format_duration_ms(remaining);
                            ("active".to_string(), Some(display))
                        }
                    }
                };
                AuthStatusEntry {
                    provider: provider.clone(),
                    auth_type,
                    status,
                    expires_in,
                    has_refresh_token: has_refresh,
                    permissions_secure,
                    last_used,
                }
            }
            AuthEntry::ApiKey { .. } => AuthStatusEntry {
                provider: provider.clone(),
                auth_type: "api_key".to_string(),
                status: "active".to_string(),
                expires_in: None,
                has_refresh_token: false,
                permissions_secure,
                last_used,
            },
        };
        results.push(status_entry);
    }

    // Sort by provider name for deterministic output
    results.sort_by(|a, b| a.provider.cmp(&b.provider));
    results
}

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

const COPILOT_AUTH_KEY: &str = "copilot";
const COPILOT_SIGN_IN_UNAVAILABLE: &str = "GitHub Copilot sign-in is not available in this version. Run `agi login` for your AGI account, or `agi login <provider>` to use your own API key.";
const AGIWORKFORCE_AUTH_KEY: &str = "agiworkforce";
// The device-grant endpoints live on the web origin (apps/web: POST
// /api/auth/device/code, /token, /refresh), so this base MUST include `/api`:
// `device_code_login` appends `/auth/device/code`. The /api/me tier lookup
// uses the bare origin (tier_cache::DEFAULT_API_BASE). AGI_AUTH_BASE overrides
// this base for a trusted host (see app_server::account::device_auth_base).
const AGIWORKFORCE_API_BASE: &str = "https://agiworkforce.com/api";

/// Device-grant endpoint base, so every surface that starts a login targets
/// the one host this file documents.
pub fn agiworkforce_api_base() -> &'static str {
    AGIWORKFORCE_API_BASE
}

fn save_auth_entry(key: &str, entry: AuthEntry) -> Result<()> {
    AuthStore::transaction_replacing_unreadable(
        |store, _| {
            store.entries.insert(key.to_string(), entry);
            Ok(())
        },
        |_| {},
    )?;
    record_credential_use(key, "signed in and saved a credential");
    Ok(())
}

pub(crate) fn is_agiworkforce_login_provider(provider: Option<&str>) -> bool {
    matches!(provider, None | Some("agi") | Some("agiworkforce"))
}

pub async fn login_agiworkforce() -> Result<()> {
    let base = crate::app_server::account::device_auth_base();
    let entry = crate::oauth::device_code_login(&base).await?;
    crate::app_server::account::save_device_grant(entry)?;
    record_credential_use(AGIWORKFORCE_AUTH_KEY, "signed in and saved a credential");
    let _ = crate::device_registry::send_heartbeat(crate::account_privacy_mode()).await;
    Ok(())
}

#[derive(Debug, Clone, Copy)]
struct ApiKeyProvider {
    id: &'static str,
    label: &'static str,
    env_var: &'static str,
}

const API_KEY_PROVIDERS: &[ApiKeyProvider] = &[
    ApiKeyProvider {
        id: "anthropic",
        label: "Anthropic",
        env_var: "ANTHROPIC_API_KEY",
    },
    ApiKeyProvider {
        id: "openai",
        label: "OpenAI",
        env_var: "OPENAI_API_KEY",
    },
    ApiKeyProvider {
        id: "google",
        label: "Google",
        env_var: "GOOGLE_API_KEY",
    },
    ApiKeyProvider {
        id: "xai",
        label: "xAI",
        env_var: "XAI_API_KEY",
    },
    ApiKeyProvider {
        id: "deepseek",
        label: "DeepSeek",
        env_var: "DEEPSEEK_API_KEY",
    },
    ApiKeyProvider {
        id: "minimax",
        label: "MiniMax",
        env_var: "MINIMAX_API_KEY",
    },
    ApiKeyProvider {
        id: "perplexity",
        label: "Perplexity",
        env_var: "PERPLEXITY_API_KEY",
    },
    ApiKeyProvider {
        id: "qwen",
        label: "Qwen / DashScope",
        env_var: "QWEN_API_KEY",
    },
    ApiKeyProvider {
        id: "moonshot",
        label: "Moonshot / Kimi",
        env_var: "MOONSHOT_API_KEY",
    },
    ApiKeyProvider {
        id: "zhipu",
        label: "Zhipu / GLM",
        env_var: "ZHIPU_API_KEY",
    },
    ApiKeyProvider {
        id: "ollama-cloud",
        label: "Ollama Cloud",
        env_var: "OLLAMA_API_KEY",
    },
    ApiKeyProvider {
        id: "openrouter",
        label: "OpenRouter",
        env_var: "OPENROUTER_API_KEY",
    },
    ApiKeyProvider {
        id: "nvidia",
        label: "NVIDIA NIM",
        env_var: "NVIDIA_API_KEY",
    },
    ApiKeyProvider {
        id: "brave",
        label: "Brave Search (web search)",
        env_var: "BRAVE_SEARCH_API_KEY",
    },
    ApiKeyProvider {
        id: "tavily",
        label: "Tavily (web search)",
        env_var: "TAVILY_API_KEY",
    },
];

fn normalize_api_key_provider_id(provider: &str) -> Option<&'static str> {
    match provider.to_ascii_lowercase().as_str() {
        "anthropic" => Some("anthropic"),
        "openai" => Some("openai"),
        "google" => Some("google"),
        "xai" | "grok" => Some("xai"),
        "deepseek" => Some("deepseek"),
        "minimax" | "minimax-ai" | "minimaxai" => Some("minimax"),
        "perplexity" => Some("perplexity"),
        "qwen" | "dashscope" => Some("qwen"),
        "moonshot" | "kimi" => Some("moonshot"),
        "zhipu" | "glm" => Some("zhipu"),
        "ollama-cloud" | "ollama_cloud" | "ollamacloud" => Some("ollama-cloud"),
        "openrouter" | "open-router" | "open_router" => Some("openrouter"),
        "nvidia" | "nvidia-nim" | "nvidia_nim" | "nim" => Some("nvidia"),
        "brave" | "brave-search" | "brave_search" => Some("brave"),
        "tavily" => Some("tavily"),
        _ => None,
    }
}

fn api_key_provider(provider: &str) -> Option<ApiKeyProvider> {
    let normalized = normalize_api_key_provider_id(provider)?;
    API_KEY_PROVIDERS
        .iter()
        .copied()
        .find(|candidate| candidate.id == normalized)
}

pub struct ApiKeyProviderSummary {
    pub id: &'static str,
    pub label: &'static str,
    pub env_var: &'static str,
    pub configured: bool,
}

pub fn api_key_providers() -> Result<Vec<ApiKeyProviderSummary>> {
    let store = AuthStore::load()?;
    Ok(API_KEY_PROVIDERS
        .iter()
        .map(|provider| ApiKeyProviderSummary {
            id: provider.id,
            label: provider.label,
            env_var: provider.env_var,
            configured: matches!(
                store.entries.get(provider.id),
                Some(AuthEntry::ApiKey { .. })
            ),
        })
        .collect())
}

pub fn save_api_key(provider: &str, key: &str) -> Result<()> {
    let provider = api_key_provider(provider)
        .ok_or_else(|| anyhow::anyhow!("Unknown API-key provider '{}'", provider))?;
    save_auth_entry(
        provider.id,
        AuthEntry::ApiKey {
            key: normalized_api_key(key)?.to_string(),
        },
    )
}

fn normalized_api_key(key: &str) -> Result<&str> {
    let key = key.trim();
    if key.is_empty()
        || key
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
    {
        bail!("That is not an API key.");
    }
    Ok(key)
}

pub fn remove_api_key(provider: &str) -> Result<bool> {
    let provider = api_key_provider(provider)
        .ok_or_else(|| anyhow::anyhow!("Unknown API-key provider '{}'", provider))?;
    let removed = AuthStore::transaction(|store| {
        if !matches!(
            store.entries.get(provider.id),
            Some(AuthEntry::ApiKey { .. })
        ) {
            return Ok(false);
        }
        store.entries.remove(provider.id);
        Ok(true)
    })?;
    if !removed {
        return Ok(false);
    }
    record_credential_use(provider.id, "removed a saved API key");
    Ok(true)
}

pub(crate) fn is_api_key_provider(provider: &str) -> bool {
    api_key_provider(provider).is_some()
}

pub async fn interactive_api_key_login_for_provider(provider: &str) -> Result<()> {
    let provider = api_key_provider(provider)
        .ok_or_else(|| anyhow::anyhow!("Unknown API-key provider '{}'", provider))?;

    let key = dialoguer::Password::new()
        .with_prompt(format!(
            "Enter {} API key ({})",
            provider.label, provider.env_var
        ))
        .interact()
        .context("Failed to read API key")?;

    if key.trim().is_empty() {
        bail!("Empty API key.");
    }

    let key = normalized_api_key(&key)?.to_string();
    save_auth_entry(provider.id, AuthEntry::ApiKey { key })?;
    println!(
        "  {} {} API key saved to the {}.",
        ts::success_header("Done!"),
        provider.label,
        credential_storage_label(),
    );
    Ok(())
}

/// Login for a specific provider by name (used by onboarding wizard).
///
/// `None` intentionally means AGI Workforce cloud login.
pub async fn interactive_login_for_provider(provider: Option<&str>) -> Result<()> {
    if is_agiworkforce_login_provider(provider) {
        return login_agiworkforce().await;
    }

    match provider {
        Some(pid) if pid.eq_ignore_ascii_case(COPILOT_AUTH_KEY) => {
            bail!(COPILOT_SIGN_IN_UNAVAILABLE)
        }
        Some(pid) => {
            if is_api_key_provider(pid) {
                interactive_api_key_login_for_provider(pid).await
            } else {
                bail!(
                    "Unknown provider '{}'. Available: agiworkforce, anthropic, openai, google, xai, deepseek, minimax, perplexity, qwen, moonshot, zhipu, ollama-cloud, openrouter, nvidia, and brave or tavily for web search",
                    pid
                )
            }
        }
        None => unreachable!("handled by is_agiworkforce_login_provider"),
    }
}

/// Interactive API key setup (used by onboarding wizard): the id of the
/// provider whose key was saved, or `None` when the user cancelled.
pub async fn interactive_api_key_login_choice() -> Result<Option<&'static str>> {
    let mut choices: Vec<String> = API_KEY_PROVIDERS
        .iter()
        .map(|provider| format!("{} ({})", provider.label, provider.env_var))
        .collect();
    choices.push("Cancel".to_string());

    let selection = dialoguer::Select::new()
        .with_prompt("Select provider for API key")
        .items(&choices)
        .default(0)
        .interact()
        .context("Failed to display provider menu")?;

    let Some(provider) = API_KEY_PROVIDERS.get(selection) else {
        println!("Cancelled.");
        return Ok(None);
    };

    interactive_api_key_login_for_provider(provider.id).await?;
    Ok(Some(provider.id))
}

// ──────────────────────────────────────────────────────────────────────────────
// Base64url Decoder (for JWT parsing, no external crate needed)
// ──────────────────────────────────────────────────────────────────────────────

fn base64url_decode(input: &str) -> Result<Vec<u8>> {
    // Base64url alphabet: A-Z a-z 0-9 - _
    // Standard alphabet:  A-Z a-z 0-9 + /
    const TABLE: [u8; 128] = {
        let mut t = [255u8; 128];
        let mut i = 0u8;
        while i < 26 {
            t[(b'A' + i) as usize] = i;
            t[(b'a' + i) as usize] = i + 26;
            i += 1;
        }
        let mut d = 0u8;
        while d < 10 {
            t[(b'0' + d) as usize] = d + 52;
            d += 1;
        }
        t[b'-' as usize] = 62; // base64url uses - instead of +
        t[b'_' as usize] = 63; // base64url uses _ instead of /
        t[b'+' as usize] = 62; // accept standard too
        t[b'/' as usize] = 63;
        t
    };

    let input = input.trim_end_matches('=');
    let len = input.len();
    let mut out = Vec::with_capacity(len * 3 / 4);
    let mut buf: u32 = 0;
    let mut bits: u32 = 0;

    for &b in input.as_bytes() {
        if b >= 128 {
            bail!("Invalid base64url character");
        }
        let val = TABLE[b as usize];
        if val == 255 {
            bail!("Invalid base64url character: '{}'", b as char);
        }
        buf = (buf << 6) | val as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }

    Ok(out)
}

/// The `sub` claim of a JWT, used as the identity that locally cached account
/// data belongs to. The payload is read, never trusted: a wrong value costs a
/// re-sync, and no authorization decision is made from it.
pub(crate) fn jwt_subject(jwt: &str) -> Option<String> {
    let payload = jwt.split('.').nth(1)?;
    let decoded = base64url_decode(payload).ok()?;
    let claims: serde_json::Value = serde_json::from_slice(&decoded).ok()?;
    claims
        .get("sub")
        .and_then(serde_json::Value::as_str)
        .filter(|subject| !subject.trim().is_empty())
        .map(str::to_string)
}

// Continuity only: the server still authenticates the token. Missing claims
// must never make two unrelated credentials look like the same session.
pub(crate) fn jwt_session_identity(jwt: &str) -> Option<(String, String)> {
    let mut segments = jwt.split('.');
    let header = segments.next()?;
    let payload = segments.next()?;
    let signature = segments.next()?;
    if header.is_empty() || signature.is_empty() || segments.next().is_some() {
        return None;
    }
    let decoded = base64url_decode(payload).ok()?;
    let claims: serde_json::Value = serde_json::from_slice(&decoded).ok()?;
    let claim = |name: &str| {
        claims
            .get(name)?
            .as_str()
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string)
    };
    Some((claim("sub")?, claim("sid")?))
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_adoption_never_shadows_a_current_managed_credential() {
        let mut store = AuthStore::default();
        store.entries.insert(
            "agiworkforce".to_string(),
            AuthEntry::ApiKey {
                key: "current".to_string(),
            },
        );
        assert!(!adopt_legacy_credential(&mut store, "malformed legacy data").unwrap());
        assert!(!store.entries.contains_key("managed_cloud"));
        store.entries.clear();
        assert!(adopt_legacy_credential(&mut store, "malformed legacy data").is_err());
        assert!(store.entries.is_empty());
        assert!(adopt_legacy_credential(
            &mut store,
            "[entries.agiworkforce]\ntoken = 'synthetic-legacy'\n"
        )
        .unwrap());
        assert_eq!(
            store.entries.get("managed_cloud"),
            Some(&AuthEntry::ApiKey {
                key: "synthetic-legacy".to_string()
            })
        );
    }

    #[test]
    fn failed_persistence_does_not_run_post_commit_cleanup() {
        let mut store = AuthStore::default();
        let cleaned = std::cell::Cell::new(false);
        let result = apply_auth_transaction(
            &mut store,
            |store| {
                store.entries.insert(
                    "agiworkforce".to_string(),
                    AuthEntry::ApiKey {
                        key: "synthetic".to_string(),
                    },
                );
                Ok(())
            },
            |_| bail!("synthetic persistence refusal"),
            |_| cleaned.set(true),
        );
        assert!(result.is_err());
        assert!(!cleaned.get());
    }

    #[test]
    fn transaction_cleanup_follows_persistence_and_unchanged_state_needs_no_write() {
        let mut store = AuthStore::default();
        let persisted = std::cell::Cell::new(false);
        apply_auth_transaction(
            &mut store,
            |store| {
                store.entries.insert(
                    "agiworkforce".to_string(),
                    AuthEntry::ApiKey {
                        key: "synthetic".to_string(),
                    },
                );
                Ok(())
            },
            |_| {
                persisted.set(true);
                Ok(())
            },
            |_| assert!(persisted.get()),
        )
        .unwrap();
        apply_auth_transaction(
            &mut store,
            |_| Ok(()),
            |_| panic!("unchanged store written"),
            |_| {},
        )
        .unwrap();
    }

    #[test]
    fn default_login_provider_targets_agiworkforce() {
        assert!(is_agiworkforce_login_provider(None));
        assert!(is_agiworkforce_login_provider(Some("agi")));
        assert!(is_agiworkforce_login_provider(Some("agiworkforce")));

        assert!(!is_agiworkforce_login_provider(Some("openai")));
        assert!(!is_agiworkforce_login_provider(Some("chatgpt")));
        assert!(!is_agiworkforce_login_provider(Some("copilot")));
        assert!(!is_agiworkforce_login_provider(Some("anthropic")));
    }

    // Helper: build a minimal AuthStore in-memory (bypasses disk I/O)
    fn make_store(entries: Vec<(&str, AuthEntry)>) -> AuthStore {
        let mut map = HashMap::new();
        for (k, v) in entries {
            map.insert(k.to_string(), v);
        }
        AuthStore { entries: map }
    }

    // ── auth_status tests ──

    #[test]
    fn test_auth_status_empty_store() {
        let store = AuthStore::default();
        let now_ms = chrono::Utc::now().timestamp_millis();
        let results = auth_status_from_store(&store, now_ms, true, &[]);
        assert!(results.is_empty(), "empty store should yield no entries");
    }

    #[test]
    fn test_auth_status_expired_oauth() {
        let now_ms = 1_700_000_000_000i64;
        let past_ms = now_ms - 300_000; // 5 minutes ago
        let store = make_store(vec![(
            "copilot",
            AuthEntry::OAuth {
                refresh: "refresh_tok_abc".into(),
                access: "access_tok_abc".into(),
                expires: past_ms,
            },
        )]);
        let results = auth_status_from_store(&store, now_ms, true, &[]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].status, "expired");
        assert_eq!(results[0].auth_type, "Copilot OAuth");
        // Should now show "expired 5m ago" instead of None
        assert!(results[0].expires_in.is_some());
        let display = results[0].expires_in.as_ref().unwrap();
        assert!(
            display.contains("expired"),
            "should say expired: {}",
            display
        );
        assert!(display.contains("ago"), "should say ago: {}", display);
        assert!(results[0].has_refresh_token);
        assert!(results[0].permissions_secure);
    }

    #[test]
    fn test_auth_status_active_oauth() {
        let now_ms = 1_700_000_000_000i64;
        let future_ms = now_ms + 9_000_000; // 2h 30m ahead
        let store = make_store(vec![(
            "copilot",
            AuthEntry::OAuth {
                refresh: "refresh_tok_abc".into(),
                access: "access_tok_abc".into(),
                expires: future_ms,
            },
        )]);
        let results = auth_status_from_store(&store, now_ms, true, &[]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].status, "active");
        let display = results[0].expires_in.as_ref().unwrap();
        assert!(
            display.contains("expires in"),
            "should say 'expires in': {}",
            display
        );
        assert!(display.contains("2h"), "should show hours: {}", display);
    }

    #[test]
    fn test_auth_status_copilot_type() {
        let store = make_store(vec![(
            "copilot",
            AuthEntry::OAuth {
                refresh: "ghp_abcdef1234567890".into(),
                access: "ghp_abcdef1234567890".into(),
                expires: 0,
            },
        )]);
        let now_ms = chrono::Utc::now().timestamp_millis();
        let results = auth_status_from_store(&store, now_ms, false, &[]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].auth_type, "Copilot OAuth");
        assert_eq!(results[0].status, "unknown"); // expires=0
        assert!(results[0].has_refresh_token);
        assert!(!results[0].permissions_secure);
    }

    #[test]
    fn test_auth_status_agiworkforce_type() {
        let store = make_store(vec![(
            "agiworkforce",
            AuthEntry::OAuth {
                refresh: "refresh".into(),
                access: "access".into(),
                expires: 0,
            },
        )]);
        let now_ms = chrono::Utc::now().timestamp_millis();
        let results = auth_status_from_store(&store, now_ms, true, &[]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].auth_type, "AGI OAuth");
    }

    #[test]
    fn test_auth_status_api_key() {
        let store = make_store(vec![(
            "openai",
            AuthEntry::ApiKey {
                key: "sk-test1234567890abcdef".into(),
            },
        )]);
        let now_ms = chrono::Utc::now().timestamp_millis();
        let results = auth_status_from_store(&store, now_ms, true, &[]);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].status, "active");
        assert_eq!(results[0].auth_type, "api_key");
        assert!(!results[0].has_refresh_token);
    }

    #[test]
    fn test_auth_status_no_refresh_token() {
        let store = make_store(vec![(
            "copilot",
            AuthEntry::OAuth {
                refresh: "".into(), // empty refresh token
                access: "access_tok_abc".into(),
                expires: 0,
            },
        )]);
        let now_ms = chrono::Utc::now().timestamp_millis();
        let results = auth_status_from_store(&store, now_ms, true, &[]);
        assert!(!results[0].has_refresh_token);
    }

    // ── Token refresh skew ──

    #[test]
    fn test_token_refresh_skew() {
        let now_ms = 1_000_000_000_000i64;
        let expires_in_20s = now_ms + 20_000;
        assert!(
            expires_in_20s > 0 && expires_in_20s < (now_ms + 30_000),
            "token expiring in 20s should be treated as expired with 30s skew"
        );
        let expires_in_60s = now_ms + 60_000;
        assert!(
            !(expires_in_60s > 0 && expires_in_60s < (now_ms + 30_000)),
            "token expiring in 60s should NOT be treated as expired"
        );
    }

    // ── JWT / base64url tests ──

    #[test]
    fn test_base64url_decode_hello() {
        let decoded = base64url_decode("SGVsbG8").unwrap();
        assert_eq!(decoded, b"Hello");
    }

    #[test]
    fn test_base64url_decode_with_padding() {
        let decoded = base64url_decode("SGk=").unwrap();
        assert_eq!(decoded, b"Hi");
        let decoded_no_pad = base64url_decode("SGk").unwrap();
        assert_eq!(decoded_no_pad, b"Hi");
    }

    #[test]
    fn test_base64url_decode_url_safe_chars() {
        let decoded_url = base64url_decode("P_8-").unwrap();
        let decoded_std = base64url_decode("P/8+").unwrap();
        assert_eq!(decoded_url, decoded_std);
    }

    // ── format_duration_ms (now with "expires in" / "expired X ago") ──

    #[test]
    fn test_format_duration_ms() {
        assert_eq!(format_duration_ms(0), "expired");
        assert_eq!(format_duration_ms(5_000), "expires in 5s");
        assert_eq!(format_duration_ms(120_000), "expires in 2m");
        assert_eq!(format_duration_ms(8_100_000), "expires in 2h 15m");
        assert_eq!(format_duration_ms(3_600_000), "expires in 1h 0m");
    }

    #[test]
    fn test_format_duration_ms_negative() {
        assert_eq!(format_duration_ms(-5_000), "expired 5s ago");
        assert_eq!(format_duration_ms(-300_000), "expired 5m ago");
        assert_eq!(format_duration_ms(-3_660_000), "expired 1h 1m ago");
    }

    #[test]
    fn keyring_accounts_do_not_disclose_provider_names() {
        let account = auth_keyring_account("private-enterprise-provider");
        assert!(account.starts_with("provider:"));
        assert_eq!(account.len(), "provider:".len() + 64);
        assert!(!account.contains("private-enterprise-provider"));
    }

    #[test]
    fn auth_index_contains_metadata_but_no_credentials() {
        let index = AuthKeyringIndex {
            version: AUTH_INDEX_VERSION,
            storage: AUTH_INDEX_STORAGE.to_string(),
            providers: vec!["openai".to_string(), "agiworkforce".to_string()],
            removing: Vec::new(),
            scope: Some(AUTH_KEYRING_SERVICE.to_string()),
        };
        let serialized = serde_json::to_string(&index).unwrap();

        assert!(parse_auth_keyring_index(&serialized).is_some());
        assert!(serialized.contains("openai"));
        assert!(!serialized.contains("sk-secret"));
        assert!(!serialized.contains("access_token"));
        assert!(!serialized.contains("refresh_token"));
    }

    /// An in-memory stand-in for the OS credential store, so the persistence
    /// rules are tested without a keychain prompt or a real keychain entry.
    #[derive(Default)]
    struct MemoryStore {
        secrets: std::sync::Mutex<HashMap<String, String>>,
    }

    impl MemoryStore {
        fn secrets(&self) -> Vec<String> {
            self.secrets
                .lock()
                .expect("store lock")
                .values()
                .cloned()
                .collect()
        }
    }

    impl CredentialStore for MemoryStore {
        fn get(&self, account: &str) -> Result<Option<String>> {
            Ok(self
                .secrets
                .lock()
                .expect("store lock")
                .get(account)
                .cloned())
        }
        fn set(&self, account: &str, secret: &str) -> Result<()> {
            self.secrets
                .lock()
                .expect("store lock")
                .insert(account.to_string(), secret.to_string());
            Ok(())
        }
        fn delete(&self, account: &str) -> Result<()> {
            self.secrets.lock().expect("store lock").remove(account);
            Ok(())
        }
    }

    /// What an unsigned binary sees on macOS when it runs unattended.
    struct DenyingStore;

    impl CredentialStore for DenyingStore {
        fn get(&self, _account: &str) -> Result<Option<String>> {
            bail!("the OS credential store denied access")
        }
        fn set(&self, _account: &str, _secret: &str) -> Result<()> {
            bail!("the OS credential store denied access")
        }
        fn delete(&self, _account: &str) -> Result<()> {
            bail!("the OS credential store denied access")
        }
    }

    fn store_with_secrets() -> AuthStore {
        make_store(vec![
            (
                "agiworkforce",
                AuthEntry::OAuth {
                    refresh: "refresh_tok_9f2c4ae81b3d5f60".into(),
                    access: "access_tok_7ad13be95c02f4d8".into(),
                    expires: 1_700_000_000_000,
                },
            ),
            (
                "openai",
                AuthEntry::ApiKey {
                    key: "sk-proj-0123456789abcdefghijklmnop".into(),
                },
            ),
        ])
    }

    fn every_secret(store: &AuthStore) -> Vec<String> {
        store
            .entries
            .values()
            .flat_map(|entry| match entry {
                AuthEntry::OAuth {
                    refresh, access, ..
                } => vec![refresh.clone(), access.clone()],
                AuthEntry::ApiKey { key } => vec![key.clone()],
            })
            .collect()
    }

    #[test]
    fn no_credential_reaches_disk_when_the_credential_store_holds_it() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let store = store_with_secrets();
        let keyring = MemoryStore::default();

        save_keyring_auth(&keyring, &path, &store).expect("save");

        let on_disk = std::fs::read_to_string(&path).expect("index file");
        for secret in every_secret(&store) {
            assert!(
                !on_disk.contains(&secret),
                "credential reached disk in plaintext: {on_disk}"
            );
        }
        // The credential material is in the store instead, one entry each.
        assert_eq!(keyring.secrets().len(), 2);
        for secret in every_secret(&store) {
            assert!(
                keyring.secrets().iter().any(|held| held.contains(&secret)),
                "credential is not in the credential store"
            );
        }

        let index = parse_auth_keyring_index(&on_disk).expect("index");
        let reloaded = load_keyring_auth(&keyring, index, false).expect("load");
        assert_eq!(reloaded.entries.len(), 2);
        let mut round_tripped = every_secret(&reloaded);
        let mut original = every_secret(&store);
        round_tripped.sort();
        original.sort();
        assert_eq!(round_tripped, original);
    }

    #[test]
    fn a_credential_store_denial_is_an_error_and_never_a_plaintext_fallback() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let store = store_with_secrets();

        let error = save_keyring_auth(&DenyingStore, &path, &store)
            .expect_err("a denied credential store must not report success");
        assert!(
            format!("{error:#}").contains("credential store"),
            "the error must name the credential store: {error:#}"
        );

        match std::fs::read_to_string(&path) {
            Err(_) => {}
            Ok(on_disk) => {
                for secret in every_secret(&store) {
                    assert!(
                        !on_disk.contains(&secret),
                        "a denied credential store fell back to plaintext: {on_disk}"
                    );
                }
            }
        }
    }

    #[test]
    fn a_credential_the_store_no_longer_holds_is_reported_not_skipped() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let keyring = MemoryStore::default();
        save_keyring_auth(&keyring, &path, &store_with_secrets()).expect("save");
        keyring
            .secrets
            .lock()
            .expect("store lock")
            .remove(&auth_keyring_account("openai"));

        let index = parse_auth_keyring_index(&std::fs::read_to_string(&path).expect("index"))
            .expect("parse");
        let error =
            load_keyring_auth(&keyring, index, false).expect_err("missing credential must error");
        assert!(format!("{error:#}").contains("openai"), "{error:#}");
    }

    #[test]
    fn an_emptied_kernel_keyring_signs_out_only_the_missing_provider() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let keyring = MemoryStore::default();
        save_keyring_auth(&keyring, &path, &store_with_secrets()).expect("save");
        keyring
            .secrets
            .lock()
            .expect("store lock")
            .remove(&auth_keyring_account("openai"));

        let index = parse_auth_keyring_index(&std::fs::read_to_string(&path).expect("index"))
            .expect("parse");
        let store = load_keyring_auth(&keyring, index, true).expect("load");
        assert_eq!(
            store.entries.keys().collect::<Vec<_>>(),
            vec!["agiworkforce"]
        );
    }

    #[test]
    fn a_keyring_failure_other_than_a_missing_entry_is_never_a_signed_out_store() {
        let index = AuthKeyringIndex {
            version: AUTH_INDEX_VERSION,
            storage: AUTH_INDEX_STORAGE.to_string(),
            providers: vec!["openai".to_string()],
            removing: Vec::new(),
            scope: Some(AUTH_KEYRING_SERVICE.to_string()),
        };
        let error = load_keyring_auth(&DenyingStore, index, true)
            .expect_err("a denied read must not become an empty store");
        assert!(format!("{error:#}").contains("denied"), "{error:#}");
    }

    #[test]
    fn dropping_a_provider_removes_its_credential_from_the_store() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let keyring = MemoryStore::default();
        save_keyring_auth(&keyring, &path, &store_with_secrets()).expect("save");

        let mut remaining = store_with_secrets();
        remaining.entries.remove("openai");
        save_keyring_auth(&keyring, &path, &remaining).expect("save");

        assert_eq!(keyring.secrets().len(), 1);
        assert!(keyring
            .get(&auth_keyring_account("openai"))
            .expect("get")
            .is_none());
    }

    struct FaultyStore {
        inner: MemoryStore,
        delete_fails: std::sync::atomic::AtomicBool,
        block_after_delete: std::sync::Mutex<Option<PathBuf>>,
    }

    impl FaultyStore {
        fn new(block_after_delete: Option<PathBuf>) -> Self {
            Self {
                inner: MemoryStore::default(),
                delete_fails: std::sync::atomic::AtomicBool::new(false),
                block_after_delete: std::sync::Mutex::new(block_after_delete),
            }
        }
    }

    impl CredentialStore for FaultyStore {
        fn get(&self, account: &str) -> Result<Option<String>> {
            self.inner.get(account)
        }
        fn set(&self, account: &str, secret: &str) -> Result<()> {
            self.inner.set(account, secret)
        }
        fn delete(&self, account: &str) -> Result<()> {
            if self.delete_fails.load(std::sync::atomic::Ordering::SeqCst) {
                bail!("the OS credential store refused to remove the credential")
            }
            self.inner.delete(account)?;
            if let Some(blocker) = self
                .block_after_delete
                .lock()
                .expect("blocker lock")
                .as_ref()
            {
                std::fs::create_dir_all(blocker)?;
            }
            Ok(())
        }
    }

    fn the_saved_index(path: &Path) -> AuthKeyringIndex {
        parse_auth_keyring_index(&std::fs::read_to_string(path).expect("index file"))
            .expect("parse index")
    }

    #[test]
    fn a_failed_index_write_after_a_removal_never_leaves_an_index_naming_a_deleted_credential() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let blocker = dir
            .path()
            .join(format!(".auth.json.{}.tmp", std::process::id()));
        let keyring = FaultyStore::new(Some(blocker.clone()));
        save_keyring_auth(&keyring, &path, &store_with_secrets()).expect("save");
        let mut remaining = store_with_secrets();
        remaining.entries.remove("openai");

        save_keyring_auth(&keyring, &path, &remaining)
            .expect_err("the final index write is blocked");

        let index = the_saved_index(&path);
        assert_eq!(index.providers, vec!["agiworkforce".to_string()]);
        let loaded = load_keyring_auth(&keyring, index, false)
            .expect("the index must still load after the interrupted removal");
        assert_eq!(
            loaded.entries.keys().collect::<Vec<_>>(),
            vec!["agiworkforce"]
        );

        std::fs::remove_dir(&blocker).unwrap();
        *keyring.block_after_delete.lock().unwrap() = None;
        save_keyring_auth(&keyring, &path, &remaining).expect("a retry completes the removal");
        let index = the_saved_index(&path);
        assert!(index.removing.is_empty());
        assert_eq!(index.providers, vec!["agiworkforce".to_string()]);
    }

    #[test]
    fn a_failed_deletion_is_retried_instead_of_forgotten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let keyring = FaultyStore::new(None);
        save_keyring_auth(&keyring, &path, &store_with_secrets()).expect("save");
        let mut remaining = store_with_secrets();
        remaining.entries.remove("openai");

        keyring
            .delete_fails
            .store(true, std::sync::atomic::Ordering::SeqCst);
        save_keyring_auth(&keyring, &path, &remaining).expect_err("the deletion is refused");

        let index = the_saved_index(&path);
        assert_eq!(index.providers, vec!["agiworkforce".to_string()]);
        assert_eq!(index.removing, vec!["openai".to_string()]);
        assert!(keyring
            .get(&auth_keyring_account("openai"))
            .unwrap()
            .is_some());

        keyring
            .delete_fails
            .store(false, std::sync::atomic::Ordering::SeqCst);
        save_keyring_auth(&keyring, &path, &remaining).expect("retry");

        assert!(keyring
            .get(&auth_keyring_account("openai"))
            .unwrap()
            .is_none());
        assert!(the_saved_index(&path).removing.is_empty());
    }

    #[test]
    fn signing_in_again_to_a_provider_pending_removal_keeps_its_credential() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let keyring = FaultyStore::new(None);
        save_keyring_auth(&keyring, &path, &store_with_secrets()).expect("save");
        let mut remaining = store_with_secrets();
        remaining.entries.remove("openai");
        keyring
            .delete_fails
            .store(true, std::sync::atomic::Ordering::SeqCst);
        save_keyring_auth(&keyring, &path, &remaining).expect_err("the deletion is refused");
        keyring
            .delete_fails
            .store(false, std::sync::atomic::Ordering::SeqCst);

        save_keyring_auth(&keyring, &path, &store_with_secrets()).expect("sign in again");

        let index = the_saved_index(&path);
        assert!(index.removing.is_empty());
        let loaded = load_keyring_auth(&keyring, index, false).expect("load");
        assert_eq!(loaded.entries.len(), 2);
    }

    #[test]
    fn two_config_roots_keep_their_own_credentials() {
        let dir = tempfile::tempdir().unwrap();
        let work_index = dir.path().join("work-auth.json");
        let personal_index = dir.path().join("personal-auth.json");
        let work_keyring = MemoryStore::default();
        let personal_keyring = MemoryStore::default();
        let work = make_store(vec![(
            "openai",
            AuthEntry::ApiKey {
                key: "sk-work".into(),
            },
        )]);
        let personal = make_store(vec![(
            "openai",
            AuthEntry::ApiKey {
                key: "sk-personal".into(),
            },
        )]);

        save_keyring_auth(&work_keyring, &work_index, &work).expect("save work");
        save_keyring_auth(&personal_keyring, &personal_index, &personal).expect("save personal");

        let index = parse_auth_keyring_index(&std::fs::read_to_string(&work_index).unwrap())
            .expect("parse");
        let reloaded = load_keyring_auth(&work_keyring, index, false).expect("load");
        assert_eq!(every_secret(&reloaded), vec!["sk-work".to_string()]);
    }

    #[test]
    fn a_migrated_root_does_not_readopt_a_changed_shared_credential() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let shared = MemoryStore::default();
        let scoped = MemoryStore::default();
        let original = make_store(vec![(
            "openai",
            AuthEntry::ApiKey {
                key: "original-test-account".to_string(),
            },
        )]);
        save_keyring_auth(&shared, &dir.path().join("shared.json"), &original).unwrap();
        write_owner_only_file(
            &path,
            r#"{"version":1,"storage":"os-keyring","providers":["openai"]}"#,
        )
        .unwrap();
        let index = || parse_auth_keyring_index(&std::fs::read_to_string(&path).unwrap()).unwrap();
        let adopted = load_keyring_auth_for_root(&scoped, &shared, &path, index(), false).unwrap();
        assert_eq!(
            every_secret(&adopted),
            vec!["original-test-account".to_string()]
        );
        assert_eq!(shared.secrets().len(), 1);
        scoped.delete(&auth_keyring_account("openai")).unwrap();
        let replacement = make_store(vec![(
            "openai",
            AuthEntry::ApiKey {
                key: "replacement-test-account".to_string(),
            },
        )]);
        save_keyring_auth(&shared, &dir.path().join("shared.json"), &replacement).unwrap();
        let result = load_keyring_auth_for_root(&scoped, &shared, &path, index(), false);
        assert!(
            result.is_err(),
            "a missing scoped credential requires sign-in"
        );
        assert!(scoped
            .get(&auth_keyring_account("openai"))
            .unwrap()
            .is_none());
    }

    #[test]
    fn a_scoped_index_cannot_be_loaded_by_another_config_root() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let shared = MemoryStore::default();
        let scoped = MemoryStore::default();
        save_keyring_auth(&shared, &path, &store_with_secrets()).unwrap();
        let mut index = parse_auth_keyring_index(&std::fs::read_to_string(&path).unwrap()).unwrap();
        index.scope = Some("another-config-root".to_string());
        let result = load_keyring_auth_for_root(&scoped, &shared, &path, index, false);
        assert!(result.is_err());
        assert!(scoped.secrets().is_empty());
    }

    struct PartlyDenyingStore {
        inner: MemoryStore,
        denied: String,
    }

    impl PartlyDenyingStore {
        fn denying(provider: &str) -> Self {
            Self {
                inner: MemoryStore::default(),
                denied: auth_keyring_account(provider),
            }
        }
    }

    impl CredentialStore for PartlyDenyingStore {
        fn get(&self, account: &str) -> Result<Option<String>> {
            if account == self.denied {
                bail!("the OS credential store denied access")
            }
            self.inner.get(account)
        }
        fn set(&self, account: &str, secret: &str) -> Result<()> {
            self.inner.set(account, secret)
        }
        fn delete(&self, account: &str) -> Result<()> {
            if account == self.denied {
                bail!("the OS credential store denied access")
            }
            self.inner.delete(account)
        }
    }

    fn fresh_grant() -> AuthEntry {
        AuthEntry::OAuth {
            refresh: "refresh_tok_new_51c0e2".into(),
            access: "access_tok_new_83b7d4".into(),
            expires: 1_700_000_000_000,
        }
    }

    #[test]
    fn signing_in_replaces_a_credential_the_store_no_longer_holds() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let keyring = MemoryStore::default();
        let unscoped = MemoryStore::default();
        save_keyring_auth(
            &keyring,
            &path,
            &make_store(vec![(
                "agiworkforce",
                AuthEntry::OAuth {
                    refresh: "refresh_tok_old".into(),
                    access: "access_tok_old".into(),
                    expires: 1,
                },
            )]),
        )
        .expect("save");
        keyring
            .secrets
            .lock()
            .expect("store lock")
            .remove(&auth_keyring_account("agiworkforce"));
        let trapped = load_keyring_auth(&keyring, the_saved_index(&path), false)
            .expect_err("every ordinary read reports the missing credential");
        assert!(
            format!("{trapped:#}").contains("`agi login`"),
            "{trapped:#}"
        );

        let (mut store, mut unreadable) =
            recover_keyring_auth_for_root(&keyring, &unscoped, the_saved_index(&path));
        assert!(store.entries.is_empty());
        assert!(unreadable.is_empty());
        apply_replacing_transaction(
            &mut store,
            &mut unreadable,
            |store, _| {
                store
                    .entries
                    .insert("agiworkforce".to_string(), fresh_grant());
                Ok(())
            },
            |saved, kept| first_removal_failure(write_keyring_auth(&keyring, &path, saved, kept)?),
            |_| {},
        )
        .expect("signing in replaces the missing credential");

        let index = the_saved_index(&path);
        assert_eq!(index.providers, vec!["agiworkforce".to_string()]);
        let loaded = load_keyring_auth(&keyring, index, false).expect("the new index loads");
        assert_eq!(loaded.entries.get("agiworkforce"), Some(&fresh_grant()));
    }

    #[test]
    fn signing_in_replaces_an_index_another_config_root_wrote() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let keyring = MemoryStore::default();
        let unscoped = MemoryStore::default();
        save_keyring_auth(&keyring, &path, &store_with_secrets()).expect("save");
        let mut foreign = the_saved_index(&path);
        foreign.scope = Some("another-config-root".to_string());
        write_owner_only_file(&path, &serde_json::to_string(&foreign).unwrap()).unwrap();
        assert!(load_keyring_auth_for_root(
            &keyring,
            &unscoped,
            &path,
            the_saved_index(&path),
            false
        )
        .is_err());

        let (mut store, mut unreadable) =
            recover_keyring_auth_for_root(&keyring, &unscoped, the_saved_index(&path));
        assert!(
            store.entries.is_empty(),
            "another root's credentials are never adopted"
        );
        assert!(unreadable.is_empty());
        apply_replacing_transaction(
            &mut store,
            &mut unreadable,
            |store, _| {
                store
                    .entries
                    .insert("agiworkforce".to_string(), fresh_grant());
                Ok(())
            },
            |saved, kept| first_removal_failure(write_keyring_auth(&keyring, &path, saved, kept)?),
            |_| {},
        )
        .expect("signing in replaces the foreign index");

        let index = the_saved_index(&path);
        assert_eq!(index.scope.as_deref(), Some(keyring.scope()));
        assert_eq!(index.providers, vec!["agiworkforce".to_string()]);
        let loaded = load_keyring_auth_for_root(&keyring, &unscoped, &path, index, false)
            .expect("this root reads its own index again");
        assert_eq!(loaded.entries.get("agiworkforce"), Some(&fresh_grant()));
        assert!(
            keyring
                .get(&auth_keyring_account("openai"))
                .unwrap()
                .is_some(),
            "an entry only another root's index named is never deleted from this root's service"
        );
    }

    #[test]
    fn only_this_roots_own_index_proves_which_entries_it_may_delete() {
        let keyring = MemoryStore::default();
        let index = |version: u8, scope: Option<&str>| AuthKeyringIndex {
            version,
            storage: AUTH_INDEX_STORAGE.to_string(),
            providers: vec!["openai".to_string()],
            removing: Vec::new(),
            scope: scope.map(str::to_string),
        };
        assert!(index_owned_by(
            &index(AUTH_INDEX_VERSION, Some(keyring.scope())),
            &keyring
        ));
        assert!(index_owned_by(&index(1, None), &keyring));
        assert!(!index_owned_by(
            &index(AUTH_INDEX_VERSION, Some("another-config-root")),
            &keyring
        ));
    }

    #[test]
    fn a_legacy_credential_file_that_cannot_be_used_is_moved_aside_not_deleted() {
        let dir = tempfile::tempdir().unwrap();
        let legacy = dir.path().join("auth.toml");
        std::fs::write(&legacy, "not a credential").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&legacy, std::fs::Permissions::from_mode(0o644)).unwrap();
        }

        let aside = set_aside_unreadable(&legacy).expect("set aside");

        assert!(!legacy.exists());
        assert_eq!(aside.parent(), legacy.parent());
        assert!(aside
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with("auth.toml.unreadable-")));
        assert_eq!(std::fs::read_to_string(&aside).unwrap(), "not a credential");
        assert!(check_file_permissions_secure(&aside));
    }

    #[test]
    fn a_sign_out_warning_says_where_the_credential_really_is() {
        let file = dropped_from_file_store("openai");
        assert!(!file.contains("still holds"), "{file}");
        assert!(file.contains("`agi login openai`"), "{file}");
        let keychain = kept_by_keychain(
            "openai",
            &anyhow::anyhow!("the OS credential store denied access"),
        );
        assert!(keychain.contains("would not delete"), "{keychain}");
        assert!(keychain.contains("denied access"), "{keychain}");
    }

    #[test]
    fn a_credential_the_store_will_not_return_survives_a_sign_in_and_goes_on_sign_out() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let keyring = PartlyDenyingStore::denying("openai");
        let unscoped = MemoryStore::default();
        save_keyring_auth(&keyring, &path, &store_with_secrets()).expect("save");

        let (mut store, mut unreadable) =
            recover_keyring_auth_for_root(&keyring, &unscoped, the_saved_index(&path));
        assert_eq!(
            store.entries.keys().collect::<Vec<_>>(),
            vec!["agiworkforce"]
        );
        assert_eq!(unreadable.iter().collect::<Vec<_>>(), vec!["openai"]);
        apply_replacing_transaction(
            &mut store,
            &mut unreadable,
            |store, _| {
                store
                    .entries
                    .insert("agiworkforce".to_string(), fresh_grant());
                Ok(())
            },
            |saved, kept| first_removal_failure(write_keyring_auth(&keyring, &path, saved, kept)?),
            |_| {},
        )
        .expect("signing in works while another credential cannot be read");
        assert_eq!(
            the_saved_index(&path).providers,
            vec!["agiworkforce".to_string(), "openai".to_string()]
        );
        assert!(keyring
            .inner
            .get(&auth_keyring_account("openai"))
            .unwrap()
            .is_some());

        let (mut store, mut unreadable) =
            recover_keyring_auth_for_root(&keyring, &unscoped, the_saved_index(&path));
        let mut kept_in_store = Vec::new();
        apply_replacing_transaction(
            &mut store,
            &mut unreadable,
            |store, unreadable| {
                store.entries.clear();
                unreadable.clear();
                Ok(())
            },
            |saved, kept| {
                kept_in_store = write_keyring_auth(&keyring, &path, saved, kept)?
                    .into_iter()
                    .map(|(provider, _)| provider)
                    .collect();
                Ok(())
            },
            |_| {},
        )
        .expect("signing out clears local state even when the store refuses");

        assert_eq!(kept_in_store, vec!["openai".to_string()]);
        let index = the_saved_index(&path);
        assert!(index.providers.is_empty());
        assert_eq!(index.removing, vec!["openai".to_string()]);
        let loaded = load_keyring_auth(&keyring, index, false).expect("the cleared index loads");
        assert!(loaded.entries.is_empty());
    }

    #[test]
    fn signing_out_forgets_a_managed_credential_that_could_not_be_read() {
        let mut store = AuthStore::default();
        let mut unreadable = BTreeSet::from(["agiworkforce".to_string()]);
        let persisted = std::cell::Cell::new(false);
        apply_replacing_transaction(
            &mut store,
            &mut unreadable,
            |_, unreadable| Ok(unreadable.remove("agiworkforce")),
            |_, kept| {
                assert!(kept.is_empty());
                persisted.set(true);
                Ok(())
            },
            |removed| assert!(*removed),
        )
        .expect("sign-out");
        assert!(
            persisted.get(),
            "forgetting an unreadable name must rewrite the index"
        );

        apply_replacing_transaction(
            &mut store,
            &mut unreadable,
            |_, _| Ok(()),
            |_, _| panic!("an unchanged store was written"),
            |_| {},
        )
        .expect("no-op");
    }

    #[test]
    fn a_damaged_credential_file_names_the_command_that_replaces_it() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        write_owner_only_file(&path, "not json").unwrap();
        let error = read_file_store(&path, "not json").expect_err("damaged file");
        assert!(format!("{error:#}").contains("`agi login`"), "{error:#}");
    }

    #[tokio::test]
    async fn copilot_sign_in_refuses_before_any_device_flow() {
        for name in ["copilot", "Copilot"] {
            let error = interactive_login_for_provider(Some(name))
                .await
                .expect_err("Copilot sign-in is not available");
            let text = error.to_string();
            assert!(text.contains("not available in this version"), "{text}");
        }
    }

    #[tokio::test]
    async fn an_unknown_login_provider_is_not_offered_copilot() {
        let error = interactive_login_for_provider(Some("fixture-unknown-provider"))
            .await
            .expect_err("unknown provider");
        assert!(!error.to_string().contains("copilot"), "{error}");
    }

    #[test]
    fn the_replacement_command_names_the_provider_it_signs_in() {
        assert_eq!(sign_in_command("agiworkforce"), "agi login");
        assert_eq!(sign_in_command("managed_cloud"), "agi login");
        assert_eq!(sign_in_command("openai"), "agi login openai");
        assert_eq!(sign_in_command("copilot"), "agi login copilot");
    }

    #[test]
    fn a_typed_api_key_is_saved_without_surrounding_whitespace() {
        assert_eq!(normalized_api_key("sk-x \t").unwrap(), "sk-x");
        assert_eq!(normalized_api_key("\nsk-x\r\n").unwrap(), "sk-x");
        assert!(normalized_api_key("sk x").is_err());
        assert!(normalized_api_key(" \t ").is_err());
    }

    #[test]
    fn every_listed_api_key_provider_reports_its_canonical_id() {
        for provider in API_KEY_PROVIDERS {
            assert_eq!(
                api_key_provider(provider.id).map(|found| found.id),
                Some(provider.id)
            );
        }
    }

    #[test]
    fn a_credential_from_the_environment_is_reported_with_its_variable() {
        let rows = environment_auth_status(|name| match name {
            "ANTHROPIC_API_KEY" => Some("sk-ant-env".to_string()),
            "AGIWORKFORCE_JWT" => Some("header.payload.signature".to_string()),
            "OPENAI_API_KEY" => Some("  ".to_string()),
            _ => None,
        });
        let providers: Vec<&str> = rows.iter().map(|row| row.provider.as_str()).collect();
        assert_eq!(providers, vec!["agiworkforce", "anthropic"]);
        for row in &rows {
            assert_eq!(row.auth_type, "env");
            assert_eq!(row.status, "active");
            assert!(row.permissions_secure);
        }
        assert_eq!(rows[1].last_used.as_deref(), Some("from ANTHROPIC_API_KEY"));
        let merged = with_environment_auth_status(
            auth_status_from_store(
                &make_store(vec![(
                    "openai",
                    AuthEntry::ApiKey {
                        key: "sk-stored".into(),
                    },
                )]),
                0,
                true,
                &[],
            ),
            |name| match name {
                "ANTHROPIC_API_KEY" => Some("sk-ant-env".to_string()),
                _ => None,
            },
        );
        assert_eq!(
            merged
                .iter()
                .map(|row| (row.provider.as_str(), row.auth_type.as_str()))
                .collect::<Vec<_>>(),
            vec![("anthropic", "env"), ("openai", "api_key")]
        );
        assert!(rows
            .iter()
            .all(|row| !format!("{row:?}").contains("sk-ant-env")));
    }

    #[test]
    fn status_reports_when_a_credential_was_last_used() {
        let now_ms = 1_700_000_000_000i64;
        let uses = vec![
            CredentialUse {
                at_ms: now_ms - 600_000,
                provider: "copilot".to_string(),
                purpose: "exchanged the stored token for an API token".to_string(),
            },
            CredentialUse {
                at_ms: now_ms - 60_000,
                provider: "copilot".to_string(),
                purpose: "exchanged the stored token for an API token".to_string(),
            },
        ];
        let store = make_store(vec![(
            "copilot",
            AuthEntry::OAuth {
                refresh: "refresh".into(),
                access: "access".into(),
                expires: 0,
            },
        )]);

        let results = auth_status_from_store(&store, now_ms, true, &uses);
        assert_eq!(results[0].last_used.as_deref(), Some("used 1m ago"));

        let unused = auth_status_from_store(&store, now_ms, true, &[]);
        assert_eq!(unused[0].last_used, None);
    }

    #[test]
    fn the_credential_use_trail_records_no_secret_material() {
        let record = CredentialUse {
            at_ms: 1_700_000_000_000,
            provider: "openai".to_string(),
            purpose: "exchanged the stored token for an API token".to_string(),
        };
        let line = serde_json::to_string(&record).unwrap();
        assert!(line.contains("openai"));
        assert!(!line.contains("sk-"));
        assert!(!line.contains("access"));
    }

    #[test]
    fn auth_index_rejects_unknown_versions_and_backends() {
        assert!(
            parse_auth_keyring_index(r#"{"version":2,"storage":"os-keyring","providers":[]}"#)
                .is_none()
        );
        assert!(
            parse_auth_keyring_index(r#"{"version":1,"storage":"plaintext","providers":[]}"#)
                .is_none()
        );
    }

    // ── File permissions ──

    #[cfg(unix)]
    #[test]
    fn test_set_and_check_file_permissions() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test_auth.json");
        std::fs::write(&path, "{}").unwrap();

        // Before setting, permissions might be 0o644 (default umask)
        set_file_permissions(&path).unwrap();

        // After setting, should be 0o600
        assert!(
            check_file_permissions_secure(&path),
            "file should be owner-only after set_file_permissions"
        );

        // Verify the exact mode bits
        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(
            mode & 0o777,
            0o600,
            "expected 0o600, got 0o{:o}",
            mode & 0o777
        );
    }

    #[cfg(unix)]
    #[test]
    fn test_check_permissions_insecure_file() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("insecure_auth.json");
        std::fs::write(&path, "{}").unwrap();

        // Set world-readable
        let perms = std::fs::Permissions::from_mode(0o644);
        std::fs::set_permissions(&path, perms).unwrap();

        assert!(
            !check_file_permissions_secure(&path),
            "0o644 should be reported as insecure"
        );
    }

    /// The file store is the clear-text fallback, so its mode is the whole of
    /// its protection. Reporting the mode on `agi auth status` is not enforcing
    /// it: the credential is handed out either way.
    #[cfg(unix)]
    #[test]
    fn a_credential_file_other_accounts_can_read_is_refused_not_reported() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("auth.json");
        let data = r#"{"anthropic":{"type":"api","key":"API_KEY_VALUE_PLACEHOLDER"}}"#;
        std::fs::write(&path, data).expect("write store");

        for mode in [0o644, 0o640, 0o604, 0o666] {
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(mode))
                .expect("set mode");
            let error = read_file_store(&path, data)
                .expect_err("a store readable by another account must be refused");
            assert!(
                error.to_string().contains("readable by other accounts"),
                "unexpected message for 0o{mode:o}: {error}"
            );
        }

        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .expect("set owner-only mode");
        let store = read_file_store(&path, data).expect("an owner-only store still loads");
        assert!(store.entries.contains_key("anthropic"));
    }

    #[cfg(unix)]
    #[test]
    fn test_check_permissions_nonexistent_file() {
        let path = Path::new("/tmp/nonexistent_auth_test_file.json");
        assert!(
            !check_file_permissions_secure(path),
            "nonexistent file should return false"
        );
    }

    #[cfg(unix)]
    #[test]
    fn test_save_sets_permissions() {
        // Override the auth_path to use a temp dir
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth.json");
        let store = AuthStore::default();
        let data = serde_json::to_string_pretty(&store).unwrap();
        std::fs::write(&path, &data).unwrap();
        set_file_permissions(&path).unwrap();

        use std::os::unix::fs::PermissionsExt;
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
    }
}
