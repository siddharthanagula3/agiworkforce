use std::num::NonZeroUsize;
use std::time::Duration;

use agiworkforce_app_server::{
    DeveloperSessionClient, DeveloperSessionClientError, DeveloperSessionClientLimits,
};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

fn limits() -> DeveloperSessionClientLimits {
    DeveloperSessionClientLimits {
        max_frame_bytes: NonZeroUsize::new(1024).unwrap(),
        max_queued_notifications: NonZeroUsize::new(2).unwrap(),
        request_timeout: Duration::from_secs(1),
    }
}

async fn exchange(reply: &str) -> Result<Value, DeveloperSessionClientError> {
    let (client, mut server) = tokio::io::duplex(4096);
    let reply = reply.to_owned();
    tokio::spawn(async move {
        let mut request = String::new();
        let mut reader = BufReader::new(&mut server);
        reader.read_line(&mut request).await.unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&request).unwrap()["method"],
            "thread/list"
        );
        server.write_all(reply.as_bytes()).await.unwrap();
    });
    let (reader, writer) = tokio::io::split(client);
    DeveloperSessionClient::new(reader, writer, limits())
        .request("thread/list", json!({}))
        .await
}

#[tokio::test]
async fn queues_notifications_without_mistaking_them_for_the_response() {
    let (client, mut server) = tokio::io::duplex(4096);
    tokio::spawn(async move {
        let mut request = String::new();
        BufReader::new(&mut server)
            .read_line(&mut request)
            .await
            .unwrap();
        server.write_all(b"{\"method\":\"thread/updated\",\"params\":{}}\n{\"id\":1,\"result\":{\"threads\":[]}}\n").await.unwrap();
    });
    let (reader, writer) = tokio::io::split(client);
    let mut client = DeveloperSessionClient::new(reader, writer, limits());
    let result: Value = client.request("thread/list", json!({})).await.unwrap();
    assert_eq!(result, json!({"threads": []}));
    assert_eq!(client.pop_notification().unwrap().method, "thread/updated");
    assert!(client.pop_notification().is_none());
}

#[tokio::test]
async fn accepts_a_successful_null_result() {
    assert_eq!(
        exchange("{\"id\":1,\"result\":null}\n").await.unwrap(),
        Value::Null
    );
}

#[tokio::test]
async fn rejects_a_response_for_another_request() {
    assert!(matches!(
        exchange("{\"id\":2,\"result\":{}}\n").await,
        Err(DeveloperSessionClientError::InvalidResponse(_))
    ));
}

#[tokio::test]
async fn rejects_ambiguous_and_missing_response_payloads() {
    for frame in [
        "{\"id\":1}\n",
        "{\"id\":1,\"result\":{},\"error\":null}\n",
        "{\"id\":1,\"method\":\"request_permission\",\"params\":{}}\n",
    ] {
        assert!(matches!(
            exchange(frame).await,
            Err(DeveloperSessionClientError::InvalidResponse(_))
        ));
    }
}

#[tokio::test]
async fn rejects_oversized_and_truncated_frames() {
    let oversized = format!("{}\n", " ".repeat(1024));
    assert!(matches!(
        exchange(&oversized).await,
        Err(DeveloperSessionClientError::FrameTooLarge)
    ));
    assert!(matches!(
        exchange("{\"id\":1,\"result\":{}}").await,
        Err(DeveloperSessionClientError::UnexpectedEof)
    ));
}

#[tokio::test]
async fn fails_closed_when_notifications_exceed_the_configured_bound() {
    let frame = "{\"method\":\"turn/updated\",\"params\":{}}\n".repeat(3);
    assert!(matches!(
        exchange(&frame).await,
        Err(DeveloperSessionClientError::NotificationOverflow)
    ));
}

#[tokio::test]
async fn a_remote_refusal_does_not_desynchronise_the_connection() {
    let (client, mut server) = tokio::io::duplex(4096);
    tokio::spawn(async move {
        for response in [
            b"{\"id\":1,\"error\":{\"code\":-32006,\"message\":\"permission denied\"}}\n"
                .as_slice(),
            b"{\"id\":2,\"result\":{\"threads\":[]}}\n".as_slice(),
        ] {
            let mut request = String::new();
            BufReader::new(&mut server)
                .read_line(&mut request)
                .await
                .unwrap();
            server.write_all(response).await.unwrap();
        }
    });
    let (reader, writer) = tokio::io::split(client);
    let mut client = DeveloperSessionClient::new(reader, writer, limits());
    assert!(matches!(
        client.request::<Value>("thread/list", json!({})).await,
        Err(DeveloperSessionClientError::Remote { code: -32006, .. })
    ));
    assert_eq!(
        client
            .request::<Value>("thread/list", json!({}))
            .await
            .unwrap(),
        json!({"threads": []})
    );
}

#[tokio::test(start_paused = true)]
async fn a_timeout_requires_reconnection() {
    let (client, _server) = tokio::io::duplex(4096);
    let (reader, writer) = tokio::io::split(client);
    let mut client = DeveloperSessionClient::new(reader, writer, limits());
    assert!(matches!(
        client.request::<Value>("thread/list", json!({})).await,
        Err(DeveloperSessionClientError::Timeout)
    ));
    assert!(matches!(
        client.request::<Value>("thread/list", json!({})).await,
        Err(DeveloperSessionClientError::Closed)
    ));
}

#[tokio::test]
async fn cancelling_an_inflight_request_requires_reconnection() {
    let (client, _server) = tokio::io::duplex(4096);
    let (reader, writer) = tokio::io::split(client);
    let mut client = DeveloperSessionClient::new(reader, writer, limits());
    {
        let request = client.request::<Value>("thread/list", json!({}));
        tokio::pin!(request);
        tokio::select! {
            result = &mut request => panic!("request unexpectedly finished: {result:?}"),
            _ = tokio::task::yield_now() => {}
        }
    }
    assert!(matches!(
        client.request::<Value>("thread/list", json!({})).await,
        Err(DeveloperSessionClientError::Closed)
    ));
}
