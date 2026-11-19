use agiworkforce_desktop_gpui::file_changes::{
    create_params, delete_detail, delete_params, rename_detail, rename_params,
};
use agiworkforce_protocol::workspace_files::MAX_EDITOR_TEXT_BYTES;

#[test]
fn an_escaping_or_empty_path_produces_no_file_request() {
    for path in [
        "../outside.txt",
        "/etc/passwd",
        "notes/../secret.txt",
        ".\\mcp.json",
        "",
    ] {
        assert!(
            create_params("root", path, "text", MAX_EDITOR_TEXT_BYTES).is_err(),
            "{path}"
        );
        assert!(
            delete_params("root", path, &delete_detail(path), true).is_err(),
            "{path}"
        );
    }
}

#[test]
fn delete_and_replacing_rename_wait_for_a_confirmation_that_names_the_path() {
    let detail = delete_detail("notes/hello.txt");
    assert!(detail.contains("notes/hello.txt"));
    assert!(delete_params("root", "notes/hello.txt", &detail, false).is_err());
    let request = delete_params("root", "notes/hello.txt", &detail, true).unwrap();
    assert_eq!(request.path, "notes/hello.txt");
    assert!(delete_params(
        "root",
        "notes/hello.txt",
        "This removes a different file.",
        true
    )
    .is_err());

    let replacing = rename_detail("notes/hello.txt", "notes/other.txt", true);
    assert!(replacing.contains("notes/hello.txt") && replacing.contains("notes/other.txt"));
    assert!(rename_params(
        "root",
        "notes/hello.txt",
        "notes/other.txt",
        &replacing,
        false,
        true,
    )
    .is_err());
    let request = rename_params(
        "root",
        "notes/hello.txt",
        "notes/other.txt",
        &replacing,
        true,
        true,
    )
    .unwrap();
    assert!(request.replace);
    let plain = rename_params(
        "root",
        "notes/hello.txt",
        "notes/moved.txt",
        &rename_detail("notes/hello.txt", "notes/moved.txt", false),
        false,
        false,
    )
    .unwrap();
    assert!(!plain.replace);
}
