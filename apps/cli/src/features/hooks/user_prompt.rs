use super::hooks::{
    aggregate_results, run_hooks, HookAggregateOutcome, HookEvent, HookInput, HooksConfig,
};

pub(crate) async fn check_user_prompt(
    config: &HooksConfig,
    session_id: &str,
    model: &str,
    prompt: &str,
) -> std::result::Result<(), String> {
    let event = HookEvent::UserPromptSubmit;
    let results = run_hooks(
        config,
        event,
        &HookInput {
            event: event.to_string(),
            session_id: Some(session_id.to_owned()),
            model: Some(model.to_owned()),
            tool_name: None,
            tool_args: None,
            tool_output: None,
            message: Some(prompt.to_owned()),
            tool_execution: None,
        },
    )
    .await;
    match aggregate_results(&results) {
        HookAggregateOutcome::Continue => Ok(()),
        HookAggregateOutcome::Blocked { reasons } => {
            let detail = reasons.join(". ");
            let detail = crate::terminal_text::sanitize_terminal_text(&detail);
            Err(format!(
                "A UserPromptSubmit hook blocked this message. {detail}"
            ))
        }
        HookAggregateOutcome::Stop => Err("A UserPromptSubmit hook stopped this message.".into()),
    }
}
