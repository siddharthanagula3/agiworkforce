use agiworkforce_protocol::developer_session::{
    CheckpointDiffResponse, CheckpointListResponse, CheckpointSection, CheckpointSectionsParams,
    CheckpointSectionsResponse,
};
use anyhow::{ensure, Context, Result};
use std::collections::HashSet;

#[derive(Default)]
pub struct Changes {
    pub visible: bool,
    pub applying: bool,
    pub operation: Option<uuid::Uuid>,
    pub thread_id: Option<String>,
    pub list: Option<CheckpointListResponse>,
    pub diff: Option<CheckpointDiffResponse>,
    pub selected_path: Option<String>,
    pub error: Option<String>,
    pub notice: Option<String>,
}

impl Changes {
    pub fn begin(&mut self) -> uuid::Uuid {
        let id = uuid::Uuid::new_v4();
        self.operation = Some(id);
        self.error = None;
        id
    }

    pub fn accept_list(&mut self, list: CheckpointListResponse) -> Result<()> {
        ensure!(
            self.thread_id.as_deref() == Some(list.thread_id.as_str()),
            "The checkpoint list belongs to another session"
        );
        let mut ids = HashSet::new();
        ensure!(
            list.turns
                .iter()
                .all(|turn| !turn.turn_id.is_empty() && ids.insert(&turn.turn_id)),
            "The runtime repeated a checkpoint identity"
        );
        ensure!(
            list.available || list.turns.is_empty(),
            "An unavailable checkpoint list contained turns"
        );
        self.list = Some(list);
        self.diff = None;
        self.selected_path = None;
        Ok(())
    }

    pub fn accept_diff(
        &mut self,
        requested_turn: &str,
        diff: CheckpointDiffResponse,
    ) -> Result<()> {
        let turn = self
            .list
            .as_ref()
            .and_then(|list| {
                list.turns
                    .iter()
                    .find(|turn| turn.turn_id == requested_turn)
            })
            .context("Reopen the checkpoint list before reviewing this turn")?;
        ensure!(
            turn.finished_at.is_some(),
            "Wait for the turn's checkpoint to finish before reviewing it"
        );
        ensure!(
            self.thread_id.as_deref() == Some(diff.thread_id.as_str())
                && diff.turn_id == requested_turn
                && diff.index == turn.index,
            "The runtime returned a different checkpoint"
        );
        let mut paths = HashSet::new();
        for file in &diff.files {
            ensure!(
                !file.path.is_empty() && paths.insert(&file.path),
                "The runtime repeated a changed file"
            );
            ensure!(
                turn.files.iter().any(|listed| listed.path == file.path
                    && listed.status == file.status
                    && listed.binary == file.binary),
                "A changed file does not match its checkpoint"
            );
            let mut hunks = HashSet::new();
            ensure!(
                file.hunks
                    .iter()
                    .all(|hunk| hunks.insert(hunk.index) && !hunk.text.is_empty()),
                "The runtime repeated or omitted a diff section"
            );
            ensure!(
                !file.binary || file.hunks.is_empty(),
                "A binary file returned text sections"
            );
        }
        ensure!(
            diff.files.len() == turn.files.len(),
            "The checkpoint diff omitted a file"
        );
        self.selected_path = diff.files.first().map(|file| file.path.clone());
        self.diff = Some(diff);
        Ok(())
    }

    pub fn sections(
        &self,
        path: &str,
        hunk: Option<u32>,
        preview: bool,
    ) -> Result<CheckpointSectionsParams> {
        let diff = self
            .diff
            .as_ref()
            .context("Open a checkpoint before changing its files")?;
        ensure!(
            self.thread_id.as_deref() == Some(diff.thread_id.as_str()),
            "The reviewed session changed"
        );
        let file = diff
            .files
            .iter()
            .find(|file| file.path == path)
            .context("That file is not in the reviewed checkpoint")?;
        if let Some(index) = hunk {
            ensure!(
                !file.binary && file.hunks.iter().any(|hunk| hunk.index == index),
                "That section is not in the reviewed file"
            );
        }
        Ok(CheckpointSectionsParams {
            thread_id: diff.thread_id.clone(),
            turn_id: diff.turn_id.clone(),
            sections: vec![CheckpointSection {
                path: path.to_owned(),
                hunks: hunk.into_iter().collect(),
            }],
            preview,
        })
    }
}

pub fn validate_outcome(
    params: &CheckpointSectionsParams,
    outcome: &CheckpointSectionsResponse,
) -> Result<()> {
    ensure!(
        params.preview == outcome.preview,
        "The runtime returned the wrong change operation phase"
    );
    let expected: HashSet<_> = params
        .sections
        .iter()
        .map(|section| section.path.as_str())
        .collect();
    let mut seen = HashSet::new();
    for path in outcome.applied.iter().map(String::as_str).chain(
        outcome
            .conflicted
            .iter()
            .map(|conflict| conflict.path.as_str()),
    ) {
        ensure!(
            expected.contains(path) && seen.insert(path),
            "The runtime returned an unrelated or repeated changed file"
        );
    }
    ensure!(
        seen == expected,
        "The runtime omitted a change operation result"
    );
    Ok(())
}

pub fn diff_markdown(text: &str) -> String {
    let longest = text
        .split('\n')
        .map(|line| {
            line.chars()
                .skip_while(|ch| *ch == ' ')
                .take_while(|ch| *ch == '~')
                .count()
        })
        .max()
        .unwrap_or(0);
    let fence = "~".repeat(longest.saturating_add(1).max(3));
    format!("{fence}diff\n{text}\n{fence}")
}
