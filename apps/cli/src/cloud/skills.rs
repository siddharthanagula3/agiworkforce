//! Account skills: the skills the account has on, whether added from the
//! catalog, written on the web or brought by an enabled plugin, synced down so
//! terminal and editor sessions offer the same skills the web does.
//!
//! The account's skills live in their own folder, which this module owns: a
//! skill turned off on the web is gone from it after the next sync, and the
//! user's own `skills/` folder is never written.

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

/// One skill as it is written to disk: its SKILL.md and the files it carries.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncedSkill {
    pub name: String,
    pub document: String,
    pub files: Vec<(String, Vec<u8>)>,
}

pub fn account_skills_dir(config_dir: &Path) -> PathBuf {
    config_dir.join(ACCOUNT_SKILLS_DIR)
}

/// A name the account sends becomes a folder name here, so it must be one
/// plain path component.
fn safe_skill_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 128
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        && !name.starts_with('.')
}

/// The SKILL.md for a skill the account serves as a name, a description and a
/// body.
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

async fn fetch_skill(
    client: &CloudClient,
    skill: &AccountSkill,
) -> Result<SyncedSkill, CloudError> {
    let base = format!("{SKILLS_PATH}/{}", path_segment(&skill.name));
    let body: SkillBody = client.get(&base, &[]).await?;
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
            .get_bytes_with_header(&format!("{base}/files/{path}"), None)
            .await?;
        if bytes.len() as u64 <= MAX_SKILL_FILE_BYTES {
            files.push((entry.path.clone(), bytes));
        }
    }
    Ok(SyncedSkill {
        name: skill.name.clone(),
        document: skill_document(skill, &body.body),
        files,
    })
}

/// Read every skill the account has on. A draft is the author's work in
/// progress on the web and is not offered to sessions.
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

/// Make `dir` hold exactly `skills`. Each skill is written beside its final
/// place and moved in whole, so a session never reads half of one.
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
