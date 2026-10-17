use axum::{
    extract::State,
    http::header,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    path::PathBuf,
    process::Stdio,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines},
    process::{Child, ChildStdin, ChildStdout, Command},
};

#[derive(Clone)]
struct ModelFixture {
    project: PathBuf,
    calls: Arc<Mutex<Vec<Value>>>,
}

async fn completion(
    State(fixture): State<ModelFixture>,
    Json(body): Json<Value>,
) -> axum::response::Response {
    let messages = body["messages"].as_array().expect("messages");
    let users = messages
        .iter()
        .filter(|message| message["role"] == "user")
        .map(|message| message["content"].to_string())
        .collect::<String>();
    let child = users.contains("CHILD_APPROVAL_FIRST") && !users.contains("PARENT_NORMAL_CHILD");
    let has_result = messages.iter().any(|message| message["role"] == "tool");
    let task_offered = body["tools"]
        .as_array()
        .is_some_and(|tools| tools.iter().any(|tool| tool["function"]["name"] == "task"));
    fixture
        .calls
        .lock()
        .unwrap()
        .push(json!({"child":child,"taskOffered":task_offered}));
    let (message, reason) = if has_result {
        (
            json!({"role":"assistant","content":if child {"Child completed."} else {"Parent completed with owned child."}}),
            "stop",
        )
    } else {
        let (name, args) = if child {
            (
                "write_file",
                json!({"path":fixture.project.join("child-result.txt"),"content":"OWNED_CHILD_SUCCESS\n"}),
            )
        } else {
            (
                "task",
                json!({"description":"Owned normal child","prompt":"CHILD_APPROVAL_FIRST"}),
            )
        };
        (
            json!({"role":"assistant","content":null,"tool_calls":[{"id":format!("call_{}",uuid::Uuid::new_v4()),"type":"function","function":{"name":name,"arguments":args.to_string()}}]}),
            "tool_calls",
        )
    };
    if body["stream"] == true {
        let mut delta = message;
        if let Some(calls) = delta.get_mut("tool_calls") {
            calls[0]["index"] = json!(0);
        }
        let chunks = [
            json!({"choices":[{"index":0,"delta":delta,"finish_reason":null}]}),
            json!({"choices":[{"index":0,"delta":{},"finish_reason":reason}],"usage":{"prompt_tokens":1,"completion_tokens":1}}),
        ];
        let wire = chunks
            .iter()
            .map(|chunk| format!("data: {chunk}\n\n"))
            .collect::<String>()
            + "data: [DONE]\n\n";
        ([(header::CONTENT_TYPE, "text/event-stream")], wire).into_response()
    } else {
        Json(json!({"choices":[{"index":0,"message":message,"finish_reason":reason}],"usage":{"prompt_tokens":1,"completion_tokens":1}})).into_response()
    }
}

struct Wire {
    child: Child,
    input: ChildStdin,
    lines: Lines<BufReader<ChildStdout>>,
    events: VecDeque<Value>,
    id: u64,
}
impl Wire {
    async fn start(project: &std::path::Path, home: &std::path::Path) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_agi"))
            .arg("app-server")
            .current_dir(project)
            .env("HOME", home)
            .env("AGIWORKFORCE_HOME", home)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .unwrap();
        let input = child.stdin.take().unwrap();
        let lines = BufReader::new(child.stdout.take().unwrap()).lines();
        let mut wire = Self {
            child,
            input,
            lines,
            events: VecDeque::new(),
            id: 0,
        };
        wire.rpc("initialize",json!({"clientInfo":{"name":"owned-child-integration","title":"Owned child integration","version":"0.0.1"},"protocolVersion":agiworkforce_protocol::developer_session::DEVELOPER_SESSION_PROTOCOL_VERSION,"userInput":true})).await;
        wire
    }
    async fn next(&mut self) -> Value {
        let line = tokio::time::timeout(Duration::from_secs(30), self.lines.next_line())
            .await
            .expect("bounded protocol response")
            .unwrap()
            .expect("app-server remains alive");
        serde_json::from_str(&line).expect("JSON protocol frame")
    }
    async fn rpc(&mut self, method: &str, params: Value) -> Value {
        self.id += 1;
        self.input
            .write_all(
                format!(
                    "{}\n",
                    json!({"id":self.id,"method":method,"params":params})
                )
                .as_bytes(),
            )
            .await
            .unwrap();
        self.input.flush().await.unwrap();
        loop {
            let response = self.next().await;
            if response["id"] == self.id {
                assert!(response.get("error").is_none(), "{response}");
                return response["result"].clone();
            }
            self.events.push_back(response);
        }
    }
    async fn close(mut self) {
        drop(self.input);
        tokio::time::timeout(Duration::from_secs(10), self.child.wait())
            .await
            .expect("owned runtime exits after EOF")
            .unwrap();
    }
}

#[tokio::test]
async fn ask_mode_child_approval_and_durable_completion_cross_the_real_stdio_binary() {
    let root = tempfile::tempdir().unwrap();
    let project = root.path().join("project");
    let home = root.path().join("home");
    std::fs::create_dir(&project).unwrap();
    std::fs::create_dir(&home).unwrap();
    let project = project.canonicalize().unwrap();
    let calls = Arc::new(Mutex::new(Vec::new()));
    let router = Router::new()
        .route(
            "/v1/models",
            get(|| async { Json(json!({"data":[{"id":"owned-fixture-model"}]})) }),
        )
        .route("/v1/chat/completions", post(completion))
        .with_state(ModelFixture {
            project: project.clone(),
            calls: calls.clone(),
        });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    std::fs::write(home.join("config.toml"),format!("[default]\nmodel=\"owned-fixture-model\"\nprovider=\"lmstudio\"\nstream=true\n[providers.lmstudio]\nbase_url=\"http://{address}/v1\"\n[telemetry]\nproduct_analytics=false\n[updates]\ncheck_on_startup=false\n")).unwrap();
    let initialized = Command::new(env!("CARGO_BIN_EXE_agi"))
        .arg("init")
        .current_dir(&project)
        .env("HOME", &home)
        .env("AGIWORKFORCE_HOME", &home)
        .output()
        .await
        .unwrap();
    assert!(
        initialized.status.success(),
        "{}",
        String::from_utf8_lossy(&initialized.stderr)
    );
    let mut wire = Wire::start(&project, &home).await;
    let thread = wire.rpc("thread/start",json!({"cwd":project,"provider":"lmstudio","model":"owned-fixture-model","title":"Owned normal child"})).await["thread"].clone();
    let turn = wire.rpc("turn/start",json!({"threadId":thread["id"],"input":[{"type":"text","text":"PARENT_NORMAL_CHILD"}],"agentMode":"ask"})).await["turn"].clone();
    let mut approvals = 0;
    loop {
        let event = match wire.events.pop_front() {
            Some(event) => event,
            None => wire.next().await,
        };
        match event["method"].as_str() {
            Some("approval/requested") => {
                let p = &event["params"];
                approvals += 1;
                assert_eq!(p["threadId"], thread["id"]);
                assert_eq!(p["turnId"], turn["id"]);
                assert!(p["summary"].as_str().unwrap().contains("subagent_"));
                let snapshot = wire
                    .rpc("thread/read", json!({"threadId":thread["id"]}))
                    .await;
                assert_eq!(snapshot["childTasks"][0]["state"], "running");
                wire.rpc("approval/respond",json!({"threadId":p["threadId"],"turnId":p["turnId"],"requestId":p["requestId"],"decision":"approved"})).await;
            }
            Some("turn/completed") => break,
            Some("turn/failed") => panic!("normal child failed: {event}"),
            _ => {}
        }
    }
    assert_eq!(approvals, 1);
    assert_eq!(
        std::fs::read_to_string(project.join("child-result.txt")).unwrap(),
        "OWNED_CHILD_SUCCESS\n"
    );
    let final_read = wire
        .rpc("thread/read", json!({"threadId":thread["id"]}))
        .await;
    assert_eq!(final_read["childTasks"][0]["state"], "completed");
    assert!(calls
        .lock()
        .unwrap()
        .iter()
        .any(|call| call["child"] == false && call["taskOffered"] == true));
    assert!(
        calls
            .lock()
            .unwrap()
            .iter()
            .filter(|call| call["child"] == true)
            .all(|call| call["taskOffered"] == false),
        "a child without its own durable parent store must not advertise nested spawning"
    );
    wire.close().await;
    let mut reopened = Wire::start(&project, &home).await;
    let restored = reopened
        .rpc("thread/read", json!({"threadId":thread["id"]}))
        .await;
    assert_eq!(restored["childTasks"], final_read["childTasks"]);
    reopened.close().await;
    server.abort();
}
