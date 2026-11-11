use crate::agent::AgentSession;

pub(super) fn context_tokens_after_turn(
    agent: &AgentSession,
    reserved_output_tokens: usize,
) -> u32 {
    u32::try_from(agent.context_usage(reserved_output_tokens).used_tokens).unwrap_or(u32::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context;
    use crate::models::Message;
    use agiworkforce_agent_core::context::ContextUsageAnchor;

    fn session() -> AgentSession {
        let system = context::SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: Vec::new(),
            monorepo_type: None,
            package_manager: None,
            containerization: Vec::new(),
            editor_configs: Vec::new(),
            os: "test".to_string(),
            shell: "test".to_string(),
        };
        AgentSession::new("test-model", &system, None)
    }

    #[test]
    fn the_reading_is_the_conversation_the_next_request_carries_not_the_turns_sum() {
        let mut agent = session();
        agent
            .messages
            .push(Message::text("user", "Read the README and quote it."));
        agent
            .messages
            .push(Message::text("assistant", "The first line is: hello."));
        let estimated = agent.context_usage(0).used_tokens;
        assert!(estimated > 0);
        agent.context_usage_anchor = Some(ContextUsageAnchor {
            observed_input_tokens: estimated * 2,
            estimated_tokens_at_observation: estimated,
        });
        agent.total_input_tokens = 20_100;
        agent.total_output_tokens = 200;

        let reading = context_tokens_after_turn(&agent, 4_096);
        assert_eq!(
            reading as usize,
            agent.context_usage(4_096).used_tokens,
            "the editor must see the figure /context shows"
        );
        assert_eq!(reading as usize, estimated * 2);
        assert_ne!(
            reading,
            agent.total_input_tokens + agent.total_output_tokens
        );
    }
}
