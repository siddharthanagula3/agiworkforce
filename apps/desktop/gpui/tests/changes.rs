use agiworkforce_desktop_gpui::changes::{diff_markdown, validate_outcome, Changes};
use agiworkforce_protocol::developer_session::*;

fn review() -> Changes {
    let mut review = Changes {
        thread_id: Some("thread".into()),
        ..Default::default()
    };
    review
        .accept_list(CheckpointListResponse {
            thread_id: "thread".into(),
            available: true,
            unavailable_reason: None,
            turns: vec![TurnCheckpointSummary {
                turn_id: "turn".into(),
                index: 1,
                started_at: "start".into(),
                finished_at: Some("finish".into()),
                rewindable: true,
                skipped_files: vec![],
                files: vec![CheckpointFile {
                    path: "src/main.rs".into(),
                    status: CheckpointFileStatus::Modified,
                    binary: false,
                }],
            }],
        })
        .unwrap();
    review
}
fn diff() -> CheckpointDiffResponse {
    CheckpointDiffResponse {
        thread_id: "thread".into(),
        turn_id: "turn".into(),
        index: 1,
        files: vec![CheckpointFileDiff {
            path: "src/main.rs".into(),
            status: CheckpointFileStatus::Modified,
            binary: false,
            hunks: vec![CheckpointHunk {
                index: 7,
                header: "@@ -1 +1 @@".into(),
                text: "@@ -1 +1 @@\n-old\n+new".into(),
            }],
        }],
    }
}

#[test]
fn only_the_exact_completed_checkpoint_can_be_selected_for_a_file_operation() {
    let mut review = review();
    let mut wrong = diff();
    wrong.thread_id = "other".into();
    assert!(review.accept_diff("turn", wrong).is_err());
    let mut missing = diff();
    missing.files.clear();
    assert!(review.accept_diff("turn", missing).is_err());
    review.accept_diff("turn", diff()).unwrap();
    assert!(review.sections("other", None, true).is_err());
    assert!(review.sections("src/main.rs", Some(0), true).is_err());
    let params = review.sections("src/main.rs", Some(7), true).unwrap();
    assert_eq!(params.sections[0].hunks, [7]);
    assert!(params.preview);
    assert_eq!(params.turn_id, "turn");
    review.list.as_mut().unwrap().turns[0].finished_at = None;
    assert!(review.accept_diff("turn", diff()).is_err());
}

#[test]
fn a_repeated_file_or_hunk_cannot_make_an_ambiguous_review() {
    let mut review = review();
    let mut repeated = diff();
    repeated.files.push(repeated.files[0].clone());
    assert!(review.accept_diff("turn", repeated).is_err());
    let mut repeated = diff();
    let hunk = repeated.files[0].hunks[0].clone();
    repeated.files[0].hunks.push(hunk);
    assert!(review.accept_diff("turn", repeated).is_err());
    assert!(review.diff.is_none());
}

#[test]
fn operation_results_must_name_each_selected_file_once_and_the_correct_phase() {
    let mut review = review();
    review.accept_diff("turn", diff()).unwrap();
    let params = review.sections("src/main.rs", None, true).unwrap();
    let mut response = CheckpointSectionsResponse {
        applied: vec!["src/main.rs".into()],
        conflicted: vec![],
        preview: true,
    };
    validate_outcome(&params, &response).unwrap();
    response.preview = false;
    assert!(validate_outcome(&params, &response).is_err());
    response.preview = true;
    response.applied.push("outside".into());
    assert!(validate_outcome(&params, &response).is_err());
    response.applied.clear();
    assert!(validate_outcome(&params, &response).is_err());
    response.conflicted.push(CheckpointSectionConflict {
        path: "src/main.rs".into(),
        reason: "Changed since the checkpoint".into(),
    });
    validate_outcome(&params, &response).unwrap();
}

#[test]
fn diff_source_cannot_escape_into_active_markdown() {
    let source = "@@ -1 +1 @@\n~~~~~\n+<script>run()</script>\n~~~\n[link](https://example.com)";
    let rendered = diff_markdown(source);
    assert!(rendered.starts_with("~~~~~~diff\n"));
    assert!(rendered.ends_with("\n~~~~~~"));
    assert!(rendered.contains(source));
}
