use super::*;
use crate::snapshot::TreeEntry;
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalApplyChange {
    pub path: String,
    pub before: Option<TreeEntry>,
    pub after: Option<TreeEntry>,
    pub binary: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalApplySnapshot {
    pub worktree_id: String,
    pub repository: PathBuf,
    pub checkout: PathBuf,
    pub source_tree: String,
    pub changes: Vec<LocalApplyChange>,
}

impl WorktreeManager<'_> {
    pub async fn verify_local_apply_file(
        &self,
        snapshot: &LocalApplySnapshot,
        path: &str,
        bytes: Option<&[u8]>,
    ) -> Result<()> {
        anyhow::ensure!(
            snapshot.repository == self.repository,
            "The apply source belongs to a different repository"
        );
        let change = snapshot
            .changes
            .iter()
            .find(|change| change.path == path)
            .context("The file is not part of the captured worktree changes")?;
        match (&change.after, bytes) {
            (None, None) => Ok(()),
            (Some(entry), Some(bytes)) => {
                let runner = self.checkout_runner(&snapshot.checkout)?;
                verify_repository_config(
                    &runner,
                    &snapshot.checkout,
                    &snapshot.checkout,
                    ConfigUse::CONTENT,
                )
                .await?;
                let path_arg = format!("--path={path}");
                let output = Git::at(&runner, &snapshot.checkout)
                    .ok_with_input(
                        ["hash-object", path_arg.as_str(), "--stdin"],
                        Some(bytes.to_vec()),
                    )
                    .await?;
                let oid = std::str::from_utf8(&output)
                    .context("Git returned an invalid source content identity")?;
                anyhow::ensure!(
                    oid.trim() == entry.oid,
                    "The worktree file changed while its review was prepared"
                );
                Ok(())
            }
            _ => anyhow::bail!(
                "The worktree file appeared or disappeared while its review was prepared"
            ),
        }
    }
    pub async fn snapshot_local_apply(
        &self,
        id: &str,
        max_files: usize,
    ) -> Result<LocalApplySnapshot> {
        let worktree = self.get(id).await?;
        anyhow::ensure!(
            !worktree.missing,
            "The worktree no longer has a checkout to review"
        );
        anyhow::ensure!(
            !worktree.active,
            "Stop the runtime serving this worktree before reviewing changes for application"
        );
        let tree = snapshot_tree(
            &self.checkout_runner(&worktree.checkout)?,
            &worktree.checkout,
            &self.reserved_dir(id)?.join("apply.index"),
        )
        .await?;
        let changes = diff_trees(
            &self.repo,
            &self.repository,
            &worktree.marker.start_tree,
            &tree,
        )
        .await?;
        anyhow::ensure!(
            changes.len() <= max_files,
            "This worktree exceeds the apply review's file limit"
        );
        let paths = changes
            .iter()
            .map(|change| change.path.as_str())
            .collect::<Vec<_>>();
        let mut before = self
            .entries_for_apply(&worktree.marker.start_tree, &paths)
            .await?;
        let mut after = self.entries_for_apply(&tree, &paths).await?;
        let changes = changes
            .into_iter()
            .map(|change| {
                let before = before.remove(&change.path);
                let after = after.remove(&change.path);
                anyhow::ensure!(
                    match change.status {
                        ChangeStatus::Added => before.is_none() && after.is_some(),
                        ChangeStatus::Modified => before.is_some() && after.is_some(),
                        ChangeStatus::Deleted => before.is_some() && after.is_none(),
                    },
                    "Git omitted the before or after version of a changed file"
                );
                Ok(LocalApplyChange {
                    before,
                    after,
                    path: change.path,
                    binary: change.binary,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(LocalApplySnapshot {
            worktree_id: id.to_owned(),
            repository: self.repository.clone(),
            checkout: worktree.checkout,
            source_tree: tree,
            changes,
        })
    }

    async fn entries_for_apply(
        &self,
        tree: &str,
        paths: &[&str],
    ) -> Result<HashMap<String, TreeEntry>> {
        if paths.is_empty() {
            return Ok(HashMap::new());
        }
        let mut args = vec!["ls-tree", "-r", "-z", tree, "--"];
        args.extend_from_slice(paths);
        let bytes = Git::at(&self.repo, &self.repository)
            .with_env("GIT_LITERAL_PATHSPECS", "1")
            .ok(args)
            .await?;
        let mut result = HashMap::new();
        for row in bytes.split(|byte| *byte == 0).filter(|row| !row.is_empty()) {
            let row = std::str::from_utf8(row)
                .context("The changed file names are not supported UTF-8")?;
            let (header, path) = row
                .split_once('\t')
                .context("Git returned an incomplete changed-file entry")?;
            let mut fields = header.split_whitespace();
            let mode = fields.next().context("Git omitted a file mode")?;
            let _kind = fields.next().context("Git omitted an object kind")?;
            let oid = fields.next().context("Git omitted an object identity")?;
            anyhow::ensure!(
                fields.next().is_none() && paths.contains(&path) && !result.contains_key(path),
                "Git returned an unrelated or repeated changed file"
            );
            anyhow::ensure!(
                !oid.is_empty() && oid.chars().all(|ch| ch.is_ascii_hexdigit()),
                "Git returned an invalid object identity"
            );
            result.insert(
                path.to_owned(),
                TreeEntry {
                    mode: mode.to_owned(),
                    oid: oid.to_owned(),
                },
            );
        }
        Ok(result)
    }

    pub async fn materialize_local_apply(
        &self,
        path: &str,
        entry: &TreeEntry,
        max_bytes: u64,
    ) -> Result<Vec<u8>> {
        anyhow::ensure!(
            entry.regular_executable().is_some()
                && !entry.oid.is_empty()
                && entry.oid.chars().all(|ch| ch.is_ascii_hexdigit()),
            "Only regular Git file contents can be applied"
        );
        path_inside(&self.repository, path).map_err(anyhow::Error::msg)?;
        verify_repository_config(
            &self.repo,
            &self.repository,
            &self.repository,
            ConfigUse::CONTENT,
        )
        .await?;
        let git = Git::at(&self.repo, &self.repository);
        let size = git
            .text(["cat-file", "-s", entry.oid.as_str()])
            .await?
            .parse::<u64>()
            .context("Git returned an invalid blob size")?;
        anyhow::ensure!(
            size <= max_bytes,
            "File {path:?} is {size} bytes, above the {max_bytes}-byte apply review limit"
        );
        let path_arg = format!("--path={path}");
        let bytes = git
            .ok([
                "cat-file",
                "--filters",
                path_arg.as_str(),
                entry.oid.as_str(),
            ])
            .await?;
        anyhow::ensure!(
            bytes.len() as u64 <= max_bytes,
            "The checked-out version of {path:?} exceeds the {max_bytes}-byte apply review limit"
        );
        Ok(bytes)
    }

    pub async fn validate_local_apply_source(
        &self,
        snapshot: &LocalApplySnapshot,
        max_files: usize,
    ) -> Result<()> {
        anyhow::ensure!(
            snapshot.repository == self.repository,
            "The reviewed repository changed"
        );
        let current = self
            .snapshot_local_apply(&snapshot.worktree_id, max_files)
            .await?;
        anyhow::ensure!(
            &current == snapshot,
            "The worktree changed after review. Review it again before applying"
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::test_support::{git, init_repo};
    use crate::{checkpoint::Workspace, TokioCommandRunner};

    #[tokio::test]
    async fn apply_snapshots_bind_additions_deletions_binary_bytes_and_later_edits() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let root = tempfile::tempdir().unwrap();
        let workspace = Workspace::discover(&TokioCommandRunner, repo.path())
            .await
            .unwrap()
            .unwrap();
        let manager = WorktreeManager::open(&TokioCommandRunner, root.path(), &workspace);
        let created = manager
            .create(
                StartPoint::Ref {
                    name: "HEAD".into(),
                },
                None,
            )
            .await
            .unwrap();
        std::fs::remove_file(created.worktree.checkout.join("README.md")).unwrap();
        std::fs::write(created.worktree.checkout.join("image.bin"), b"\0binary\xff").unwrap();
        let plan = manager
            .snapshot_local_apply(&created.worktree.marker.id, 10)
            .await
            .unwrap();
        assert_eq!(plan.changes.len(), 2);
        let deleted = plan
            .changes
            .iter()
            .find(|file| file.path == "README.md")
            .unwrap();
        assert!(deleted.before.is_some() && deleted.after.is_none());
        let added = plan
            .changes
            .iter()
            .find(|file| file.path == "image.bin")
            .unwrap();
        assert!(added.binary && added.before.is_none());
        manager
            .verify_local_apply_file(&plan, "image.bin", Some(b"\0binary\xff"))
            .await
            .unwrap();
        assert!(manager
            .verify_local_apply_file(&plan, "image.bin", Some(b"different source"))
            .await
            .is_err());
        manager
            .verify_local_apply_file(&plan, "README.md", None)
            .await
            .unwrap();
        assert_eq!(
            manager
                .materialize_local_apply(&added.path, added.after.as_ref().unwrap(), 100)
                .await
                .unwrap(),
            b"\0binary\xff"
        );
        assert!(manager
            .materialize_local_apply(&added.path, added.after.as_ref().unwrap(), 1)
            .await
            .is_err());
        manager
            .validate_local_apply_source(&plan, 10)
            .await
            .unwrap();
        std::fs::write(created.worktree.checkout.join("later.txt"), "later").unwrap();
        assert!(manager
            .validate_local_apply_source(&plan, 10)
            .await
            .is_err());
        assert!(manager
            .snapshot_local_apply(&created.worktree.marker.id, 1)
            .await
            .is_err());
        assert_eq!(git(repo.path(), &["diff", "--cached", "--name-only"]), "");
    }

    #[tokio::test]
    async fn apply_materialization_uses_the_original_folders_git_newline_rules() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        std::fs::write(repo.path().join(".gitattributes"), "*.txt text eol=crlf\n").unwrap();
        git(repo.path(), &["add", ".gitattributes"]);
        git(repo.path(), &["commit", "-m", "newline rules"]);
        let root = tempfile::tempdir().unwrap();
        let workspace = Workspace::discover(&TokioCommandRunner, repo.path())
            .await
            .unwrap()
            .unwrap();
        let manager = WorktreeManager::open(&TokioCommandRunner, root.path(), &workspace);
        let created = manager
            .create(
                StartPoint::Ref {
                    name: "HEAD".into(),
                },
                None,
            )
            .await
            .unwrap();
        std::fs::write(created.worktree.checkout.join("new.txt"), "first\nsecond\n").unwrap();
        let plan = manager
            .snapshot_local_apply(&created.worktree.marker.id, 10)
            .await
            .unwrap();
        let file = plan
            .changes
            .iter()
            .find(|file| file.path == "new.txt")
            .unwrap();
        manager
            .verify_local_apply_file(&plan, "new.txt", Some(b"first\nsecond\n"))
            .await
            .unwrap();
        assert_eq!(
            manager
                .materialize_local_apply(&file.path, file.after.as_ref().unwrap(), 100)
                .await
                .unwrap(),
            b"first\r\nsecond\r\n"
        );
        assert!(!repo.path().join("new.txt").exists());
    }
}
