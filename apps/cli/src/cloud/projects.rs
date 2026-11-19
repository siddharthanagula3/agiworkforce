//! Hosted projects: the account's project list, shared with the web app and
//! mobile through `/api/projects/sync`.
//!
//! The local `projects.json` registry is a different thing and stays where it
//! is: it records which *directories* on this machine are trusted. A hosted
//! project is a named workspace for conversations, and a directory is linked to
//! one only when the user asks for it.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::client::{CloudClient, CloudError};
use super::state::{SyncSection, SyncState};

pub mod api;

pub const PROJECTS_SYNC_PATH: &str = "/api/projects/sync";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPushItem {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub base_version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectsPushRequest {
    pub projects: Vec<ProjectPushItem>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct ProjectDelta {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub instructions: Option<String>,
    #[serde(default)]
    pub is_archived: bool,
    pub updated_at: String,
    #[serde(default)]
    pub deleted_at: Option<String>,
    pub server_version: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectsPullResponse {
    #[serde(default)]
    pub projects: Vec<ProjectDelta>,
    pub cursor: String,
    #[serde(default)]
    pub has_more: bool,
    #[serde(default)]
    pub workspace_scope: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct AppliedRow {
    pub id: String,
    pub server_version: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProjectConflict {
    pub id: String,
    #[serde(default)]
    pub current: Option<ProjectDelta>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProjectsPushResponse {
    #[serde(default)]
    pub applied: Vec<AppliedRow>,
    #[serde(default)]
    pub conflicts: Vec<ProjectConflict>,
    pub cursor: String,
}

/// The account's project list as this device last saw it. Cached beside the
/// sync state so `agi projects` answers offline with what it knows and says
/// when it could not refresh.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct ProjectCache {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(default)]
    pub projects: Vec<CachedProject>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub synced_through: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CachedProject {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub instructions: Option<String>,
    #[serde(default)]
    pub is_archived: bool,
    pub updated_at: String,
}

impl ProjectCache {
    /// Fold a delta page into the cache. A tombstoned project is removed
    /// locally, which is the hosted side's deletion reaching this device, not a
    /// local delete on a server error.
    pub fn apply(&mut self, deltas: &[ProjectDelta]) {
        for delta in deltas {
            self.projects.retain(|project| project.id != delta.id);
            if delta.deleted_at.is_some() {
                continue;
            }
            self.projects.push(CachedProject {
                id: delta.id.clone(),
                name: delta.name.clone(),
                description: delta.description.clone(),
                instructions: delta.instructions.clone(),
                is_archived: delta.is_archived,
                updated_at: delta.updated_at.clone(),
            });
        }
        self.projects
            .sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    }

    pub fn adopt(&mut self, response: &ProjectsPullResponse) {
        self.apply(&response.projects);
        self.synced_through = Some(response.cursor.clone());
    }

    pub fn find(&self, id_or_name: &str) -> Option<&CachedProject> {
        self.projects
            .iter()
            .find(|project| project.id == id_or_name)
            .or_else(|| {
                self.projects
                    .iter()
                    .find(|project| project.name.eq_ignore_ascii_case(id_or_name))
            })
    }
}

fn truncate(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

pub fn new_project(name: &str, description: Option<&str>) -> ProjectPushItem {
    ProjectPushItem {
        id: Uuid::new_v4().to_string(),
        name: truncate(name.trim(), api::contract().name_max_length),
        description: description
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| truncate(value, api::contract().description_max_length)),
        base_version: super::state::INITIAL_CURSOR.to_string(),
    }
}

pub fn apply_push_response(response: &ProjectsPushResponse, state: &mut SyncState) {
    for row in &response.applied {
        state.projects.record(&row.id, &row.server_version);
    }
    for conflict in &response.conflicts {
        if let Some(current) = conflict.current.as_ref() {
            state.projects.record(&conflict.id, &current.server_version);
        }
    }
}

pub fn apply_pull_response(response: &ProjectsPullResponse, state: &mut SyncState) {
    for project in &response.projects {
        state.projects.record(&project.id, &project.server_version);
    }
    state.projects.advance(&response.cursor);
}

fn workspace_changed_error() -> CloudError {
    CloudError::Api {
        status: 409,
        message: "the account's selected workspace changed while its projects were listed; run the command again".to_string(),
    }
}

fn fold_pull_page(
    merged: &mut ProjectsPullResponse,
    page: ProjectsPullResponse,
    first: bool,
) -> Result<bool, CloudError> {
    if first {
        merged.workspace_scope = page.workspace_scope.clone();
    } else if page.workspace_scope != merged.workspace_scope {
        return Err(workspace_changed_error());
    }
    merged.projects.extend(page.projects);
    let advanced = page.cursor != merged.cursor;
    merged.cursor = page.cursor;
    Ok(page.has_more && advanced)
}

pub fn scope_to_adopt(
    response: &ProjectsPullResponse,
    cache: &ProjectCache,
    state: &SyncState,
) -> Option<String> {
    let scope = response.workspace_scope.as_ref()?;
    (cache.scope.as_ref() != Some(scope) || state.projects_scope.as_ref() != Some(scope))
        .then(|| scope.clone())
}

pub fn reset_scope(scope: &str, cache: &mut ProjectCache, state: &mut SyncState) {
    *cache = ProjectCache {
        scope: Some(scope.to_string()),
        projects: Vec::new(),
        synced_through: None,
    };
    state.projects = SyncSection::default();
    state.projects_scope = Some(scope.to_string());
}

pub fn require_scope(response: &ProjectsPullResponse, scope: &str) -> Result<(), CloudError> {
    if response.workspace_scope.as_deref() == Some(scope) {
        Ok(())
    } else {
        Err(workspace_changed_error())
    }
}

/// Names of projects the push was refused for, so a caller never reports a
/// project as created when the server rejected it.
pub fn rejected_ids(request: &ProjectsPushRequest, response: &ProjectsPushResponse) -> Vec<String> {
    request
        .projects
        .iter()
        .filter(|project| {
            !response
                .applied
                .iter()
                .any(|applied| applied.id == project.id)
        })
        .map(|project| project.id.clone())
        .collect()
}

pub struct ProjectsSync<'a> {
    client: &'a CloudClient,
}

impl<'a> ProjectsSync<'a> {
    pub fn new(client: &'a CloudClient) -> Self {
        Self { client }
    }

    pub async fn pull(&self, since: &str) -> Result<ProjectsPullResponse, CloudError> {
        self.client
            .get(PROJECTS_SYNC_PATH, &[("since", since.to_string())])
            .await
    }

    pub async fn pull_all(&self, since: &str) -> Result<ProjectsPullResponse, CloudError> {
        let mut merged = ProjectsPullResponse {
            projects: Vec::new(),
            cursor: since.to_string(),
            has_more: false,
            workspace_scope: None,
        };
        let mut first = true;
        loop {
            let page = self.pull(&merged.cursor).await?;
            if !fold_pull_page(&mut merged, page, first)? {
                break;
            }
            first = false;
        }
        Ok(merged)
    }

    pub async fn push(
        &self,
        request: &ProjectsPushRequest,
    ) -> Result<ProjectsPushResponse, CloudError> {
        self.client.post(PROJECTS_SYNC_PATH, request).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn delta(id: &str, name: &str, version: &str, deleted: bool) -> ProjectDelta {
        ProjectDelta {
            id: id.to_string(),
            name: name.to_string(),
            description: None,
            instructions: None,
            is_archived: false,
            updated_at: format!("2026-09-13T00:00:{version:0>2}Z"),
            deleted_at: deleted.then(|| "2026-09-13T02:00:00Z".to_string()),
            server_version: version.to_string(),
        }
    }

    #[test]
    fn a_new_project_pushes_as_an_insert_with_a_fresh_uuid() {
        let project = new_project("  Launch  ", Some("  plan  "));
        assert_eq!(project.name, "Launch");
        assert_eq!(project.description.as_deref(), Some("plan"));
        assert_eq!(project.base_version, super::super::state::INITIAL_CURSOR);
        assert!(Uuid::parse_str(&project.id).is_ok());
    }

    #[test]
    fn a_blank_description_is_omitted_rather_than_sent_as_empty() {
        assert!(new_project("Launch", Some("   ")).description.is_none());
        assert!(new_project("Launch", None).description.is_none());
    }

    #[test]
    fn the_cache_takes_the_newest_copy_of_a_project() {
        let mut cache = ProjectCache::default();
        cache.apply(&[delta("p1", "First", "1", false)]);
        cache.apply(&[delta("p1", "Renamed", "2", false)]);
        assert_eq!(cache.projects.len(), 1);
        assert_eq!(cache.projects[0].name, "Renamed");
    }

    #[test]
    fn a_tombstoned_project_leaves_the_cache() {
        let mut cache = ProjectCache::default();
        cache.apply(&[delta("p1", "First", "1", false)]);
        cache.apply(&[delta("p1", "First", "2", true)]);
        assert!(cache.projects.is_empty());
    }

    #[test]
    fn a_project_resolves_by_id_or_by_name() {
        let mut cache = ProjectCache::default();
        cache.apply(&[delta("p1", "Launch", "1", false)]);
        assert_eq!(cache.find("p1").map(|p| p.name.as_str()), Some("Launch"));
        assert_eq!(cache.find("launch").map(|p| p.id.as_str()), Some("p1"));
        assert!(cache.find("missing").is_none());
    }

    #[test]
    fn a_conflict_adopts_the_hosted_version() {
        let mut state = SyncState::default();
        let response = ProjectsPushResponse {
            applied: Vec::new(),
            conflicts: vec![ProjectConflict {
                id: "p1".to_string(),
                current: Some(delta("p1", "Renamed on the web", "44", false)),
            }],
            cursor: "44".to_string(),
        };
        apply_push_response(&response, &mut state);
        assert_eq!(state.projects.base_version("p1"), "44");
        assert_eq!(state.projects.cursor, super::super::state::INITIAL_CURSOR);
    }

    #[test]
    fn creating_a_project_does_not_skip_deltas_this_device_has_not_pulled() {
        let mut state = SyncState::default();
        state.projects.advance("10");
        let created = new_project("Launch", None);
        let response = ProjectsPushResponse {
            applied: vec![AppliedRow {
                id: created.id.clone(),
                server_version: "12".to_string(),
            }],
            conflicts: Vec::new(),
            cursor: "12".to_string(),
        };
        apply_push_response(&response, &mut state);
        assert_eq!(state.projects.base_version(&created.id), "12");
        assert_eq!(state.projects.cursor, "10");

        let mut cache = ProjectCache {
            synced_through: Some("10".to_string()),
            ..ProjectCache::default()
        };
        let since =
            super::super::state::pull_frontier(&state.projects, cache.synced_through.as_deref());
        assert_eq!(since, "10");
        let renamed_elsewhere = pull(
            None,
            vec![
                delta("p-other", "Renamed elsewhere", "11", false),
                delta(&created.id, "Launch", "12", false),
            ],
            "12",
        );
        cache.adopt(&renamed_elsewhere);
        apply_pull_response(&renamed_elsewhere, &mut state);
        assert!(cache.find("p-other").is_some());
        assert_eq!(cache.synced_through.as_deref(), Some("12"));
        assert_eq!(state.projects.cursor, "12");
    }

    #[test]
    fn a_project_the_server_did_not_apply_is_reported_as_rejected() {
        let request = ProjectsPushRequest {
            projects: vec![new_project("Kept", None), new_project("Refused", None)],
        };
        let response = ProjectsPushResponse {
            applied: vec![AppliedRow {
                id: request.projects[0].id.clone(),
                server_version: "5".to_string(),
            }],
            conflicts: Vec::new(),
            cursor: "5".to_string(),
        };
        assert_eq!(
            rejected_ids(&request, &response),
            vec![request.projects[1].id.clone()]
        );
    }

    #[test]
    fn a_push_request_serializes_to_the_hosted_field_names() {
        let request = ProjectsPushRequest {
            projects: vec![new_project("Launch", None)],
        };
        let json = serde_json::to_value(&request).expect("serializes");
        assert!(json["projects"][0]["baseVersion"].is_string());
        assert!(json["projects"][0].get("description").is_none());
    }

    fn pull(scope: Option<&str>, deltas: Vec<ProjectDelta>, cursor: &str) -> ProjectsPullResponse {
        ProjectsPullResponse {
            projects: deltas,
            cursor: cursor.to_string(),
            has_more: false,
            workspace_scope: scope.map(str::to_string),
        }
    }

    #[test]
    fn a_pull_page_reads_the_hosted_workspace_scope() {
        let page: ProjectsPullResponse = serde_json::from_value(serde_json::json!({
            "projects": [],
            "cursor": "0",
            "hasMore": false,
            "workspaceScope": "personal"
        }))
        .expect("decodes");
        assert_eq!(page.workspace_scope.as_deref(), Some("personal"));
    }

    #[test]
    fn a_workspace_change_replaces_the_cache_and_cursor_instead_of_merging() {
        let mut state = SyncState::default();
        let mut cache = ProjectCache::default();
        let in_a = pull(
            Some("org-a"),
            vec![delta("a1", "Alpha", "100", false)],
            "100",
        );
        let scope = scope_to_adopt(&in_a, &cache, &state).expect("first scope is adopted");
        reset_scope(&scope, &mut cache, &mut state);
        cache.apply(&in_a.projects);
        apply_pull_response(&in_a, &mut state);
        assert_eq!(state.projects.cursor, "100");

        let incremental_b = pull(Some("org-b"), Vec::new(), "100");
        let scope = scope_to_adopt(&incremental_b, &cache, &state).expect("B differs from A");
        assert_eq!(scope, "org-b");
        reset_scope(&scope, &mut cache, &mut state);
        assert!(cache.projects.is_empty());
        assert_eq!(state.projects.cursor, super::super::state::INITIAL_CURSOR);
        assert_eq!(
            state.projects.base_version("a1"),
            super::super::state::INITIAL_CURSOR
        );

        let full_b = pull(Some("org-b"), vec![delta("b1", "Beta", "50", false)], "50");
        require_scope(&full_b, &scope).expect("same scope");
        cache.apply(&full_b.projects);
        apply_pull_response(&full_b, &mut state);
        let ids: Vec<&str> = cache
            .projects
            .iter()
            .map(|project| project.id.as_str())
            .collect();
        assert_eq!(ids, vec!["b1"]);
        assert_eq!(cache.scope.as_deref(), Some("org-b"));
        assert_eq!(state.projects_scope.as_deref(), Some("org-b"));
        assert!(scope_to_adopt(&pull(Some("org-b"), Vec::new(), "50"), &cache, &state).is_none());
    }

    #[test]
    fn a_cache_written_before_scopes_is_rebuilt_on_the_first_scoped_pull() {
        let mut state = SyncState::default();
        state.projects.advance("100");
        let mut cache = ProjectCache::default();
        cache.apply(&[delta("a1", "Alpha", "100", false)]);
        let scoped = pull(Some("personal"), Vec::new(), "100");
        assert_eq!(
            scope_to_adopt(&scoped, &cache, &state).as_deref(),
            Some("personal")
        );
        assert!(scope_to_adopt(&pull(None, Vec::new(), "100"), &cache, &state).is_none());
    }

    #[test]
    fn a_rebuild_that_lands_in_another_workspace_is_refused() {
        assert!(require_scope(&pull(Some("org-c"), Vec::new(), "9"), "org-b").is_err());
        assert!(require_scope(&pull(None, Vec::new(), "9"), "org-b").is_err());
    }

    #[test]
    fn pages_from_different_workspaces_are_not_merged() {
        let mut merged = pull(None, Vec::new(), "0");
        let mut first = pull(Some("org-a"), vec![delta("a1", "Alpha", "1", false)], "1");
        first.has_more = true;
        assert!(fold_pull_page(&mut merged, first, true).expect("first page"));
        let second = pull(Some("org-b"), vec![delta("b1", "Beta", "2", false)], "2");
        assert!(fold_pull_page(&mut merged, second, false).is_err());

        let mut merged = pull(None, Vec::new(), "0");
        let mut first = pull(Some("org-a"), vec![delta("a1", "Alpha", "1", false)], "1");
        first.has_more = true;
        assert!(fold_pull_page(&mut merged, first, true).expect("first page"));
        let second = pull(Some("org-a"), vec![delta("a2", "Alpha 2", "2", false)], "2");
        assert!(!fold_pull_page(&mut merged, second, false).expect("same scope"));
        assert_eq!(merged.projects.len(), 2);
        assert_eq!(merged.cursor, "2");
        assert_eq!(merged.workspace_scope.as_deref(), Some("org-a"));
    }

    #[test]
    fn a_page_that_does_not_advance_the_cursor_stops_the_pull() {
        let mut merged = pull(None, Vec::new(), "7");
        let mut stuck = pull(Some("org-a"), Vec::new(), "7");
        stuck.has_more = true;
        assert!(!fold_pull_page(&mut merged, stuck, true).expect("first page"));
    }
}
