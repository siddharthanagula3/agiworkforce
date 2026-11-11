use agiworkforce_desktop_gpui::cloud_models::CloudModelPicker;
use agiworkforce_protocol::account_cloud::{CloudModelListResponse, CloudModelSummary};

fn catalogue(scope: &str) -> CloudModelListResponse {
    CloudModelListResponse {
        scope: scope.into(),
        plan_label: "Fixture plan".into(),
        models: vec![
            CloudModelSummary {
                id: "fixture-available".into(),
                display_name: "Available model".into(),
                developer_label: "Developer".into(),
                admitted: true,
                temporarily_unavailable: false,
                minimum_plan_label: None,
            },
            CloudModelSummary {
                id: "fixture-blocked".into(),
                display_name: "Blocked model".into(),
                developer_label: "Developer".into(),
                admitted: false,
                temporarily_unavailable: false,
                minimum_plan_label: Some("Other plan".into()),
            },
            CloudModelSummary {
                id: "fixture-degraded".into(),
                display_name: "Unavailable model".into(),
                developer_label: "Developer".into(),
                admitted: true,
                temporarily_unavailable: true,
                minimum_plan_label: None,
            },
        ],
    }
}

#[test]
fn choices_never_cross_an_account_or_conversation() {
    let mut picker = CloudModelPicker::default();
    let request = picker.begin("account-a", "conversation-a");
    picker.accept(request, catalogue("account-a")).unwrap();
    assert!(picker
        .validate_choice(request, "account-a", "conversation-a", "fixture-available")
        .is_ok());
    assert!(picker
        .validate_choice(request, "account-b", "conversation-a", "fixture-available")
        .is_err());
    assert!(picker
        .validate_choice(request, "account-a", "conversation-b", "fixture-available")
        .is_err());
    picker.begin("account-b", "conversation-a");
    assert!(picker.models.is_empty());
}

#[test]
fn stale_catalogues_and_unavailable_choices_cannot_propose_a_change() {
    let mut picker = CloudModelPicker::default();
    let old = picker.begin("account-a", "conversation-a");
    let current = picker.begin("account-a", "conversation-a");
    assert!(picker.accept(old, catalogue("account-a")).is_err());
    assert!(picker.accept(current, catalogue("account-b")).is_err());
    picker.accept(current, catalogue("account-a")).unwrap();
    assert!(picker
        .validate_choice(old, "account-a", "conversation-a", "fixture-available")
        .is_err());
    for id in ["fixture-blocked", "fixture-degraded", "unknown"] {
        assert!(picker
            .validate_choice(current, "account-a", "conversation-a", id)
            .is_err());
    }
    assert!(picker
        .validate_choice(current, "account-a", "conversation-a", "fixture-available")
        .is_ok());
}

#[test]
fn a_failed_refresh_does_not_admit_choices_from_the_previous_catalogue() {
    let mut picker = CloudModelPicker::default();
    let request = picker.begin("account-a", "conversation-a");
    picker.accept(request, catalogue("account-a")).unwrap();
    let request = picker.begin("account-a", "conversation-a");
    let mut invalid = catalogue("account-a");
    invalid.models.push(invalid.models[0].clone());
    assert!(picker.accept(request, invalid).is_err());
    assert!(picker
        .validate_choice(request, "account-a", "conversation-a", "fixture-available")
        .is_err());
}
