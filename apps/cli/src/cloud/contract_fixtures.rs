use serde_json::Value;

use super::chat::{ChatPushRequest, ChatPushResponse};
use super::image::ImageGenerationRequest;
use super::memory::{MemoryPushRequest, MemoryPushResponse};
use super::projects::{ProjectsPullResponse, ProjectsPushRequest, ProjectsPushResponse};
use crate::tier_cache::MeApiResponse;

const FIXTURES: &str = "../../../../packages/contracts/cloud-contracts/src/__fixtures__";

fn golden(name: &str) -> Value {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("src/cloud")
        .join(FIXTURES)
        .join(name);
    serde_json::from_str(&std::fs::read_to_string(&path).expect("golden fixture")).expect("json")
}

fn assert_sent_as_golden(sent: &Value, golden: &Value, at: &str) {
    match (sent, golden) {
        (Value::Object(sent), Value::Object(golden)) => {
            for (key, value) in sent {
                let expected = golden.get(key).unwrap_or(&Value::Null);
                assert_sent_as_golden(value, expected, &format!("{at}.{key}"));
            }
        }
        (Value::Array(sent), Value::Array(golden)) => {
            assert_eq!(sent.len(), golden.len(), "{at} length");
            for (index, (sent, golden)) in sent.iter().zip(golden).enumerate() {
                assert_sent_as_golden(sent, golden, &format!("{at}[{index}]"));
            }
        }
        _ => assert_eq!(sent, golden, "{at} differs from the golden request"),
    }
}

fn round_trip<T: serde::de::DeserializeOwned + serde::Serialize>(golden: &Value, at: &str) {
    let parsed: T = serde_json::from_value(golden.clone()).expect(at);
    let sent = serde_json::to_value(parsed).expect(at);
    assert_sent_as_golden(&sent, golden, at);
}

#[test]
fn cli_requests_match_the_golden_wire() {
    let chat = golden("chat-memory-sync-cas.golden.json");
    round_trip::<ChatPushRequest>(&chat["chatPush"], "chatPush");
    round_trip::<MemoryPushRequest>(&chat["memoryPush"], "memoryPush");
    let projects = golden("projects-sync-cas.golden.json");
    round_trip::<ProjectsPushRequest>(&projects["push"], "projects.push");
    let media = golden("managed-media-requests.golden.json");
    round_trip::<ImageGenerationRequest>(&media["image"], "media.image");
}

#[test]
fn cli_reads_the_golden_responses() {
    let chat = golden("chat-memory-sync-cas.golden.json");
    let pushed: ChatPushResponse =
        serde_json::from_value(chat["chatPushResponse"].clone()).expect("chat push response");
    assert_eq!(pushed.cursor, chat["chatPushResponse"]["cursor"]);
    let memory: MemoryPushResponse =
        serde_json::from_value(chat["memoryPushResponse"].clone()).expect("memory push response");
    assert_eq!(
        memory.conflicts.len(),
        chat["memoryPushResponse"]["conflicts"]
            .as_array()
            .map_or(0, Vec::len)
    );

    let projects = golden("projects-sync-cas.golden.json");
    let pushed: ProjectsPushResponse =
        serde_json::from_value(projects["pushResponse"].clone()).expect("projects push response");
    assert_eq!(pushed.cursor, projects["pushResponse"]["cursor"]);
    let pulled: ProjectsPullResponse =
        serde_json::from_value(projects["pullResponse"].clone()).expect("projects pull response");
    assert_eq!(
        pulled.projects.len(),
        projects["pullResponse"]["projects"]
            .as_array()
            .map_or(0, Vec::len)
    );

    let me = golden("me-response.golden.json");
    let parsed: MeApiResponse = serde_json::from_value(me.clone()).expect("me response");
    assert_eq!(
        parsed.plan.and_then(|plan| plan.tier).as_deref(),
        me["plan"]["tier"].as_str()
    );
    let handshake = parsed.capability_handshake.expect("capability handshake");
    assert_eq!(
        handshake.granted.len(),
        me["capability_handshake"]["granted"]
            .as_array()
            .map_or(0, Vec::len)
    );
}
