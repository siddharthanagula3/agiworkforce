//! The account-skills folder belongs to the sync: whatever the account no
//! longer lists is removed from it, so the user's own `skills/` folder must
//! never be written here.

use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::client::{CloudClient, CloudError};

pub const SKILLS_PATH: &str = "/api/skills";
pub const ACCOUNT_SKILLS_DIR: &str = "account-skills";
const SKILL_ENTRY_FILE: &str = "SKILL.md";
const MAX_SKILL_FILES: usize = 64;
const MAX_SKILL_FILE_BYTES: u64 = 1_000_000;

#[derive(Debug, Clone, Deserialize)]
pub struct AccountSkill {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub lifecycle: Option<String>,
    #[serde(default)]
    pub downloadable: bool,
}

#[derive(Debug, Deserialize)]
struct SkillList {
    #[serde(default)]
    skills: Vec<AccountSkill>,
}

#[derive(Debug, Deserialize)]
struct SkillBody {
    body: String,
}

#[derive(Debug, Deserialize)]
struct SkillFiles {
    #[serde(default)]
    files: Vec<SkillFileEntry>,
}

#[derive(Debug, Deserialize)]
struct SkillFileEntry {
    path: String,
    #[serde(default)]
    size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncedSkill {
    pub name: String,
    pub document: String,
    pub files: Vec<(String, Vec<u8>)>,
}

pub fn account_skills_dir(config_dir: &Path) -> PathBuf {
    config_dir.join(ACCOUNT_SKILLS_DIR)
}

pub const ACCOUNT_SKILLS_STAMP: &str = ".synced";

pub fn account_skills_belong_to(dir: &Path, owner: Option<&str>) -> bool {
    let Some(owner) = owner.map(str::trim).filter(|owner| !owner.is_empty()) else {
        return false;
    };
    std::fs::read_to_string(dir.join(ACCOUNT_SKILLS_STAMP))
        .is_ok_and(|stamped| stamped.trim() == owner)
}

/// The name becomes a folder name, so it must be one plain path component.
fn safe_skill_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        && !name.starts_with('.')
}

pub fn skill_document(skill: &AccountSkill, body: &str) -> String {
    let description = skill
        .description
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    format!(
        "---\nname: {}\ndescription: {}\n---\n\n{}\n",
        skill.name,
        description,
        body.trim_end()
    )
}

fn path_segment(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            other => format!("%{other:02X}"),
        })
        .collect()
}

fn decode_skill_document(bytes: Vec<u8>) -> Result<String, CloudError> {
    if bytes.is_empty() || bytes.len() as u64 > MAX_SKILL_FILE_BYTES {
        return Err(CloudError::Decode(
            "the downloaded skill entry is empty or exceeds the file limit".to_string(),
        ));
    }
    String::from_utf8(bytes)
        .map_err(|_| CloudError::Decode("the downloaded skill entry is not UTF-8".to_string()))
}

async fn fetch_skill(
    client: &CloudClient,
    skill: &AccountSkill,
) -> Result<SyncedSkill, CloudError> {
    let base = format!("{SKILLS_PATH}/{}", path_segment(&skill.name));
    let document = if skill.downloadable {
        let (bytes, _) = client
            .get_bytes_with_header(&format!("{base}/files/{SKILL_ENTRY_FILE}?download=1"), None)
            .await?;
        decode_skill_document(bytes)?
    } else {
        let body: SkillBody = client.get(&base, &[]).await?;
        skill_document(skill, &body.body)
    };
    let listed: SkillFiles = client.get(&format!("{base}/files"), &[]).await?;
    let mut files = Vec::new();
    for entry in listed
        .files
        .iter()
        .filter(|entry| entry.path != SKILL_ENTRY_FILE)
        .filter(|entry| entry.size <= MAX_SKILL_FILE_BYTES)
        .filter(|entry| crate::sync::is_contained_relative_path(&entry.path))
        .take(MAX_SKILL_FILES)
    {
        let path = entry
            .path
            .split('/')
            .map(path_segment)
            .collect::<Vec<_>>()
            .join("/");
        let (bytes, _) = client
            .get_bytes_with_header(&format!("{base}/files/{path}?download=1"), None)
            .await?;
        if bytes.len() as u64 <= MAX_SKILL_FILE_BYTES {
            files.push((entry.path.clone(), bytes));
        }
    }
    Ok(SyncedSkill {
        name: skill.name.clone(),
        document,
        files,
    })
}

/// A draft is its author's work in progress and is not offered to sessions.
pub async fn fetch_account_skills(client: &CloudClient) -> Result<Vec<SyncedSkill>, CloudError> {
    let list: SkillList = client.get(SKILLS_PATH, &[]).await?;
    let mut synced = Vec::new();
    for skill in list
        .skills
        .iter()
        .filter(|skill| safe_skill_name(&skill.name))
        .filter(|skill| skill.lifecycle.as_deref() != Some("draft"))
    {
        match fetch_skill(client, skill).await {
            Ok(skill) => synced.push(skill),
            Err(CloudError::Api { status: 404, .. }) => {}
            Err(error) => return Err(error),
        }
    }
    Ok(synced)
}

/// Each skill is staged and moved in whole, so a session never reads half of one.
pub fn write_account_skills(dir: &Path, skills: &[SyncedSkill]) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    for skill in skills {
        let staging = dir.join(format!(".{}.syncing", skill.name));
        if staging.exists() {
            std::fs::remove_dir_all(&staging)?;
        }
        std::fs::create_dir_all(&staging)?;
        std::fs::write(staging.join(SKILL_ENTRY_FILE), &skill.document)?;
        for (relative, bytes) in &skill.files {
            let target = staging.join(relative);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(target, bytes)?;
        }
        let destination = dir.join(&skill.name);
        if destination.exists() {
            std::fs::remove_dir_all(&destination)?;
        }
        std::fs::rename(&staging, &destination)?;
    }
    for entry in std::fs::read_dir(dir)?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !skills.iter().any(|skill| skill.name == name) && entry.path().is_dir() {
            std::fs::remove_dir_all(entry.path())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downloaded_skill_entry_rejects_non_utf8_instead_of_replacing_bytes() {
        assert!(matches!(
            decode_skill_document(vec![0xff]),
            Err(CloudError::Decode(_))
        ));
    }

    #[test]
    fn downloaded_skill_entry_rejects_empty_content() {
        assert!(matches!(
            decode_skill_document(Vec::new()),
            Err(CloudError::Decode(_))
        ));
    }

    #[test]
    fn downloaded_skill_entry_rejects_content_over_the_existing_file_limit() {
        assert!(matches!(
            decode_skill_document(vec![b'x'; MAX_SKILL_FILE_BYTES as usize + 1]),
            Err(CloudError::Decode(_))
        ));
    }

    fn skill(name: &str, document: &str) -> SyncedSkill {
        SyncedSkill {
            name: name.to_string(),
            document: document.to_string(),
            files: vec![("scripts/run.sh".to_string(), b"echo hi\n".to_vec())],
        }
    }

    #[test]
    fn a_skill_from_the_account_loads_like_a_local_one() {
        let document = skill_document(
            &AccountSkill {
                name: "pdf-forms".to_string(),
                description: "Fill PDF forms:\n  read fields, then write them".to_string(),
                lifecycle: None,
                downloadable: false,
            },
            "Read the form first.\n",
        );
        let dir = tempfile::tempdir().unwrap();
        write_account_skills(dir.path(), &[skill("pdf-forms", &document)]).unwrap();

        let loaded = crate::skills::load_skill(&dir.path().join("pdf-forms").join("SKILL.md"))
            .expect("loads");
        assert_eq!(loaded.name, "pdf-forms");
        assert_eq!(
            loaded.description,
            "Fill PDF forms: read fields, then write them"
        );
        assert_eq!(loaded.body.trim(), "Read the form first.");
        assert_eq!(
            std::fs::read(dir.path().join("pdf-forms/scripts/run.sh")).unwrap(),
            b"echo hi\n"
        );
    }

    #[test]
    fn account_skills_load_only_for_the_account_that_synced_them() {
        let dir = tempfile::tempdir().unwrap();
        write_account_skills(dir.path(), &[skill("kept", "---\nname: kept\n---\n")]).unwrap();
        assert!(!account_skills_belong_to(dir.path(), Some("account-a")));

        std::fs::write(dir.path().join(ACCOUNT_SKILLS_STAMP), b"").unwrap();
        assert!(!account_skills_belong_to(dir.path(), Some("account-a")));

        std::fs::write(dir.path().join(ACCOUNT_SKILLS_STAMP), b"account-a").unwrap();
        assert!(account_skills_belong_to(dir.path(), Some("account-a")));
        assert!(!account_skills_belong_to(dir.path(), Some("account-b")));
        assert!(!account_skills_belong_to(dir.path(), None));
    }

    #[test]
    fn a_skill_turned_off_on_the_web_leaves_this_device_on_the_next_sync() {
        let dir = tempfile::tempdir().unwrap();
        write_account_skills(
            dir.path(),
            &[
                skill("kept", "---\nname: kept\n---\n"),
                skill("dropped", "---\nname: dropped\n---\n"),
            ],
        )
        .unwrap();
        write_account_skills(
            dir.path(),
            &[skill("kept", "---\nname: kept\ndescription: v2\n---\n")],
        )
        .unwrap();

        assert!(!dir.path().join("dropped").exists());
        assert!(std::fs::read_to_string(dir.path().join("kept/SKILL.md"))
            .unwrap()
            .contains("v2"));
    }

    #[test]
    fn a_name_that_is_not_one_folder_is_refused() {
        for name in ["", "..", "../escape", "a/b", ".hidden", "a\\b"] {
            assert!(!safe_skill_name(name), "{name:?}");
        }
        assert!(safe_skill_name("pdf-forms_v2"));
        assert_eq!(path_segment("a b/c"), "a%20b%2Fc");
    }
}
