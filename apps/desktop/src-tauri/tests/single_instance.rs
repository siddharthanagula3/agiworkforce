use agiworkforce_desktop::focus_running_instance;
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
use tauri::{App, WebviewUrl, WebviewWindowBuilder};

const LIB_SOURCE: &str = include_str!("../src/lib.rs");

fn mock_app() -> App<MockRuntime> {
    mock_builder().build(mock_context(noop_assets())).unwrap()
}

#[test]
fn focus_running_instance_reports_whether_the_main_window_was_reached() {
    let app = mock_app();

    assert!(!focus_running_instance(app.handle()));

    WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
        .build()
        .unwrap();

    assert!(focus_running_instance(app.handle()));
}

#[test]
fn single_instance_plugin_is_registered_before_every_other_plugin() {
    let builder_start = LIB_SOURCE
        .find("tauri::Builder::default()")
        .expect("run() must construct a tauri::Builder");
    let chain = &LIB_SOURCE[builder_start..];

    let guard_at = chain
        .find(".plugin(tauri_plugin_single_instance::init(")
        .expect("the single-instance guard must be registered on the builder");
    let first_plugin_at = chain
        .find(".plugin(")
        .expect("the builder must register at least one plugin");

    assert_eq!(
        guard_at, first_plugin_at,
        "a plugin registered before the single-instance guard can open the encrypted database in a second process"
    );
}
