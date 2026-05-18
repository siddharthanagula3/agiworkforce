//! JSON-RPC 2.0 protocol layer (Google A2A-inspired, minimal).
//!
//! Transports (stdio / WebSocket) drive `handle_request`; the HTTP server
//! wraps this for localhost delivery. Types kept separate from HTTP-server
//! types so the protocol surface can be tested and evolved independently.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentCard {
    pub id: String,
    pub name: String,
    pub model: String,
    pub capabilities: Vec<String>,
    pub tools: Vec<String>,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TaskRequest {
    pub id: String,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deadline_unix: Option<i64>,
    #[serde(default)]
    pub context: HashMap<String, String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskState {
    Accepted,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TaskResponse {
    pub id: String,
    pub state: TaskState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct A2aRequest {
    pub jsonrpc: String,
    pub id: serde_json::Value,
    pub method: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct A2aResponse {
    pub jsonrpc: String,
    pub id: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<A2aError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct A2aError {
    pub code: i32,
    pub message: String,
}

#[derive(Default)]
pub struct PeerRegistry {
    peers: HashMap<String, AgentCard>,
}

impl PeerRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, card: AgentCard) {
        self.peers.insert(card.id.clone(), card);
    }

    pub fn unregister(&mut self, id: &str) -> Option<AgentCard> {
        self.peers.remove(id)
    }

    pub fn lookup(&self, id: &str) -> Option<&AgentCard> {
        self.peers.get(id)
    }

    pub fn list(&self) -> Vec<&AgentCard> {
        self.peers.values().collect()
    }

    pub fn find_by_capability(&self, cap: &str) -> Vec<&AgentCard> {
        self.peers
            .values()
            .filter(|c| c.capabilities.iter().any(|x| x == cap))
            .collect()
    }
}

pub fn handle_request(
    req: A2aRequest,
    registry: &PeerRegistry,
    self_card: &AgentCard,
) -> A2aResponse {
    match req.method.as_str() {
        "discover" => A2aResponse {
            jsonrpc: "2.0".into(),
            id: req.id,
            result: Some(
                serde_json::to_value(self_card).unwrap_or(serde_json::json!({})),
            ),
            error: None,
        },
        "list_peers" => A2aResponse {
            jsonrpc: "2.0".into(),
            id: req.id,
            result: Some(
                serde_json::to_value(
                    registry
                        .list()
                        .iter()
                        .map(|c| (*c).clone())
                        .collect::<Vec<_>>(),
                )
                .unwrap_or(serde_json::json!([])),
            ),
            error: None,
        },
        "delegate" => {
            let Ok(task) = serde_json::from_value::<TaskRequest>(req.params.clone()) else {
                return A2aResponse {
                    jsonrpc: "2.0".into(),
                    id: req.id,
                    result: None,
                    error: Some(A2aError {
                        code: -32602,
                        message: "invalid params (expected TaskRequest)".into(),
                    }),
                };
            };
            let resp = TaskResponse {
                id: task.id.clone(),
                state: TaskState::Accepted,
                result: None,
                error: None,
            };
            A2aResponse {
                jsonrpc: "2.0".into(),
                id: req.id,
                result: Some(
                    serde_json::to_value(resp).unwrap_or(serde_json::json!({})),
                ),
                error: None,
            }
        }
        _ => A2aResponse {
            jsonrpc: "2.0".into(),
            id: req.id,
            result: None,
            error: Some(A2aError {
                code: -32601,
                message: format!("method not found: {}", req.method),
            }),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card() -> AgentCard {
        AgentCard {
            id: "agi-1".into(),
            name: "AGI Workforce".into(),
            model: "claude-opus-4-7".into(),
            capabilities: vec!["code".into(), "search".into()],
            tools: vec!["read_file".into(), "edit_file".into()],
            version: "1.3.0".into(),
        }
    }

    fn req(method: &str, params: serde_json::Value) -> A2aRequest {
        A2aRequest {
            jsonrpc: "2.0".into(),
            id: serde_json::json!(1),
            method: method.into(),
            params,
        }
    }

    #[test]
    fn discover_returns_self_card() {
        let reg = PeerRegistry::new();
        let me = card();
        let resp = handle_request(req("discover", serde_json::json!({})), &reg, &me);
        assert!(resp.error.is_none());
        let parsed: AgentCard =
            serde_json::from_value(resp.result.unwrap()).unwrap();
        assert_eq!(parsed.id, "agi-1");
    }

    #[test]
    fn list_peers_returns_registry_contents() {
        let mut reg = PeerRegistry::new();
        reg.register(AgentCard {
            id: "peer-1".into(),
            ..card()
        });
        reg.register(AgentCard {
            id: "peer-2".into(),
            ..card()
        });
        let resp =
            handle_request(req("list_peers", serde_json::json!({})), &reg, &card());
        let peers: Vec<AgentCard> =
            serde_json::from_value(resp.result.unwrap()).unwrap();
        assert_eq!(peers.len(), 2);
    }

    #[test]
    fn delegate_returns_accepted() {
        let reg = PeerRegistry::new();
        let me = card();
        let task = TaskRequest {
            id: "task-1".into(),
            prompt: "do thing".into(),
            deadline_unix: None,
            context: HashMap::new(),
        };
        let resp = handle_request(
            req("delegate", serde_json::to_value(&task).unwrap()),
            &reg,
            &me,
        );
        assert!(resp.error.is_none());
        let parsed: TaskResponse =
            serde_json::from_value(resp.result.unwrap()).unwrap();
        assert_eq!(parsed.state, TaskState::Accepted);
        assert_eq!(parsed.id, "task-1");
    }

    #[test]
    fn delegate_with_bad_params_returns_invalid_params() {
        let reg = PeerRegistry::new();
        let me = card();
        let resp = handle_request(
            req("delegate", serde_json::json!("not an object")),
            &reg,
            &me,
        );
        assert!(resp.result.is_none());
        let err = resp.error.unwrap();
        assert_eq!(err.code, -32602);
    }

    #[test]
    fn unknown_method_returns_method_not_found() {
        let reg = PeerRegistry::new();
        let me = card();
        let resp =
            handle_request(req("bogus/method", serde_json::json!({})), &reg, &me);
        let err = resp.error.unwrap();
        assert_eq!(err.code, -32601);
    }

    #[test]
    fn registry_find_by_capability() {
        let mut reg = PeerRegistry::new();
        reg.register(AgentCard {
            id: "peer-coder".into(),
            capabilities: vec!["code".into()],
            ..card()
        });
        reg.register(AgentCard {
            id: "peer-search".into(),
            capabilities: vec!["search".into()],
            ..card()
        });
        let coders = reg.find_by_capability("code");
        assert_eq!(coders.len(), 1);
        assert_eq!(coders[0].id, "peer-coder");
    }

    #[test]
    fn task_state_serializes_lowercase() {
        assert_eq!(
            serde_json::to_string(&TaskState::Accepted).unwrap(),
            "\"accepted\""
        );
        assert_eq!(
            serde_json::to_string(&TaskState::Cancelled).unwrap(),
            "\"cancelled\""
        );
    }
}
