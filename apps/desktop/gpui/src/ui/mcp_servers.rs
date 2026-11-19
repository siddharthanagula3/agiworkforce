use super::*;
use crate::mcp_servers::{apply_accepted, apply_refused, enable_request, project};
use agiworkforce_protocol::developer_session::McpServerListResponse;

impl Desktop {
    pub(super) fn open_mcp_servers(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.capabilities.as_ref().is_some_and(|caps| caps.mcp) {
            return;
        }
        self.mcp.visible = true;
        self.code_settings.visible = false;
        self.host_defaults.visible = false;
        self.code_worktrees.visible = false;
        self.editor.visible = false;
        self.terminal.visible = false;
        self.terminal.epoch = uuid::Uuid::new_v4();
        self.terminal_poll_task = None;
        self.cloud.visible = false;
        self.account.visible = false;
        self.focus.focus(window, cx);
        if self.mcp.rows.is_empty() && self.mcp.operation.is_none() {
            self.load_mcp_servers(cx);
        }
        cx.notify();
    }

    pub(super) fn load_mcp_servers(&mut self, cx: &mut Context<Self>) {
        if self.mcp.operation.is_some() {
            return;
        }
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.mcp.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = uuid::Uuid::new_v4();
        self.mcp.operation = Some(operation);
        self.mcp.error = None;
        let generation = self.generation;
        let task = self.executor.spawn(async move {
            client
                .request::<McpServerListResponse>(method::MCP_LIST, serde_json::json!({}))
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("Reading MCP servers stopped")
                .and_then(|result| result.map_err(Into::into))
                .and_then(|response| project(&response));
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.mcp.operation != Some(operation) {
                    return;
                }
                view.mcp.operation = None;
                match result {
                    Ok(rows) => {
                        view.mcp.rows = rows;
                        view.mcp.error = None;
                    }
                    Err(error) => view.mcp.error = Some(error.to_string()),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn set_mcp_enabled(&mut self, name: String, enabled: bool, cx: &mut Context<Self>) {
        if self.mcp.operation.is_some() {
            return;
        }
        let request = match enable_request(&self.mcp.rows, &name, enabled) {
            Ok(request) => request,
            Err(error) => {
                self.mcp.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let client = match self.client() {
            Ok(client) => client,
            Err(error) => {
                self.mcp.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let previous = self.mcp.rows.clone();
        let operation = uuid::Uuid::new_v4();
        self.mcp.operation = Some(operation);
        self.mcp.error = None;
        let generation = self.generation;
        let task = self.executor.spawn(async move {
            client
                .request::<McpServerListResponse>(method::MCP_SET_ENABLED, request.clone())
                .await
                .map(|response| (request, response))
        });
        cx.spawn(async move |view, cx| {
            let result = task.await.context("Updating the MCP server stopped");
            let _ = view.update(cx, |view, cx| {
                if view.generation != generation || view.mcp.operation != Some(operation) {
                    return;
                }
                view.mcp.operation = None;
                match result {
                    Ok(Ok((request, response))) => {
                        match apply_accepted(&previous, &response, &request) {
                            Ok(rows) => {
                                view.mcp.rows = rows;
                                view.mcp.error = None;
                                view.mcp.notice = Some(format!(
                                    "{} is {}.",
                                    request.name,
                                    if request.enabled {
                                        "enabled"
                                    } else {
                                        "disabled"
                                    }
                                ));
                            }
                            Err(error) => {
                                view.mcp.rows = apply_refused(previous);
                                view.mcp.error = Some(error.to_string());
                            }
                        }
                    }
                    Ok(Err(error)) => {
                        view.mcp.rows = apply_refused(previous);
                        view.mcp.error = Some(error.to_string());
                    }
                    Err(error) => {
                        view.mcp.rows = apply_refused(previous);
                        view.mcp.error = Some(error.to_string());
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(super) fn render_mcp_servers(&self, palette: Palette, cx: &mut Context<Self>) -> gpui::Div {
        let mut panel = div()
            .w_full()
            .min_w_0()
            .max_w(px(self.contracts.frame.content_width))
            .flex()
            .flex_col()
            .gap_3()
            .child(gpui::text!("MCP servers"))
            .child(gpui::text!(
                "These are the coding host's servers. Enabling one does not run a tool, and it does not change Cloud connectors."
            ));
        if self.mcp.operation.is_none() {
            panel = panel
                .child(self.button(
                    "close-mcp-servers",
                    "Back to conversation",
                    UiAction::CloseMcpServers,
                    palette,
                    cx,
                ))
                .child(self.button(
                    "reload-mcp-servers",
                    "Refresh",
                    UiAction::McpServers,
                    palette,
                    cx,
                ));
        }
        if let Some(error) = &self.mcp.error {
            panel = panel.child(gpui::text!(error.clone()));
        }
        if let Some(notice) = &self.mcp.notice {
            panel = panel.child(gpui::text!(notice.clone()));
        }
        if self.mcp.operation.is_some() {
            panel = panel.child(gpui::text!("Updating MCP servers…"));
        }
        for row in &self.mcp.rows {
            panel = panel.child(gpui::text!(format!(
                "{} · {} · {}",
                row.name,
                row.transport,
                if row.enabled { "Enabled" } else { "Disabled" }
            )));
            if self.mcp.operation.is_none() {
                panel = panel.child(self.button(
                    SharedString::from(format!("mcp-toggle:{}", row.name)),
                    if row.enabled { "Disable" } else { "Enable" },
                    UiAction::SetMcpEnabled(row.name.clone(), !row.enabled),
                    palette,
                    cx,
                ));
            }
        }
        if self.mcp.rows.is_empty() && self.mcp.operation.is_none() {
            panel = panel.child(gpui::text!(
                "No MCP servers are configured for this folder."
            ));
        }
        panel
    }
}
