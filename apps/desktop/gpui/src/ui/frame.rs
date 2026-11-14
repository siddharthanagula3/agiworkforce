use super::*;
use crate::native_frame;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Surface {
    Chat,
    Work,
    Code,
    Account,
}

#[derive(Clone, Copy)]
pub(super) enum WorkDestination {
    List,
    Projects,
    Chat,
    Code,
}

impl Desktop {
    pub(super) fn compact_button(
        &self,
        id: impl Into<SharedString>,
        label: impl Into<SharedString>,
        action: UiAction,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        crate::native_controls::compact_button(
            id,
            label,
            move |view: &mut Desktop, window, cx| view.dispatch(action.clone(), window, cx),
            &self.contracts,
            palette,
            cx,
        )
    }
    pub(super) fn surface(&self) -> Surface {
        if self.terminal.visible || self.editor.visible {
            Surface::Code
        } else if self.cloud.visible {
            if self.cloud.work_visible || self.cloud.compose_work && self.cloud.detail.is_some() {
                Surface::Work
            } else {
                Surface::Chat
            }
        } else if self.account.visible {
            Surface::Account
        } else {
            Surface::Code
        }
    }

    pub(super) fn open_code(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.cloud.work_selected.is_some() {
            self.leave_work(WorkDestination::Code, window, cx);
            return;
        }
        self.save_draft(cx);
        self.code_settings.visible = false;
        self.code_worktrees.visible = false;
        self.editor.visible = false;
        self.terminal.visible = false;
        self.terminal.epoch = uuid::Uuid::new_v4();
        self.terminal_poll_task = None;
        self.cloud.visible = false;
        self.account.visible = false;
        self.focus.focus(window, cx);
        cx.notify();
    }

    fn nav_button(
        &self,
        id: impl Into<SharedString>,
        label: impl Into<SharedString>,
        action: UiAction,
        selected: bool,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        let label = label.into();
        let accessible: SharedString = if selected {
            format!("{label}, current").into()
        } else {
            label.clone()
        };
        self.compact_button(id, label, action, palette, cx)
            .w_full()
            .min_w_0()
            .truncate()
            .aria_label(accessible)
            .when(selected, |row| row.bg(rgb(palette.hover)))
    }

    fn nav_label(
        &self,
        id: SharedString,
        label: String,
        selected: bool,
        palette: Palette,
    ) -> gpui::Stateful<gpui::Div> {
        div()
            .id(id)
            .role(gpui::Role::Label)
            .aria_label(if selected {
                format!("{label}, current")
            } else {
                label.clone()
            })
            .w_full()
            .min_w_0()
            .h(px(self.contracts.frame.sidebar_row_height))
            .px_3()
            .flex()
            .items_center()
            .truncate()
            .rounded_md()
            .border(px(self.contracts.stroke_width))
            .border_color(gpui::transparent_black())
            .text_size(px(self.contracts.frame.sidebar_font_size))
            .line_height(px(self.contracts.frame.sidebar_line_height))
            .when(selected, |row| row.bg(rgb(palette.hover)))
            .child(label)
    }

    pub(super) fn render_sidebar(
        &self,
        small: bool,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        let mode = self.surface();
        let geometry = &self.contracts.frame;
        let mut sidebar = div()
            .id("native-sidebar")
            .h_full()
            .flex_none()
            .flex()
            .flex_col()
            .min_h_0()
            .bg(rgb(palette.sidebar))
            .p(px(geometry.control_gap))
            .gap(px(geometry.control_gap))
            .text_size(px(geometry.sidebar_font_size))
            .line_height(px(geometry.sidebar_line_height))
            .when(small, gpui::Styled::w_full)
            .when(!small, |pane| pane.w(px(geometry.sidebar_width)));
        let mut top = div()
            .h(px(geometry.header_height - geometry.control_gap))
            .flex_none()
            .flex()
            .items_center()
            .px_3()
            .child(gpui::text!(self.contracts.desktop_name.clone()));
        if small {
            top = top.child(
                self.compact_button(
                    "close-navigation",
                    "Close navigation",
                    UiAction::CloseNavigation,
                    palette,
                    cx,
                )
                .track_focus(&self.navigation_close_focus),
            );
        }
        sidebar = sidebar.child(top);
        let mut modes = div()
            .id("primary-navigation")
            .role(gpui::Role::Navigation)
            .aria_label("Main navigation")
            .flex()
            .flex_col()
            .gap_1();
        if self
            .account_capabilities
            .as_ref()
            .is_some_and(|caps| caps.cloud_history)
        {
            modes = modes.child(self.nav_button(
                "cloud-history",
                self.contracts.chat_name.clone(),
                UiAction::CloudHistory,
                mode == Surface::Chat && !self.cloud.projects.visible,
                palette,
                cx,
            ));
        }
        if self
            .account_capabilities
            .as_ref()
            .is_some_and(|caps| caps.cloud_work)
        {
            modes = modes.child(self.nav_button(
                "cloud-work",
                self.contracts.work_name.clone(),
                UiAction::Work,
                mode == Surface::Work,
                palette,
                cx,
            ));
        }
        modes = modes.child(self.nav_button(
            "code-navigation",
            self.contracts.code_name.clone(),
            UiAction::Code,
            mode == Surface::Code,
            palette,
            cx,
        ));
        sidebar = sidebar.child(modes);
        if self
            .account_capabilities
            .as_ref()
            .is_some_and(|caps| caps.cloud_projects)
        {
            sidebar = sidebar.child(self.nav_button(
                "projects",
                "Projects",
                UiAction::Projects,
                self.cloud.visible && self.cloud.projects.visible,
                palette,
                cx,
            ));
        }

        if matches!(mode, Surface::Chat | Surface::Work)
            && self.cloud.workspaces.selector().is_some()
        {
            sidebar = sidebar.child(self.render_cloud_workspaces(palette, cx));
        }
        if mode == Surface::Code {
            sidebar = sidebar.child(self.nav_button(
                "open-folder",
                "Open folder",
                UiAction::OpenFolder,
                false,
                palette,
                cx,
            ));
            if !self.loading
                && self
                    .connection_client
                    .as_ref()
                    .is_some_and(BackgroundDeveloperSessionClient::is_connected)
            {
                if self
                    .capabilities
                    .as_ref()
                    .is_some_and(|caps| caps.workspace_files)
                {
                    sidebar = sidebar.child(self.nav_button(
                        "coding-files",
                        "Files",
                        UiAction::Files,
                        self.editor.visible,
                        palette,
                        cx,
                    ));
                }
                if self
                    .capabilities
                    .as_ref()
                    .is_some_and(|caps| caps.settings_instructions)
                {
                    sidebar = sidebar.child(self.nav_button(
                        "code-settings",
                        "Code settings",
                        UiAction::CodeSettings,
                        self.code_settings.visible
                            && !self.editor.visible
                            && !self.terminal.visible,
                        palette,
                        cx,
                    ));
                }
                if self
                    .capabilities
                    .as_ref()
                    .is_some_and(|caps| caps.managed_worktrees)
                {
                    sidebar = sidebar.child(self.nav_button(
                        "code-worktrees",
                        "Worktrees",
                        UiAction::CodeWorktrees,
                        self.code_worktrees.visible
                            && !self.editor.visible
                            && !self.terminal.visible,
                        palette,
                        cx,
                    ));
                }
                if self
                    .capabilities
                    .as_ref()
                    .is_some_and(|caps| caps.workspace_terminal)
                {
                    sidebar = sidebar.child(self.nav_button(
                        "coding-terminal",
                        "Terminal",
                        UiAction::Terminal,
                        self.terminal.visible,
                        palette,
                        cx,
                    ));
                }
                if !self.code_busy()
                    && self
                        .capabilities
                        .as_ref()
                        .is_some_and(|caps| caps.models && caps.threads)
                {
                    sidebar = sidebar.child(self.nav_button(
                        "new-session",
                        "New conversation",
                        UiAction::NewSession,
                        false,
                        palette,
                        cx,
                    ));
                }
            }
        }
        let mut recent = div()
            .id("sessions")
            .role(gpui::Role::List)
            .aria_label(if mode == Surface::Code {
                "Coding sessions"
            } else {
                "Recent conversations"
            })
            .w_full()
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .gap_1();
        if mode == Surface::Code {
            let interactive = !self.loading && !self.code_busy();
            let searching = self.code_search.searching();
            if self.workspace.is_some() {
                sidebar = sidebar.child(
                    Input::new(&self.code_query)
                        .aria_label("Search coding sessions")
                        .disabled(!interactive || searching),
                );
                if interactive && !searching {
                    sidebar = sidebar.child(self.nav_button(
                        "search-sessions",
                        "Search",
                        UiAction::SearchSessions,
                        false,
                        palette,
                        cx,
                    ));
                }
            }
            let results = self.code_search.results();
            let rows = match results {
                Some((_, hits)) => hits
                    .iter()
                    .map(|hit| (hit.thread.id.clone(), crate::code_search::hit_label(hit)))
                    .collect::<Vec<_>>(),
                None => self
                    .threads
                    .iter()
                    .map(|thread| (thread.id.clone(), thread.title.clone()))
                    .collect(),
            };
            if searching {
                recent = recent.child(self.nav_label(
                    "session-search-progress".into(),
                    "Searching…".into(),
                    false,
                    palette,
                ));
            } else if results.is_some_and(|(_, hits)| hits.is_empty()) {
                recent = recent.child(self.nav_label(
                    "session-search-empty".into(),
                    crate::code_search::NO_MATCHES.into(),
                    false,
                    palette,
                ));
            }
            for (id, label) in rows {
                let current = self
                    .conversation
                    .as_ref()
                    .is_some_and(|conversation| conversation.transcript.thread.id == id);
                if interactive && !searching {
                    recent = recent.child(self.nav_button(
                        SharedString::from(format!("session:{id}")),
                        label,
                        UiAction::ReadSession(id),
                        current,
                        palette,
                        cx,
                    ));
                } else {
                    recent = recent.child(self.nav_label(
                        SharedString::from(format!("session-label:{id}")),
                        label,
                        current,
                        palette,
                    ));
                }
            }
            if results.is_some() && interactive && !searching {
                recent = recent.child(self.nav_button(
                    "clear-session-search",
                    "Clear search",
                    UiAction::ClearSessionSearch,
                    false,
                    palette,
                    cx,
                ));
            }
            if results.is_none() && self.next_cursor.is_some() && !self.loading {
                recent = recent.child(self.nav_button(
                    "load-more",
                    "Load more",
                    UiAction::NextPage,
                    false,
                    palette,
                    cx,
                ));
            }
            if self.workspace.is_some() && !self.loading && !self.code_busy() {
                recent = recent.child(self.nav_button(
                    "refresh",
                    "Refresh sessions",
                    UiAction::Refresh,
                    false,
                    palette,
                    cx,
                ));
            }
        } else if (mode == Surface::Chat || mode == Surface::Work && !self.cloud.work_visible)
            && self.cloud.workspaces.selector().is_some()
        {
            for conversation in &self.cloud.conversations {
                let mut title = conversation
                    .title
                    .clone()
                    .filter(|title| !title.trim().is_empty())
                    .unwrap_or_else(|| "Untitled conversation".into());
                if conversation.archived {
                    title = format!("Archived: {title}");
                } else if conversation.pinned {
                    title = format!("Pinned: {title}");
                }
                let current = self
                    .cloud
                    .detail
                    .as_ref()
                    .is_some_and(|detail| detail.conversation.id == conversation.id);
                if !self.cloud.loading
                    && !self.cloud.navigation_busy()
                    && self.cloud.management.editing.is_none()
                {
                    recent = recent.child(self.nav_button(
                        SharedString::from(format!("cloud:{}", conversation.id)),
                        title,
                        UiAction::ReadCloud(conversation.id.clone()),
                        current,
                        palette,
                        cx,
                    ));
                } else {
                    recent = recent.child(self.nav_label(
                        SharedString::from(format!("cloud-label:{}", conversation.id)),
                        title,
                        current,
                        palette,
                    ));
                }
            }
            if self.cloud.has_more && !self.cloud.loading && !self.cloud.navigation_busy() {
                recent = recent.child(self.nav_button(
                    "more-cloud-history",
                    "Load more",
                    UiAction::MoreCloudHistory,
                    false,
                    palette,
                    cx,
                ));
            }
        }
        sidebar
            .child(recent)
            .child(self.nav_button(
                "account",
                if self.account.challenge.is_some() {
                    "Account · sign-in pending"
                } else {
                    "Account"
                },
                UiAction::Account,
                mode == Surface::Account,
                palette,
                cx,
            ))
            .into_any_element()
    }

    pub(super) fn render_header(
        &self,
        small: bool,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        let title = if self.terminal.visible {
            "Terminal".into()
        } else if self.editor.visible {
            if self.editor.recovery_browser.visible {
                "Recovered edits".into()
            } else {
                self.editor
                    .file
                    .as_ref()
                    .map(|file| file.path.clone())
                    .unwrap_or_else(|| "Files".into())
            }
        } else if self.cloud.visible {
            if self.cloud.projects.visible {
                self.cloud
                    .projects
                    .selected
                    .as_ref()
                    .map(|project| project.name.clone())
                    .unwrap_or_else(|| "Projects".into())
            } else if self.cloud.work_visible {
                self.cloud
                    .work_selected
                    .as_ref()
                    .and_then(|run| run.conversation_title.clone())
                    .unwrap_or_else(|| self.contracts.work_name.clone())
            } else {
                self.cloud
                    .detail
                    .as_ref()
                    .and_then(|detail| detail.conversation.title.clone())
                    .unwrap_or_else(|| {
                        if self.cloud.compose_work {
                            self.contracts.work_name.clone()
                        } else {
                            self.contracts.chat_name.clone()
                        }
                    })
            }
        } else if self.account.visible {
            "Account".into()
        } else if self.code_worktrees.visible {
            "Worktrees".into()
        } else if self.code_settings.visible {
            "Code settings".into()
        } else if self.changes.visible {
            "Changes".into()
        } else {
            self.conversation
                .as_ref()
                .map(|value| value.transcript.thread.title.clone())
                .unwrap_or_else(|| self.contracts.code_name.clone())
        };
        let menu = small.then(|| {
            self.compact_button(
                "toggle-navigation",
                "Menu",
                UiAction::ToggleNavigation,
                palette,
                cx,
            )
            .track_focus(&self.navigation_menu_focus)
            .aria_expanded(self.navigation_open)
            .into_any_element()
        });
        let mut actions = Vec::new();
        if self.cloud.visible
            && !self.cloud.work_visible
            && !self.cloud.projects.visible
            && !self.cloud.loading
            && !self.cloud.navigation_busy()
            && self.cloud.scope.is_some()
        {
            if self.cloud.detail.is_some() {
                actions.push(
                    self.compact_button(
                        "back-cloud-history",
                        "History",
                        if self.cloud.projects.active_id.is_some() {
                            UiAction::ScopedCloudHistory
                        } else {
                            UiAction::CloudHistory
                        },
                        palette,
                        cx,
                    )
                    .aria_label("Back to history")
                    .into_any_element(),
                );
            }
            if self.cloud.projects.active_id.as_ref().is_none_or(|id| {
                self.cloud
                    .projects
                    .selected
                    .as_ref()
                    .is_some_and(|project| project.id == *id && project.can_start_chat)
            }) {
                actions.push(
                    self.compact_button(
                        "new-cloud",
                        "New",
                        if self.cloud.compose_work {
                            UiAction::NewWork
                        } else {
                            UiAction::NewCloud
                        },
                        palette,
                        cx,
                    )
                    .aria_label(if self.cloud.compose_work {
                        "New Work"
                    } else {
                        "New conversation"
                    })
                    .into_any_element(),
                );
            }
        }
        native_frame::header(title, menu, actions, &self.contracts).into_any_element()
    }

    pub(super) fn render_composer(
        &self,
        window: &mut Window,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> Option<gpui::AnyElement> {
        if self.terminal.visible || self.editor.visible || self.account.visible {
            return None;
        }
        if (self.code_settings.visible || self.code_worktrees.visible) && !self.cloud.visible {
            return None;
        }
        if self.cloud.visible {
            return self.render_cloud_composer(window, palette, cx);
        }
        let conversation = self.conversation.as_ref()?;
        if self.models.is_some() || self.changes.visible {
            return None;
        }
        let action = if conversation.is_running() {
            Some(
                self.compact_button(
                    "stop-turn",
                    if self.stopping { "Stopping…" } else { "Stop" },
                    UiAction::Stop,
                    palette,
                    cx,
                )
                .into_any_element(),
            )
        } else if !self.submitting
            && !self.loading
            && conversation.can_send()
            && !self.composer.read(cx).value().trim().is_empty()
        {
            Some(
                self.compact_button("send-message", "Send", UiAction::Send, palette, cx)
                    .into_any_element(),
            )
        } else {
            None
        };
        let composer = native_frame::composer(
            &self.composer,
            "Message",
            self.submitting
                || self.loading
                || conversation.transcript.thread.trust_mode
                    == agiworkforce_protocol::developer_session::DeveloperSessionTrustMode::Unknown,
            false,
            action,
            &self.contracts,
            palette,
        );
        Some(native_frame::footer(composer.into_any_element(), &self.contracts).into_any_element())
    }
}
