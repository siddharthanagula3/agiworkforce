use agiworkforce_desktop_gpui::{
    config::{NativeContracts, Settings},
    runtime::RuntimeSession,
};
use agiworkforce_protocol::project_files::*;
use agiworkforce_protocol::{account_cloud::*, developer_session::method};
use std::path::PathBuf;

async fn connect() -> RuntimeSession {
    RuntimeSession::connect_account(
        &PathBuf::from(std::env::var_os("AGI_GPUI_TEST_RUNTIME").unwrap()),
        &NativeContracts::load().unwrap(),
        Settings::load().unwrap(),
    )
    .await
    .unwrap()
}
async fn control(body: serde_json::Value) {
    let origin = std::env::var("AGIWORKFORCE_API_BASE").unwrap();
    let request = std::process::Command::new("curl")
        .args(["--fail", "--silent", "--show-error", "--header"])
        .arg(format!(
            "Authorization: Bearer {}",
            std::env::var("AGIWORKFORCE_JWT").unwrap()
        ))
        .args([
            "--header",
            "Content-Type: application/json",
            "--data-binary",
        ])
        .arg(body.to_string())
        .arg(format!("{origin}/fixture/control"))
        .output()
        .unwrap();
    assert!(request.status.success(), "fixture control failed");
}
fn target(
    scope: &str,
    workspace: &CloudConversationWorkspace,
    project: &CloudProject,
) -> CloudProjectTarget {
    CloudProjectTarget {
        scope: scope.into(),
        workspace: workspace.clone(),
        project_id: project.id.clone(),
    }
}
fn change(
    target: CloudProjectTarget,
    project: &CloudProject,
    change: CloudProjectChange,
) -> CloudProjectUpdateParams {
    CloudProjectUpdateParams {
        target,
        expected_version: project.version.clone().unwrap(),
        change,
    }
}
#[tokio::test]
#[ignore = "run through the isolated native projects fixture runner"]
async fn native_projects_use_scoped_versions_permissions_and_project_conversations() {
    assert_eq!(
        std::env::var("AGI_GPUI_PROJECTS_FIXTURE").as_deref(),
        Ok("1")
    );
    let origin = url::Url::parse(&std::env::var("AGIWORKFORCE_API_BASE").unwrap()).unwrap();
    assert_eq!(origin.scheme(), "http");
    assert_eq!(origin.host_str(), Some("127.0.0.1"));
    assert!(std::env::var("AGIWORKFORCE_JWT")
        .unwrap()
        .starts_with("fixture."));
    let session = connect().await;
    let client = session.client();
    assert!(session.capabilities().cloud_projects);
    let memberships: CloudWorkspacesListResponse = client
        .request(
            method::CLOUD_WORKSPACES_LIST,
            CloudWorkspacesListParams { scope: None },
        )
        .await
        .unwrap();
    let scope = memberships.scope;
    let workspace = CloudConversationWorkspace::Personal;
    let list = |workspace, cursor| CloudProjectListParams {
        scope: scope.clone(),
        workspace,
        limit: 1,
        cursor,
    };
    let mut first: CloudProjectListParams = list(workspace.clone(), None);
    first.scope = "another-account".into();
    assert!(client
        .request::<CloudProjectListResponse>(method::CLOUD_PROJECT_LIST, first)
        .await
        .is_err());
    let mut cursor = None;
    let mut projects = Vec::new();
    loop {
        let page: CloudProjectListResponse = client
            .request(method::CLOUD_PROJECT_LIST, list(workspace.clone(), cursor))
            .await
            .unwrap();
        projects.extend(page.projects);
        if !page.has_more {
            break;
        }
        cursor = page.next_cursor;
    }
    assert_eq!(
        projects.len(),
        3,
        "A web-only project was exposed on Desktop"
    );
    let archived = projects.iter().find(|project| project.archived).unwrap();
    assert!(!archived.can_start_chat);
    control(serde_json::json!({ "projectCursor": "repeat" })).await;
    assert!(client
        .request::<CloudProjectListResponse>(
            method::CLOUD_PROJECT_LIST,
            list(workspace.clone(), Some("project-page-1".into()))
        )
        .await
        .is_err());
    control(serde_json::json!({ "projectCursor": "normal" })).await;
    let mut invalid = CloudProjectCreateParams {
        scope: scope.clone(),
        workspace: workspace.clone(),
        details: CloudProjectDetails {
            name: "🦀".repeat(NativeContracts::load().unwrap().project_name_max_length),
            description: String::new(),
            instructions: String::new(),
        },
    };
    assert!(client
        .request::<CloudProjectResponse>(method::CLOUD_PROJECT_CREATE, invalid.clone())
        .await
        .is_err());
    invalid.details = CloudProjectDetails {
        name: "Native project 東京 🦀".into(),
        description: "  Native description  ".into(),
        instructions: "  Keep this project context separate.\n".into(),
    };
    let created: CloudProjectResponse = client
        .request(method::CLOUD_PROJECT_CREATE, invalid.clone())
        .await
        .unwrap();
    let mut current = created.project;
    assert!(current.can_edit && current.can_archive && current.can_start_chat);
    assert!(current.version.is_some());
    let selected = target(&scope, &workspace, &current);
    assert!(session.capabilities().cloud_project_files);
    let files: CloudProjectFilesResponse = client
        .request(method::CLOUD_PROJECT_FILES_LIST, selected.clone())
        .await
        .unwrap();
    assert_eq!(files.target, selected);
    assert_eq!(files.files.len(), 3);
    let source = files
        .files
        .iter()
        .find(|file| file.preview_kind == Some(ProjectFilePreviewKind::Text))
        .unwrap();
    let file_target = CloudProjectFileTarget {
        project: selected.clone(),
        file_id: source.id.clone(),
    };
    let preview: CloudProjectFilePreview = client
        .request(method::CLOUD_PROJECT_FILE_PREVIEW, file_target.clone())
        .await
        .unwrap();
    assert!(preview.text.contains("東京 🦀"));
    assert_eq!(preview.checksum_sha256, source.checksum_sha256);
    let table = files
        .files
        .iter()
        .find(|file| file.preview_kind == Some(ProjectFilePreviewKind::Table))
        .unwrap();
    let table: CloudProjectFilePreview = client
        .request(
            method::CLOUD_PROJECT_FILE_PREVIEW,
            CloudProjectFileTarget {
                project: selected.clone(),
                file_id: table.id.clone(),
            },
        )
        .await
        .unwrap();
    assert_eq!(table.kind, ProjectFilePreviewKind::Table);
    let binary = files
        .files
        .iter()
        .find(|file| file.preview_kind.is_none())
        .unwrap();
    assert!(client
        .request::<CloudProjectFilePreview>(
            method::CLOUD_PROJECT_FILE_PREVIEW,
            CloudProjectFileTarget {
                project: selected.clone(),
                file_id: binary.id.clone()
            }
        )
        .await
        .is_err());
    let mut wrong_scope = selected.clone();
    wrong_scope.scope = "not-the-account".into();
    assert!(client
        .request::<CloudProjectFilesResponse>(method::CLOUD_PROJECT_FILES_LIST, wrong_scope)
        .await
        .is_err());
    let mut wrong_workspace = selected.clone();
    wrong_workspace.workspace = CloudConversationWorkspace::Organization {
        id: uuid::Uuid::new_v4().to_string(),
    };
    assert!(client
        .request::<CloudProjectFilesResponse>(method::CLOUD_PROJECT_FILES_LIST, wrong_workspace)
        .await
        .is_err());
    for (mode, message) in [
        ("duplicate", "duplicate"),
        ("wrong-project", "invalid file metadata"),
        ("unsafe-byte-count", "invalid file metadata"),
    ] {
        control(serde_json::json!({ "projectFileMode": mode })).await;
        let error = client
            .request::<CloudProjectFilesResponse>(
                method::CLOUD_PROJECT_FILES_LIST,
                selected.clone(),
            )
            .await
            .unwrap_err();
        assert!(error.to_string().contains(message), "{mode}: {error}");
    }
    for (mode, message) in [
        ("oversize-preview", "text budget"),
        ("changed-preview", "file changed"),
    ] {
        control(serde_json::json!({ "projectFileMode": mode })).await;
        let error = client
            .request::<CloudProjectFilePreview>(
                method::CLOUD_PROJECT_FILE_PREVIEW,
                file_target.clone(),
            )
            .await
            .unwrap_err();
        assert!(error.to_string().contains(message), "{mode}: {error}");
    }
    control(serde_json::json!({ "projectFileMode": "normal" })).await;

    let invalid_ack = change(
        selected.clone(),
        &current,
        CloudProjectChange::Details {
            details: CloudProjectDetails {
                name: "Fixture nonadvancing project reply".into(),
                description: current.description.clone().unwrap_or_default(),
                instructions: current.instructions.clone().unwrap_or_default(),
            },
        },
    );
    assert!(client
        .request::<CloudProjectResponse>(method::CLOUD_PROJECT_UPDATE, invalid_ack)
        .await
        .is_err());
    let stale = change(
        selected.clone(),
        &current,
        CloudProjectChange::Details {
            details: CloudProjectDetails {
                name: "Renamed native project".into(),
                description: "Updated description".into(),
                instructions: "Keep the updated context separate.".into(),
            },
        },
    );
    current = client
        .request::<CloudProjectResponse>(method::CLOUD_PROJECT_UPDATE, stale.clone())
        .await
        .unwrap()
        .project;
    assert!(client
        .request::<CloudProjectResponse>(method::CLOUD_PROJECT_UPDATE, stale)
        .await
        .unwrap_err()
        .to_string()
        .contains("changed"));
    for archived in [true, false] {
        current = client
            .request::<CloudProjectResponse>(
                method::CLOUD_PROJECT_UPDATE,
                change(
                    selected.clone(),
                    &current,
                    CloudProjectChange::Archive { archived },
                ),
            )
            .await
            .unwrap()
            .project;
        assert_eq!(current.archived, archived);
    }
    let lost = change(
        selected.clone(),
        &current,
        CloudProjectChange::Details {
            details: CloudProjectDetails {
                name: "Fixture lost project reply".into(),
                description: "Retain this proposal".into(),
                instructions: "No replay".into(),
            },
        },
    );
    assert!(client
        .request::<CloudProjectResponse>(method::CLOUD_PROJECT_UPDATE, lost.clone())
        .await
        .is_err());
    current = client
        .request::<CloudProjectResponse>(method::CLOUD_PROJECT_READ, selected.clone())
        .await
        .unwrap()
        .project;
    assert_eq!(current.name, "Fixture lost project reply");
    assert!(client
        .request::<CloudProjectResponse>(method::CLOUD_PROJECT_UPDATE, lost)
        .await
        .is_err());
    let organization = memberships
        .workspaces
        .iter()
        .find_map(|row| match &row.selector {
            CloudConversationWorkspace::Organization { .. } => Some(row.selector.clone()),
            _ => None,
        })
        .unwrap();
    assert!(client
        .request::<CloudProjectResponse>(
            method::CLOUD_PROJECT_READ,
            CloudProjectTarget {
                workspace: organization.clone(),
                ..selected.clone()
            }
        )
        .await
        .is_err());
    let org_page: CloudProjectListResponse = client
        .request(
            method::CLOUD_PROJECT_LIST,
            CloudProjectListParams {
                limit: 10,
                ..list(organization.clone(), None)
            },
        )
        .await
        .unwrap();
    let reader = org_page
        .projects
        .iter()
        .find(|project| !project.can_edit)
        .unwrap();
    assert!(client
        .request::<CloudProjectResponse>(
            method::CLOUD_PROJECT_UPDATE,
            change(
                target(&scope, &organization, reader),
                &client
                    .request::<CloudProjectResponse>(
                        method::CLOUD_PROJECT_READ,
                        target(&scope, &organization, reader)
                    )
                    .await
                    .unwrap()
                    .project,
                CloudProjectChange::Archive { archived: true }
            )
        )
        .await
        .is_err());
    let editor = org_page
        .projects
        .iter()
        .find(|project| project.can_edit)
        .unwrap();
    let edit_target = target(&scope, &organization, editor);
    let mut editor = client
        .request::<CloudProjectResponse>(method::CLOUD_PROJECT_READ, edit_target.clone())
        .await
        .unwrap()
        .project;
    assert!(!editor.can_archive);
    assert!(client
        .request::<CloudProjectResponse>(
            method::CLOUD_PROJECT_UPDATE,
            change(
                edit_target.clone(),
                &editor,
                CloudProjectChange::Archive { archived: true }
            )
        )
        .await
        .is_err());
    editor = client
        .request::<CloudProjectResponse>(
            method::CLOUD_PROJECT_UPDATE,
            change(
                edit_target.clone(),
                &editor,
                CloudProjectChange::Details {
                    details: CloudProjectDetails {
                        name: "Shared editor details".into(),
                        description: String::new(),
                        instructions: "Shared instructions".into(),
                    },
                },
            ),
        )
        .await
        .unwrap()
        .project;
    control(serde_json::json!({ "projectAccess": { "id": editor.id, "access": "read" } })).await;
    assert!(client
        .request::<CloudProjectResponse>(
            method::CLOUD_PROJECT_UPDATE,
            change(
                edit_target,
                &editor,
                CloudProjectChange::Details {
                    details: CloudProjectDetails {
                        name: "Revoked write".into(),
                        description: String::new(),
                        instructions: String::new()
                    }
                }
            )
        )
        .await
        .is_err());
    let conversation_params = CloudConversationCreateParams {
        project_id: Some(current.id.clone()),
        workspace: Some(workspace.clone()),
        scope: scope.clone(),
        id: uuid::Uuid::new_v4().to_string(),
    };
    let archived_request = CloudConversationCreateParams {
        project_id: Some(archived.id.clone()),
        id: uuid::Uuid::new_v4().to_string(),
        ..conversation_params.clone()
    };
    assert!(client
        .request::<CloudConversationCreateResponse>(
            method::CLOUD_CONVERSATION_CREATE,
            archived_request
        )
        .await
        .is_err());
    let catalogue: CloudModelListResponse = client
        .request(
            method::CLOUD_MODEL_LIST,
            CloudModelListParams {
                scope: scope.clone(),
            },
        )
        .await
        .unwrap();
    let unavailable = catalogue
        .models
        .iter()
        .find(|model| !model.selectable())
        .unwrap();
    control(serde_json::json!({ "projectChange": { "id": current.id, "change": { "defaultModelId": unavailable.id } } })).await;
    assert!(client
        .request::<CloudConversationCreateResponse>(
            method::CLOUD_CONVERSATION_CREATE,
            conversation_params.clone()
        )
        .await
        .is_err());
    control(serde_json::json!({ "projectChange": { "id": current.id, "change": { "defaultModelId": current.default_model_id } } })).await;
    let mut wrong_default = conversation_params.clone();
    wrong_default.id = uuid::Uuid::new_v4().to_string();
    control(serde_json::json!({ "projectChange": { "id": current.id, "change": { "chatDefaults": { "research": true } } } })).await;
    assert!(client
        .request::<CloudConversationCreateResponse>(
            method::CLOUD_CONVERSATION_CREATE,
            wrong_default.clone()
        )
        .await
        .is_err());
    control(serde_json::json!({ "projectChange": { "id": current.id, "change": { "chatDefaults": {} } } })).await;
    let conversation: CloudConversationCreateResponse = client
        .request(method::CLOUD_CONVERSATION_CREATE, conversation_params)
        .await
        .unwrap();
    assert_eq!(
        conversation.conversation.project_id.as_ref(),
        Some(&current.id)
    );
    assert_eq!(conversation.conversation.model, current.default_model_id);
    let history: CloudHistoryListResponse = client
        .request(
            method::CLOUD_HISTORY_LIST,
            CloudHistoryListParams {
                project_id: Some(current.id.clone()),
                workspace: Some(workspace.clone()),
                scope: Some(scope.clone()),
                archive_filter: None,
                query: None,
                limit: 10,
                offset: 0,
                cursor: None,
            },
        )
        .await
        .unwrap();
    assert_eq!(history.conversations.len(), 1);
    assert_eq!(history.conversations[0].id, conversation.conversation.id);
    let start = CloudTurnStartParams {
        attachments: Vec::new(),
        scope: scope.clone(),
        workspace: Some(workspace.clone()),
        conversation_id: conversation.conversation.id.clone(),
        request_id: uuid::Uuid::new_v4().to_string(),
        user_message_id: uuid::Uuid::new_v4().to_string(),
        text: "A synthetic project conversation".into(),
        model: conversation.conversation.model,
        page_size: 2,
        work: None,
    };
    control(serde_json::json!({ "projectChange": { "id": current.id, "change": { "allowedSurfaces": ["web"] } } })).await;
    let mut blocked = start.clone();
    blocked.request_id = uuid::Uuid::new_v4().to_string();
    blocked.user_message_id = uuid::Uuid::new_v4().to_string();
    let _: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, blocked.clone())
        .await
        .unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            let snapshot: CloudTurnSnapshot = client
                .request(
                    method::CLOUD_TURN_READ,
                    CloudTurnIdParams {
                        scope: scope.clone(),
                        workspace: Some(workspace.clone()),
                        request_id: blocked.request_id.clone(),
                        run_id: None,
                    },
                )
                .await
                .unwrap();
            if snapshot.state.is_terminal() {
                assert!(snapshot.rejected && !snapshot.accepted);
                assert!(snapshot.error.is_some());
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
    control(serde_json::json!({ "projectChange": { "id": current.id, "change": { "allowedSurfaces": agiworkforce_protocol::projects::SYNCED_APP_SURFACES } } })).await;
    let _: CloudTurnSnapshot = client
        .request(method::CLOUD_TURN_START, start.clone())
        .await
        .unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            let snapshot: CloudTurnSnapshot = client
                .request(
                    method::CLOUD_TURN_READ,
                    CloudTurnIdParams {
                        scope: scope.clone(),
                        workspace: Some(workspace.clone()),
                        request_id: start.request_id.clone(),
                        run_id: None,
                    },
                )
                .await
                .unwrap();
            assert!(snapshot.error.is_none(), "{:?}", snapshot.error);
            if snapshot.accepted && !snapshot.needs_attention() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    })
    .await
    .unwrap();
    let mut lost_creation = invalid;
    lost_creation.details.name = "Fixture lost project creation".into();
    assert!(client
        .request::<CloudProjectResponse>(method::CLOUD_PROJECT_CREATE, lost_creation)
        .await
        .is_err());
    session.shutdown().await.unwrap();
    let cold = connect().await;
    let reopened: CloudProjectResponse = cold
        .client()
        .request(method::CLOUD_PROJECT_READ, selected)
        .await
        .unwrap();
    assert_eq!(reopened.project.name, current.name);
    let messages: CloudHistoryReadResponse = cold
        .client()
        .request(
            method::CLOUD_HISTORY_READ,
            CloudHistoryReadParams {
                scope,
                workspace: Some(workspace),
                conversation_id: conversation.conversation.id,
                limit: 10,
                offset: 0,
                latest: true,
                before: None,
            },
        )
        .await
        .unwrap();
    assert_eq!(messages.messages.len(), 2);
    assert_eq!(messages.conversation.project_id.as_ref(), Some(&current.id));
    cold.shutdown().await.unwrap();
}
