use agiworkforce_desktop_gpui::drafts::*;
use agiworkforce_protocol::account_cloud::*;

fn target(scope: &str, id: &str) -> DraftTarget {
    DraftTarget {
        scope: scope.into(),
        conversation_id: id.into(),
        workspace: CloudConversationWorkspace::Personal,
    }
}
fn snapshot(text: &str, revision: &str) -> CloudConversationDraft {
    CloudConversationDraft {
        text: text.into(),
        revision: Some(revision.into()),
    }
}
fn saved(job: &DraftJob, revision: &str) -> CloudDraftSaveResponse {
    CloudDraftSaveResponse {
        scope: job.request.scope.clone(),
        workspace: job.request.workspace.clone(),
        conversation_id: job.request.conversation_id.clone(),
        outcome: CloudDraftSaveOutcome::Saved {
            revision: Some(revision.into()),
        },
    }
}

#[test]
fn opening_and_reopening_restore_only_the_selected_conversations_saved_draft() {
    let mut state = DraftState::default();
    let draft = snapshot("Unsent 東京 🦀\nsecond line", "2026-11-09T00:00:00Z");
    assert_eq!(
        state
            .observe(target("account-a", "one"), Some(draft.clone()))
            .unwrap(),
        Some(draft.text.clone())
    );
    assert!(!state.dirty());
    let mut fresh_process = DraftState::default();
    assert_eq!(
        fresh_process
            .observe(target("account-a", "one"), Some(draft))
            .unwrap(),
        Some(state.text.clone())
    );
    assert_eq!(
        state
            .observe(
                target("account-b", "two"),
                Some(snapshot("Other account", "2026-11-09T00:00:01Z"))
            )
            .unwrap(),
        Some("Other account".into())
    );
}

#[test]
fn typing_during_a_save_keeps_the_newer_text_and_uses_the_acknowledged_clock_next() {
    let mut state = DraftState::default();
    state
        .observe(
            target("account", "one"),
            Some(CloudConversationDraft {
                text: String::new(),
                revision: None,
            }),
        )
        .unwrap();
    state.edit("First words".into());
    let first = state.begin(100).unwrap().unwrap();
    state.edit("First words and more 🦀".into());
    assert!(state.begin(100).unwrap().is_none());
    state
        .finish(&first, saved(&first, "2026-11-09T00:00:01Z"))
        .unwrap();
    assert!(state.dirty());
    assert_eq!(state.text, "First words and more 🦀");
    let next = state.begin(100).unwrap().unwrap();
    assert_eq!(
        next.request.draft.revision.as_deref(),
        Some("2026-11-09T00:00:01Z")
    );
    state
        .finish(&next, saved(&next, "2026-11-09T00:00:02Z"))
        .unwrap();
    assert!(!state.dirty());
}

#[test]
fn another_device_never_silently_replaces_local_text_and_resolution_uses_its_clock() {
    let mut state = DraftState::default();
    state
        .observe(
            target("account", "one"),
            Some(snapshot("Earlier", "2026-11-09T00:00:00Z")),
        )
        .unwrap();
    state.edit("Mine".into());
    let job = state.begin(100).unwrap().unwrap();
    let theirs = snapshot("Theirs", "2026-11-09T00:00:01Z");
    let mut response = saved(&job, "unused");
    response.outcome = CloudDraftSaveOutcome::Conflict {
        current: theirs.clone(),
    };
    state.finish(&job, response).unwrap();
    assert_eq!(state.text, "Mine");
    assert!(state.begin(100).unwrap().is_none());
    assert!(state
        .resolve(&snapshot("Older conflict", "2026-11-09T00:00:00Z"), true)
        .is_err());
    state.resolve(&theirs, true).unwrap();
    let retry = state.begin(100).unwrap().unwrap();
    assert_eq!(
        retry.request.draft,
        snapshot("Mine", "2026-11-09T00:00:01Z")
    );
    let mut conflict = saved(&retry, "unused");
    conflict.outcome = CloudDraftSaveOutcome::Conflict {
        current: theirs.clone(),
    };
    state.finish(&retry, conflict).unwrap();
    assert_eq!(state.resolve(&theirs, false).unwrap(), "Theirs");
    assert!(!state.dirty());
}

#[test]
fn unsaved_owner_and_unconfirmed_writes_survive_stale_replies_without_rebinding() {
    let mut state = DraftState::default();
    state
        .observe(
            target("account", "one"),
            Some(snapshot("Earlier", "2026-11-09T00:00:00Z")),
        )
        .unwrap();
    state.edit("Retain me".into());
    let job = state.begin(100).unwrap().unwrap();
    assert!(state.observe(target("other-account", "one"), None).is_err());
    let mut wrong = saved(&job, "2026-11-09T00:00:01Z");
    wrong.workspace = CloudConversationWorkspace::Organization {
        id: "different".into(),
    };
    assert!(state.finish(&job, wrong).is_err());
    state.fail(&job, "Acceptance unknown".into());
    assert!(state.dirty());
    assert_eq!(state.text, "Retain me");
    assert_eq!(state.saved.as_ref().unwrap().text, "Earlier");
    let retry = state.begin(100).unwrap().unwrap();
    assert!(state
        .finish(&job, saved(&job, "2026-11-09T00:00:02Z"))
        .is_err());
    assert_eq!(state.operation.as_ref().unwrap().id, retry.id);
}

#[test]
fn unsupported_drafts_and_utf16_limits_never_truncate_or_claim_persistence() {
    let mut state = DraftState::default();
    state.observe(target("account", "one"), None).unwrap();
    state.edit("Preserve unknown support".into());
    assert!(state.begin(100).is_err());
    assert_eq!(state.text, "Preserve unknown support");
    let mut state = DraftState::default();
    state
        .observe(
            target("account", "one"),
            Some(CloudConversationDraft {
                text: String::new(),
                revision: None,
            }),
        )
        .unwrap();
    state.edit("🦀🦀".into());
    assert!(state.begin(3).is_err());
    assert_eq!(state.text, "🦀🦀");
    assert!(state.begin(4).unwrap().is_some());
}

#[test]
fn stale_reads_and_missing_support_cannot_erase_a_newer_draft() {
    let mut state = DraftState::default();
    state
        .observe(
            target("account", "one"),
            Some(snapshot("Newest text", "2026-11-09T00:00:02Z")),
        )
        .unwrap();
    assert!(state
        .observe(
            target("account", "one"),
            Some(snapshot("Stale text", "2026-11-09T00:00:01Z"))
        )
        .unwrap()
        .is_none());
    assert_eq!(state.text, "Newest text");
    assert!(state
        .observe(target("account", "one"), None)
        .unwrap()
        .is_none());
    assert_eq!(state.text, "Newest text");
    assert!(state.begin(100).is_err());
    assert!(state.dirty());
}
