use agiworkforce_desktop_gpui::{cloud_history::CloudHistory, workspaces::Workspaces};
use agiworkforce_protocol::account_cloud::*;

fn choice(id: &str) -> CloudWorkspaceSummary {
    CloudWorkspaceSummary {
        id: id.into(),
        name: format!("Workspace {id}"),
        slug: id.into(),
        selector: CloudConversationWorkspace::Organization {
            id: uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_URL, id.as_bytes()).to_string(),
        },
        role: Some("member".into()),
    }
}
fn list(active: &str) -> CloudWorkspacesListResponse {
    CloudWorkspacesListResponse {
        scope: "account".into(),
        workspaces: vec![choice("a"), choice("b")],
        selected: choice(active),
    }
}

#[test]
fn membership_refresh_does_not_adopt_another_clients_active_workspace() {
    let mut state = Workspaces::default();
    assert!(state.accept_list(list("a")).unwrap());
    assert!(!state.accept_list(list("b")).unwrap());
    assert_eq!(state.selected.as_ref().unwrap().id, "a");
    let mut renamed = list("b");
    renamed.workspaces[0].name = "Renamed workspace".into();
    assert!(!state.accept_list(renamed).unwrap());
    assert_eq!(state.selected.as_ref().unwrap().name, "Renamed workspace");
}

#[test]
fn uncertain_selection_is_blocked_until_the_list_proves_its_result() {
    let mut state = Workspaces::default();
    state.accept_list(list("a")).unwrap();
    state.requested = Some("b".into());
    state.uncertain = true;
    assert!(state.selector().is_none());
    assert!(state.accept_list(list("b")).unwrap());
    assert_eq!(state.selected.as_ref().unwrap().id, "b");
    assert!(state.selector().is_some());
}

#[test]
fn revoked_membership_never_silently_falls_back_to_another_workspace() {
    let mut state = Workspaces::default();
    state.accept_list(list("a")).unwrap();
    let mut revoked = list("b");
    revoked.workspaces.remove(0);
    assert!(state.accept_list(revoked.clone()).unwrap());
    assert!(state.selector().is_none());
    assert!(state.error.is_some());
    assert!(!state.accept_list(revoked).unwrap());
    assert!(state.selector().is_none());
    state.requested = Some("b".into());
    state
        .accept_selection(CloudWorkspaceSelectResponse {
            scope: "account".into(),
            selected: choice("b"),
        })
        .unwrap();
    assert!(state.selector().is_some());
}

#[test]
fn bad_lists_and_replies_cannot_partially_replace_the_confirmed_context() {
    let mut state = Workspaces::default();
    state.accept_list(list("a")).unwrap();
    let mut foreign = list("b");
    foreign.scope = "different-account".into();
    assert!(state.accept_list(foreign).is_err());
    let mut duplicate = list("b");
    duplicate.workspaces.push(choice("a"));
    assert!(state.accept_list(duplicate).is_err());
    state.requested = Some("b".into());
    assert!(state
        .accept_selection(CloudWorkspaceSelectResponse {
            scope: "different-account".into(),
            selected: choice("b")
        })
        .is_err());
    assert_eq!(state.selected.as_ref().unwrap().id, "a");
}

#[test]
fn resetting_a_failed_view_keeps_the_frozen_workspace_but_an_account_reset_drops_it() {
    let mut state = CloudHistory::new(1024);
    state.workspaces.accept_list(list("a")).unwrap();
    state.scope = Some("account".into());
    let generation = state.generation;
    state.reset_view();
    assert_ne!(state.generation, generation);
    assert_eq!(state.workspaces.selected.as_ref().unwrap().id, "a");
    state.reset();
    assert!(state.workspaces.selector().is_none());
}
