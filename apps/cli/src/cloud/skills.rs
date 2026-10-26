//! The account-skills folder belongs to the sync: whatever the account no
//! longer lists is removed from it, so the user's own `skills/` folder must
//! never be written here.

use std::path::{Path, PathBuf};

use serde::Deserialize;
use sha2::{Digest, Sha256};

use super::client::{CloudClient, CloudError, RateBudget};

pub const SKILLS_PATH: &str = "/api/skills";
pub const ACCOUNT_SKILLS_DIR: &str = "account-skills";
const SKILL_ENTRY_FILE: &str = "SKILL.md";
const MAX_SKILL_FILES: usize = 64;
const MAX_SKILL_FILE_BYTES: u64 = 1_000_000;
/// Names the package hash a held skill was written from, beside its files.
const TREE_HASH_FILE: &str = ".tree-hash";
/// The skill names of the last sync that brought the whole catalog down.
const COMPLETED_CATALOG_FILE: &str = ".catalog";

#[derive(Debug, Clone, Deserialize)]
pub struct AccountSkill {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub lifecycle: Option<String>,
    /// Hash of the whole package, when the server offers one.
    #[serde(default, rename = "treeHash")]
    pub tree_hash: Option<String>,
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
    /// The hash a download of this file carries, when the server offers it.
    #[serde(default, rename = "contentHash")]
    content_hash: Option<String>,
}

/// The form the web gives a file's hash: its download ETag.
fn content_hash(bytes: &[u8]) -> String {
    format!("sha256:{}", crate::hex::encode(&Sha256::digest(bytes)))
}

/// The copy this device already holds, when it is byte for byte the one listed.
fn held_copy(held: &Path, relative: &str, listed_hash: Option<&str>) -> Option<Vec<u8>> {
    let listed_hash = listed_hash?;
    let bytes = std::fs::read(held.join(relative)).ok()?;
    (content_hash(&bytes) == listed_hash).then_some(bytes)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncedSkill {
    pub name: String,
    pub document: String,
    pub files: Vec<(String, Vec<u8>)>,
    pub tree_hash: Option<String>,
}

/// What one sync brought down, and every name the account lists, so a sync
/// the server cut short removes only the skills the account no longer has.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillSync {
    pub fetched: Vec<SyncedSkill>,
    pub listed: Vec<String>,
    /// Whether every listed skill is now held, so this sync's list is a
    /// whole catalog rather than one paced batch of it.
    pub complete: bool,
}

/// A held skill written from the same package needs nothing downloaded.
fn holds_package(held: &Path, tree_hash: Option<&str>) -> bool {
    let Some(tree_hash) = tree_hash else {
        return false;
    };
    held.join(SKILL_ENTRY_FILE).is_file()
        && std::fs::read_to_string(held.join(TREE_HASH_FILE))
            .is_ok_and(|held_hash| held_hash.trim() == tree_hash)
}

const SAFETY_MARGIN_DIVISOR: u64 = 10;
const MAX_RESET_WAIT: std::time::Duration = std::time::Duration::from_secs(90);
const RESET_SLACK: std::time::Duration = std::time::Duration::from_millis(250);

/// A background mirror keeps a tenth of the bucket the server reports unspent,
/// so the skills page never finds it empty. Once only that margin is left it
/// waits for the bucket to refill, when the server says that is soon, and goes
/// on from there.
#[derive(Debug, Default)]
struct Pacer {
    budget: Option<RateBudget>,
}

impl Pacer {
    fn note(&mut self, budget: Option<RateBudget>) {
        if budget.is_some() {
            self.budget = budget;
        }
    }

    fn at_margin(budget: &RateBudget) -> bool {
        budget.remaining <= (budget.limit / SAFETY_MARGIN_DIVISOR).max(1)
    }

    /// Whether the next request may go out, after waiting out a refill that is
    /// near enough. False when the bucket is low and will not refill soon.
    async fn admit(&mut self) -> bool {
        let Some(budget) = self.budget.filter(Self::at_margin) else {
            return true;
        };
        let Some(wait) = budget.reset_in.filter(|wait| *wait <= MAX_RESET_WAIT) else {
            return false;
        };
        tokio::time::sleep(wait + RESET_SLACK).await;
        self.budget = None;
        true
    }
}

pub fn account_skills_dir(config_dir: &Path) -> PathBuf {
    config_dir.join(ACCOUNT_SKILLS_DIR)
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

async fn fetch_skill(
    client: &CloudClient,
    skill: &AccountSkill,
    held: &Path,
    pacer: &mut Pacer,
) -> Result<Option<SyncedSkill>, CloudError> {
    let base = format!("{SKILLS_PATH}/{}", path_segment(&skill.name));
    if !pacer.admit().await {
        return Ok(None);
    }
    let (body, budget): (SkillBody, _) = client.get_observed(&base).await?;
    pacer.note(budget);
    if !pacer.admit().await {
        return Ok(None);
    }
    let (listed, budget): (SkillFiles, _) = client.get_observed(&format!("{base}/files")).await?;
    pacer.note(budget);
    let mut files = Vec::new();
    for entry in listed
        .files
        .iter()
        .filter(|entry| entry.path != SKILL_ENTRY_FILE)
        .filter(|entry| entry.size <= MAX_SKILL_FILE_BYTES)
        .filter(|entry| crate::sync::is_contained_relative_path(&entry.path))
        .take(MAX_SKILL_FILES)
    {
        if let Some(bytes) = held_copy(held, &entry.path, entry.content_hash.as_deref()) {
            files.push((entry.path.clone(), bytes));
            continue;
        }
        if !pacer.admit().await {
            return Ok(None);
        }
        let path = entry
            .path
            .split('/')
            .map(path_segment)
            .collect::<Vec<_>>()
            .join("/");
        let (bytes, _, budget) = client
            .get_bytes_observed(&format!("{base}/files/{path}?download=1"), None)
            .await?;
        pacer.note(budget);
        if bytes.len() as u64 <= MAX_SKILL_FILE_BYTES {
            files.push((entry.path.clone(), bytes));
        }
    }
    Ok(Some(SyncedSkill {
        name: skill.name.clone(),
        document: skill_document(skill, &body.body),
        files,
        tree_hash: skill.tree_hash.clone(),
    }))
}

/// A draft is its author's work in progress and is not offered to sessions.
/// A file already held in `dir` with the listed hash is kept, not downloaded.
/// A skill already held from the same package is kept as it is. When the
/// server stops answering for a while, or the rate-limit bucket it reports is
/// low and will not refill soon, what came down so far is kept and the rest
/// waits for the next sync.
pub async fn fetch_account_skills(
    client: &CloudClient,
    dir: &Path,
) -> Result<SkillSync, CloudError> {
    let mut pacer = Pacer::default();
    let (list, budget): (SkillList, _) = client.get_observed(SKILLS_PATH).await?;
    pacer.note(budget);
    let offered: Vec<&AccountSkill> = list
        .skills
        .iter()
        .filter(|skill| safe_skill_name(&skill.name))
        .filter(|skill| skill.lifecycle.as_deref() != Some("draft"))
        .collect();
    let mut fetched = Vec::new();
    let mut complete = true;
    for skill in &offered {
        let held = dir.join(&skill.name);
        if holds_package(&held, skill.tree_hash.as_deref()) {
            continue;
        }
        match fetch_skill(client, skill, &held, &mut pacer).await {
            Ok(Some(skill)) => fetched.push(skill),
            Ok(None) | Err(CloudError::Api { status: 429, .. }) => {
                complete = false;
                break;
            }
            Err(CloudError::Api { status: 404, .. }) => {}
            Err(error) => return Err(error),
        }
    }
    Ok(SkillSync {
        fetched,
        listed: offered.iter().map(|skill| skill.name.clone()).collect(),
        complete,
    })
}

/// Each skill is staged and moved in whole, so a session never reads half of one.
pub fn write_account_skills(dir: &Path, sync: &SkillSync) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    for skill in &sync.fetched {
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
        if let Some(tree_hash) = &skill.tree_hash {
            std::fs::write(staging.join(TREE_HASH_FILE), tree_hash)?;
        }
        let destination = dir.join(&skill.name);
        if destination.exists() {
            std::fs::remove_dir_all(&destination)?;
        }
        std::fs::rename(&staging, &destination)?;
    }
    for entry in std::fs::read_dir(dir)?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !sync.listed.contains(&name) && entry.path().is_dir() {
            std::fs::remove_dir_all(entry.path())?;
        }
    }
    if sync.complete {
        let staging = dir.join(format!("{COMPLETED_CATALOG_FILE}.syncing"));
        std::fs::write(&staging, sync.listed.join("\n"))?;
        std::fs::rename(&staging, dir.join(COMPLETED_CATALOG_FILE))?;
    }
    Ok(())
}

/// The skill names the last complete sync listed, or none before one has
/// finished. A session lists only these in its prompt, so a catalog that
/// lands over several paced syncs reaches the prompt once, whole.
pub fn completed_catalog(dir: &Path) -> std::collections::BTreeSet<String> {
    std::fs::read_to_string(dir.join(COMPLETED_CATALOG_FILE))
        .map(|text| {
            text.lines()
                .filter(|name| !name.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn skill(name: &str, document: &str) -> SyncedSkill {
        SyncedSkill {
            name: name.to_string(),
            document: document.to_string(),
            files: vec![("scripts/run.sh".to_string(), b"echo hi\n".to_vec())],
            tree_hash: None,
        }
    }

    fn sync(fetched: Vec<SyncedSkill>, listed: &[&str]) -> SkillSync {
        SkillSync {
            fetched,
            listed: listed.iter().map(|name| (*name).to_string()).collect(),
            complete: true,
        }
    }

    #[test]
    fn a_skill_from_the_account_loads_like_a_local_one() {
        let document = skill_document(
            &AccountSkill {
                name: "pdf-forms".to_string(),
                description: "Fill PDF forms:\n  read fields, then write them".to_string(),
                lifecycle: None,
                tree_hash: None,
            },
            "Read the form first.\n",
        );
        let dir = tempfile::tempdir().unwrap();
        write_account_skills(
            dir.path(),
            &sync(vec![skill("pdf-forms", &document)], &["pdf-forms"]),
        )
        .unwrap();

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
            &sync(
                vec![
                    skill("kept", "---\nname: kept\n---\n"),
                    skill("dropped", "---\nname: dropped\n---\n"),
                ],
                &["kept", "dropped"],
            ),
        )
        .unwrap();
        write_account_skills(
            dir.path(),
            &sync(
                vec![skill("kept", "---\nname: kept\ndescription: v2\n---\n")],
                &["kept"],
            ),
        )
        .unwrap();

        assert!(!dir.path().join("dropped").exists());
        assert!(std::fs::read_to_string(dir.path().join("kept/SKILL.md"))
            .unwrap()
            .contains("v2"));
    }

    #[test]
    fn a_package_held_at_the_listed_hash_is_kept_without_a_download() {
        let dir = tempfile::tempdir().unwrap();
        let mut held = skill("pdf-forms", "---\nname: pdf-forms\n---\n");
        held.tree_hash = Some("sha256-tree-v1:abc".to_string());
        write_account_skills(dir.path(), &sync(vec![held], &["pdf-forms"])).unwrap();

        let path = dir.path().join("pdf-forms");
        assert!(holds_package(&path, Some("sha256-tree-v1:abc")));
        assert!(!holds_package(&path, Some("sha256-tree-v1:changed")));
        assert!(!holds_package(&path, None));
    }

    #[test]
    fn a_sync_the_server_cut_short_keeps_every_skill_the_account_still_lists() {
        let dir = tempfile::tempdir().unwrap();
        write_account_skills(
            dir.path(),
            &sync(
                vec![
                    skill("first", "---\nname: first\n---\n"),
                    skill("second", "---\nname: second\n---\n"),
                ],
                &["first", "second"],
            ),
        )
        .unwrap();
        write_account_skills(
            dir.path(),
            &sync(
                vec![skill("first", "---\nname: first\n---\n")],
                &["first", "second"],
            ),
        )
        .unwrap();

        assert!(dir.path().join("second/SKILL.md").is_file());
    }

    #[test]
    fn a_file_held_with_the_listed_hash_is_reused_and_any_other_is_fetched() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join("references")).unwrap();
        std::fs::write(dir.path().join("references/guide.md"), b"same bytes").unwrap();
        let listed = content_hash(b"same bytes");
        assert!(listed.starts_with("sha256:") && listed.len() == "sha256:".len() + 64);

        assert_eq!(
            held_copy(dir.path(), "references/guide.md", Some(&listed)),
            Some(b"same bytes".to_vec())
        );
        assert_eq!(
            held_copy(
                dir.path(),
                "references/guide.md",
                Some(&content_hash(b"changed"))
            ),
            None
        );
        assert_eq!(held_copy(dir.path(), "references/guide.md", None), None);
        assert_eq!(
            held_copy(dir.path(), "references/missing.md", Some(&listed)),
            None
        );
    }

    /// A stand-in for the web catalogue: `skills` packages of one reference
    /// file each behind a rate-limit bucket of `limit` requests per `window`,
    /// answering with the headers the web sends and refusing past the bucket.
    struct Catalogue {
        base: String,
        requests: std::sync::atomic::AtomicUsize,
        refused: std::sync::atomic::AtomicUsize,
        bucket: std::sync::Mutex<(std::time::Instant, usize)>,
    }

    impl Catalogue {
        fn refill(&self) {
            *self.bucket.lock().unwrap() = (std::time::Instant::now(), 0);
        }

        fn requests(&self) -> usize {
            self.requests.load(std::sync::atomic::Ordering::SeqCst)
        }

        fn refused(&self) -> usize {
            self.refused.load(std::sync::atomic::Ordering::SeqCst)
        }

        fn reset_requests(&self) {
            self.requests.store(0, std::sync::atomic::Ordering::SeqCst);
        }
    }

    async fn catalogue(
        skills: usize,
        with_hashes: bool,
        limit: usize,
        window: std::time::Duration,
    ) -> std::sync::Arc<Catalogue> {
        use std::sync::atomic::Ordering;
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let state = std::sync::Arc::new(Catalogue {
            base: format!("http://{}", listener.local_addr().unwrap()),
            requests: Default::default(),
            refused: Default::default(),
            bucket: std::sync::Mutex::new((std::time::Instant::now(), 0)),
        });
        let served = state.clone();
        tokio::spawn(async move {
            loop {
                let Ok((mut socket, _)) = listener.accept().await else {
                    return;
                };
                let state = served.clone();
                tokio::spawn(async move {
                    let mut request = vec![0u8; 8192];
                    let read = socket.read(&mut request).await.unwrap_or(0);
                    let line = String::from_utf8_lossy(&request[..read]).to_string();
                    let path = line.split_whitespace().nth(1).unwrap_or("/").to_string();
                    state.requests.fetch_add(1, Ordering::SeqCst);
                    let (seen, until_reset) = {
                        let mut bucket = state.bucket.lock().unwrap();
                        if bucket.0.elapsed() >= window {
                            *bucket = (std::time::Instant::now(), 0);
                        }
                        bucket.1 += 1;
                        (bucket.1, window.saturating_sub(bucket.0.elapsed()))
                    };
                    let reference = b"Reference text".to_vec();
                    let (status, body): (u16, Vec<u8>) = if seen > limit {
                        state.refused.fetch_add(1, Ordering::SeqCst);
                        (429, br#"{"error":"Too many requests"}"#.to_vec())
                    } else if path == "/api/skills" {
                        let entries: Vec<String> = (0..skills)
                            .map(|index| {
                                let hash = if with_hashes {
                                    format!(r#","treeHash":"sha256-tree-v1:{index}""#)
                                } else {
                                    String::new()
                                };
                                format!(r#"{{"name":"skill-{index}","description":"d"{hash}}}"#)
                            })
                            .collect();
                        (
                            200,
                            format!(r#"{{"skills":[{}]}}"#, entries.join(",")).into_bytes(),
                        )
                    } else if path.ends_with("/files") {
                        let hash = if with_hashes {
                            format!(r#","contentHash":"{}""#, content_hash(&reference))
                        } else {
                            String::new()
                        };
                        (
                            200,
                            format!(
                                r#"{{"files":[{{"path":"SKILL.md","size":4}},{{"path":"references/guide.md","size":14{hash}}}]}}"#
                            )
                            .into_bytes(),
                        )
                    } else if path.contains("/files/") {
                        (200, reference)
                    } else {
                        (200, br#"{"body":"Use it."}"#.to_vec())
                    };
                    let reset = (chrono::Utc::now()
                        + chrono::Duration::from_std(until_reset).unwrap())
                    .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
                    let head = format!(
                        "HTTP/1.1 {status} X\r\ncontent-length: {}\r\nx-ratelimit-limit: {limit}\r\nx-ratelimit-remaining: {}\r\nx-ratelimit-reset: {reset}\r\nconnection: close\r\n\r\n",
                        body.len(),
                        limit.saturating_sub(seen)
                    );
                    let _ = socket.write_all(head.as_bytes()).await;
                    let _ = socket.write_all(&body).await;
                });
            }
        });
        state
    }

    const A_MINUTE: std::time::Duration = std::time::Duration::from_secs(60);

    fn assert_whole_catalogue_held(dir: &Path, skills: usize) {
        for index in 0..skills {
            assert!(dir.join(format!("skill-{index}/SKILL.md")).is_file());
            assert_eq!(
                std::fs::read(dir.join(format!("skill-{index}/references/guide.md"))).unwrap(),
                b"Reference text"
            );
        }
    }

    #[tokio::test]
    async fn one_run_brings_down_a_catalogue_the_bucket_covers_and_the_next_costs_one_request() {
        let dir = tempfile::tempdir().unwrap();
        let catalogue = catalogue(63, true, 300, A_MINUTE).await;
        let client = CloudClient::for_test_server(&catalogue.base);

        let sync = fetch_account_skills(&client, dir.path()).await.unwrap();
        write_account_skills(dir.path(), &sync).unwrap();

        assert!(sync.complete);
        assert_eq!(sync.fetched.len(), 63);
        assert_eq!(catalogue.refused(), 0);
        assert_eq!(catalogue.requests(), 1 + 63 * 3);
        assert_whole_catalogue_held(dir.path(), 63);
        assert_eq!(completed_catalog(dir.path()).len(), 63);

        catalogue.reset_requests();
        let again = fetch_account_skills(&client, dir.path()).await.unwrap();
        write_account_skills(dir.path(), &again).unwrap();
        assert!(again.complete && again.fetched.is_empty());
        assert_eq!(
            catalogue.requests(),
            1,
            "a catalogue held in full costs only its listing"
        );
    }

    #[tokio::test]
    async fn a_smaller_bucket_is_waited_out_and_the_run_still_completes_without_a_refusal() {
        let dir = tempfile::tempdir().unwrap();
        let catalogue = catalogue(63, true, 60, std::time::Duration::from_secs(1)).await;
        let client = CloudClient::for_test_server(&catalogue.base);

        let sync = fetch_account_skills(&client, dir.path()).await.unwrap();
        write_account_skills(dir.path(), &sync).unwrap();

        assert!(sync.complete);
        assert_eq!(sync.fetched.len(), 63);
        assert_eq!(
            catalogue.refused(),
            0,
            "the run never spent past the bucket"
        );
        assert_eq!(catalogue.requests(), 1 + 63 * 3);
        assert_whole_catalogue_held(dir.path(), 63);
    }

    #[tokio::test]
    async fn a_refill_too_far_away_ends_the_run_early_without_a_refusal() {
        let dir = tempfile::tempdir().unwrap();
        let catalogue = catalogue(63, true, 60, std::time::Duration::from_secs(3600)).await;
        let client = CloudClient::for_test_server(&catalogue.base);

        let sync = fetch_account_skills(&client, dir.path()).await.unwrap();

        assert!(!sync.complete);
        assert!(!sync.fetched.is_empty() && sync.fetched.len() < 63);
        assert_eq!(catalogue.refused(), 0);
        assert!(catalogue.requests() <= 60 - 60 / SAFETY_MARGIN_DIVISOR as usize);
    }

    /// What a session started now would list in its system prompt.
    fn prompt_catalog(dir: &Path) -> String {
        let mut held = Vec::new();
        for entry in std::fs::read_dir(dir).unwrap().flatten() {
            if let Ok(skill) = crate::skills::load_skill(&entry.path().join(SKILL_ENTRY_FILE)) {
                held.push(skill);
            }
        }
        crate::skills::format_skill_catalog_for_prompt(
            &crate::skills::in_completed_account_catalog(held, dir),
        )
    }

    #[tokio::test]
    async fn the_prompt_lists_a_cut_short_catalogue_only_once_a_sync_has_brought_all_of_it() {
        let dir = tempfile::tempdir().unwrap();
        let catalogue = catalogue(30, true, 60, std::time::Duration::from_secs(3600)).await;
        let client = CloudClient::for_test_server(&catalogue.base);

        let before = prompt_catalog(dir.path());
        let mut batches = 0;
        loop {
            catalogue.refill();
            let sync = fetch_account_skills(&client, dir.path()).await.unwrap();
            write_account_skills(dir.path(), &sync).unwrap();
            if sync.complete {
                break;
            }
            batches += 1;
            assert!(batches < 10, "the paced sync never finished");
            assert_eq!(
                prompt_catalog(dir.path()),
                before,
                "a session started between paced batches lists what the last complete sync did"
            );
        }

        assert!(batches > 0, "the catalogue arrived over more than one sync");
        let listed = prompt_catalog(dir.path());
        for index in 0..30 {
            assert!(listed.contains(&format!("- skill-{index}: ")), "{listed}");
        }
        assert_eq!(completed_catalog(dir.path()).len(), 30);
    }

    #[tokio::test]
    async fn without_package_hashes_every_sync_downloads_every_skill() {
        let dir = tempfile::tempdir().unwrap();
        let catalogue = catalogue(5, false, 300, A_MINUTE).await;
        let client = CloudClient::for_test_server(&catalogue.base);
        for _ in 0..2 {
            catalogue.reset_requests();
            let sync = fetch_account_skills(&client, dir.path()).await.unwrap();
            write_account_skills(dir.path(), &sync).unwrap();
        }
        assert_eq!(catalogue.requests(), 1 + 5 * 3);
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
