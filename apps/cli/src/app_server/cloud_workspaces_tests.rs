use super::*;

fn fixture() -> Workspaces {
    let workspace = uuid::Uuid::new_v4().to_string();
    let organization = uuid::Uuid::new_v4().to_string();
    serde_json::from_value(serde_json::json!({
        "accountId": "owner",
        "workspaces": [{
            "id": workspace, "organizationId": organization, "kind": "organization",
            "name": "Team", "slug": "team", "role": "member", "isPrimary": true
        }],
        "activeWorkspaceId": workspace, "activeOrganizationId": organization,
        "scope": "organization"
    }))
    .unwrap()
}

#[test]
fn projection_requires_the_account_and_active_membership() {
    assert!(project(fixture(), "other", "scope".into()).is_err());
    let mut missing = fixture();
    missing.active_workspace_id = Some(uuid::Uuid::new_v4().to_string());
    assert!(project(missing, "owner", "scope".into()).is_err());
    let mut mismatch = fixture();
    mismatch.active_organization_id = Some(uuid::Uuid::new_v4().to_string());
    assert!(project(mismatch, "owner", "scope".into()).is_err());
    let projected = project(fixture(), "owner", "scope".into()).unwrap();
    assert_eq!(projected.workspaces.len(), 2);
    assert_eq!(
        projected.workspaces[0].selector,
        CloudConversationWorkspace::Personal
    );
    assert_eq!(projected.workspaces[1], projected.selected);
}

#[test]
fn projection_rejects_duplicate_and_malformed_memberships() {
    let mut duplicate = fixture();
    let mut other = fixture().workspaces.remove(0);
    other.id = duplicate.workspaces[0].id.clone();
    duplicate.workspaces.push(other);
    assert!(project(duplicate, "owner", "scope".into()).is_err());
    for invalid in ["personal", "", "not-an-id"] {
        let mut body = fixture();
        body.workspaces[0].id = invalid.into();
        assert!(project(body, "owner", "scope".into()).is_err());
    }
    let mut invalid = fixture();
    invalid.workspaces[0].organization_id = Some("bad".into());
    assert!(project(invalid, "owner", "scope".into()).is_err());
    let mut invalid = fixture();
    invalid.workspaces[0].kind = "unknown".into();
    assert!(project(invalid, "owner", "scope".into()).is_err());
}

#[test]
fn personal_scope_never_claims_an_organization() {
    let mut body = fixture();
    body.scope = "personal".into();
    assert!(project(body, "owner", "scope".into()).is_err());
    let mut body = fixture();
    body.scope = "personal".into();
    body.active_workspace_id = None;
    body.active_organization_id = None;
    let projected = project(body, "owner", "scope".into()).unwrap();
    assert_eq!(
        projected.selected.selector,
        CloudConversationWorkspace::Personal
    );
    assert_eq!(projected.selected.id, personal_selector());
}
