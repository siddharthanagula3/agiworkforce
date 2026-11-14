use agiworkforce_protocol::account_cloud::*;
use anyhow::{ensure, Result};
use std::collections::HashSet;

#[derive(Clone)]
pub struct ProjectEdit {
    pub id: uuid::Uuid,
    pub scope: String,
    pub workspace: CloudConversationWorkspace,
    pub original: Option<CloudProject>,
}

#[derive(Default)]
pub struct Projects {
    pub files: crate::project_files::ProjectFiles,
    pub visible: bool,
    pub scope: Option<String>,
    pub workspace: Option<CloudConversationWorkspace>,
    pub rows: Vec<CloudProject>,
    pub selected: Option<CloudProject>,
    pub active_id: Option<String>,
    pub operation: Option<uuid::Uuid>,
    pub saving: bool,
    pub loaded: bool,
    pub has_more: bool,
    pub next_cursor: Option<String>,
    cursors: HashSet<String>,
    pub windowed: bool,
    pub edit: Option<ProjectEdit>,
    pub needs_review: bool,
    pub error: Option<String>,
}
impl Projects {
    pub fn reset(&mut self) {
        let edit = self.edit.take();
        *self = Self { needs_review: edit.is_some(), error: edit.as_ref().map(|_| "This project edit needs a fresh account and workspace check. Your proposed details are retained; copy or cancel them before changing accounts.".into()), edit, ..Default::default() };
    }
    pub fn bind(&mut self, scope: &str, workspace: &CloudConversationWorkspace) {
        if self.scope.as_deref() != Some(scope) || self.workspace.as_ref() != Some(workspace) {
            self.reset();
            self.scope = Some(scope.into());
            self.workspace = Some(workspace.clone());
        }
    }
    pub fn accept_list(
        &mut self,
        response: CloudProjectListResponse,
        more: bool,
        max_bytes: usize,
    ) -> Result<()> {
        ensure!(
            self.scope.as_ref() == Some(&response.scope)
                && self.workspace.as_ref() == Some(&response.workspace),
            "The project page changed account or workspace"
        );
        ensure!(
            response
                .projects
                .iter()
                .all(|project| CloudConversationWorkspace::from_organization(
                    project.organization_id.as_deref()
                ) == response.workspace),
            "The project page contains another workspace"
        );
        let mut seen = HashSet::new();
        ensure!(
            response
                .projects
                .iter()
                .all(|project| seen.insert(&project.id)),
            "The project page repeated an identity"
        );
        let mut cursors = if more {
            self.cursors.clone()
        } else {
            HashSet::new()
        };
        if response.has_more {
            let cursor = response
                .next_cursor
                .as_ref()
                .ok_or_else(|| anyhow::anyhow!("The project page has no continuation"))?;
            ensure!(
                cursors.insert(cursor.clone()),
                "The project cursor repeated"
            );
        }
        ensure!(
            cursors.iter().map(String::len).sum::<usize>() <= max_bytes,
            "The project cursor cache is full. Reload projects."
        );
        let mut rows = if more { self.rows.clone() } else { Vec::new() };
        for project in response.projects {
            if let Some(existing) = rows.iter_mut().find(|row| row.id == project.id) {
                *existing = project;
            } else {
                rows.push(project);
            }
        }
        let mut bytes = serde_json::to_vec(&rows)?.len();
        let mut remove = 0;
        while bytes > max_bytes && remove < rows.len() {
            let separator = usize::from(remove + 1 < rows.len());
            bytes = bytes.saturating_sub(serde_json::to_vec(&rows[remove])?.len() + separator);
            remove += 1;
        }
        rows.drain(..remove);
        self.rows = rows;
        self.windowed = more && self.windowed || remove > 0;
        self.cursors = cursors;
        self.has_more = response.has_more;
        self.next_cursor = response.next_cursor;
        self.loaded = true;
        Ok(())
    }
    pub fn accept_project(
        &mut self,
        target: &CloudProjectTarget,
        response: CloudProjectResponse,
    ) -> Result<()> {
        ensure!(
            self.scope.as_ref() == Some(&response.scope)
                && response.scope == target.scope
                && self.workspace.as_ref() == Some(&response.workspace)
                && response.workspace == target.workspace
                && response.project.id == target.project_id
                && CloudConversationWorkspace::from_organization(
                    response.project.organization_id.as_deref()
                ) == target.workspace,
            "The returned project changed identity or workspace"
        );
        if let Some(row) = self
            .rows
            .iter_mut()
            .find(|row| row.id == response.project.id)
        {
            *row = response.project.clone();
        }
        self.files = Default::default();
        self.selected = Some(response.project);
        Ok(())
    }
}

pub fn details(project: &CloudProject) -> CloudProjectDetails {
    CloudProjectDetails {
        name: project.name.clone(),
        description: project.description.clone().unwrap_or_default(),
        instructions: project.instructions.clone().unwrap_or_default(),
    }
}
