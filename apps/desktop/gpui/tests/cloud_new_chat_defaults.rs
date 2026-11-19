use agiworkforce_desktop_gpui::cloud_new_chat_defaults::{attempt, current, UNAVAILABLE};

#[test]
fn unavailable_cloud_defaults_persist_nothing() {
    let mut writes = Vec::new();
    let error = attempt(current(), &mut writes).expect_err("defaults are unavailable");
    assert!(error.to_string().contains(UNAVAILABLE));
    assert!(writes.is_empty());
    assert!(!current().available);
}
