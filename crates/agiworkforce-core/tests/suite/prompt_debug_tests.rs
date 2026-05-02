use anyhow::Result;
use agiworkforce_core::build_prompt_input;
use agiworkforce_core::config::ConfigBuilder;
use agiworkforce_core::config::ConfigOverrides;
use agiworkforce_protocol::models::ContentItem;
use agiworkforce_protocol::models::ResponseItem;
use agiworkforce_protocol::user_input::UserInput;
use pretty_assertions::assert_eq;
use tempfile::TempDir;

#[tokio::test]
async fn build_prompt_input_includes_context_and_user_message() -> Result<()> {
    let agiworkforce_home = TempDir::new()?;
    let cwd = TempDir::new()?;
    let mut config = ConfigBuilder::default()
        .agiworkforce_home(agiworkforce_home.path().to_path_buf())
        .harness_overrides(ConfigOverrides {
            cwd: Some(cwd.path().to_path_buf()),
            agiworkforce_self_exe: Some(std::env::current_exe()?),
            ..ConfigOverrides::default()
        })
        .build()
        .await?;
    config.user_instructions = Some("Project-specific test instructions".to_string());

    let input = build_prompt_input(
        config,
        vec![UserInput::Text {
            text: "hello from debug prompt".to_string(),
            text_elements: Vec::new(),
        }],
    )
    .await?;

    let expected_user_message = ResponseItem::Message {
        id: None,
        role: "user".to_string(),
        content: vec![ContentItem::InputText {
            text: "hello from debug prompt".to_string(),
        }],
        phase: None,
    };
    assert_eq!(input.last(), Some(&expected_user_message));
    assert!(input.iter().any(|item| {
        let ResponseItem::Message { content, .. } = item else {
            return false;
        };

        content.iter().any(|content_item| {
            let (ContentItem::InputText { text } | ContentItem::OutputText { text }) = content_item
            else {
                return false;
            };
            text.contains("Project-specific test instructions")
        })
    }));

    Ok(())
}
