use std::sync::LazyLock;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ConversationContract {
    pub title_max_length: usize,
    pub draft_max_length: usize,
    pub organization_header: String,
    pub personal_workspace: String,
    pub workspaces_path: String,
}

static CONTRACT: LazyLock<ConversationContract> = LazyLock::new(|| {
    serde_json::from_str(include_str!(
        "../../../../packages/contracts/cloud-contracts/src/conversation-contract.json"
    ))
    .expect("the compiled conversation contract must match its schema")
});

pub(super) fn contract() -> &'static ConversationContract {
    &CONTRACT
}
