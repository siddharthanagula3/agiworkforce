use std::{num::NonZeroUsize, time::Duration};

use agiworkforce_app_server::{
    BackgroundDeveloperSessionClient, DeveloperSessionClient, DeveloperSessionClientError,
    DeveloperSessionClientEvent, DeveloperSessionClientLimits,
};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, DuplexStream};
use tokio::sync::{mpsc, oneshot};

fn client(
    capacity: usize,
) -> (
    BackgroundDeveloperSessionClient,
    mpsc::Receiver<DeveloperSessionClientEvent>,
    DuplexStream,
) {
    let (client, server) = tokio::io::duplex(8192);
    let (reader, writer) = tokio::io::split(client);
    let (client, events) = DeveloperSessionClient::new(
        reader,
        writer,
        DeveloperSessionClientLimits {
            max_frame_bytes: NonZeroUsize::new(1024).unwrap(),
            max_queued_notifications: NonZeroUsize::new(capacity).unwrap(),
            request_timeout: Duration::from_secs(1),
        },
    )
    .into_background(NonZeroUsize::new(capacity).unwrap())
    .unwrap();
    (client, events, server)
}

#[tokio::test]
async fn receives_notifications_without_polling_or_sending_a_request() {
    let (_client, mut events, mut server) = client(4);
    server
        .write_all(b"{\"method\":\"turn/agent_event\",\"params\":{\"delta\":\"hello\"}}\n")
        .await
        .unwrap();
    match events.recv().await.unwrap() {
        DeveloperSessionClientEvent::Notification(event) => {
            assert_eq!(event.params["delta"], "hello")
        }
        _ => panic!("unexpected disconnection"),
    }
}

#[tokio::test(start_paused = true)]
async fn a_long_request_uses_its_own_deadline_while_normal_requests_continue() {
    let (client, _events, server) = client(4);
    let (started, received) = oneshot::channel();
    let (finish, finishing) = oneshot::channel();
    tokio::spawn(async move {
        let (reader, mut writer) = tokio::io::split(server);
        let mut reader = BufReader::new(reader);
        let mut line = String::new();
        reader.read_line(&mut line).await.unwrap();
        let slow: Value = serde_json::from_str(&line).unwrap();
        started.send(()).unwrap();
        line.clear();
        reader.read_line(&mut line).await.unwrap();
        let fast: Value = serde_json::from_str(&line).unwrap();
        writer
            .write_all(format!("{}\n", json!({"id":fast["id"],"result":"fast"})).as_bytes())
            .await
            .unwrap();
        finishing.await.unwrap();
        writer
            .write_all(format!("{}\n", json!({"id":slow["id"],"result":"slow"})).as_bytes())
            .await
            .unwrap();
    });
    let slow_client = client.clone();
    let slow = tokio::spawn(async move {
        slow_client
            .request_with_timeout::<String>(
                "account/login/wait",
                json!({"loginId":"fixture"}),
                Duration::from_secs(5),
            )
            .await
    });
    received.await.unwrap();
    tokio::time::advance(Duration::from_secs(2)).await;
    assert!(!slow.is_finished());
    assert_eq!(
        client
            .request::<String>("account/status", json!({}))
            .await
            .unwrap(),
        "fast"
    );
    finish.send(()).unwrap();
    assert_eq!(slow.await.unwrap().unwrap(), "slow");
}

#[tokio::test]
async fn invalid_custom_deadlines_do_not_write_or_poison_the_connection() {
    let (client, _events, server) = client(4);
    for timeout in [Duration::ZERO, Duration::MAX] {
        assert!(matches!(
            client
                .request_with_timeout::<Value>("account/login/wait", json!({}), timeout)
                .await,
            Err(DeveloperSessionClientError::InvalidTimeout)
        ));
    }
    let reply = tokio::spawn(async move {
        let (reader, mut writer) = tokio::io::split(server);
        let mut line = String::new();
        BufReader::new(reader).read_line(&mut line).await.unwrap();
        let request: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(request["method"], "account/status");
        writer
            .write_all(format!("{}\n", json!({"id":request["id"],"result":{}})).as_bytes())
            .await
            .unwrap();
    });
    client
        .request::<Value>("account/status", json!({}))
        .await
        .unwrap();
    reply.await.unwrap();
}

#[tokio::test]
async fn concurrent_requests_are_correlated_when_the_server_answers_in_reverse_order() {
    let (client, _events, server) = client(4);
    tokio::spawn(async move {
        let (reader, mut writer) = tokio::io::split(server);
        let mut reader = BufReader::new(reader);
        let mut requests = Vec::new();
        for _ in 0..2 {
            let mut line = String::new();
            reader.read_line(&mut line).await.unwrap();
            requests.push(serde_json::from_str::<Value>(&line).unwrap());
        }
        for request in requests.into_iter().rev() {
            let response = json!({"id":request["id"],"result":request["params"]});
            writer
                .write_all(format!("{response}\n").as_bytes())
                .await
                .unwrap();
        }
    });
    let (first, second) = tokio::join!(
        client.request::<Value>("thread/read", json!({"threadId":"first"})),
        client.request::<Value>("thread/read", json!({"threadId":"second"})),
    );
    assert_eq!(first.unwrap()["threadId"], "first");
    assert_eq!(second.unwrap()["threadId"], "second");
}

#[tokio::test]
async fn preserves_a_partial_utf8_frame_when_a_request_arrives() {
    let (client, mut events, server) = client(4);
    let (prefix_sent, prefix_received) = oneshot::channel();
    tokio::spawn(async move {
        let (reader, mut writer) = tokio::io::split(server);
        let notification = "{\"method\":\"turn/updated\",\"params\":{\"text\":\"🌍\"}}\n";
        let split = notification.find('🌍').unwrap() + 2;
        writer
            .write_all(&notification.as_bytes()[..split])
            .await
            .unwrap();
        prefix_sent.send(()).unwrap();
        let mut request = String::new();
        BufReader::new(reader)
            .read_line(&mut request)
            .await
            .unwrap();
        let request: Value = serde_json::from_str(&request).unwrap();
        writer
            .write_all(&notification.as_bytes()[split..])
            .await
            .unwrap();
        let response = json!({"id":request["id"],"result":{}});
        writer
            .write_all(format!("{response}\n").as_bytes())
            .await
            .unwrap();
    });
    prefix_received.await.unwrap();
    tokio::task::yield_now().await;
    client
        .request::<Value>("thread/list", json!({}))
        .await
        .unwrap();
    match events.recv().await.unwrap() {
        DeveloperSessionClientEvent::Notification(event) => assert_eq!(event.params["text"], "🌍"),
        _ => panic!("partial frame was discarded"),
    }
}

#[tokio::test(start_paused = true)]
async fn a_timed_out_request_disconnects_the_session() {
    let (client, _events, _server) = client(4);
    assert!(matches!(
        client.request::<Value>("thread/list", json!({})).await,
        Err(DeveloperSessionClientError::Timeout)
    ));
    assert!(matches!(
        client.request::<Value>("thread/list", json!({})).await,
        Err(DeveloperSessionClientError::Disconnected(_))
    ));
}

#[tokio::test]
async fn cancelling_an_admitted_request_prevents_further_writes() {
    let (client, _events, server) = client(4);
    let pending_client = client.clone();
    let pending = tokio::spawn(async move {
        pending_client
            .request::<Value>("thread/list", json!({}))
            .await
    });
    let (reader, _writer) = tokio::io::split(server);
    let mut reader = BufReader::new(reader);
    let mut request = String::new();
    reader.read_line(&mut request).await.unwrap();
    pending.abort();
    assert!(pending.await.unwrap_err().is_cancelled());
    assert!(matches!(
        client.request::<Value>("thread/list", json!({})).await,
        Err(DeveloperSessionClientError::Disconnected(_))
    ));
    request.clear();
    assert_eq!(reader.read_line(&mut request).await.unwrap(), 0);
}

#[tokio::test]
async fn notification_overflow_disconnects_instead_of_silently_losing_events() {
    let (client, mut events, mut server) = client(1);
    let notification = "{\"method\":\"turn/updated\",\"params\":{}}\n";
    server
        .write_all(notification.repeat(3).as_bytes())
        .await
        .unwrap();
    tokio::task::yield_now().await;
    assert!(matches!(
        events.recv().await,
        Some(DeveloperSessionClientEvent::Notification(_))
    ));
    assert!(events.recv().await.is_none());
    assert!(matches!(
        client.request::<Value>("thread/list", json!({})).await,
        Err(DeveloperSessionClientError::Disconnected(_))
    ));
}

#[tokio::test]
async fn rejects_a_complete_json_value_without_its_frame_terminator() {
    let (client, _events, mut server) = client(4);
    tokio::spawn(async move {
        let mut request = String::new();
        BufReader::new(&mut server)
            .read_line(&mut request)
            .await
            .unwrap();
        server.write_all(b"{\"id\":1,\"result\":{}}").await.unwrap();
    });
    assert!(matches!(
        client.request::<Value>("thread/list", json!({})).await,
        Err(DeveloperSessionClientError::Disconnected(_))
    ));
}

#[tokio::test]
async fn enforces_admission_limits_without_closing_the_connection() {
    let (client, _events, server) = client(1);
    let (seen, received) = oneshot::channel();
    let (finish, finishing) = oneshot::channel();
    tokio::spawn(async move {
        let (reader, mut writer) = tokio::io::split(server);
        let mut reader = BufReader::new(reader);
        let mut request = String::new();
        reader.read_line(&mut request).await.unwrap();
        let request: Value = serde_json::from_str(&request).unwrap();
        seen.send(()).unwrap();
        finishing.await.unwrap();
        let response = json!({"id":request["id"],"result":{}});
        writer
            .write_all(format!("{response}\n").as_bytes())
            .await
            .unwrap();
    });
    let pending_client = client.clone();
    let pending = tokio::spawn(async move {
        pending_client
            .request::<Value>("thread/read", json!({}))
            .await
    });
    received.await.unwrap();
    assert!(matches!(
        client.request::<Value>("thread/list", json!({})).await,
        Err(DeveloperSessionClientError::Busy)
    ));
    finish.send(()).unwrap();
    pending.await.unwrap().unwrap();
}
