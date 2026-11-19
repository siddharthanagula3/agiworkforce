use agiworkforce_desktop_gpui::code_composer_drafts::{
    accept, clear_params, composer_after_show, read_params, restored_text, set_params,
    CodeDraftAction, CodeDraftQueue, ComposerDraftStore,
};
use agiworkforce_desktop_gpui::config::NativeContracts;
use agiworkforce_protocol::account_cloud::{CloudConversationDraft, CloudDraftSaveParams};
use agiworkforce_protocol::code_drafts::CodeDraftChange;
use agiworkforce_protocol::code_drafts::CodeDraftWriteResponse;
use agiworkforce_protocol::workspace_files::WorkspaceFileRecoverySnapshot;

fn limit() -> usize {
    NativeContracts::load()
        .expect("draft contract")
        .draft_max_length
}

fn fresh_owner(store: &ComposerDraftStore) -> ComposerDraftStore {
    ComposerDraftStore::from_bytes(&store.to_bytes().expect("draft bytes")).expect("fresh owner")
}

fn read_thread(
    store: &ComposerDraftStore,
    root: &str,
    thread: &str,
) -> agiworkforce_protocol::code_drafts::CodeDraftSnapshot {
    store
        .read(&read_params(root, thread).expect("draft identity"))
        .expect("draft read")
}

#[test]
fn a_fresh_owner_restores_only_the_matching_folder_and_thread() {
    let max = limit();
    let mut store = ComposerDraftStore::new();
    let empty = read_thread(&store, "folder-a", "thread-1");
    assert!(empty.text.is_none());
    let saved = store
        .write(
            set_params(&empty, "unsent", max).expect("draft params"),
            max,
        )
        .expect("save");
    assert!(saved.accepted);
    assert_eq!(saved.current.text.as_deref(), Some("unsent"));

    let owner = fresh_owner(&store);
    let restored = read_thread(&owner, "folder-a", "thread-1");
    assert_eq!(
        restored_text(&restored, "folder-a", "thread-1").as_deref(),
        Some("unsent")
    );
    assert_eq!(restored_text(&restored, "folder-a", "thread-2"), None);
    assert_eq!(restored_text(&restored, "folder-b", "thread-1"), None);
    assert!(read_thread(&owner, "folder-a", "thread-2").text.is_none());
    assert!(read_params("", "thread-1").is_err());
}

#[test]
fn a_newer_write_wins_and_a_stale_revision_is_rejected() {
    let max = limit();
    let mut store = ComposerDraftStore::new();
    let empty = read_thread(&store, "folder-a", "thread-1");
    let first = store
        .write(set_params(&empty, "unsent", max).expect("first"), max)
        .expect("first write");
    let newer = store
        .write(
            set_params(&first.current, "newer", max).expect("newer"),
            max,
        )
        .expect("newer write");
    assert!(newer.accepted);
    let before = store.to_bytes().expect("bytes before stale write");
    let stale = store
        .write(
            set_params(&first.current, "older", max).expect("stale"),
            max,
        )
        .expect("stale write");
    assert!(!stale.accepted);
    assert_eq!(accept(stale).text.as_deref(), Some("newer"));
    assert_eq!(store.to_bytes().expect("bytes after stale write"), before);
    let owner = fresh_owner(&store);
    assert_eq!(
        restored_text(
            &read_thread(&owner, "folder-a", "thread-1"),
            "folder-a",
            "thread-1"
        )
        .as_deref(),
        Some("newer")
    );
    assert!(set_params(&newer.current, &"x".repeat(max + 1), max).is_err());
    let mut overlong = set_params(&newer.current, "ok", max).expect("bounded");
    match &mut overlong.change {
        CodeDraftChange::Set { text } => *text = "x".repeat(max + 1),
        CodeDraftChange::Clear => panic!("a text edit is a set"),
    }
    assert!(store.write(overlong, max).is_err());
    assert_eq!(store.to_bytes().expect("bytes after overlong"), before);
}

#[test]
fn clear_on_send_removes_the_stored_draft() {
    let max = limit();
    let mut store = ComposerDraftStore::new();
    let empty = read_thread(&store, "folder-a", "thread-1");
    let saved = store
        .write(set_params(&empty, "unsent", max).expect("save"), max)
        .expect("saved");
    let recovery = WorkspaceFileRecoverySnapshot {
        root_key: "folder-a".into(),
        path: "notes/keep.txt".into(),
        epoch: "file-epoch".into(),
        revision: Some("file-rev".into()),
        recovery: None,
    };
    let recovery_bytes = serde_json::to_vec(&recovery).expect("recovery bytes");
    let draft_bytes = store.to_bytes().expect("draft bytes");
    assert_ne!(draft_bytes, recovery_bytes);
    let draft_json = String::from_utf8(draft_bytes.clone()).expect("draft json");
    assert!(draft_json.contains("thread-1"));
    assert!(draft_json.contains("unsent"));
    assert!(!draft_json.contains("conversationId"));
    assert!(!draft_json.contains("notes/keep.txt"));
    assert!(serde_json::from_slice::<CloudConversationDraft>(&draft_bytes).is_err());
    assert!(serde_json::from_slice::<CloudDraftSaveParams>(&draft_bytes).is_err());
    assert!(serde_json::from_slice::<WorkspaceFileRecoverySnapshot>(&draft_bytes).is_err());

    let cleared = store
        .write(clear_params(&saved.current), max)
        .expect("clear");
    assert!(cleared.accepted);
    assert!(cleared.current.text.is_none());
    let owner = fresh_owner(&store);
    let restored = read_thread(&owner, "folder-a", "thread-1");
    assert_eq!(restored_text(&restored, "folder-a", "thread-1"), None);
    let cleared_json = String::from_utf8(owner.to_bytes().expect("cleared bytes")).expect("json");
    assert!(!cleared_json.contains("unsent"));
    assert!(!cleared_json.contains("thread-1"));
}

fn open_queue(store: &ComposerDraftStore, root: &str, thread: &str) -> CodeDraftQueue {
    let snapshot = read_thread(store, root, thread);
    let mut queue = CodeDraftQueue::default();
    let load = uuid::Uuid::new_v4();
    assert!(queue.begin_load(load));
    let action = queue
        .complete_load(load, snapshot, thread)
        .expect("the load belongs to this queue");
    assert!(matches!(
        action,
        CodeDraftAction::Wait | CodeDraftAction::Show(_)
    ));
    queue
}

fn begin_write(
    queue: &mut CodeDraftQueue,
    store: &mut ComposerDraftStore,
    thread: &str,
    text: &str,
    max: usize,
) -> (
    uuid::Uuid,
    agiworkforce_protocol::code_drafts::CodeDraftWriteParams,
) {
    queue.edit(thread, text);
    let request = queue
        .next_write(max)
        .expect("draft limit")
        .expect("a paused edit is ready");
    let operation = uuid::Uuid::new_v4();
    assert!(queue.begin(operation, &request));
    let saved = store.write(request.clone(), max).expect("host write");
    assert!(saved.accepted);
    (operation, request)
}

#[test]
fn an_edit_during_a_write_is_saved_when_typing_pauses() {
    let max = limit();
    let root = "folder-a";
    let thread = "thread-1";
    let mut store = ComposerDraftStore::new();
    let mut queue = open_queue(&store, root, thread);
    let (operation, sent) = begin_write(&mut queue, &mut store, thread, "draft", max);
    queue.edit(thread, "draft more");
    assert!(queue.waiting_for_pause());
    assert!(queue.next_write(max).expect("limit").is_none());
    let saved = store
        .read(&read_params(root, thread).expect("identity"))
        .expect("read");
    let response = queue
        .finished(
            operation,
            agiworkforce_protocol::code_drafts::CodeDraftWriteResponse {
                accepted: true,
                current: saved.clone(),
            },
            Some("draft more"),
        )
        .expect("the write belongs to this queue");
    assert_eq!(response, CodeDraftAction::Pause);
    let follow = queue
        .next_write(max)
        .expect("limit")
        .expect("the paused text");
    assert!(matches!(follow.change, CodeDraftChange::Set { ref text } if text == "draft more"));
    assert_eq!(follow.revision, saved.revision);
    assert_ne!(follow.revision, sent.revision);
    let written = store.write(follow, max).expect("paused write");
    assert!(written.accepted);
    let owner = fresh_owner(&store);
    assert_eq!(
        restored_text(&read_thread(&owner, root, thread), root, thread).as_deref(),
        Some("draft more")
    );
}

#[test]
fn a_send_during_a_write_clears_the_accepted_revision() {
    let max = limit();
    let root = "folder-a";
    let thread = "thread-1";
    let mut store = ComposerDraftStore::new();
    let mut queue = open_queue(&store, root, thread);
    let (operation, sent) = begin_write(&mut queue, &mut store, thread, "sent text", max);
    queue.edit(thread, "sent text and more");
    assert!(queue.waiting_for_pause());
    queue.request_clear(thread);
    assert!(!queue.waiting_for_pause());
    assert!(queue.next_write(max).expect("limit").is_none());
    let current = read_thread(&store, root, thread);
    let response = queue
        .finished(
            operation,
            agiworkforce_protocol::code_drafts::CodeDraftWriteResponse {
                accepted: true,
                current: current.clone(),
            },
            Some("sent text and more"),
        )
        .expect("the write belongs to this queue");
    assert_eq!(response, CodeDraftAction::Clear);
    let clear = queue
        .next_write(max)
        .expect("limit")
        .expect("clear after the accepted write");
    assert!(matches!(clear.change, CodeDraftChange::Clear));
    assert_eq!(clear.revision, current.revision);
    assert_ne!(clear.revision, sent.revision);
    let cleared = store.write(clear, max).expect("clear");
    assert!(cleared.accepted);
    assert!(cleared.current.text.is_none());
    let owner = fresh_owner(&store);
    assert_eq!(
        restored_text(&read_thread(&owner, root, thread), root, thread),
        None
    );
}

#[test]
fn a_send_before_the_snapshot_loads_clears_instead_of_restoring() {
    let max = limit();
    let root = "folder-a";
    let thread = "thread-1";
    let mut store = ComposerDraftStore::new();
    let mut saving = open_queue(&store, root, thread);
    let (operation, _) = begin_write(&mut saving, &mut store, thread, "unsent", max);
    let current = read_thread(&store, root, thread);
    saving
        .finished(
            operation,
            agiworkforce_protocol::code_drafts::CodeDraftWriteResponse {
                accepted: true,
                current: current.clone(),
            },
            Some("unsent"),
        )
        .expect("save finished");

    let mut restore = CodeDraftQueue::default();
    let restore_load = uuid::Uuid::new_v4();
    assert!(restore.begin_load(restore_load));
    assert_eq!(
        restore
            .complete_load(restore_load, current.clone(), thread)
            .expect("restore"),
        CodeDraftAction::Show("unsent".into())
    );

    let mut queue = CodeDraftQueue::default();
    queue.request_clear(thread);
    assert!(queue.needs_load());
    assert!(queue.next_write(max).expect("limit").is_none());
    let load = uuid::Uuid::new_v4();
    assert!(queue.begin_load(load));
    let action = queue
        .complete_load(load, current.clone(), thread)
        .expect("load");
    assert_eq!(action, CodeDraftAction::Clear);
    let clear = queue.next_write(max).expect("limit").expect("clear");
    assert!(matches!(clear.change, CodeDraftChange::Clear));
    assert_eq!(clear.revision, current.revision);
    let cleared = store.write(clear, max).expect("clear");
    assert!(cleared.accepted);
    assert!(cleared.current.text.is_none());
    assert_eq!(
        restored_text(
            &read_thread(&fresh_owner(&store), root, thread),
            root,
            thread
        ),
        None
    );
}

#[test]
fn a_rejected_write_replaces_a_non_empty_composer_with_the_newer_draft() {
    let max = limit();
    let root = "folder-a";
    let thread = "thread-1";
    let mut store = ComposerDraftStore::new();
    let mut queue = open_queue(&store, root, thread);
    let (operation, _) = begin_write(&mut queue, &mut store, thread, "base", max);
    let base = read_thread(&store, root, thread);
    queue
        .finished(
            operation,
            CodeDraftWriteResponse {
                accepted: true,
                current: base.clone(),
            },
            Some("base"),
        )
        .expect("base saved");
    let newer = store
        .write(set_params(&base, "newer", max).expect("newer"), max)
        .expect("other owner");
    assert!(newer.accepted);
    queue.edit(thread, "older");
    let stale = queue.next_write(max).expect("limit").expect("stale edit");
    let operation = uuid::Uuid::new_v4();
    assert!(queue.begin(operation, &stale));
    let rejected = store.write(stale, max).expect("rejected write");
    assert!(!rejected.accepted);
    assert_eq!(rejected.current.text.as_deref(), Some("newer"));
    let action = queue
        .finished(operation, rejected, Some("older"))
        .expect("rejection");
    assert_eq!(composer_after_show(&action, "older"), "newer");
    queue.edit(thread, "newer");
    assert!(queue.next_write(max).expect("limit").is_none());
    assert_eq!(
        restored_text(
            &read_thread(&fresh_owner(&store), root, thread),
            root,
            thread
        )
        .as_deref(),
        Some("newer")
    );
}

#[test]
fn a_switch_during_the_first_read_writes_the_paused_text_when_the_snapshot_arrives() {
    let max = limit();
    let root = "folder-a";
    let mut store = ComposerDraftStore::new();
    let mut queue = CodeDraftQueue::default();
    let load = uuid::Uuid::new_v4();
    assert!(queue.begin_load(load));
    queue.edit("thread-a", "keep A");
    assert!(queue.waiting_for_pause());
    assert!(queue
        .commit_before_switch("thread-b", max)
        .expect("limit")
        .is_none());
    queue.edit("thread-b", "");
    assert!(queue.waiting_for_pause());
    let action = queue
        .complete_load(load, read_thread(&store, root, "thread-a"), "thread-b")
        .expect("the first read");
    assert_eq!(action, CodeDraftAction::Commit);
    assert_eq!(composer_after_show(&action, ""), "");
    assert_eq!(queue.current_thread(), Some("thread-a"));
    let request = queue.next_write(max).expect("limit").expect("paused text");
    assert!(matches!(request.change, CodeDraftChange::Set { ref text } if text == "keep A"));
    assert_eq!(request.thread_id, "thread-a");
    let operation = uuid::Uuid::new_v4();
    assert!(queue.begin(operation, &request));
    let saved = store.write(request, max).expect("save A");
    assert!(saved.accepted);
    let after = queue
        .finished(operation, saved, None)
        .expect("save finished");
    assert_eq!(composer_after_show(&after, ""), "");
    assert_eq!(queue.take_deferred_load().as_deref(), Some("thread-b"));
    let owner = fresh_owner(&store);
    assert_eq!(
        restored_text(&read_thread(&owner, root, "thread-a"), root, "thread-a").as_deref(),
        Some("keep A")
    );
}
