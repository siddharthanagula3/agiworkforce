use std::collections::HashMap;
use std::path::{Path, PathBuf};

use base64::Engine as _;
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const SIGNATURE_FILE: &str = ".agiworkforce-plugin/signature.json";
pub const SIGNATURE_ALGORITHM: &str = "ed25519";
const SIGNED_PAYLOAD_DOMAIN: &str = "agiworkforce-plugin-signature/v1";

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

fn collect_signed_files(root: &Path, dir: &Path, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            if entry.file_name() == ".git" {
                continue;
            }
            collect_signed_files(root, &path, out)?;
        } else if file_type.is_file() && path != root.join(SIGNATURE_FILE) {
            out.push(path);
        }
    }
    Ok(())
}

pub fn signed_content_sha256(root: &Path) -> std::io::Result<String> {
    let mut files = Vec::new();
    collect_signed_files(root, root, &mut files)?;
    let mut relative: Vec<(String, PathBuf)> = files
        .into_iter()
        .map(|path| {
            let rel = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .components()
                .map(|component| component.as_os_str().to_string_lossy().into_owned())
                .collect::<Vec<_>>()
                .join("/");
            (rel, path)
        })
        .collect();
    relative.sort_by(|a, b| a.0.cmp(&b.0));
    let mut hasher = Sha256::new();
    for (rel, path) in relative {
        hasher.update(rel.as_bytes());
        hasher.update([0u8]);
        hasher.update(std::fs::read(&path)?);
        hasher.update([0u8]);
    }
    Ok(crate::hex::encode(&hasher.finalize()))
}

pub fn signed_payload(root: &Path) -> Result<(Vec<u8>, String), SignatureError> {
    let (manifest_rel, manifest_path) = manifest_file(root).ok_or(SignatureError::NoManifest)?;
    let manifest_bytes =
        std::fs::read(&manifest_path).map_err(|error| SignatureError::Io(error.to_string()))?;
    let manifest_sha256 = crate::hex::encode(&Sha256::digest(&manifest_bytes));
    let content_sha256 =
        signed_content_sha256(root).map_err(|error| SignatureError::Io(error.to_string()))?;
    let payload =
        format!("{SIGNED_PAYLOAD_DOMAIN}\n{manifest_rel}\n{manifest_sha256}\n{content_sha256}\n");
    Ok((payload.into_bytes(), content_sha256))
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
    let (payload, content_sha256) = signed_payload(root)?;
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
}
