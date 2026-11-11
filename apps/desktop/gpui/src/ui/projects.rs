use super::*;
use crate::projects::{details, ProjectEdit};
use agiworkforce_protocol::account_cloud::*;

impl Desktop {
    pub(super) fn project_binding(&self) -> Result<(String, CloudConversationWorkspace)> {
        Ok((
            self.cloud
                .scope
                .clone()
                .context("Load your Cloud workspace before opening projects")?,
            self.cloud
                .workspaces
                .selector()
                .cloned()
                .context("Choose a Cloud workspace before opening projects")?,
        ))
    }
    pub(super) fn project_fields(&self, cx: &App) -> CloudProjectDetails {
        CloudProjectDetails {
            name: self.project_name.read(cx).value().to_string(),
            description: self.project_description.read(cx).value().to_string(),
            instructions: self.project_instructions.read(cx).value().to_string(),
        }
    }
    pub(super) fn project_edit_dirty(&self, cx: &App) -> bool {
        self.cloud.projects.edit.as_ref().is_some_and(|edit| {
            self.project_fields(cx)
                != edit
                    .original
                    .as_ref()
                    .map(details)
                    .unwrap_or(CloudProjectDetails {
                        name: String::new(),
                        description: String::new(),
                        instructions: String::new(),
                    })
        })
    }
    pub(super) fn open_projects(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.cloud.has_unconfirmed_turn() {
            self.cloud.visible = true;
            self.account.visible = false;
            self.cloud.work_visible = false;
            self.cloud.projects.visible = false;
            self.cloud.error = Some("Check the unconfirmed message status or its saved conversation before leaving it or starting another conversation.".into());
            cx.notify();
            return;
        }
        if self.cloud.work_selected.is_some() {
            self.leave_work(super::frame::WorkDestination::Projects, window, cx);
            return;
        }
        if self.cloud.loading || self.cloud.navigation_busy() {
            return;
        }
        if self.has_unsaved_cloud_draft(cx) || self.cloud.management.editing.is_some() {
            self.cloud.error = Some(
                "Save or resolve the current conversation draft and title before opening projects."
                    .into(),
            );
            cx.notify();
            return;
        }
        if !self
            .account_capabilities
            .as_ref()
            .is_some_and(|caps| caps.cloud_projects)
        {
            return;
        }
        self.save_draft(cx);
        self.account.visible = false;
        self.cloud.visible = true;
        self.cloud.work_visible = false;
        self.cloud.projects.visible = true;
        if !self.require_cloud_workspace(cx) {
            cx.notify();
            return;
        }
        if let Ok((scope, workspace)) = self.project_binding() {
            self.cloud.projects.bind(&scope, &workspace);
        }
        self.cloud.projects.visible = true;
        self.cloud.detail = None;
        if self.cloud.projects.edit.is_none() {
            self.history_viewport.top();
            self.load_projects(false, cx);
        }
        self.focus.focus(window, cx);
        cx.notify();
    }
    pub(super) fn load_projects(&mut self, more: bool, cx: &mut Context<Self>) {
        if self.cloud.navigation_busy() || self.cloud.loading {
            return;
        }
        let (scope, workspace) = match self.project_binding() {
            Ok(binding) => binding,
            Err(error) => {
                self.cloud.projects.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        self.cloud.projects.bind(&scope, &workspace);
        self.cloud.projects.visible = true;
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.cloud.projects.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let request = CloudProjectListParams {
            scope,
            workspace,
            limit: self.settings.session_page_size,
            cursor: if more {
                self.cloud.projects.next_cursor.clone()
            } else {
                None
            },
        };
        let operation = uuid::Uuid::new_v4();
        let generation = self.cloud.generation;
        self.cloud.projects.operation = Some(operation);
        self.cloud.projects.error = None;
        let task = self.executor.spawn(async move {
            client
                .request::<CloudProjectListResponse>(method::CLOUD_PROJECT_LIST, request)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task.await.context("Loading projects stopped").and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.cloud.generation != generation || view.cloud.projects.operation != Some(operation) { return; }
                view.cloud.projects.operation = None;
                match result.and_then(|response| view.cloud.projects.accept_list(response, more, view.contracts.max_frame_bytes.get())) {
                    Ok(()) => { if view.cloud.projects.edit.as_ref().is_some_and(|edit| edit.original.is_none()) { view.cloud.projects.needs_review = false; view.cloud.projects.error = Some("Review the saved projects before creating another one. Your proposed fields are retained.".into()); } },
                    Err(error) => view.cloud.projects.error = Some(format!("Projects could not be read: {error:#}")),
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }
    pub(super) fn read_project(&mut self, id: String, review: bool, cx: &mut Context<Self>) {
        if self.cloud.navigation_busy() || self.cloud.loading {
            return;
        }
        let (scope, workspace) = match self.project_binding() {
            Ok(binding) => binding,
            Err(error) => {
                self.cloud.projects.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        if self.cloud.projects.edit.as_ref().is_some_and(|edit| {
            !review
                || edit.scope != scope
                || edit.workspace != workspace
                || edit
                    .original
                    .as_ref()
                    .is_none_or(|original| original.id != id)
        }) {
            self.cloud.projects.error = Some("Copy or cancel the retained project edit before changing its account, workspace or project.".into());
            cx.notify();
            return;
        }
        let target = CloudProjectTarget {
            scope,
            workspace,
            project_id: id,
        };
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.cloud.projects.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let operation = uuid::Uuid::new_v4();
        if !review {
            self.history_viewport.top();
        }
        let generation = self.cloud.generation;
        self.cloud.projects.operation = Some(operation);
        self.cloud.projects.error = None;
        let requested = target.clone();
        let task = self.executor.spawn(async move {
            client
                .request::<CloudProjectResponse>(method::CLOUD_PROJECT_READ, requested)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task.await.context("Reading the project stopped").and_then(|result| result.map_err(Into::into));
            let _ = view.update(cx, |view, cx| {
                if view.cloud.generation != generation || view.cloud.projects.operation != Some(operation) { return; }
                view.cloud.projects.operation = None;
                match result.and_then(|response| view.cloud.projects.accept_project(&target, response)) {
                    Ok(()) => {
                        view.cloud.projects.needs_review = false;
                        if review && view.cloud.projects.edit.is_some() {
                            if let Some(edit) = &mut view.cloud.projects.edit { edit.original = view.cloud.projects.selected.clone(); }
                            view.cloud.projects.error = Some("The latest saved details are shown. Your proposed fields are retained; review them before saving again.".into());
                        }
                    },
                    Err(error) => view.cloud.projects.error = Some(format!("This project could not be read: {error:#}")),
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }
    pub(super) fn edit_project(&mut self, new: bool, window: &mut Window, cx: &mut Context<Self>) {
        if self.cloud.navigation_busy() || self.cloud.projects.edit.is_some() {
            return;
        }
        let (scope, workspace) = match self.project_binding() {
            Ok(binding) => binding,
            Err(error) => {
                self.cloud.projects.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let original = if new {
            None
        } else {
            self.cloud.projects.selected.clone()
        };
        if !new
            && original
                .as_ref()
                .is_none_or(|project| !project.can_edit || project.version.is_none())
        {
            return;
        }
        if new {
            self.cloud.projects.selected = None;
        }
        self.history_viewport.top();
        let fields = original
            .as_ref()
            .map(details)
            .unwrap_or(CloudProjectDetails {
                name: String::new(),
                description: String::new(),
                instructions: String::new(),
            });
        self.project_name.update(cx, |input, cx| {
            input.set_value(fields.name, window, cx);
            input.focus(window, cx);
        });
        self.project_description.update(cx, |input, cx| {
            input.set_value(fields.description, window, cx)
        });
        self.project_instructions.update(cx, |input, cx| {
            input.set_value(fields.instructions, window, cx)
        });
        self.cloud.projects.edit = Some(ProjectEdit {
            id: uuid::Uuid::new_v4(),
            scope,
            workspace,
            original,
        });
        self.cloud.projects.needs_review = false;
        self.cloud.projects.error = None;
        cx.notify();
    }
    pub(super) fn cancel_project_edit(
        &mut self,
        edit_id: uuid::Uuid,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.cloud.projects.operation.is_some() {
            return;
        }
        let Some(edit) = &self.cloud.projects.edit else {
            return;
        };
        if edit.id != edit_id {
            return;
        }
        let id = edit.id;
        let proposed = self.project_fields(cx);
        if !self.project_edit_dirty(cx) {
            self.cloud.projects.edit = None;
            self.cloud.projects.needs_review = false;
            cx.notify();
            return;
        }
        let answer = window.prompt(PromptLevel::Warning, "Discard unsaved project details?", Some("This discards the name, description and instructions you changed in this form. The saved project remains unchanged. Copy anything you need before discarding it."), &["Keep editing", "Discard changes"], cx);
        cx.spawn(async move |view, cx| {
            if !matches!(answer.await, Ok(1)) {
                return;
            }
            let _ = view.update(cx, |view, cx| {
                if view.project_fields(cx) != proposed {
                    view.cloud.projects.error = Some("Project details changed while the confirmation was open. Review them again.".into()); cx.notify(); return;
                }
                if view
                    .cloud
                    .projects
                    .edit
                    .as_ref()
                    .is_some_and(|edit| edit.id == id)
                    && view.cloud.projects.operation.is_none()
                {
                    view.cloud.projects.edit = None;
                    view.cloud.projects.error = None;
                    view.cloud.projects.needs_review = false;
                    cx.notify();
                }
            });
        })
        .detach();
    }
    pub(super) fn save_project(&mut self, edit_id: uuid::Uuid, cx: &mut Context<Self>) {
        if self.cloud.navigation_busy() || self.cloud.projects.needs_review {
            return;
        }
        let Some(edit) = self.cloud.projects.edit.clone() else {
            return;
        };
        if edit.id != edit_id {
            return;
        }
        if self.project_binding().ok().as_ref()
            != Some(&(edit.scope.clone(), edit.workspace.clone()))
        {
            self.cloud.projects.error = Some("This edit belongs to a different account or workspace. Copy or cancel it before continuing.".into());
            cx.notify();
            return;
        }
        if edit
            .original
            .as_ref()
            .is_some_and(|project| !project.can_edit || project.version.is_none())
        {
            self.cloud.projects.error =
                Some("This project is now read-only. Copy or cancel your proposed details.".into());
            cx.notify();
            return;
        }
        let fields = self.project_fields(cx);
        if edit
            .original
            .as_ref()
            .is_some_and(|project| details(project) == fields)
        {
            self.cloud.projects.edit = None;
            self.cloud.projects.error = None;
            cx.notify();
            return;
        }
        let expected_id = edit.original.as_ref().map(|project| project.id.clone());
        if fields.name.trim().is_empty()
            || fields.name.trim().encode_utf16().count() > self.contracts.project_name_max_length
            || fields.description.encode_utf16().count()
                > self.contracts.project_description_max_length
            || fields.instructions.encode_utf16().count()
                > self.contracts.project_instructions_max_length
        {
            self.cloud.projects.error = Some(format!("Enter a name with up to {} characters, a description with up to {}, and instructions with up to {}.", self.contracts.project_name_max_length, self.contracts.project_description_max_length, self.contracts.project_instructions_max_length));
            cx.notify();
            return;
        }
        let task = match self.account_client() {
            Ok(client) => self.executor.spawn(async move {
                if let Some(original) = edit.original {
                    client
                        .request::<CloudProjectResponse>(
                            method::CLOUD_PROJECT_UPDATE,
                            CloudProjectUpdateParams {
                                target: CloudProjectTarget {
                                    scope: edit.scope,
                                    workspace: edit.workspace,
                                    project_id: original.id,
                                },
                                expected_version: original
                                    .version
                                    .context("Review the project before saving")?,
                                change: CloudProjectChange::Details { details: fields },
                            },
                        )
                        .await
                        .map_err(Into::into)
                } else {
                    client
                        .request::<CloudProjectResponse>(
                            method::CLOUD_PROJECT_CREATE,
                            CloudProjectCreateParams {
                                scope: edit.scope,
                                workspace: edit.workspace,
                                details: fields,
                            },
                        )
                        .await
                        .map_err(Into::into)
                }
            }),
            Err(error) => {
                self.cloud.projects.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        self.finish_project_write(task, expected_id, cx);
    }
    pub(super) fn archive_project(
        &mut self,
        request: CloudProjectUpdateParams,
        cx: &mut Context<Self>,
    ) {
        if self.cloud.navigation_busy() || self.cloud.projects.edit.is_some() {
            return;
        }
        if self.project_binding().ok().as_ref()
            != Some(&(
                request.target.scope.clone(),
                request.target.workspace.clone(),
            ))
        {
            return;
        }
        let client = match self.account_client() {
            Ok(client) => client,
            Err(error) => {
                self.cloud.projects.error = Some(error.to_string());
                cx.notify();
                return;
            }
        };
        let expected_id = Some(request.target.project_id.clone());
        let task = self.executor.spawn(async move {
            client
                .request::<CloudProjectResponse>(method::CLOUD_PROJECT_UPDATE, request)
                .await
                .map_err(Into::into)
        });
        self.finish_project_write(task, expected_id, cx);
    }
    fn finish_project_write(
        &mut self,
        task: tokio::task::JoinHandle<Result<CloudProjectResponse>>,
        expected_id: Option<String>,
        cx: &mut Context<Self>,
    ) {
        let generation = self.cloud.generation;
        let retaining_form = self.cloud.projects.edit.is_some();
        let operation = uuid::Uuid::new_v4();
        self.cloud.projects.operation = Some(operation);
        self.cloud.projects.saving = true;
        self.cloud.projects.error = None;
        cx.spawn(async move |view, cx| {
            let result = task.await.context("Saving the project stopped").and_then(|result| result);
            let _ = view.update(cx, |view, cx| {
                if view.cloud.generation != generation || view.cloud.projects.operation != Some(operation) { return; }
                view.cloud.projects.operation = None;
                view.cloud.projects.saving = false;
                let result = result.and_then(|response| {
                    anyhow::ensure!(expected_id.as_ref().is_none_or(|id| *id == response.project.id), "The project save returned a different project");
                    let target = CloudProjectTarget { scope: response.scope.clone(), workspace: response.workspace.clone(), project_id: response.project.id.clone() };
                    view.cloud.projects.accept_project(&target, response)
                });
                match result {
                    Ok(()) => { view.cloud.projects.edit = None; view.cloud.projects.needs_review = false; },
                    Err(error) => { view.cloud.projects.needs_review = true; view.cloud.projects.error = Some(format!("The project save is unconfirmed: {error:#}. {}Review the saved project before retrying.", if retaining_form { "Your proposed details are retained. " } else { "" })); },
                }
                cx.notify();
            });
        }).detach();
        cx.notify();
    }
    pub(super) fn project_chats(
        &mut self,
        expected_id: String,
        new: Option<bool>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.cloud.navigation_busy() || self.cloud.projects.edit.is_some() {
            return;
        }
        let Some(project) = &self.cloud.projects.selected else {
            return;
        };
        if project.id != expected_id {
            return;
        }
        self.cloud.projects.active_id = Some(project.id.clone());
        self.cloud.projects.visible = false;
        self.cloud.detail = None;
        if let Some(work) = new {
            self.new_cloud(work, window, cx);
        } else {
            self.load_cloud(false, cx);
        }
        cx.notify();
    }
    pub(super) fn render_projects(
        &self,
        palette: Palette,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> gpui::Div {
        let state = &self.cloud.projects;
        let busy = state.operation.is_some();
        let mut panel = div()
            .w_full()
            .max_w(px(self.contracts.frame.content_width))
            .min_w_0()
            .flex()
            .flex_col()
            .gap_4();
        if self.account_client().is_err() {
            panel = panel.child(self.button(
                "reconnect-project-account",
                "Reconnect account",
                UiAction::ReconnectAccount,
                palette,
                cx,
            ));
        }
        if let Some(error) = &state.error {
            panel = panel.child(gpui::text!(error.clone()));
        }
        if busy {
            panel = panel.child(gpui::text!(if state.saving {
                "Saving project…"
            } else {
                "Loading projects…"
            }));
        }
        if !busy && state.selected.is_some() && state.edit.is_none() {
            panel = panel.child(self.button(
                "all-projects",
                "All projects",
                UiAction::RefreshProjects,
                palette,
                cx,
            ));
        }
        if let Some(edit) = &state.edit {
            panel = panel.child(crate::project_form::form(
                crate::project_form::ProjectFormProps {
                    edit,
                    fields: crate::project_form::ProjectFormFields {
                        name: &self.project_name,
                        description: &self.project_description,
                        instructions: &self.project_instructions,
                    },
                    busy,
                    needs_review: state.needs_review,
                    contracts: &self.contracts,
                },
                palette,
                |view: &mut Desktop, action, window, cx| {
                    let action = match action {
                        crate::project_form::ProjectFormAction::Save(id) => {
                            UiAction::SaveProject(id)
                        }
                        crate::project_form::ProjectFormAction::Cancel(id) => {
                            UiAction::CancelProjectEdit(id)
                        }
                    };
                    view.dispatch(action, window, cx);
                },
                cx,
            ));
        }
        if let Some(project) = &state.selected {
            panel = panel.child(gpui::text!(project.name.clone()));
            if let Some(description) = &project.description {
                if !description.is_empty() {
                    panel = panel.child(gpui::text!(description.clone()));
                }
            }
            panel = panel.child(gpui::text!(if project.archived {
                "Archived project".to_string()
            } else if !project.can_edit {
                "Read-only project".to_string()
            } else {
                format!("{} project", self.contracts.cloud_trust_label)
            }));
            if let Some(count) = project.conversation_count {
                panel = panel.child(gpui::text!(format!("{count} conversations")));
            }
            if !busy && state.edit.is_none() {
                let mut actions = div().flex().flex_wrap().gap_2().child(self.button(
                    "project-chats",
                    "Conversations",
                    UiAction::ProjectChats(project.id.clone(), None),
                    palette,
                    cx,
                ));
                if project.can_start_chat {
                    actions = actions
                        .child(self.button(
                            "new-project-chat",
                            "New chat",
                            UiAction::ProjectChats(project.id.clone(), Some(false)),
                            palette,
                            cx,
                        ))
                        .child(self.button(
                            "new-project-work",
                            format!("New {}", self.contracts.work_name),
                            UiAction::ProjectChats(project.id.clone(), Some(true)),
                            palette,
                            cx,
                        ));
                } else {
                    panel = panel.child(gpui::text!("New conversations are unavailable here for this project's sharing access, archived state or saved tool settings. Existing conversations remain available."));
                }
                if project.can_edit && project.version.is_some() && !state.needs_review {
                    actions = actions.child(self.button(
                        "edit-project",
                        "Edit project",
                        UiAction::EditProject(false),
                        palette,
                        cx,
                    ));
                }
                if project.can_archive && !state.needs_review {
                    if let (Some(scope), Some(workspace), Some(version)) =
                        (&state.scope, &state.workspace, &project.version)
                    {
                        actions = actions.child(self.button(
                            "archive-project",
                            if project.archived {
                                "Restore project"
                            } else {
                                "Archive project"
                            },
                            UiAction::ArchiveProject(CloudProjectUpdateParams {
                                target: CloudProjectTarget {
                                    scope: scope.clone(),
                                    workspace: workspace.clone(),
                                    project_id: project.id.clone(),
                                },
                                expected_version: version.clone(),
                                change: CloudProjectChange::Archive {
                                    archived: !project.archived,
                                },
                            }),
                            palette,
                            cx,
                        ));
                    }
                }
                panel = panel.child(actions);
            }
            if state.edit.is_none()
                && self
                    .account_capabilities
                    .as_ref()
                    .is_some_and(|caps| caps.cloud_project_files)
            {
                panel = panel.child(crate::project_file_controls::controls(
                    &state.files,
                    crate::project_file_controls::FileCapabilities {
                        download: self.project_download.target.is_none()
                            && self
                                .account_capabilities
                                .as_ref()
                                .is_some_and(|caps| caps.cloud_project_downloads),
                        reindex: project.can_archive
                            && !project.archived
                            && self
                                .account_capabilities
                                .as_ref()
                                .is_some_and(|caps| caps.cloud_project_file_reindex),
                    },
                    &self.contracts,
                    palette,
                    |view: &mut Desktop, action, window, cx| {
                        view.dispatch(UiAction::ProjectFile(action), window, cx)
                    },
                    window,
                    cx,
                ));
            }
            if state.edit.is_none()
                && project.can_edit
                && !project.archived
                && self.project_upload.target.is_none()
                && self
                    .account_capabilities
                    .as_ref()
                    .is_some_and(|caps| caps.cloud_project_uploads)
            {
                panel = panel.child(self.button(
                    "choose-project-upload",
                    "Add file",
                    UiAction::ChooseProjectUpload(project.id.clone()),
                    palette,
                    cx,
                ));
            }
            if let Some(instructions) = &project.instructions {
                if !instructions.is_empty() {
                    panel = panel.child(
                        div()
                            .id("saved-project-instructions")
                            .child(gpui::text!("Saved instructions"))
                            .child(gpui::text!(instructions.clone())),
                    );
                }
            }
        }
        if !busy {
            if state.edit.is_none() {
                panel = panel.child(self.button(
                    "create-project",
                    "New project",
                    UiAction::EditProject(true),
                    palette,
                    cx,
                ));
            }
            if state.selected.is_some() {
                panel = panel.child(self.button(
                    "review-project",
                    "Review latest project",
                    UiAction::ReviewProject,
                    palette,
                    cx,
                ));
            }
            panel = panel.child(self.button(
                "refresh-projects",
                if state.needs_review {
                    "Review saved projects"
                } else {
                    "Refresh projects"
                },
                UiAction::RefreshProjects,
                palette,
                cx,
            ));
        }
        if state.windowed {
            panel = panel.child(gpui::text!(
                "Showing a window of projects. Refresh projects to return to the first page."
            ));
        }
        for project in &state.rows {
            let mut row = div()
                .id(SharedString::from(format!("project-row:{}", project.id)))
                .w_full()
                .min_w_0()
                .flex()
                .flex_col()
                .gap_1();
            let name = if project.name.is_empty() {
                "Untitled project".into()
            } else {
                project.name.clone()
            };
            if !busy && state.edit.is_none() {
                row = row.child(
                    self.compact_button(
                        SharedString::from(format!("project:{}", project.id)),
                        name,
                        UiAction::ReadProject(project.id.clone()),
                        palette,
                        cx,
                    )
                    .w_full()
                    .min_w_0()
                    .truncate(),
                );
            } else {
                row = row.child(gpui::text!(name));
            }
            if let Some(description) = &project.description {
                row = row.child(
                    div()
                        .truncate()
                        .text_size(px(self.contracts.frame.sidebar_font_size))
                        .child(gpui::text!(description.clone())),
                );
            }
            if project.archived {
                row = row.child(gpui::text!("Archived"));
            }
            panel = panel.child(row);
        }
        if state.loaded && state.rows.is_empty() {
            panel = panel.child(gpui::text!(if state.has_more {
                "No projects for this device in this page. Load more to continue."
            } else {
                "No projects are available in this workspace on this device."
            }));
        }
        if state.has_more && !busy && state.edit.is_none() {
            panel = panel.child(self.button(
                "more-projects",
                "Load more projects",
                UiAction::MoreProjects,
                palette,
                cx,
            ));
        }
        panel
    }
}
