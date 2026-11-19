use agiworkforce_desktop_gpui::host_defaults::{
    accept_write, admit_models, remembered, write_params, DefaultChange,
};
use agiworkforce_protocol::developer_session::LocalModelListResponse;
use agiworkforce_protocol::developer_session::LocalModelProvider;
use agiworkforce_protocol::developer_session::LocalModelSummary;
use agiworkforce_protocol::developer_session::{
    DeveloperAgentMode, DeveloperReasoningEffort, DeveloperSessionTrustMode, HostModelSummary,
    SettingsReadResponse, SettingsWriteParams,
};

fn current() -> SettingsReadResponse {
    SettingsReadResponse {
        default_model: Some("fixture-current".into()),
        default_effort: Some(DeveloperReasoningEffort::Medium),
        permission_mode: Some(DeveloperAgentMode::Ask),
        user_instructions: Some("do not keep this".into()),
        project_instructions: Some("or this".into()),
        user_instructions_path: "/profile/instructions.md".into(),
        project_instructions_path: "/workspace/.agiworkforce/instructions.md".into(),
        config_path: "/profile/config.toml".into(),
    }
}

fn model(id: &str, provider: &str, trust: DeveloperSessionTrustMode) -> HostModelSummary {
    HostModelSummary {
        id: id.into(),
        provider: provider.into(),
        reachable: true,
        unreachable: None,
        trust_mode: trust,
    }
}

#[test]
fn defaults_save_one_admitted_field_and_drop_instruction_text() {
    let stored = remembered(current());
    assert!(stored.user_instructions.is_none());
    assert!(stored.project_instructions.is_none());
    assert_eq!(stored.user_instructions_path, "/profile/instructions.md");
    let admitted = [model(
        "fixture-next",
        "local",
        DeveloperSessionTrustMode::Local,
    )];
    let change = DefaultChange::Model {
        id: " fixture-next ".into(),
        provider: " local ".into(),
    };
    let params = write_params(&stored, &change, &admitted).unwrap();
    assert_eq!(params.default_model.as_deref(), Some("fixture-next"));
    assert!(params.default_effort.is_none());
    assert!(params.permission_mode.is_none());
    assert!(params.user_instructions.is_none());
    accept_write(&params, &{
        let mut saved = stored.clone();
        saved.default_model = params.default_model.clone();
        saved
    })
    .unwrap();
    assert!(write_params(&stored, &change, &[]).is_err());
    assert!(write_params(
        &stored,
        &DefaultChange::Model {
            id: "fixture-next".into(),
            provider: "local".into(),
        },
        &[
            model("fixture-next", "local", DeveloperSessionTrustMode::Local),
            model("fixture-next", "local", DeveloperSessionTrustMode::Byok),
        ],
    )
    .is_err());
    assert!(write_params(
        &stored,
        &DefaultChange::Model {
            id: "fixture-next".into(),
            provider: "local".into(),
        },
        &[model(
            "fixture-next",
            "local",
            DeveloperSessionTrustMode::Unknown,
        )],
    )
    .is_err());
}

#[test]
fn saved_permission_mode_cannot_bypass_approval_or_skip_confirmation() {
    let stored = remembered(current());
    assert!(write_params(
        &stored,
        &DefaultChange::Mode {
            mode: DeveloperAgentMode::Bypass,
            confirmed: true,
        },
        &[],
    )
    .is_err());
    assert!(write_params(
        &stored,
        &DefaultChange::Mode {
            mode: DeveloperAgentMode::Auto,
            confirmed: false,
        },
        &[],
    )
    .is_err());
    let params = write_params(
        &stored,
        &DefaultChange::Mode {
            mode: DeveloperAgentMode::Auto,
            confirmed: true,
        },
        &[],
    )
    .unwrap();
    assert_eq!(params.permission_mode, Some(DeveloperAgentMode::Auto));
    let mut saved = stored.clone();
    saved.permission_mode = Some(DeveloperAgentMode::Ask);
    assert!(accept_write(&params, &saved).is_err());
    assert!(write_params(
        &stored,
        &DefaultChange::Effort(DeveloperReasoningEffort::Medium),
        &[],
    )
    .is_err());
    let effort = write_params(
        &stored,
        &DefaultChange::Effort(DeveloperReasoningEffort::High),
        &[],
    )
    .unwrap();
    assert_eq!(effort.default_effort, Some(DeveloperReasoningEffort::High));
    let mut leaked = effort;
    leaked.project_instructions = Some("rewrite".into());
    assert!(accept_write(&leaked, &stored).is_err());
    let _ = SettingsWriteParams::default();
}

#[test]
fn discovered_local_models_join_the_host_list_once() {
    let admitted = admit_models(LocalModelListResponse {
        models: vec![
            LocalModelSummary {
                id: "fixture-local".into(),
                provider: LocalModelProvider::Ollama,
            },
            LocalModelSummary {
                id: "fixture-listed".into(),
                provider: LocalModelProvider::Ollama,
            },
        ],
        host_models: vec![model(
            "fixture-listed",
            "ollama",
            DeveloperSessionTrustMode::Local,
        )],
        local_servers: Vec::new(),
    });
    assert_eq!(admitted.len(), 2);
    assert_eq!(admitted[0].id, "fixture-listed");
    assert_eq!(admitted[1].provider, "ollama");
}
