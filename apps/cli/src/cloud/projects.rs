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
use super::state::SyncState;

pub const PROJECTS_SYNC_PATH: &str = "/api/projects/sync";
const NAME_MAX_CHARS: usize = 200;
const DESCRIPTION_MAX_CHARS: usize = 2_000;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPushItem {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub base_version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
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
    #[serde(default)]
    pub projects: Vec<CachedProject>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CachedProject {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
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
                is_archived: delta.is_archived,
                updated_at: delta.updated_at.clone(),
            });
        }
        self.projects
            .sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
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
        name: truncate(name.trim(), NAME_MAX_CHARS),
        description: description
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| truncate(value, DESCRIPTION_MAX_CHARS)),
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
    state.projects.advance(&response.cursor);
}

pub fn apply_pull_response(response: &ProjectsPullResponse, state: &mut SyncState) {
    for project in &response.projects {
        state.projects.record(&project.id, &project.server_version);
    }
    state.projects.advance(&response.cursor);
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
        let mut cursor = since.to_string();
        let mut merged = ProjectsPullResponse {
            projects: Vec::new(),
            cursor: cursor.clone(),
            has_more: false,
        };
        loop {
            let page = self.pull(&cursor).await?;
            merged.projects.extend(page.projects.iter().cloned());
            let advanced = page.cursor != cursor;
            cursor = page.cursor.clone();
            merged.cursor = cursor.clone();
            if !page.has_more || !advanced {
                break;
            }
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
        assert_eq!(state.projects.cursor, "44");
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
}
