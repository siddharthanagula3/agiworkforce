use agiworkforce_desktop_gpui::editor::FileEditor;
use agiworkforce_protocol::{developer_session::DeveloperWorkspaceIdentity, workspace_files::*};

fn editor() -> FileEditor {
    FileEditor {
        root: Some(DeveloperWorkspaceIdentity {
            cwd: "/fixture".into(),
            root_key: "root".into(),
        }),
        ..Default::default()
    }
}
fn file() -> WorkspaceFileResponse {
    WorkspaceFileResponse {
        root_key: "root".into(),
        path: "note.txt".into(),
        content: "original\r\n🦀".into(),
        revision: "first".into(),
    }
}

#[test]
fn an_unrelated_file_response_cannot_replace_the_current_editor_text() {
    let mut editor = editor();
    let params = WorkspaceFileParams {
        root_key: "root".into(),
        path: "note.txt".into(),
    };
    editor.accept_file(&params, file()).unwrap();
    let mut other = file();
    other.root_key = "another-root".into();
    assert!(editor.accept_file(&params, other).is_err());
    assert_eq!(editor.file, Some(file()));
    assert!(editor.dirty("unsaved"));
    assert!(!editor.dirty(&file().content));
    let mut binary = file();
    binary.content = "bad\0content".into();
    assert!(editor.accept_file(&params, binary).is_err());
}

#[test]
fn only_the_saved_file_and_revision_can_acknowledge_a_save() {
    let mut editor = editor();
    editor.file = Some(file());
    let params = editor.write_params("edited\r\n🦀".into()).unwrap();
    let mut wrong = WorkspaceFileWriteResponse {
        root_key: "root".into(),
        path: "another.txt".into(),
        revision: "saved".into(),
        changed: true,
    };
    assert!(editor.accept_save(params.clone(), wrong.clone()).is_err());
    assert!(editor.dirty(&params.content));
    wrong.path = params.path.clone();
    editor.accept_save(params.clone(), wrong).unwrap();
    assert!(!editor.dirty(&params.content));
    assert!(editor
        .write_params("x".repeat(MAX_EDITOR_TEXT_BYTES + 1))
        .is_err());
}

#[test]
fn directory_pages_cannot_repeat_names_escape_their_folder_or_invent_a_cursor() {
    let mut editor = editor();
    let params = WorkspaceDirectoryParams {
        root_key: "root".into(),
        path: "src".into(),
        after: Some("a".into()),
    };
    let page = WorkspaceDirectoryResponse {
        root_key: "root".into(),
        path: "src".into(),
        entries: vec![WorkspaceDirectoryEntry {
            path: "src/b".into(),
            name: "b".into(),
            kind: WorkspaceEntryKind::File,
            blocked: false,
        }],
        omitted_names: 0,
        next_after: Some("b".into()),
    };
    editor.accept_directory(&params, page.clone()).unwrap();
    let mut wrong = page.clone();
    wrong.entries[0].path = "outside/b".into();
    assert!(editor.accept_directory(&params, wrong).is_err());
    let mut wrong = page.clone();
    wrong.entries.push(wrong.entries[0].clone());
    assert!(editor.accept_directory(&params, wrong).is_err());
    let mut wrong = page;
    wrong.next_after = Some("invented".into());
    assert!(editor.accept_directory(&params, wrong).is_err());
}
