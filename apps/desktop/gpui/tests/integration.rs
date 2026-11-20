use std::path::PathBuf;
use std::time::{Duration, Instant};

use agiworkforce_desktop_gpui::integration::{
    menu_bar_status, parse_accelerator, quick_ask_shortcut, tray_menu, tray_supported,
    AcceleratorError, DeepLinkContract, DeepLinkQueue, DeepLinkRejection, DeepLinkRoute,
    MenuBarStatus, QuickAskShortcut, ShortcutStatus, TrayCommand, TrayMenuItem,
    DEEP_LINK_QUEUE_LIMIT, DEEP_LINK_QUEUE_TTL,
};

#[path = "support/host_path.rs"]
mod host_path;
use host_path::host_absolute;

fn contract() -> &'static DeepLinkContract {
    DeepLinkContract::load().expect("the deep-link contract loads from its TypeScript owner")
}

fn link(path: &str) -> String {
    format!("{}://{path}", contract().scheme())
}

#[test]
fn the_contract_is_read_from_the_typescript_owner() {
    let source = include_str!("../../../../packages/contracts/local-runtime/src/host-bridge.ts");
    let contract = contract();
    assert!(source.contains(&format!(
        "DESKTOP_DEEP_LINK_SCHEME = '{}'",
        contract.scheme()
    )));
    for target in ["chat", "project", "code"] {
        assert!(contract.targets().iter().any(|known| known == target));
    }
    assert!(contract
        .quick_ask_choices()
        .iter()
        .all(|choice| source.contains(&format!("'{choice}'"))));
    assert_eq!(
        contract.quick_ask_default(),
        contract.quick_ask_choices()[0]
    );
}

#[test]
fn a_contract_that_drifts_fails_closed() {
    let sign_in = "export const DESKTOP_SIGN_IN_LINK_HOST = 'sign-in';";
    let products = "export const PRODUCT_LINK_TARGETS = ['chat', 'file'] as const;";
    let host = |scheme: &str, targets: &str| {
        format!(
            "export const DESKTOP_DEEP_LINK_SCHEME = '{scheme}';\nexport const DESKTOP_DEEP_LINK_TARGETS = [{targets}] as const;\nexport const CODE_HOME_DEEP_LINK_ID = 'home';\nexport const HOST_SHORTCUT_CHOICES: Record<HostShortcutKey, readonly string[]> = {{\n  quickAsk: ['Alt+Shift+Space'],\n}};"
        )
    };
    let valid = host(
        "example-app",
        "'chat', 'project', 'code', ...PRODUCT_LINK_TARGETS",
    );
    let parsed = DeepLinkContract::from_sources(&valid, sign_in, products).unwrap();
    assert_eq!(parsed.scheme(), "example-app");
    assert!(parsed.targets().iter().any(|target| target == "file"));
    for broken in [
        host("Example App", "'chat', 'project', 'code'"),
        host("example-app", "'chat', 'project'"),
        host("example-app", "'chat', 'project', 'code', ...OTHER_TARGETS"),
        host("example-app", "'chat', 'project', 'code', `template`"),
        host("example-app", "'chat', 'project', 'code', 'Bad Host'"),
        valid.replace("CODE_HOME_DEEP_LINK_ID", "CODE_HOME"),
        valid.replace("'Alt+Shift+Space'", "'Space'"),
    ] {
        assert!(
            DeepLinkContract::from_sources(&broken, sign_in, products).is_err(),
            "{broken}"
        );
    }
    assert!(DeepLinkContract::from_sources(&valid, "", products).is_err());
    assert!(DeepLinkContract::from_sources(
        &valid,
        "export const DESKTOP_SIGN_IN_LINK_HOST = 'chat';",
        products
    )
    .is_err());
}

#[test]
fn allowed_routes_parse_into_typed_destinations() {
    let contract = contract();
    assert_eq!(
        contract.parse(&link("chat/3f1d2c4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f")),
        Ok(DeepLinkRoute::Conversation(
            "3f1d2c4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f".into()
        ))
    );
    assert_eq!(
        contract.parse(&link("chat/a%3Ab/")),
        Ok(DeepLinkRoute::Conversation("a:b".into()))
    );
    assert_eq!(
        contract.parse(&link("project/project_1")),
        Ok(DeepLinkRoute::Project("project_1".into()))
    );
    assert_eq!(
        contract.parse(&link("code/home")),
        Ok(DeepLinkRoute::CodeHome)
    );
    let folder = host_absolute("/Users/me/My Project");
    let encoded_folder = folder
        .replace(':', "%3A")
        .replace('/', "%2F")
        .replace(' ', "%20");
    assert_eq!(
        contract.parse(&link(&format!(
            "code/local/3f1d2c4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f?folder={encoded_folder}"
        ))),
        Ok(DeepLinkRoute::LocalSession {
            thread_id: "3f1d2c4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f".into(),
            folder: PathBuf::from(folder),
        })
    );
    assert_eq!(
        contract.parse(&link("sign-in?code=abc&challenge=def")),
        Ok(DeepLinkRoute::SignIn)
    );
}

#[test]
fn everything_outside_the_allowlist_is_rejected_with_a_visible_reason() {
    let contract = contract();
    let cases = [
        ("https://chat/abc".to_owned(), DeepLinkRejection::NotThisApp),
        ("not a url".to_owned(), DeepLinkRejection::Malformed),
        (link("chat/%"), DeepLinkRejection::Malformed),
        (link("chat/%E0%A4%A"), DeepLinkRejection::Malformed),
        (link("chat/"), DeepLinkRejection::InvalidId),
        (link("chat/a b"), DeepLinkRejection::InvalidId),
        (link("chat/a%20b"), DeepLinkRejection::InvalidId),
        (link("chat/a/b"), DeepLinkRejection::InvalidId),
        (
            link(&format!("chat/{}", "a".repeat(129))),
            DeepLinkRejection::InvalidId,
        ),
        (link("chat/abc?x=1"), DeepLinkRejection::Malformed),
        (link("chat/abc#x"), DeepLinkRejection::Malformed),
        (link("user@chat/abc"), DeepLinkRejection::Malformed),
        (link("chat:9/abc"), DeepLinkRejection::Malformed),
        (link("sso-callback/abc"), DeepLinkRejection::UnknownTarget),
        (link("CHAT/abc"), DeepLinkRejection::UnknownTarget),
        (link("code/session-1"), DeepLinkRejection::CloudCodeSession),
        (link("code/local/t1"), DeepLinkRejection::InvalidFolder),
        (
            link("code/local/t1?folder=relative%2Fpath"),
            DeepLinkRejection::InvalidFolder,
        ),
        (
            link("code/local/t1?folder=%2Fa&folder=%2Fb"),
            DeepLinkRejection::Malformed,
        ),
        (
            link("code/local/t1?folder=%2Fa&extra=1"),
            DeepLinkRejection::Malformed,
        ),
        (
            link("code/local/t%2F1?folder=%2Fa"),
            DeepLinkRejection::InvalidId,
        ),
        (
            link(&format!("chat/{}", "a".repeat(5000))),
            DeepLinkRejection::Malformed,
        ),
    ];
    for (url, expected) in cases {
        let rejection = contract.parse(&url).expect_err(&url);
        assert_eq!(rejection, expected, "{url}");
        assert!(!rejection.message().is_empty());
    }
    let unsupported = contract
        .targets()
        .iter()
        .find(|target| !["chat", "project", "code"].contains(&target.as_str()))
        .expect("the contract names targets the native app does not open");
    let rejection = contract
        .parse(&link(&format!("{unsupported}/abc")))
        .unwrap_err();
    assert_eq!(
        rejection,
        DeepLinkRejection::Unsupported(unsupported.clone())
    );
    assert!(rejection.message().contains(unsupported.as_str()));
}

#[test]
fn the_queue_keeps_first_place_drops_the_oldest_and_expires_stale_links() {
    let start = Instant::now();
    let mut queue = DeepLinkQueue::default();
    queue.push("a".into(), start);
    queue.push("b".into(), start);
    queue.push("a".into(), start + Duration::from_secs(1));
    assert_eq!(queue.len(), 2);
    assert_eq!(queue.drain_fresh(start), ["a", "b"]);
    assert!(queue.is_empty());

    for index in 0..DEEP_LINK_QUEUE_LIMIT + 3 {
        queue.push(index.to_string(), start);
    }
    let drained = queue.drain_fresh(start);
    assert_eq!(drained.len(), DEEP_LINK_QUEUE_LIMIT);
    assert_eq!(drained.first().map(String::as_str), Some("3"));

    queue.push("old".into(), start);
    queue.push("new".into(), start + DEEP_LINK_QUEUE_TTL);
    assert_eq!(
        queue.drain_fresh(start + DEEP_LINK_QUEUE_TTL + Duration::from_secs(1)),
        ["new"]
    );
}

#[test]
fn accelerators_need_a_real_modifier_and_one_known_key() {
    for chord in contract().quick_ask_choices() {
        assert!(parse_accelerator(chord).is_ok(), "{chord}");
    }
    assert!(parse_accelerator("CommandOrControl+Alt+.").is_ok());
    for (chord, error) in [
        ("", AcceleratorError::Empty),
        ("Alt + Space", AcceleratorError::Whitespace),
        ("Alt++Space", AcceleratorError::EmptyToken),
        ("Alt+Alt+Space", AcceleratorError::DuplicateModifier),
        ("Space", AcceleratorError::MissingModifier),
        ("Shift+A", AcceleratorError::ShiftOnly),
        ("Alt+Shift", AcceleratorError::UnknownKey),
        ("Alt+Space+A", AcceleratorError::UnknownKey),
        ("Alt+NotAKey", AcceleratorError::UnknownKey),
        ("Hyper+Space", AcceleratorError::UnknownKey),
    ] {
        assert_eq!(parse_accelerator(chord).unwrap_err(), error, "{chord}");
    }
}

#[test]
fn the_quick_ask_preference_defaults_to_the_contract_and_empty_means_off() {
    let default = contract().quick_ask_default();
    assert_eq!(
        quick_ask_shortcut(None, default),
        QuickAskShortcut::Chord(default.to_owned())
    );
    assert_eq!(quick_ask_shortcut(Some(""), default), QuickAskShortcut::Off);
    assert_eq!(
        quick_ask_shortcut(Some("Alt+Shift+N"), default),
        QuickAskShortcut::Chord("Alt+Shift+N".into())
    );
    assert_eq!(ShortcutStatus::Off.detail(), None);
    assert_eq!(
        ShortcutStatus::Registered("Alt+Space".into()).detail(),
        None
    );
    assert!(ShortcutStatus::Taken("Alt+Space".into())
        .detail()
        .is_some_and(|detail| detail.contains("another app")));
    assert!(
        ShortcutStatus::Malformed("Space".into(), AcceleratorError::MissingModifier)
            .detail()
            .is_some()
    );
}

#[test]
fn the_tray_menu_offers_open_hide_new_chat_and_quit_with_stable_ids() {
    let menu = tray_menu("Example");
    let commands = menu
        .iter()
        .filter_map(|item| match item {
            TrayMenuItem::Command(command, label) => Some((*command, label.as_str())),
            TrayMenuItem::Separator => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(
        commands,
        [
            (TrayCommand::Open, "Open Example"),
            (TrayCommand::Hide, "Hide Example"),
            (TrayCommand::NewChat, "New Chat"),
            (TrayCommand::Quit, "Quit Example"),
        ]
    );
    for (command, _) in commands {
        assert_eq!(TrayCommand::from_id(command.id()), Some(command));
    }
    assert_eq!(TrayCommand::from_id("integration.tray.unknown"), None);
}

#[test]
fn the_menu_bar_toggle_is_reported_where_it_cannot_be_honoured() {
    assert_eq!(menu_bar_status(false), MenuBarStatus::Off);
    let requested = menu_bar_status(true);
    if tray_supported() {
        assert_eq!(requested, MenuBarStatus::Shown);
    } else {
        assert!(matches!(requested, MenuBarStatus::Unsupported(_)));
        assert!(requested.detail().is_some());
    }
    assert_eq!(
        tray_supported(),
        cfg!(any(target_os = "macos", target_os = "windows"))
    );
}
