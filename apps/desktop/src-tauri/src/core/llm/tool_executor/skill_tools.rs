//! Execution for the model-facing `skill` tool (progressive disclosure).
//!
//! The disclosure rules live in `core::agi::tools::skill_tool`; this adapter only
//! resolves the loaded catalog from app state and shuttles arguments/results.

use super::*;
use crate::core::agi::tools::{SkillTool, SkillToolInput};
use crate::sys::commands::skills::SkillsState;

impl ToolExecutor {
    pub(super) async fn execute_skill_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let app_handle = self
            .app_handle
            .as_ref()
            .ok_or_else(|| anyhow!("The skill tool requires desktop app context"))?;

        // Snapshot the catalog inside a block: `State` is not held across an await.
        let tool = {
            let skills_state = app_handle
                .try_state::<SkillsState>()
                .ok_or_else(|| anyhow!("Skills are not available in this session"))?;
            SkillTool::from_manager(&skills_state.manager)
        };

        let action = args
            .get("action")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| anyhow!("Missing required 'action' parameter (list or load)"))?;
        let name = args.get("name").and_then(Value::as_str).map(str::to_string);

        let input = SkillToolInput {
            action: action.clone(),
            name: name.clone(),
        };

        match tool.invoke(&input) {
            Ok(content) => Ok(ToolResult {
                success: true,
                data: json!({
                    "success": true,
                    "action": action,
                    "name": name,
                    "content": content,
                }),
                error: None,
                metadata: HashMap::from([
                    ("tool_name".to_string(), json!("skill")),
                    ("action".to_string(), json!(action)),
                ]),
            }),
            // A rejected load (unknown name, unmet requirements, missing consent) is a
            // normal outcome the model must see and recover from, not an executor fault.
            Err(message) => Ok(ToolResult {
                success: false,
                data: json!({
                    "success": false,
                    "action": action,
                    "name": name,
                    "error": message,
                }),
                error: Some(message),
                metadata: HashMap::from([
                    ("tool_name".to_string(), json!("skill")),
                    ("action".to_string(), json!(action)),
                ]),
            }),
        }
    }
}
