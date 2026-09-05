//! Resolves an utterance's target on a page the desktop already drives.
//!
//! The page is read twice through the devtools protocol, never scripted: the
//! accessible tree names the candidates, the document tree addresses them. Both
//! reads are pure data, so the match and the selector it produces are decided
//! locally and are exercised against recorded page shapes rather than a browser.
//!
//! An accessible name resolves first because it is what the user says out loud;
//! a CSS path is the fallback for a node whose attributes cannot address it.

use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value;

use super::intent::TargetRole;
use super::matching::{pick_best, Match};

pub const ACCESSIBILITY_TREE_COMMAND: &str = "Accessibility.getFullAXTree";
pub const DOCUMENT_TREE_COMMAND: &str = "DOM.getDocument";
pub const WHOLE_SUBTREE_DEPTH: i32 = -1;

const NODES_KEY: &str = "nodes";
const ROOT_KEY: &str = "root";
const ROLE_KEY: &str = "role";
const NAME_KEY: &str = "name";
const VALUE_KEY: &str = "value";
const IGNORED_KEY: &str = "ignored";
const BACKEND_NODE_ID_KEY: &str = "backendDOMNodeId";
const DOM_BACKEND_NODE_ID_KEY: &str = "backendNodeId";
const NODE_NAME_KEY: &str = "nodeName";
const NODE_TYPE_KEY: &str = "nodeType";
const ATTRIBUTES_KEY: &str = "attributes";
const CHILDREN_KEY: &str = "children";
const CONTENT_DOCUMENT_KEY: &str = "contentDocument";
const SHADOW_ROOTS_KEY: &str = "shadowRoots";

const ELEMENT_NODE_TYPE: u64 = 1;
const ID_ATTRIBUTE: &str = "id";
const IDENTIFYING_ATTRIBUTES: &[&str] =
    &["id", "data-testid", "data-test-id", "aria-label", "name"];
const CSS_IDENTIFIER_EXTRA_CHARACTERS: &[char] = &['-', '_'];
const CHILD_INDEX_ORIGIN: usize = 1;
const PATH_SEPARATOR: &str = " > ";
const UNIQUE_SELECTOR_MATCHES: usize = 1;

const ARIA_ROLES: &[(TargetRole, &[&str])] = &[
    (TargetRole::Button, &["button"]),
    (TargetRole::Link, &["link"]),
    (TargetRole::MenuItem, &["menuitem", "menuitemradio"]),
    (TargetRole::Tab, &["tab"]),
    (TargetRole::Checkbox, &["checkbox", "switch"]),
    (
        TargetRole::TextField,
        &["textbox", "searchbox", "textfield"],
    ),
    (TargetRole::ListItem, &["listitem", "option", "row"]),
    (TargetRole::ComboBox, &["combobox", "listbox"]),
    (TargetRole::Window, &["dialog", "window"]),
    (TargetRole::StaticText, &["statictext", "text", "paragraph"]),
    (TargetRole::ScrollArea, &["region", "group", "list"]),
];

/// The two page reads a target resolution needs, kept as protocol payloads so
/// the matching below is exercised against recorded pages.
pub struct PageSnapshot {
    pub accessibility: Value,
    pub document: Value,
}

#[async_trait]
pub trait BrowserTransportProbe: Send + Sync {
    async fn connected_tab(&self) -> Result<Option<String>>;
    async fn snapshot(&self, tab_id: &str) -> Result<PageSnapshot>;
}

#[derive(Debug, Clone, PartialEq)]
struct DomNode {
    backend_node_id: u64,
    tag: String,
    attributes: Vec<(String, String)>,
    parent: Option<u64>,
    child_index: usize,
}

pub fn locate(snapshot: &PageSnapshot, phrase: &str, role: Option<TargetRole>) -> Match<String> {
    let nodes = index_document(&snapshot.document);

    for accept_any_role in [false, true] {
        if !accept_any_role && role.is_none() {
            continue;
        }

        let candidates: Vec<(String, u64)> = accessible_candidates(&snapshot.accessibility)
            .into_iter()
            .filter(|(_, node_role, _)| {
                accept_any_role || role.is_none_or(|wanted| role_matches(wanted, node_role))
            })
            .map(|(name, _, backend_node_id)| (name, backend_node_id))
            .collect();

        match pick_best(phrase, candidates) {
            Match::Found(backend_node_id) => {
                return match selector_for(&nodes, backend_node_id) {
                    Some(selector) => Match::Found(selector),
                    None => Match::NotFound,
                };
            }
            Match::Ambiguous { candidates } => return Match::Ambiguous { candidates },
            Match::NotFound => continue,
        }
    }

    Match::NotFound
}

fn role_matches(wanted: TargetRole, reported: &str) -> bool {
    ARIA_ROLES
        .iter()
        .find(|(role, _)| *role == wanted)
        .is_some_and(|(_, aliases)| {
            aliases
                .iter()
                .any(|alias| alias.eq_ignore_ascii_case(reported))
        })
}

fn accessible_candidates(accessibility: &Value) -> Vec<(String, String, u64)> {
    let Some(nodes) = accessibility.get(NODES_KEY).and_then(Value::as_array) else {
        return Vec::new();
    };

    nodes
        .iter()
        .filter(|node| {
            !node
                .get(IGNORED_KEY)
                .and_then(Value::as_bool)
                .unwrap_or(false)
        })
        .filter_map(|node| {
            let name = node
                .get(NAME_KEY)
                .and_then(|name| name.get(VALUE_KEY))
                .and_then(Value::as_str)?;
            let role = node
                .get(ROLE_KEY)
                .and_then(|role| role.get(VALUE_KEY))
                .and_then(Value::as_str)
                .unwrap_or_default();
            let backend_node_id = node.get(BACKEND_NODE_ID_KEY).and_then(Value::as_u64)?;

            Some((name.to_string(), role.to_string(), backend_node_id))
        })
        .collect()
}

fn index_document(document: &Value) -> Vec<DomNode> {
    let mut nodes = Vec::new();
    let Some(root) = document.get(ROOT_KEY) else {
        return nodes;
    };

    collect_nodes(root, None, CHILD_INDEX_ORIGIN, &mut nodes);
    nodes
}

fn collect_nodes(node: &Value, parent: Option<u64>, child_index: usize, nodes: &mut Vec<DomNode>) {
    let backend_node_id = node.get(DOM_BACKEND_NODE_ID_KEY).and_then(Value::as_u64);
    let is_element = node
        .get(NODE_TYPE_KEY)
        .and_then(Value::as_u64)
        .is_some_and(|node_type| node_type == ELEMENT_NODE_TYPE);

    if let (Some(backend_node_id), true) = (backend_node_id, is_element) {
        nodes.push(DomNode {
            backend_node_id,
            tag: node
                .get(NODE_NAME_KEY)
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_lowercase(),
            attributes: attribute_pairs(node),
            parent,
            child_index,
        });
    }

    let descend_into = [CHILDREN_KEY, SHADOW_ROOTS_KEY];
    for key in descend_into {
        let Some(children) = node.get(key).and_then(Value::as_array) else {
            continue;
        };
        let mut element_index = CHILD_INDEX_ORIGIN;
        for child in children {
            collect_nodes(child, backend_node_id, element_index, nodes);
            if child
                .get(NODE_TYPE_KEY)
                .and_then(Value::as_u64)
                .is_some_and(|node_type| node_type == ELEMENT_NODE_TYPE)
            {
                element_index += 1;
            }
        }
    }

    if let Some(content) = node.get(CONTENT_DOCUMENT_KEY) {
        collect_nodes(content, backend_node_id, CHILD_INDEX_ORIGIN, nodes);
    }
}

fn attribute_pairs(node: &Value) -> Vec<(String, String)> {
    let Some(flat) = node.get(ATTRIBUTES_KEY).and_then(Value::as_array) else {
        return Vec::new();
    };

    flat.chunks(2)
        .filter_map(|pair| match pair {
            [name, value] => Some((
                name.as_str()?.to_string(),
                value.as_str().unwrap_or_default().to_string(),
            )),
            _ => None,
        })
        .collect()
}

fn selector_for(nodes: &[DomNode], backend_node_id: u64) -> Option<String> {
    let node = nodes
        .iter()
        .find(|node| node.backend_node_id == backend_node_id)?;

    if let Some(identifier) = attribute_value(node, ID_ATTRIBUTE) {
        if is_css_identifier(&identifier)
            && is_unique(nodes, |candidate| {
                attribute_value(candidate, ID_ATTRIBUTE).as_deref() == Some(identifier.as_str())
            })
        {
            return Some(format!("#{identifier}"));
        }
    }

    for attribute in IDENTIFYING_ATTRIBUTES {
        let Some(value) = attribute_value(node, attribute) else {
            continue;
        };
        if is_unique(nodes, |candidate| {
            candidate.tag == node.tag
                && attribute_value(candidate, attribute).as_deref() == Some(value.as_str())
        }) {
            return Some(format!(
                "{}[{attribute}=\"{}\"]",
                node.tag,
                escape_attribute_value(&value)
            ));
        }
    }

    structural_path(nodes, node)
}

fn is_css_identifier(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || CSS_IDENTIFIER_EXTRA_CHARACTERS.contains(&c))
        && !value.starts_with(|c: char| c.is_ascii_digit())
}

fn is_unique(nodes: &[DomNode], matches: impl Fn(&DomNode) -> bool) -> bool {
    nodes.iter().filter(|node| matches(node)).count() == UNIQUE_SELECTOR_MATCHES
}

fn structural_path(nodes: &[DomNode], node: &DomNode) -> Option<String> {
    let mut steps = Vec::new();
    let mut current = Some(node);

    while let Some(step) = current {
        if step.tag.is_empty() {
            return None;
        }
        steps.push(format!("{}:nth-child({})", step.tag, step.child_index));
        current = step
            .parent
            .and_then(|parent| nodes.iter().find(|node| node.backend_node_id == parent));
    }

    steps.reverse();
    Some(steps.join(PATH_SEPARATOR))
}

fn attribute_value(node: &DomNode, attribute: &str) -> Option<String> {
    node.attributes
        .iter()
        .find(|(name, _)| name == attribute)
        .map(|(_, value)| value.clone())
        .filter(|value| !value.is_empty())
}

fn escape_attribute_value(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn snapshot() -> PageSnapshot {
        PageSnapshot {
            accessibility: json!({
                "nodes": [
                    {
                        "role": { "value": "button" },
                        "name": { "value": "Send" },
                        "backendDOMNodeId": 11
                    },
                    {
                        "role": { "value": "textbox" },
                        "name": { "value": "Search" },
                        "backendDOMNodeId": 12
                    },
                    {
                        "role": { "value": "button" },
                        "name": { "value": "Send Later" },
                        "backendDOMNodeId": 13
                    },
                    {
                        "role": { "value": "button" },
                        "name": { "value": "Hidden Send" },
                        "backendDOMNodeId": 14,
                        "ignored": true
                    }
                ]
            }),
            document: json!({
                "root": {
                    "nodeType": 9,
                    "nodeName": "#document",
                    "children": [{
                        "nodeType": 1,
                        "nodeName": "HTML",
                        "backendNodeId": 1,
                        "children": [{
                            "nodeType": 1,
                            "nodeName": "BODY",
                            "backendNodeId": 2,
                            "children": [
                                {
                                    "nodeType": 1,
                                    "nodeName": "BUTTON",
                                    "backendNodeId": 11,
                                    "attributes": ["id", "send-button", "class", "primary"]
                                },
                                {
                                    "nodeType": 1,
                                    "nodeName": "INPUT",
                                    "backendNodeId": 12,
                                    "attributes": ["aria-label", "Search", "type", "text"]
                                },
                                {
                                    "nodeType": 1,
                                    "nodeName": "BUTTON",
                                    "backendNodeId": 13,
                                    "attributes": []
                                }
                            ]
                        }]
                    }]
                }
            }),
        }
    }

    #[test]
    fn an_accessible_name_resolves_to_an_id_selector() {
        let found = locate(&snapshot(), "Send", Some(TargetRole::Button));

        assert_eq!(found, Match::Found(String::from("#send-button")));
    }

    #[test]
    fn a_node_without_an_id_resolves_through_an_identifying_attribute() {
        let found = locate(&snapshot(), "Search", Some(TargetRole::TextField));

        assert_eq!(
            found,
            Match::Found(String::from("input[aria-label=\"Search\"]"))
        );
    }

    #[test]
    fn a_node_with_no_addressable_attribute_falls_back_to_a_css_path() {
        let found = locate(&snapshot(), "Send Later", Some(TargetRole::Button));

        assert_eq!(
            found,
            Match::Found(String::from(
                "html:nth-child(1) > body:nth-child(1) > button:nth-child(3)"
            ))
        );
    }

    #[test]
    fn the_role_the_utterance_named_narrows_before_the_name_alone() {
        let typed = locate(&snapshot(), "Search", Some(TargetRole::TextField));
        let untyped = locate(&snapshot(), "Search", None);

        assert_eq!(typed, untyped);
    }

    #[test]
    fn a_role_that_matches_nothing_widens_to_the_name_alone() {
        let found = locate(&snapshot(), "Search", Some(TargetRole::Checkbox));

        assert_eq!(
            found,
            Match::Found(String::from("input[aria-label=\"Search\"]"))
        );
    }

    #[test]
    fn a_name_the_page_does_not_carry_is_not_found() {
        assert_eq!(locate(&snapshot(), "Archive", None), Match::NotFound);
    }

    #[test]
    fn an_ignored_accessible_node_is_not_a_candidate() {
        let found = locate(&snapshot(), "Hidden Send", Some(TargetRole::Button));

        assert_eq!(found, Match::NotFound);
    }

    #[test]
    fn two_controls_sharing_a_name_are_ambiguous() {
        let mut page = snapshot();
        page.accessibility = json!({
            "nodes": [
                { "role": { "value": "button" }, "name": { "value": "Send" }, "backendDOMNodeId": 11 },
                { "role": { "value": "button" }, "name": { "value": "Send" }, "backendDOMNodeId": 13 }
            ]
        });

        assert_eq!(
            locate(&page, "Send", Some(TargetRole::Button)),
            Match::Ambiguous { candidates: 2 }
        );
    }

    #[test]
    fn a_duplicated_id_never_produces_an_id_selector() {
        let mut page = snapshot();
        page.document = json!({
            "root": {
                "nodeType": 9,
                "nodeName": "#document",
                "children": [{
                    "nodeType": 1,
                    "nodeName": "BODY",
                    "backendNodeId": 2,
                    "children": [
                        {
                            "nodeType": 1,
                            "nodeName": "BUTTON",
                            "backendNodeId": 11,
                            "attributes": ["id", "duplicated"]
                        },
                        {
                            "nodeType": 1,
                            "nodeName": "BUTTON",
                            "backendNodeId": 99,
                            "attributes": ["id", "duplicated"]
                        }
                    ]
                }]
            }
        });

        assert_eq!(
            locate(&page, "Send", Some(TargetRole::Button)),
            Match::Found(String::from("body:nth-child(1) > button:nth-child(1)"))
        );
    }

    #[test]
    fn an_id_shared_across_tags_still_addresses_the_node_by_its_own_tag() {
        let mut page = snapshot();
        page.document = json!({
            "root": {
                "nodeType": 9,
                "nodeName": "#document",
                "children": [{
                    "nodeType": 1,
                    "nodeName": "BODY",
                    "backendNodeId": 2,
                    "children": [
                        {
                            "nodeType": 1,
                            "nodeName": "BUTTON",
                            "backendNodeId": 11,
                            "attributes": ["id", "duplicated"]
                        },
                        {
                            "nodeType": 1,
                            "nodeName": "SPAN",
                            "backendNodeId": 99,
                            "attributes": ["id", "duplicated"]
                        }
                    ]
                }]
            }
        });

        assert_eq!(
            locate(&page, "Send", Some(TargetRole::Button)),
            Match::Found(String::from("button[id=\"duplicated\"]"))
        );
    }

    #[test]
    fn a_candidate_the_document_does_not_carry_is_not_found() {
        let mut page = snapshot();
        page.document = json!({ "root": { "nodeType": 9, "nodeName": "#document" } });

        assert_eq!(
            locate(&page, "Send", Some(TargetRole::Button)),
            Match::NotFound
        );
    }

    #[test]
    fn an_attribute_value_carrying_a_quote_is_escaped() {
        assert_eq!(escape_attribute_value("say \"hi\""), "say \\\"hi\\\"");
    }

    #[test]
    fn an_id_that_is_not_a_css_identifier_is_addressed_as_an_attribute() {
        assert!(is_css_identifier("send-button"));
        assert!(!is_css_identifier("2fast"));
        assert!(!is_css_identifier("has space"));

        let mut page = snapshot();
        page.document = json!({
            "root": {
                "nodeType": 9,
                "nodeName": "#document",
                "children": [{
                    "nodeType": 1,
                    "nodeName": "BUTTON",
                    "backendNodeId": 11,
                    "attributes": ["id", "2 send"]
                }]
            }
        });

        assert_eq!(
            locate(&page, "Send", Some(TargetRole::Button)),
            Match::Found(String::from("button[id=\"2 send\"]"))
        );
    }
}
