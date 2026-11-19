use agiworkforce_protocol::developer_session::{
    McpServerListResponse, McpServerScope, McpSetEnabledParams,
};
use anyhow::{ensure, Result};

#[derive(Default)]
pub struct McpPanel {
    pub visible: bool,
    pub rows: Vec<McpRow>,
    pub operation: Option<uuid::Uuid>,
    pub error: Option<String>,
    pub notice: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct McpRow {
    pub name: String,
    pub enabled: bool,
    pub transport: String,
    pub scope: McpServerScope,
}

pub fn project(response: &McpServerListResponse) -> Result<Vec<McpRow>> {
    let mut rows = Vec::new();
    for server in &response.servers {
        ensure!(!server.name.is_empty(), "An MCP server had no name");
        ensure!(
            !rows.iter().any(|row: &McpRow| row.name == server.name),
            "An MCP server was listed more than once"
        );
        rows.push(McpRow {
            name: server.name.clone(),
            enabled: !server.disabled,
            transport: server.transport.clone(),
            scope: server.scope,
        });
    }
    Ok(rows)
}

pub fn enable_request(rows: &[McpRow], name: &str, enabled: bool) -> Result<McpSetEnabledParams> {
    let row = rows
        .iter()
        .find(|row| row.name == name)
        .ok_or_else(|| anyhow::anyhow!("Choose an MCP server from the current list"))?;
    ensure!(
        row.enabled != enabled,
        "That MCP server is already in the requested state"
    );
    Ok(McpSetEnabledParams {
        name: name.to_owned(),
        enabled,
    })
}

pub fn apply_accepted(
    previous: &[McpRow],
    response: &McpServerListResponse,
    request: &McpSetEnabledParams,
) -> Result<Vec<McpRow>> {
    let rows = project(response)?;
    let updated = rows
        .iter()
        .find(|row| row.name == request.name)
        .ok_or_else(|| anyhow::anyhow!("The MCP server disappeared from the host list"))?;
    ensure!(
        updated.enabled == request.enabled,
        "The host did not accept the MCP server change"
    );
    ensure!(
        previous.iter().any(|row| row.name == request.name),
        "The MCP server was not in the list that was shown"
    );
    Ok(rows)
}

pub fn apply_refused(previous: Vec<McpRow>) -> Vec<McpRow> {
    previous
}
