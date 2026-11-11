use std::collections::HashMap;
use std::path::{Path, PathBuf};

use base64::Engine as _;
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const SIGNATURE_FILE: &str = ".agiworkforce-plugin/signature.json";
pub const SIGNATURE_ALGORITHM: &str = "ed25519";
pub const SIGNED_PAYLOAD_TYPE: &str = "application/vnd.agiworkforce.plugin-signature.v2";
const SIGNED_STATEMENT_TAG: &[u8] = b"agiworkforce-plugin-signature/v2";
const SIGNED_CONTENT_TAG: &[u8] = b"agiworkforce-plugin-content/v2";
const SIGNED_CONTENT_FILE: &[u8] = b"file";
const SIGNED_CONTENT_LINK: &[u8] = b"link";
const DSSE_PAE_TAG: &[u8] = b"DSSEv1";
const LEGACY_PAYLOAD_DOMAIN: &str = "agiworkforce-plugin-signature/v1";

#[derive(Debug, Clone, Default)]
pub struct TrustedPublishers {
    keys: HashMap<String, Vec<VerifyingKey>>,
}

impl TrustedPublishers {
    pub fn from_config_toml(contents: Option<&str>) -> Result<Self, String> {
        let Some(contents) = contents else {
            return Ok(Self::default());
        };
        let parsed: toml::Value = toml::from_str(contents)
            .map_err(|error| format!("config.toml is not valid TOML: {error}"))?;
        let Some(table) = parsed
            .get("plugins")
            .and_then(|plugins| plugins.get("trusted_publishers"))
        else {
            return Ok(Self::default());
        };
        let table = table
            .as_table()
            .ok_or_else(|| "plugins.trusted_publishers must be a table".to_string())?;
        let mut publishers = Self::default();
        for (publisher, value) in table {
            let encoded: Vec<&str> = match value {
                toml::Value::String(key) => vec![key.as_str()],
                toml::Value::Array(keys) => keys
                    .iter()
                    .map(|key| {
                        key.as_str().ok_or_else(|| {
                            format!("plugins.trusted_publishers.{publisher} keys must be strings")
                        })
                    })
                    .collect::<Result<_, _>>()?,
                _ => {
                    return Err(format!(
                        "plugins.trusted_publishers.{publisher} must be a key or a list of keys"
                    ))
                }
            };
            for key in encoded {
                publishers.insert(publisher, decode_public_key(key)?);
            }
        }
        Ok(publishers)
    }

    pub fn configured() -> Result<Self, String> {
        let contents = super::registry::registry_config_path()
            .filter(|path| path.exists())
            .map(std::fs::read_to_string)
            .transpose()
            .map_err(|error| format!("failed to read config.toml: {error}"))?;
        Self::from_config_toml(contents.as_deref())
    }

    pub fn insert(&mut self, publisher: &str, key: VerifyingKey) {
        self.keys
            .entry(publisher.to_string())
            .or_default()
            .push(key);
    }

    pub fn is_empty(&self) -> bool {
        self.keys.is_empty()
    }

    pub fn has_publisher(&self, publisher: &str) -> bool {
        self.keys.contains_key(publisher)
    }

    fn keys_for(&self, publisher: &str) -> Option<&[VerifyingKey]> {
        self.keys.get(publisher).map(Vec::as_slice)
    }
}

fn decode_public_key(encoded: &str) -> Result<VerifyingKey, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .map_err(|error| format!("publisher key is not base64: {error}"))?;
    let bytes: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "publisher key must be a 32-byte Ed25519 public key".to_string())?;
    VerifyingKey::from_bytes(&bytes).map_err(|error| format!("invalid publisher key: {error}"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignatureDocument {
    pub publisher: String,
    pub algorithm: String,
    pub signature: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedPublisher {
    pub publisher: String,
    pub content_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SignatureError {
    Unsigned,
    NoManifest,
    Malformed(String),
    UntrustedPublisher(String),
    Invalid(String),
    LegacyAmbiguous(String),
    Io(String),
}

impl std::fmt::Display for SignatureError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unsigned => write!(f, "plugin is not signed (no {SIGNATURE_FILE})"),
            Self::NoManifest => write!(f, "plugin has no manifest to sign"),
            Self::Malformed(detail) => write!(f, "plugin signature is malformed: {detail}"),
            Self::UntrustedPublisher(publisher) => write!(
                f,
                "publisher '{publisher}' is not in plugins.trusted_publishers"
            ),
            Self::Invalid(publisher) => write!(
                f,
                "signature does not verify against any key for publisher '{publisher}'; the plugin was modified or signed by someone else"
            ),
            Self::LegacyAmbiguous(detail) => write!(
                f,
                "plugin carries an original-format signature, which cannot tell this plugin's files apart ({detail}); the publisher must run `plugin sign` again with a current CLI"
            ),
            Self::Io(detail) => write!(f, "failed to read plugin for signature check: {detail}"),
        }
    }
}

fn manifest_file(root: &Path) -> Option<(String, PathBuf)> {
    super::plugins::MANIFEST_PATHS
        .iter()
        .map(|(_, rel)| (rel.to_string(), root.join(rel)))
        .find(|(_, path)| path.is_file())
}

const LEGACY_LINK_RECORD: &[u8] = b"\0link\0";

fn collect_signed_files(
    root: &Path,
    dir: &Path,
    out: &mut Vec<(PathBuf, bool)>,
) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            if entry.file_name() == ".git" {
                continue;
            }
            collect_signed_files(root, &path, out)?;
        } else if (file_type.is_file() || file_type.is_symlink())
            && path != root.join(SIGNATURE_FILE)
        {
            out.push((path, file_type.is_symlink()));
        }
    }
    Ok(())
}

fn io_error(error: std::io::Error) -> SignatureError {
    SignatureError::Io(error.to_string())
}

fn collected_files(root: &Path) -> Result<Vec<(PathBuf, bool)>, SignatureError> {
    let mut files = Vec::new();
    collect_signed_files(root, root, &mut files).map_err(io_error)?;
    Ok(files)
}

fn utf8_name(root: &Path, path: &Path) -> Option<String> {
    let mut parts = Vec::new();
    for component in path.strip_prefix(root).unwrap_or(path).components() {
        parts.push(component.as_os_str().to_str()?);
    }
    Some(parts.join("/"))
}

fn not_utf8(path: &Path, what: &str) -> SignatureError {
    SignatureError::Malformed(format!(
        "{} has a {what} that is not valid UTF-8, so a signature cannot name it",
        path.display()
    ))
}

fn put_field(sink: &mut dyn FnMut(&[u8]), field: &[u8]) {
    sink(b" ");
    sink(field.len().to_string().as_bytes());
    sink(b" ");
    sink(field);
}

fn framed(tag: &[u8], fields: &[&[u8]]) -> Vec<u8> {
    let mut out = tag.to_vec();
    let mut sink = |bytes: &[u8]| out.extend_from_slice(bytes);
    for field in fields {
        put_field(&mut sink, field);
    }
    out
}

/// DSSE v1 pre-authentication encoding (secure-systems-lab/dsse, protocol.md):
/// `"DSSEv1" SP LEN(type) SP type SP LEN(body) SP body`, LEN being the decimal
/// byte length with no leading zeros. The signature covers exactly these bytes.
pub fn pre_authentication_encoding(payload_type: &str, body: &[u8]) -> Vec<u8> {
    framed(DSSE_PAE_TAG, &[payload_type.as_bytes(), body])
}

/// Every file and link except `.git` and the signature itself, in byte order
/// of its `/`-joined UTF-8 path, as three PAE-framed fields: its kind, its path
/// and its bytes (a link's target, never the file it points to). Each field
/// carries its own length, so no byte inside a file can end a record early.
pub fn signed_content_sha256(root: &Path) -> Result<String, SignatureError> {
    let mut entries = Vec::new();
    for (path, is_link) in collected_files(root)? {
        let name = utf8_name(root, &path).ok_or_else(|| not_utf8(&path, "name"))?;
        entries.push((name, path, is_link));
    }
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    let mut hasher = Sha256::new();
    hasher.update(SIGNED_CONTENT_TAG);
    let mut sink = |bytes: &[u8]| hasher.update(bytes);
    for (name, path, is_link) in entries {
        let (kind, bytes) = if is_link {
            let target = std::fs::read_link(&path).map_err(io_error)?;
            let target = target
                .to_str()
                .ok_or_else(|| not_utf8(&path, "link target"))?
                .as_bytes()
                .to_vec();
            (SIGNED_CONTENT_LINK, target)
        } else {
            (SIGNED_CONTENT_FILE, std::fs::read(&path).map_err(io_error)?)
        };
        put_field(&mut sink, kind);
        put_field(&mut sink, name.as_bytes());
        put_field(&mut sink, &bytes);
    }
    Ok(crate::hex::encode(&hasher.finalize()))
}

fn manifest_digest(root: &Path) -> Result<(String, String), SignatureError> {
    let (manifest_rel, manifest_path) = manifest_file(root).ok_or(SignatureError::NoManifest)?;
    let manifest_bytes = std::fs::read(&manifest_path).map_err(io_error)?;
    Ok((
        manifest_rel,
        crate::hex::encode(&Sha256::digest(&manifest_bytes)),
    ))
}

pub fn signed_payload(root: &Path) -> Result<(Vec<u8>, String), SignatureError> {
    let (manifest_rel, manifest_sha256) = manifest_digest(root)?;
    let content_sha256 = signed_content_sha256(root)?;
    let statement = framed(
        SIGNED_STATEMENT_TAG,
        &[
            manifest_rel.as_bytes(),
            manifest_sha256.as_bytes(),
            content_sha256.as_bytes(),
        ],
    );
    Ok((
        pre_authentication_encoding(SIGNED_PAYLOAD_TYPE, &statement),
        content_sha256,
    ))
}

struct LegacyContent {
    sha256: String,
    ambiguity: Option<String>,
}

/// The original record stream: `path NUL bytes NUL`, and `NUL "link" NUL path
/// NUL target NUL` for a link. Paths and link targets never hold NUL, so the
/// stream parses one way only while no file holds NUL and every name is valid
/// Unicode; anything else is reported as the ambiguity that refuses it.
fn legacy_content(root: &Path) -> Result<LegacyContent, SignatureError> {
    let mut ambiguity = None;
    let mut relative = Vec::new();
    for (path, is_link) in collected_files(root)? {
        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .components()
            .map(|component| component.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/");
        if ambiguity.is_none() && utf8_name(root, &path).is_none() {
            ambiguity = Some(format!("{rel} has a name that is not valid UTF-8"));
        }
        relative.push((rel, path, is_link));
    }
    relative.sort_by(|a, b| a.0.cmp(&b.0));
    let mut hasher = Sha256::new();
    for (rel, path, is_link) in relative {
        if is_link {
            let target = std::fs::read_link(&path).map_err(io_error)?;
            if ambiguity.is_none() && target.to_str().is_none() {
                ambiguity = Some(format!("{rel} links to a target that is not valid UTF-8"));
            }
            hasher.update(LEGACY_LINK_RECORD);
            hasher.update(rel.as_bytes());
            hasher.update([0u8]);
            hasher.update(super::plugins::os_bytes(target.as_os_str()));
            hasher.update([0u8]);
        } else {
            let bytes = std::fs::read(&path).map_err(io_error)?;
            if ambiguity.is_none() && bytes.contains(&0) {
                ambiguity = Some(format!("{rel} contains a NUL byte"));
            }
            hasher.update(rel.as_bytes());
            hasher.update([0u8]);
            hasher.update(&bytes);
            hasher.update([0u8]);
        }
    }
    Ok(LegacyContent {
        sha256: crate::hex::encode(&hasher.finalize()),
        ambiguity,
    })
}

fn legacy_signed_payload(root: &Path) -> Result<(Vec<u8>, String), SignatureError> {
    let (manifest_rel, manifest_sha256) = manifest_digest(root)?;
    let content = legacy_content(root)?;
    if let Some(detail) = content.ambiguity {
        return Err(SignatureError::LegacyAmbiguous(detail));
    }
    let payload = format!(
        "{LEGACY_PAYLOAD_DOMAIN}\n{manifest_rel}\n{manifest_sha256}\n{}\n",
        content.sha256
    );
    Ok((payload.into_bytes(), content.sha256))
}

pub fn read_signature_document(root: &Path) -> Result<Option<SignatureDocument>, SignatureError> {
    let path = root.join(SIGNATURE_FILE);
    if !path.exists() {
        return Ok(None);
    }
    let raw =
        std::fs::read_to_string(&path).map_err(|error| SignatureError::Io(error.to_string()))?;
    serde_json::from_str(&raw)
        .map(Some)
        .map_err(|error| SignatureError::Malformed(error.to_string()))
}

pub fn verify_plugin_signature(
    root: &Path,
    publishers: &TrustedPublishers,
) -> Result<VerifiedPublisher, SignatureError> {
    let document = read_signature_document(root)?.ok_or(SignatureError::Unsigned)?;
    if !document.algorithm.eq_ignore_ascii_case(SIGNATURE_ALGORITHM) {
        return Err(SignatureError::Malformed(format!(
            "unsupported algorithm '{}'",
            document.algorithm
        )));
    }
    let legacy = match document.payload_type.as_deref() {
        Some(SIGNED_PAYLOAD_TYPE) => false,
        None => true,
        Some(other) => {
            return Err(SignatureError::Malformed(format!(
                "unsupported payload type '{other}'"
            )))
        }
    };
    let signature_bytes = base64::engine::general_purpose::STANDARD
        .decode(document.signature.trim())
        .map_err(|error| SignatureError::Malformed(format!("signature is not base64: {error}")))?;
    let signature_bytes: [u8; 64] = signature_bytes
        .try_into()
        .map_err(|_| SignatureError::Malformed("signature must be 64 bytes".to_string()))?;
    let signature = Signature::from_bytes(&signature_bytes);
    let keys = publishers
        .keys_for(&document.publisher)
        .ok_or_else(|| SignatureError::UntrustedPublisher(document.publisher.clone()))?;
    let (payload, content_sha256) = if legacy {
        legacy_signed_payload(root)?
    } else {
        signed_payload(root)?
    };
    if keys
        .iter()
        .any(|key| key.verify_strict(&payload, &signature).is_ok())
    {
        Ok(VerifiedPublisher {
            publisher: document.publisher,
            content_sha256,
        })
    } else {
        Err(SignatureError::Invalid(document.publisher))
    }
}

pub fn sign_plugin(
    root: &Path,
    publisher: &str,
    signing_key: &SigningKey,
) -> Result<PathBuf, SignatureError> {
    if publisher.trim().is_empty() {
        return Err(SignatureError::Malformed(
            "publisher must not be empty".to_string(),
        ));
    }
    let (payload, _) = signed_payload(root)?;
    let signature = signing_key.sign(&payload);
    let document = SignatureDocument {
        publisher: publisher.trim().to_string(),
        algorithm: SIGNATURE_ALGORITHM.to_string(),
        signature: base64::engine::general_purpose::STANDARD.encode(signature.to_bytes()),
        payload_type: Some(SIGNED_PAYLOAD_TYPE.to_string()),
    };
    let path = root.join(SIGNATURE_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| SignatureError::Io(error.to_string()))?;
    }
    let json = serde_json::to_string_pretty(&document)
        .map_err(|error| SignatureError::Malformed(error.to_string()))?;
    std::fs::write(&path, json).map_err(|error| SignatureError::Io(error.to_string()))?;
    Ok(path)
}

pub fn signing_key_from_seed_base64(encoded: &str) -> Result<SigningKey, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .map_err(|error| format!("signing key is not base64: {error}"))?;
    let seed: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "signing key must be a 32-byte Ed25519 seed".to_string())?;
    Ok(SigningKey::from_bytes(&seed))
}

pub fn public_key_base64(signing_key: &SigningKey) -> String {
    base64::engine::general_purpose::STANDARD.encode(signing_key.verifying_key().to_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(seed: u8) -> SigningKey {
        SigningKey::from_bytes(&[seed; 32])
    }

    fn plugin(root: &Path) {
        let manifest = root.join(".agiworkforce-plugin").join("plugin.json");
        std::fs::create_dir_all(manifest.parent().unwrap()).unwrap();
        std::fs::write(manifest, r#"{"name":"signed","version":"1.0.0"}"#).unwrap();
        std::fs::create_dir_all(root.join("commands")).unwrap();
        std::fs::write(root.join("commands").join("hello.md"), "hello").unwrap();
    }

    fn trusted(publisher: &str, signing_key: &SigningKey) -> TrustedPublishers {
        let toml = format!(
            "[plugins.trusted_publishers]\n{publisher} = \"{}\"\n",
            public_key_base64(signing_key)
        );
        TrustedPublishers::from_config_toml(Some(&toml)).unwrap()
    }

    #[test]
    fn a_signed_plugin_verifies_against_its_publisher_key() {
        let dir = tempfile::tempdir().unwrap();
        plugin(dir.path());
        sign_plugin(dir.path(), "acme", &key(7)).unwrap();

        let verified = verify_plugin_signature(dir.path(), &trusted("acme", &key(7))).unwrap();
        assert_eq!(verified.publisher, "acme");
        assert_eq!(
            verified.content_sha256,
            signed_content_sha256(dir.path()).unwrap()
        );
    }

    #[test]
    fn tampering_with_any_file_breaks_the_signature() {
        let dir = tempfile::tempdir().unwrap();
        plugin(dir.path());
        sign_plugin(dir.path(), "acme", &key(7)).unwrap();
        std::fs::write(dir.path().join("commands").join("hello.md"), "evil").unwrap();

        assert_eq!(
            verify_plugin_signature(dir.path(), &trusted("acme", &key(7))),
            Err(SignatureError::Invalid("acme".to_string()))
        );
    }

    #[test]
    fn adding_a_file_breaks_the_signature() {
        let dir = tempfile::tempdir().unwrap();
        plugin(dir.path());
        sign_plugin(dir.path(), "acme", &key(7)).unwrap();
        std::fs::write(dir.path().join("payload.sh"), "curl evil").unwrap();

        assert!(matches!(
            verify_plugin_signature(dir.path(), &trusted("acme", &key(7))),
            Err(SignatureError::Invalid(_))
        ));
    }

    #[test]
    fn a_signature_from_another_key_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        plugin(dir.path());
        sign_plugin(dir.path(), "acme", &key(9)).unwrap();

        assert!(matches!(
            verify_plugin_signature(dir.path(), &trusted("acme", &key(7))),
            Err(SignatureError::Invalid(_))
        ));
    }

    #[test]
    fn an_unlisted_publisher_and_an_unsigned_plugin_are_distinct_refusals() {
        let dir = tempfile::tempdir().unwrap();
        plugin(dir.path());
        assert_eq!(
            verify_plugin_signature(dir.path(), &trusted("acme", &key(7))),
            Err(SignatureError::Unsigned)
        );

        sign_plugin(dir.path(), "other", &key(7)).unwrap();
        assert_eq!(
            verify_plugin_signature(dir.path(), &trusted("acme", &key(7))),
            Err(SignatureError::UntrustedPublisher("other".to_string()))
        );
    }

    #[test]
    fn rotated_publisher_keys_are_all_accepted() {
        let dir = tempfile::tempdir().unwrap();
        plugin(dir.path());
        sign_plugin(dir.path(), "acme", &key(9)).unwrap();
        let toml = format!(
            "[plugins.trusted_publishers]\nacme = [\"{}\", \"{}\"]\n",
            public_key_base64(&key(7)),
            public_key_base64(&key(9))
        );
        let publishers = TrustedPublishers::from_config_toml(Some(&toml)).unwrap();
        assert!(verify_plugin_signature(dir.path(), &publishers).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn repointing_a_signed_link_breaks_the_signature() {
        let dir = tempfile::tempdir().unwrap();
        plugin(dir.path());
        std::fs::write(dir.path().join("normal.md"), "review only").unwrap();
        std::fs::write(dir.path().join("maintenance.md"), "rewrite everything").unwrap();
        let selected = dir.path().join("selected.md");
        std::os::unix::fs::symlink("normal.md", &selected).unwrap();
        sign_plugin(dir.path(), "acme", &key(7)).unwrap();
        assert!(verify_plugin_signature(dir.path(), &trusted("acme", &key(7))).is_ok());

        std::fs::remove_file(&selected).unwrap();
        std::os::unix::fs::symlink("maintenance.md", &selected).unwrap();

        assert_eq!(
            verify_plugin_signature(dir.path(), &trusted("acme", &key(7))),
            Err(SignatureError::Invalid("acme".to_string()))
        );
    }

    #[cfg(unix)]
    #[test]
    fn adding_or_removing_a_link_breaks_the_signature() {
        let dir = tempfile::tempdir().unwrap();
        plugin(dir.path());
        sign_plugin(dir.path(), "acme", &key(7)).unwrap();
        let link = dir.path().join("late.md");
        std::os::unix::fs::symlink("commands/hello.md", &link).unwrap();
        assert!(matches!(
            verify_plugin_signature(dir.path(), &trusted("acme", &key(7))),
            Err(SignatureError::Invalid(_))
        ));

        std::fs::remove_file(&link).unwrap();
        assert!(verify_plugin_signature(dir.path(), &trusted("acme", &key(7))).is_ok());
    }

    #[test]
    fn malformed_publisher_keys_fail_configuration_loading() {
        assert!(TrustedPublishers::from_config_toml(Some(
            "[plugins.trusted_publishers]\nacme = \"not-a-key\"\n"
        ))
        .is_err());
        assert!(TrustedPublishers::from_config_toml(None)
            .unwrap()
            .is_empty());
    }

    const VECTOR_CONTENT_SHA256: &str =
        "5a1f6bf845cd6d3c549e8af3cf62b6872cfb3b2e49f1bfbec8ddb91837c2bd07";
    const VECTOR_SIGNED_BYTES: &str = "DSSEv1 48 application/vnd.agiworkforce.plugin-signature.v2 204 agiworkforce-plugin-signature/v2 32 .agiworkforce-plugin/plugin.json 64 52221d6eb33f037286cd30954ccacf6fcb033f002080aaa90fa0230114e2e31f 64 5a1f6bf845cd6d3c549e8af3cf62b6872cfb3b2e49f1bfbec8ddb91837c2bd07";
    const VECTOR_PUBLIC_KEY: &str = "6kpsY+KcUgq+9VB7Ey7F+ZVHdq6+vnuSQh7qaRRG0iw=";
    const VECTOR_SIGNATURE: &str =
        "TcglDfITUSIQI+GYrA9bcvGOWIYfxz8nGitU1yYtieAcw6cf1TN+iPCbUvwAQ2Stiz3S/knhIm96ja9UXzucBQ==";
    const LEGACY_VECTOR_CONTENT_SHA256: &str =
        "ce76e25b3076f298c4be83b9d33350b4ce4a274cf94f58a93fb4265561646543";
    const LEGACY_VECTOR_SIGNATURE: &str =
        "NUd/4HUuZlfhumiDl7kDDwxiEyDQh89esLTIp1C9wS/suF6e+k82iGbyzjDbDMevCm5fdPtUEzq0nWsuCY1zDw==";

    fn write_document(root: &Path, signature: String, payload_type: Option<&str>) {
        let document = SignatureDocument {
            publisher: "acme".to_string(),
            algorithm: SIGNATURE_ALGORITHM.to_string(),
            signature,
            payload_type: payload_type.map(str::to_string),
        };
        let path = root.join(SIGNATURE_FILE);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, serde_json::to_string_pretty(&document).unwrap()).unwrap();
    }

    fn sign_in_original_format(root: &Path, signing_key: &SigningKey) {
        let (payload, _) = legacy_signed_payload(root).unwrap();
        let signature = signing_key.sign(&payload);
        write_document(
            root,
            base64::engine::general_purpose::STANDARD.encode(signature.to_bytes()),
            None,
        );
    }

    fn honest_pair(root: &Path) {
        plugin(root);
        std::fs::write(root.join("a.md"), "review only").unwrap();
        std::fs::write(root.join("b.md"), "rewrite everything").unwrap();
    }

    fn forge_from_honest_pair(root: &Path) {
        std::fs::remove_file(root.join("b.md")).unwrap();
        std::fs::write(root.join("a.md"), b"review only\0b.md\0rewrite everything").unwrap();
    }

    #[test]
    fn the_signed_bytes_are_the_dsse_pre_authentication_encoding() {
        assert_eq!(
            pre_authentication_encoding("http://example.com/HelloWorld", b"hello world"),
            b"DSSEv1 29 http://example.com/HelloWorld 11 hello world".to_vec()
        );
    }

    #[test]
    fn signing_produces_the_published_vector_byte_for_byte() {
        let dir = tempfile::tempdir().unwrap();
        plugin(dir.path());

        let (payload, content_sha256) = signed_payload(dir.path()).unwrap();
        assert_eq!(String::from_utf8(payload).unwrap(), VECTOR_SIGNED_BYTES);
        assert_eq!(content_sha256, VECTOR_CONTENT_SHA256);
        assert_eq!(public_key_base64(&key(7)), VECTOR_PUBLIC_KEY);

        sign_plugin(dir.path(), "acme", &key(7)).unwrap();
        let document = read_signature_document(dir.path()).unwrap().unwrap();
        assert_eq!(document.signature, VECTOR_SIGNATURE);
        assert_eq!(document.payload_type.as_deref(), Some(SIGNED_PAYLOAD_TYPE));
    }

    #[test]
    fn the_colliding_pair_from_the_finding_no_longer_shares_a_signature() {
        let honest = tempfile::tempdir().unwrap();
        honest_pair(honest.path());
        let forged = tempfile::tempdir().unwrap();
        honest_pair(forged.path());
        forge_from_honest_pair(forged.path());
        assert_eq!(
            legacy_content(honest.path()).unwrap().sha256,
            legacy_content(forged.path()).unwrap().sha256
        );
        assert_ne!(
            signed_content_sha256(honest.path()).unwrap(),
            signed_content_sha256(forged.path()).unwrap()
        );

        sign_plugin(honest.path(), "acme", &key(7)).unwrap();
        assert!(verify_plugin_signature(honest.path(), &trusted("acme", &key(7))).is_ok());
        forge_from_honest_pair(honest.path());
        assert_eq!(
            verify_plugin_signature(honest.path(), &trusted("acme", &key(7))),
            Err(SignatureError::Invalid("acme".to_string()))
        );
    }

    #[test]
    fn an_original_format_signature_still_verifies_when_its_files_cannot_be_confused() {
        let dir = tempfile::tempdir().unwrap();
        plugin(dir.path());
        write_document(dir.path(), LEGACY_VECTOR_SIGNATURE.to_string(), None);

        let verified = verify_plugin_signature(dir.path(), &trusted("acme", &key(7))).unwrap();
        assert_eq!(verified.publisher, "acme");
        assert_eq!(verified.content_sha256, LEGACY_VECTOR_CONTENT_SHA256);
    }

    #[test]
    fn an_original_format_signature_is_refused_over_a_file_holding_nul() {
        let dir = tempfile::tempdir().unwrap();
        honest_pair(dir.path());
        sign_in_original_format(dir.path(), &key(7));
        assert!(verify_plugin_signature(dir.path(), &trusted("acme", &key(7))).is_ok());

        forge_from_honest_pair(dir.path());
        assert_eq!(
            verify_plugin_signature(dir.path(), &trusted("acme", &key(7))),
            Err(SignatureError::LegacyAmbiguous(
                "a.md contains a NUL byte".to_string()
            ))
        );
    }

    #[test]
    fn removing_the_payload_type_does_not_downgrade_a_signature() {
        let dir = tempfile::tempdir().unwrap();
        plugin(dir.path());
        sign_plugin(dir.path(), "acme", &key(7)).unwrap();
        let document = read_signature_document(dir.path()).unwrap().unwrap();
        write_document(dir.path(), document.signature, None);

        assert_eq!(
            verify_plugin_signature(dir.path(), &trusted("acme", &key(7))),
            Err(SignatureError::Invalid("acme".to_string()))
        );
    }

    #[test]
    fn an_unknown_payload_type_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        plugin(dir.path());
        write_document(
            dir.path(),
            VECTOR_SIGNATURE.to_string(),
            Some("application/vnd.agiworkforce.plugin-signature.v3"),
        );

        assert!(matches!(
            verify_plugin_signature(dir.path(), &trusted("acme", &key(7))),
            Err(SignatureError::Malformed(_))
        ));
    }

    #[cfg(unix)]
    #[test]
    fn a_file_can_no_longer_pass_for_a_signed_link() {
        let honest = tempfile::tempdir().unwrap();
        plugin(honest.path());
        std::fs::write(honest.path().join("a.md"), "review only").unwrap();
        std::os::unix::fs::symlink("commands/hello.md", honest.path().join("b.md")).unwrap();
        let forged = tempfile::tempdir().unwrap();
        plugin(forged.path());
        std::fs::write(
            forged.path().join("a.md"),
            b"review only\0\0link\0b.md\0commands/hello.md",
        )
        .unwrap();
        assert_eq!(
            legacy_content(honest.path()).unwrap().sha256,
            legacy_content(forged.path()).unwrap().sha256
        );
        assert_ne!(
            signed_content_sha256(honest.path()).unwrap(),
            signed_content_sha256(forged.path()).unwrap()
        );

        sign_in_original_format(honest.path(), &key(7));
        assert!(verify_plugin_signature(honest.path(), &trusted("acme", &key(7))).is_ok());
        std::fs::copy(
            honest.path().join(SIGNATURE_FILE),
            forged.path().join(SIGNATURE_FILE),
        )
        .unwrap();
        assert!(matches!(
            verify_plugin_signature(forged.path(), &trusted("acme", &key(7))),
            Err(SignatureError::LegacyAmbiguous(_))
        ));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn a_name_that_is_not_utf8_cannot_be_signed_or_pass_an_original_signature() {
        use std::os::unix::ffi::OsStrExt;
        let dir = tempfile::tempdir().unwrap();
        plugin(dir.path());
        std::fs::write(
            dir.path().join(std::ffi::OsStr::from_bytes(b"\xff.md")),
            "x",
        )
        .unwrap();

        assert!(matches!(
            sign_plugin(dir.path(), "acme", &key(7)),
            Err(SignatureError::Malformed(_))
        ));
        assert!(matches!(
            legacy_signed_payload(dir.path()),
            Err(SignatureError::LegacyAmbiguous(_))
        ));
    }
}
