#![cfg(unix)]
use agiworkforce_app_server::{DeveloperSessionClientError, DeveloperSessionHostError};
use agiworkforce_desktop_gpui::{
    config::{NativeContracts, Settings},
    runtime::{consent_timestamp_ms, RuntimeSession},
};
use agiworkforce_protocol::{
    developer_session::{method, DeveloperWorkspaceIdentity},
    workspace_terminal::*,
};
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};

async fn wait_file(path: &std::path::Path) -> String {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if let Ok(text) = std::fs::read_to_string(path) {
            if !text.is_empty() {
                return text;
            }
        }
        assert!(
            Instant::now() < deadline,
            "{} was not written",
            path.display()
        );
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}

#[tokio::test]
#[ignore = "run through the isolated packaged terminal runner"]
async fn real_terminal_pty_sequences_screen_resize_sandbox_and_shutdown() {
    assert_eq!(
        std::env::var("AGI_GPUI_TERMINAL_FIXTURE").as_deref(),
        Ok("1")
    );
    let binary = PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap());
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let contracts = NativeContracts::load().unwrap();
    let session = RuntimeSession::connect(
        &binary,
        root.path(),
        consent_timestamp_ms().unwrap(),
        &contracts,
        Settings::load().unwrap(),
    )
    .await
    .unwrap();
    assert!(session.capabilities().workspace_terminal);
    let client = session.client();
    let identity: DeveloperWorkspaceIdentity = client
        .request(method::WORKSPACE_IDENTITY, serde_json::json!({}))
        .await
        .unwrap();
    let key = identity.root_key;
    let plan: TerminalPlan = client
        .request(
            method::TERMINAL_PLAN,
            TerminalPlanParams {
                root_key: key.clone(),
                size: TerminalSize {
                    rows: 24,
                    columns: 80,
                },
            },
        )
        .await
        .unwrap();
    assert_eq!(plan.sandbox, "contained");
    assert!(!plan.network_allowed);
    assert_eq!(
        std::fs::canonicalize(&plan.cwd).unwrap(),
        root.path().canonicalize().unwrap()
    );
    let wrong = TerminalIdParams {
        root_key: key.clone(),
        terminal_id: uuid::Uuid::new_v4().to_string(),
    };
    assert!(client
        .request::<TerminalSummary>(method::TERMINAL_START, wrong)
        .await
        .is_err());
    let empty: TerminalListResponse = client
        .request(
            method::TERMINAL_LIST,
            TerminalListParams {
                root_key: key.clone(),
            },
        )
        .await
        .unwrap();
    assert!(empty.terminals.is_empty());
    let plan: TerminalPlan = client
        .request(
            method::TERMINAL_PLAN,
            TerminalPlanParams {
                root_key: key.clone(),
                size: plan.size,
            },
        )
        .await
        .unwrap();
    let id = TerminalIdParams {
        root_key: key.clone(),
        terminal_id: plan.terminal_id.clone(),
    };
    let started: TerminalSummary = client
        .request(method::TERMINAL_START, id.clone())
        .await
        .unwrap();
    assert_eq!(started.state, TerminalState::Running);
    let duplicate: TerminalSummary = client
        .request(method::TERMINAL_START, id.clone())
        .await
        .unwrap();
    assert_eq!(duplicate.plan.terminal_id, started.plan.terminal_id);
    let command = r#"printf once >> once; test -t 0 && test -t 1 && printf tty > tty; printf '\033[31mred\033[0m 東京🦀\n'"#;
    let params = TerminalWriteParams {
        root_key: key.clone(),
        terminal_id: id.terminal_id.clone(),
        sequence: 0,
        text: format!("{command}\r"),
    };
    let accepted: TerminalSummary = client
        .request(method::TERMINAL_WRITE, params.clone())
        .await
        .unwrap();
    assert_eq!(accepted.next_input_sequence, 1);
    let replay: TerminalSummary = client
        .request(method::TERMINAL_WRITE, params)
        .await
        .unwrap();
    assert_eq!(replay.next_input_sequence, 1);
    assert_eq!(wait_file(&root.path().join("once")).await, "once");
    assert_eq!(wait_file(&root.path().join("tty")).await, "tty");
    let mut read = TerminalReadParams {
        root_key: key.clone(),
        terminal_id: id.terminal_id.clone(),
        scrollback: 0,
        after_revision: None,
    };
    let deadline = Instant::now() + Duration::from_secs(5);
    let screen = loop {
        let frame: TerminalReadResponse = client
            .request(method::TERMINAL_READ, read.clone())
            .await
            .unwrap();
        if let Some(screen) = frame.screen {
            if screen.cells.iter().flatten().any(|cell| cell.text == "東")
                && screen
                    .cells
                    .iter()
                    .flatten()
                    .any(|cell| cell.style.foreground == TerminalColor::Indexed { index: 1 })
            {
                break screen;
            }
        }
        assert!(Instant::now() < deadline);
        tokio::time::sleep(Duration::from_millis(10)).await;
    };
    assert!(screen
        .cells
        .iter()
        .flatten()
        .any(|cell| cell.style.foreground == TerminalColor::Indexed { index: 1 }));
    let resized: TerminalSummary = client
        .request(
            method::TERMINAL_RESIZE,
            TerminalResizeParams {
                root_key: key.clone(),
                terminal_id: id.terminal_id.clone(),
                size: TerminalSize {
                    rows: 38,
                    columns: 109,
                },
            },
        )
        .await
        .unwrap();
    assert_eq!(resized.plan.size.rows, 38);
    let forbidden = outside.path().join("must-not-exist");
    let text = format!(
        "stty size > dimensions; printf no > '{}'; printf blocked > attempted\r",
        forbidden.display()
    );
    let _: TerminalSummary = client
        .request(
            method::TERMINAL_WRITE,
            TerminalWriteParams {
                root_key: key.clone(),
                terminal_id: id.terminal_id.clone(),
                sequence: 1,
                text,
            },
        )
        .await
        .unwrap();
    assert_eq!(
        wait_file(&root.path().join("dimensions")).await.trim(),
        "38 109"
    );
    let _ = wait_file(&root.path().join("attempted")).await;
    assert!(!forbidden.exists());
    let _: TerminalSummary = client
        .request(
            method::TERMINAL_WRITE,
            TerminalWriteParams {
                root_key: key.clone(),
                terminal_id: id.terminal_id.clone(),
                sequence: 2,
                text: format!("{}\r", r#"printf '\033[?2004h\033[?1h\033[?1049h'"#),
            },
        )
        .await
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let frame: TerminalReadResponse = client
            .request(method::TERMINAL_READ, read.clone())
            .await
            .unwrap();
        if frame.screen.as_ref().is_some_and(|screen| {
            screen.bracketed_paste && screen.application_cursor && screen.alternate_screen
        }) {
            break;
        }
        assert!(Instant::now() < deadline);
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    let mut changed = TerminalWriteParams {
        root_key: key.clone(),
        terminal_id: id.terminal_id.clone(),
        sequence: 2,
        text: "must not execute\r".into(),
    };
    assert!(client
        .request::<TerminalSummary>(method::TERMINAL_WRITE, changed.clone())
        .await
        .is_err());
    changed.sequence = 3;
    changed.root_key = "wrong-root".into();
    assert!(client
        .request::<TerminalSummary>(method::TERMINAL_WRITE, changed)
        .await
        .is_err());
    let _: TerminalSummary = client
        .request(
            method::TERMINAL_WRITE,
            TerminalWriteParams {
                root_key: key.clone(),
                terminal_id: id.terminal_id.clone(),
                sequence: 3,
                text:
                    "sleep 60 & echo $! > background; sh -c 'echo $$ > foreground; exec sleep 60'\r"
                        .into(),
            },
        )
        .await
        .unwrap();
    let background: u32 = wait_file(&root.path().join("background"))
        .await
        .trim()
        .parse()
        .unwrap();
    let foreground: u32 = wait_file(&root.path().join("foreground"))
        .await
        .trim()
        .parse()
        .unwrap();
    assert!(std::process::Command::new("/bin/kill")
        .args(["-0", &background.to_string()])
        .status()
        .unwrap()
        .success());
    let closed: TerminalSummary = client
        .request(method::TERMINAL_CLOSE, id.clone())
        .await
        .unwrap();
    assert!(matches!(
        closed.state,
        TerminalState::Stopped | TerminalState::Exited
    ));
    for pid in [background, foreground] {
        assert!(!std::process::Command::new("/bin/kill")
            .args(["-0", &pid.to_string()])
            .stderr(std::process::Stdio::null())
            .status()
            .unwrap()
            .success());
    }
    assert!(client
        .request::<TerminalReadResponse>(method::TERMINAL_READ, read.clone())
        .await
        .is_err());
    let plan: TerminalPlan = client
        .request(
            method::TERMINAL_PLAN,
            TerminalPlanParams {
                root_key: key.clone(),
                size: TerminalSize {
                    rows: 24,
                    columns: 80,
                },
            },
        )
        .await
        .unwrap();
    let next = TerminalIdParams {
        root_key: key.clone(),
        terminal_id: plan.terminal_id,
    };
    let _: TerminalSummary = client
        .request(method::TERMINAL_START, next.clone())
        .await
        .unwrap();
    let _: TerminalSummary = client
        .request(
            method::TERMINAL_WRITE,
            TerminalWriteParams {
                root_key: key.clone(),
                terminal_id: next.terminal_id,
                sequence: 0,
                text: "sleep 60 & echo $! > shutdown-background; sleep 60\r".into(),
            },
        )
        .await
        .unwrap();
    let pid: u32 = wait_file(&root.path().join("shutdown-background"))
        .await
        .trim()
        .parse()
        .unwrap();
    session.shutdown().await.unwrap();
    assert!(!std::process::Command::new("/bin/kill")
        .args(["-0", &pid.to_string()])
        .stderr(std::process::Stdio::null())
        .status()
        .unwrap()
        .success());
    let account = RuntimeSession::connect_account(&binary, &contracts, Settings::load().unwrap())
        .await
        .unwrap();
    assert!(!account.capabilities().workspace_terminal);
    read.terminal_id = id.terminal_id;
    let denied = account
        .client()
        .request::<TerminalReadResponse>(method::TERMINAL_READ, read)
        .await;
    assert!(
        matches!(denied,Err(DeveloperSessionClientError::Remote{code,..}) if code==DeveloperSessionHostError::unavailable("").code())
    );
    account.shutdown().await.unwrap();
}
