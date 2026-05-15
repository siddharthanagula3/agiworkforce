//! MCP tool-list and connector state handlers for `ChatWidget`.
//!
//! Owns the event handlers that process `ListMcpToolsResponse`,
//! `ConnectorsLoaded`, and related state updates, plus the `/mcp` and
//! `/apps` slash-command entry points that trigger those loads.

use super::*;

impl ChatWidget {
    pub(crate) fn add_mcp_output(&mut self) {
        let mcp_manager = McpManager::new(Arc::new(PluginsManager::new(
            self.config.agiworkforce_home.clone(),
        )));
        if mcp_manager
            .effective_servers(&self.config, /*auth*/ None)
            .is_empty()
        {
            self.add_to_history(history_cell::empty_mcp_output());
        } else if self.submit_op(Op::ListMcpTools) {
            self.pending_mcp_output_requests = self.pending_mcp_output_requests.saturating_add(1);
        }
    }

    pub(crate) fn add_connectors_output(&mut self) {
        if !self.connectors_enabled() {
            self.add_info_message(
                "Apps are disabled.".to_string(),
                Some("Enable the apps feature to use $ or /apps.".to_string()),
            );
            return;
        }

        let connectors_cache = self.connectors_cache.clone();
        let should_force_refetch = !self.connectors_prefetch_in_flight
            || matches!(connectors_cache, ConnectorsCacheState::Ready(_));
        self.prefetch_connectors_with_options(should_force_refetch);

        match connectors_cache {
            ConnectorsCacheState::Ready(snapshot) => {
                if snapshot.connectors.is_empty() {
                    self.add_info_message("No apps available.".to_string(), /*hint*/ None);
                } else {
                    self.open_connectors_popup(&snapshot.connectors);
                }
            }
            ConnectorsCacheState::Failed(err) => {
                self.add_to_history(history_cell::new_error_event(err));
            }
            ConnectorsCacheState::Loading | ConnectorsCacheState::Uninitialized => {
                self.open_connectors_loading_popup();
            }
        }
        self.request_redraw();
    }

    pub(crate) fn on_connectors_loaded(
        &mut self,
        result: Result<ConnectorsSnapshot, String>,
        is_final: bool,
    ) {
        let mut trigger_pending_force_refetch = false;
        if is_final {
            self.connectors_prefetch_in_flight = false;
            if self.connectors_force_refetch_pending {
                self.connectors_force_refetch_pending = false;
                trigger_pending_force_refetch = true;
            }
        }

        match result {
            Ok(mut snapshot) => {
                if !is_final {
                    snapshot.connectors = connectors::merge_connectors_with_accessible(
                        Vec::new(),
                        snapshot.connectors,
                        /*all_connectors_loaded*/ false,
                    );
                }
                snapshot.connectors =
                    connectors::with_app_enabled_state(snapshot.connectors, &self.config);
                if let ConnectorsCacheState::Ready(existing_snapshot) = &self.connectors_cache {
                    let enabled_by_id: HashMap<&str, bool> = existing_snapshot
                        .connectors
                        .iter()
                        .map(|connector| (connector.id.as_str(), connector.is_enabled))
                        .collect();
                    for connector in &mut snapshot.connectors {
                        if let Some(is_enabled) = enabled_by_id.get(connector.id.as_str()) {
                            connector.is_enabled = *is_enabled;
                        }
                    }
                }
                if is_final {
                    self.connectors_partial_snapshot = None;
                    self.refresh_connectors_popup_if_open(&snapshot.connectors);
                    self.connectors_cache = ConnectorsCacheState::Ready(snapshot.clone());
                } else {
                    self.connectors_partial_snapshot = Some(snapshot.clone());
                }
                self.bottom_pane.set_connectors_snapshot(Some(snapshot));
            }
            Err(err) => {
                let partial_snapshot = self.connectors_partial_snapshot.take();
                if let ConnectorsCacheState::Ready(snapshot) = &self.connectors_cache {
                    warn!("failed to refresh apps list; retaining current apps snapshot: {err}");
                    self.bottom_pane
                        .set_connectors_snapshot(Some(snapshot.clone()));
                } else if let Some(snapshot) = partial_snapshot {
                    warn!(
                        "failed to load full apps list; falling back to installed apps snapshot: {err}"
                    );
                    self.refresh_connectors_popup_if_open(&snapshot.connectors);
                    self.connectors_cache = ConnectorsCacheState::Ready(snapshot.clone());
                    self.bottom_pane.set_connectors_snapshot(Some(snapshot));
                } else {
                    self.connectors_cache = ConnectorsCacheState::Failed(err);
                    self.bottom_pane.set_connectors_snapshot(/*snapshot*/ None);
                }
            }
        }

        if trigger_pending_force_refetch {
            self.prefetch_connectors_with_options(/*force_refetch*/ true);
        }
    }

    pub(crate) fn update_connector_enabled(&mut self, connector_id: &str, enabled: bool) {
        let ConnectorsCacheState::Ready(mut snapshot) = self.connectors_cache.clone() else {
            return;
        };

        let mut changed = false;
        for connector in &mut snapshot.connectors {
            if connector.id == connector_id {
                changed = connector.is_enabled != enabled;
                connector.is_enabled = enabled;
                break;
            }
        }

        if !changed {
            return;
        }

        self.refresh_connectors_popup_if_open(&snapshot.connectors);
        self.connectors_cache = ConnectorsCacheState::Ready(snapshot.clone());
        self.bottom_pane.set_connectors_snapshot(Some(snapshot));
    }

    pub(crate) fn refresh_plugin_mentions(&mut self) {
        if !self.config.features.enabled(Feature::Plugins) {
            self.bottom_pane.set_plugin_mentions(/*plugins*/ None);
            return;
        }

        let plugins = PluginsManager::new(self.config.agiworkforce_home.clone())
            .plugins_for_config(&self.config)
            .capability_summaries()
            .to_vec();
        self.bottom_pane.set_plugin_mentions(Some(plugins));
    }

    pub(crate) fn sync_plugin_mentions_config(&mut self, config: &Config) {
        self.config.features = config.features.clone();
        self.config.config_layer_stack = config.config_layer_stack.clone();
    }

    pub(super) fn on_list_mcp_tools(&mut self, ev: McpListToolsResponseEvent) {
        if self.connectors_enabled() {
            let plugin_provenance = McpManager::new(Arc::new(PluginsManager::new(
                self.config.agiworkforce_home.clone(),
            )))
            .tool_plugin_provenance(&self.config);
            let mut connectors_by_id: HashMap<String, connectors::AppInfo> = HashMap::new();
            for tool in ev.tools.values() {
                let Some(meta) = tool.meta.as_ref().and_then(serde_json::Value::as_object) else {
                    continue;
                };
                let Some(connector_id) = meta
                    .get("connector_id")
                    .and_then(serde_json::Value::as_str)
                    .filter(|id| !id.is_empty())
                else {
                    continue;
                };
                connectors_by_id
                    .entry(connector_id.to_string())
                    .or_insert_with(|| {
                        let name = meta
                            .get("connector_name")
                            .or_else(|| meta.get("connector_display_name"))
                            .and_then(serde_json::Value::as_str)
                            .filter(|name| !name.trim().is_empty())
                            .unwrap_or(connector_id)
                            .to_string();
                        let description = meta
                            .get("connector_description")
                            .or_else(|| meta.get("connectorDescription"))
                            .and_then(serde_json::Value::as_str)
                            .map(str::trim)
                            .filter(|description| !description.is_empty())
                            .map(ToString::to_string);
                        connectors::AppInfo {
                            id: connector_id.to_string(),
                            name,
                            description,
                            logo_url: None,
                            logo_url_dark: None,
                            distribution_channel: None,
                            branding: None,
                            app_metadata: None,
                            labels: None,
                            install_url: None,
                            is_accessible: true,
                            is_enabled: true,
                            plugin_display_names: plugin_provenance
                                .plugin_display_names_for_connector_id(connector_id)
                                .to_vec(),
                        }
                    });
            }

            let mut app_connectors = connectors_by_id.into_values().collect::<Vec<_>>();
            app_connectors.sort_by(|left, right| {
                left.name
                    .cmp(&right.name)
                    .then_with(|| left.id.cmp(&right.id))
            });
            let app_connectors = connectors::with_app_enabled_state(app_connectors, &self.config);
            self.bottom_pane
                .set_connectors_snapshot(Some(ConnectorsSnapshot {
                    connectors: app_connectors,
                }));
        }

        if self.pending_mcp_output_requests > 0 {
            self.pending_mcp_output_requests -= 1;
            self.add_to_history(history_cell::new_mcp_tools_output(
                &self.config,
                ev.tools,
                ev.resources,
                ev.resource_templates,
                &ev.auth_statuses,
            ));
        }
    }
}
