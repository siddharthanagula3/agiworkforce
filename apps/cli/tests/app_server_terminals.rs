#![cfg(unix)]

use agiworkforce_protocol::developer_session::DEVELOPER_SESSION_PROTOCOL_VERSION;
use serde_json::{json, Value};
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;
use tempfile::tempdir;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};

const WAIT: Duration = Duration::from_secs(30);

struct Client {
    child: Child,
    stdin: Option<ChildStdin>,
    lines: tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
    next_id: u64,
    notifications: Vec<Value>,
}

impl Client {
    async fn start(workspace: &Path, home: &Path) -> Self {
        let state = home.join(".agiworkforce");
        let initialized = Command::new(env!("CARGO_BIN_EXE_agi"))
            .arg("init")
            .current_dir(workspace)
            .env("HOME", home)
            .env("AGIWORKFORCE_HOME", &state)
            .env("AGIWORKFORCE_NO_KEYRING", "1")
            .output()
            .await
            .expect("trust the test project");
        assert!(
            initialized.status.success(),
            "agi init failed: {}",
            String::from_utf8_lossy(&initialized.stderr)
        );
        let mut child = Command::new(env!("CARGO_BIN_EXE_agi"))
            .arg("app-server")
            .current_dir(workspace)
            .env("HOME", home)
            .env("SHELL", "/bin/sh")
            .env("AGIWORKFORCE_HOME", &state)
            .env("AGIWORKFORCE_NO_KEYRING", "1")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .expect("spawn app-server");
        let stdin = child.stdin.take().expect("stdin");
        let lines = BufReader::new(child.stdout.take().expect("stdout")).lines();
        let mut client = Self {
            child,
            stdin: Some(stdin),
            lines,
            next_id: 0,
            notifications: Vec::new(),
        };
        let initialized = client
            .call(
                "initialize",
                json!({
                    "clientInfo": { "name": "agi_desktop_test", "title": "Desktop test", "version": "0.0.0" },
                    "protocolVersion": DEVELOPER_SESSION_PROTOCOL_VERSION
                }),
            )
            .await;
        assert_eq!(initialized["result"]["capabilities"]["terminals"], true);
        client
    }

    async fn call(&mut self, method: &str, params: Value) -> Value {
        self.next_id += 1;
        let id = self.next_id;
        let request = json!({ "id": id, "method": method, "params": params });
        let stdin = self.stdin.as_mut().expect("stdin is open");
        stdin
            .write_all(format!("{request}\n").as_bytes())
            .await
            .expect("write request");
        stdin.flush().await.expect("flush request");
        tokio::time::timeout(WAIT, async {
            loop {
                let line = self
                    .lines
                    .next_line()
                    .await
                    .expect("read")
                    .expect("app-server closed stdout");
                let value: Value = serde_json::from_str(&line).expect("JSON line");
                if value["id"] == id {
                    return value;
                }
                if value.get("id").is_none() {
                    self.notifications.push(value);
                }
            }
        })
        .await
        .unwrap_or_else(|_| panic!("no answer to {method}"))
    }

    async fn pull_notification(&mut self) {
        let line = self
            .lines
            .next_line()
            .await
            .expect("read")
            .expect("app-server closed stdout");
        let value: Value = serde_json::from_str(&line).expect("JSON line");
        if value.get("id").is_none() {
            self.notifications.push(value);
        }
    }

    fn output_of(&self, terminal_id: &str) -> String {
        self.notifications
            .iter()
            .filter(|n| {
                n["method"] == "terminal/output" && n["params"]["terminalId"] == terminal_id
            })
            .filter_map(|n| n["params"]["data"].as_str())
            .collect()
    }

    async fn output_contains(&mut self, terminal_id: &str, needle: &str) -> String {
        tokio::time::timeout(WAIT, async {
            while !self.output_of(terminal_id).contains(needle) {
                self.pull_notification().await;
            }
        })
        .await
        .unwrap_or_else(|_| panic!("no {needle:?} in {:?}", self.output_of(terminal_id)));
        self.output_of(terminal_id)
    }

    async fn exited(&mut self, terminal_id: &str) -> Value {
        tokio::time::timeout(WAIT, async {
            loop {
                if let Some(found) = self.notifications.iter().find(|n| {
                    n["method"] == "terminal/exited" && n["params"]["terminalId"] == terminal_id
                }) {
                    return found["params"].clone();
                }
                self.pull_notification().await;
            }
        })
        .await
        .expect("a terminal/exited notification")
    }

    async fn type_into(&mut self, terminal_id: &str, text: &str) {
        let written = self
            .call(
                "terminal/write",
                json!({ "terminalId": terminal_id, "data": text }),
            )
            .await;
        assert_eq!(written["result"]["acknowledged"], true, "{written}");
    }
}

fn alive(pid: i32) -> bool {
    std::process::Command::new("kill")
        .args(["-0", &pid.to_string()])
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

async fn gone(pid: i32) -> bool {
    tokio::time::timeout(WAIT, async {
        while alive(pid) {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .is_ok()
}

fn background_pid(output: &str) -> Option<i32> {
    output
        .split("bg-pid-")
        .filter_map(|rest| {
            let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
            digits.parse().ok()
        })
        .last()
}

async fn start_background_job(client: &mut Client, terminal: &str) -> i32 {
    client
        .type_into(terminal, "sleep 300 & echo bg-pid-$!\n")
        .await;
    tokio::time::timeout(WAIT, async {
        loop {
            if let Some(pid) = background_pid(&client.output_of(terminal)) {
                return pid;
            }
            client.pull_notification().await;
        }
    })
    .await
    .expect("the shell reports its background job")
}

#[tokio::test]
async fn a_client_terminal_runs_sandboxed_in_the_workspace_and_ends_with_its_connection() {
    let workspace = tempdir().expect("workspace");
    let outside = tempdir().expect("outside");
    let home = tempdir().expect("home");
    let root = workspace
        .path()
        .canonicalize()
        .expect("canonical workspace");
    let mut client = Client::start(&root, home.path()).await;

    let elsewhere = client
        .call(
            "terminal/open",
            json!({ "cwd": outside.path(), "cols": 80, "rows": 24 }),
        )
        .await;
    assert_eq!(elsewhere["error"]["code"], -32602, "{elsewhere}");
    assert!(
        elsewhere["error"]["message"]
            .as_str()
            .is_some_and(|message| message.contains("opens inside")),
        "{elsewhere}"
    );

    let opened = client
        .call(
            "terminal/open",
            json!({ "cwd": root, "cols": 100, "rows": 30 }),
        )
        .await;
    if let Some(error) = opened.get("error") {
        assert_eq!(
            error["code"], -32010,
            "a terminal that cannot be sandboxed is refused, never started bare: {opened}"
        );
        eprintln!("no sandbox backend here, so only the refusal was exercised: {opened}");
        return;
    }
    let terminal = opened["result"]["terminalId"]
        .as_str()
        .expect("id")
        .to_string();

    client
        .type_into(&terminal, "echo marker-$((6*7)); pwd; stty size\n")
        .await;
    let printed = client.output_contains(&terminal, "30 100").await;
    assert!(printed.contains("marker-42"), "{printed:?}");
    assert!(printed.contains(root.to_str().unwrap()), "{printed:?}");

    let resized = client
        .call(
            "terminal/resize",
            json!({ "terminalId": terminal, "cols": 132, "rows": 50 }),
        )
        .await;
    assert_eq!(resized["result"]["acknowledged"], true, "{resized}");
    client.type_into(&terminal, "stty size\n").await;
    client.output_contains(&terminal, "50 132").await;

    let escape = home.path().join("escape-probe");
    client
        .type_into(
            &terminal,
            &format!(
                "echo y > inside-probe; echo inside-$?; echo x > '{}'; echo outside-$?; echo end-$((1+1))\n",
                escape.display()
            ),
        )
        .await;
    let probed = client.output_contains(&terminal, "end-2").await;
    assert!(probed.contains("inside-0"), "{probed:?}");
    assert!(
        !probed.contains("outside-0"),
        "the sandbox let a write out: {probed:?}"
    );
    assert!(root.join("inside-probe").is_file());
    assert!(!escape.exists());

    let background = start_background_job(&mut client, &terminal).await;
    assert!(alive(background));
    let closed = client
        .call("terminal/close", json!({ "terminalId": terminal }))
        .await;
    assert_eq!(closed["result"]["acknowledged"], true, "{closed}");
    client.exited(&terminal).await;
    assert!(
        gone(background).await,
        "the shell's background job outlived it"
    );

    let after = client
        .call(
            "terminal/write",
            json!({ "terminalId": terminal, "data": "x" }),
        )
        .await;
    assert_eq!(after["error"]["code"], -32004, "{after}");

    let mut open = Vec::new();
    for _ in 0..8 {
        let next = client
            .call(
                "terminal/open",
                json!({ "cwd": root, "cols": 80, "rows": 24 }),
            )
            .await;
        open.push(
            next["result"]["terminalId"]
                .as_str()
                .expect("id")
                .to_string(),
        );
    }
    let ninth = client
        .call(
            "terminal/open",
            json!({ "cwd": root, "cols": 80, "rows": 24 }),
        )
        .await;
    assert_eq!(ninth["error"]["code"], -32009, "{ninth}");
    assert!(
        ninth["error"]["message"]
            .as_str()
            .is_some_and(|m| m.contains("At most 8")),
        "{ninth}"
    );

    let last = open.last().expect("a terminal").clone();
    let survivor = start_background_job(&mut client, &last).await;
    assert!(alive(survivor));

    drop(client.stdin.take());
    let status = tokio::time::timeout(WAIT, client.child.wait())
        .await
        .expect("the app-server ends when its client does")
        .expect("wait");
    assert!(status.success(), "{status}");
    assert!(
        gone(survivor).await,
        "a terminal's processes outlived the connection that opened them"
    );
}
