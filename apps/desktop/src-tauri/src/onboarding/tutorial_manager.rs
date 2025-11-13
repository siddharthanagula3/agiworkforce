use super::*;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum TutorialError {
    #[error("Tutorial not found: {0}")]
    NotFound(String),
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("Prerequisite not completed: {0}")]
    PrerequisiteNotMet(String),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

pub struct TutorialManager {
    db: Arc<Mutex<Connection>>,
    tutorials: Vec<Tutorial>,
}

impl TutorialManager {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        let tutorials = Self::create_all_tutorials();
        Self { db, tutorials }
    }

    /// Get all available tutorials
    pub fn get_tutorials(&self) -> Vec<Tutorial> {
        self.tutorials.clone()
    }

    /// Get tutorials by category
    pub fn get_tutorials_by_category(&self, category: TutorialCategory) -> Vec<Tutorial> {
        self.tutorials
            .iter()
            .filter(|t| t.category == category)
            .cloned()
            .collect()
    }

    /// Get tutorial by ID
    pub fn get_tutorial(&self, tutorial_id: &str) -> Result<Tutorial, TutorialError> {
        self.tutorials
            .iter()
            .find(|t| t.id == tutorial_id)
            .cloned()
            .ok_or_else(|| TutorialError::NotFound(tutorial_id.to_string()))
    }

    /// Check if user can start a tutorial (prerequisites met)
    pub fn can_start_tutorial(&self, user_id: &str, tutorial_id: &str) -> Result<bool, TutorialError> {
        let tutorial = self.get_tutorial(tutorial_id)?;

        if tutorial.prerequisites.is_empty() {
            return Ok(true);
        }

        let conn = self.db.lock().unwrap();
        for prereq_id in &tutorial.prerequisites {
            let completed: bool = conn
                .query_row(
                    "SELECT COUNT(*) > 0 FROM tutorial_progress
                     WHERE user_id = ?1 AND tutorial_id = ?2 AND completed_at IS NOT NULL",
                    [user_id, prereq_id],
                    |row| row.get(0),
                )
                .unwrap_or(false);

            if !completed {
                return Ok(false);
            }
        }

        Ok(true)
    }

    /// Get recommended next tutorial for user
    pub fn get_recommended_tutorial(&self, user_id: &str) -> Option<Tutorial> {
        let conn = self.db.lock().ok()?;

        // Get completed tutorial IDs
        let mut stmt = conn
            .prepare("SELECT tutorial_id FROM tutorial_progress WHERE user_id = ?1 AND completed_at IS NOT NULL")
            .ok()?;

        let completed: Vec<String> = stmt
            .query_map([user_id], |row| row.get(0))
            .ok()?
            .filter_map(Result::ok)
            .collect();

        // Find first tutorial that's not completed and has prerequisites met
        for tutorial in &self.tutorials {
            if completed.contains(&tutorial.id) {
                continue;
            }

            let can_start = self.can_start_tutorial(user_id, &tutorial.id).unwrap_or(false);
            if can_start {
                return Some(tutorial.clone());
            }
        }

        None
    }

    /// Create all built-in tutorials
    fn create_all_tutorials() -> Vec<Tutorial> {
        vec![
            Self::create_basic_tutorial(),
            Self::create_agent_template_tutorial(),
            Self::create_workflow_tutorial(),
            Self::create_team_tutorial(),
            Self::create_browser_automation_tutorial(),
            Self::create_database_integration_tutorial(),
        ]
    }

    fn create_basic_tutorial() -> Tutorial {
        Tutorial {
            id: "basic_getting_started".to_string(),
            title: "Getting Started with AGI Workforce".to_string(),
            description: "Learn the basics of creating and running your first automation. This tutorial covers goal creation, execution, and viewing results.".to_string(),
            category: TutorialCategory::GettingStarted,
            difficulty: TutorialDifficulty::Beginner,
            estimated_minutes: 5,
            steps: vec![
                TutorialStep {
                    id: "step1_create_goal".to_string(),
                    title: "Create Your First Goal".to_string(),
                    description: "Let's create a simple automation goal. Goals are high-level tasks you want the AI to accomplish.".to_string(),
                    component: "goal-input".to_string(),
                    action_required: ActionType::Input {
                        field: "goal-input".to_string(),
                        value: Some("Read my emails and summarize them".to_string()),
                        placeholder: Some("Enter your automation goal...".to_string()),
                    },
                    help_text: "Type a task you want the AI to perform. Be specific and clear about what you want to accomplish.".to_string(),
                    estimated_duration_seconds: 60,
                    validation_criteria: Some(ValidationCriteria {
                        check_type: ValidationType::ValueEquals,
                        expected_value: "goal-input".to_string(),
                    }),
                },
                TutorialStep {
                    id: "step2_understand_planning".to_string(),
                    title: "Understand AI Planning".to_string(),
                    description: "The AI will break down your goal into executable steps. Watch as it plans the automation workflow.".to_string(),
                    component: "planning-panel".to_string(),
                    action_required: ActionType::Observe,
                    help_text: "The AI analyzes your goal and creates a step-by-step plan. This ensures efficient and accurate execution.".to_string(),
                    estimated_duration_seconds: 30,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "step3_execute_goal".to_string(),
                    title: "Execute the Goal".to_string(),
                    description: "Click the execute button to run your automation. The AI will execute each planned step.".to_string(),
                    component: "execute-button".to_string(),
                    action_required: ActionType::Click {
                        selector: "[data-testid='execute-button']".to_string(),
                    },
                    help_text: "The AI will now execute the steps needed to accomplish your goal. You can monitor progress in real-time.".to_string(),
                    estimated_duration_seconds: 45,
                    validation_criteria: Some(ValidationCriteria {
                        check_type: ValidationType::ElementExists,
                        expected_value: "execution-progress".to_string(),
                    }),
                },
                TutorialStep {
                    id: "step4_view_outcomes".to_string(),
                    title: "View Outcomes".to_string(),
                    description: "See the results and measurable outcomes of your automation.".to_string(),
                    component: "outcomes-panel".to_string(),
                    action_required: ActionType::Complete,
                    help_text: "Outcomes show measurable results like files created, emails sent, or data processed. Review them to verify success.".to_string(),
                    estimated_duration_seconds: 60,
                    validation_criteria: None,
                },
            ],
            prerequisites: vec![],
            rewards: vec!["badge_first_automation".to_string()],
            tags: vec!["beginner".to_string(), "essential".to_string()],
        }
    }

    fn create_agent_template_tutorial() -> Tutorial {
        Tutorial {
            id: "agent_templates".to_string(),
            title: "Using Agent Templates".to_string(),
            description: "Learn how to use pre-built agent templates to quickly deploy common automation workflows without starting from scratch.".to_string(),
            category: TutorialCategory::AgentTemplates,
            difficulty: TutorialDifficulty::Beginner,
            estimated_minutes: 10,
            steps: vec![
                TutorialStep {
                    id: "browse_templates".to_string(),
                    title: "Browse Template Marketplace".to_string(),
                    description: "Explore the agent template marketplace to find pre-configured agents for common tasks.".to_string(),
                    component: "template-marketplace".to_string(),
                    action_required: ActionType::Navigate {
                        route: "/templates".to_string(),
                    },
                    help_text: "Templates provide pre-configured agents for tasks like invoice processing, email automation, and data extraction.".to_string(),
                    estimated_duration_seconds: 60,
                    validation_criteria: Some(ValidationCriteria {
                        check_type: ValidationType::StateMatches,
                        expected_value: "route:/templates".to_string(),
                    }),
                },
                TutorialStep {
                    id: "filter_templates".to_string(),
                    title: "Filter by Category".to_string(),
                    description: "Use filters to find templates relevant to your needs.".to_string(),
                    component: "template-filters".to_string(),
                    action_required: ActionType::Click {
                        selector: "[data-testid='category-filter']".to_string(),
                    },
                    help_text: "Templates are organized by category: Productivity, Finance, Data Processing, Marketing, and more.".to_string(),
                    estimated_duration_seconds: 45,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "preview_template".to_string(),
                    title: "Preview Template Details".to_string(),
                    description: "Click on a template to see its workflow, required tools, and example outputs.".to_string(),
                    component: "template-detail-modal".to_string(),
                    action_required: ActionType::Click {
                        selector: "[data-testid='template-card']:first-child".to_string(),
                    },
                    help_text: "Review the template's workflow diagram, tool requirements, and success criteria before installing.".to_string(),
                    estimated_duration_seconds: 90,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "install_template".to_string(),
                    title: "Install a Template".to_string(),
                    description: "Install your chosen template to add it to your agent library.".to_string(),
                    component: "install-template-button".to_string(),
                    action_required: ActionType::Click {
                        selector: "[data-testid='install-template']".to_string(),
                    },
                    help_text: "Templates can be customized after installation. You can modify prompts, tools, and workflows.".to_string(),
                    estimated_duration_seconds: 30,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "customize_template".to_string(),
                    title: "Customize Template".to_string(),
                    description: "Personalize the template to fit your specific needs.".to_string(),
                    component: "template-editor".to_string(),
                    action_required: ActionType::Complete,
                    help_text: "Adjust default prompts, add custom tools, or modify the workflow to match your requirements.".to_string(),
                    estimated_duration_seconds: 120,
                    validation_criteria: None,
                },
            ],
            prerequisites: vec!["basic_getting_started".to_string()],
            rewards: vec!["badge_template_user".to_string(), "unlock_advanced_templates".to_string()],
            tags: vec!["templates".to_string(), "efficiency".to_string()],
        }
    }

    fn create_workflow_tutorial() -> Tutorial {
        Tutorial {
            id: "workflow_orchestration".to_string(),
            title: "Workflow Orchestration".to_string(),
            description: "Master the visual workflow builder to create complex multi-step automations with conditional logic and parallel execution.".to_string(),
            category: TutorialCategory::WorkflowOrchestration,
            difficulty: TutorialDifficulty::Intermediate,
            estimated_minutes: 15,
            steps: vec![
                TutorialStep {
                    id: "open_workflow_builder".to_string(),
                    title: "Open Workflow Builder".to_string(),
                    description: "Navigate to the workflow builder interface.".to_string(),
                    component: "workflow-builder".to_string(),
                    action_required: ActionType::Navigate {
                        route: "/workflows/new".to_string(),
                    },
                    help_text: "The workflow builder lets you visually design complex automations with drag-and-drop nodes.".to_string(),
                    estimated_duration_seconds: 30,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "add_trigger_node".to_string(),
                    title: "Add Trigger Node".to_string(),
                    description: "Every workflow starts with a trigger - an event that starts the automation.".to_string(),
                    component: "node-palette".to_string(),
                    action_required: ActionType::Click {
                        selector: "[data-node-type='trigger']".to_string(),
                    },
                    help_text: "Triggers can be scheduled (time-based), event-driven (file created, email received), or manual.".to_string(),
                    estimated_duration_seconds: 60,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "add_action_nodes".to_string(),
                    title: "Add Action Nodes".to_string(),
                    description: "Add action nodes to define what happens in your workflow.".to_string(),
                    component: "canvas".to_string(),
                    action_required: ActionType::Click {
                        selector: "[data-node-type='action']".to_string(),
                    },
                    help_text: "Action nodes represent tasks like reading files, making API calls, or processing data.".to_string(),
                    estimated_duration_seconds: 90,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "connect_nodes".to_string(),
                    title: "Connect Nodes".to_string(),
                    description: "Draw connections between nodes to define the flow of data and execution.".to_string(),
                    component: "canvas".to_string(),
                    action_required: ActionType::Complete,
                    help_text: "Drag from a node's output port to another node's input port to create connections.".to_string(),
                    estimated_duration_seconds: 120,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "add_conditional_logic".to_string(),
                    title: "Add Conditional Logic".to_string(),
                    description: "Use decision nodes to add if/else logic to your workflow.".to_string(),
                    component: "node-palette".to_string(),
                    action_required: ActionType::Click {
                        selector: "[data-node-type='condition']".to_string(),
                    },
                    help_text: "Decision nodes let you branch workflows based on conditions like file size, API response, or data values.".to_string(),
                    estimated_duration_seconds: 90,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "test_workflow".to_string(),
                    title: "Test Your Workflow".to_string(),
                    description: "Run your workflow in test mode to verify it works as expected.".to_string(),
                    component: "test-button".to_string(),
                    action_required: ActionType::Click {
                        selector: "[data-testid='test-workflow']".to_string(),
                    },
                    help_text: "Test mode shows real-time execution with data flowing through nodes. Fix any errors before deployment.".to_string(),
                    estimated_duration_seconds: 120,
                    validation_criteria: None,
                },
            ],
            prerequisites: vec!["basic_getting_started".to_string()],
            rewards: vec!["badge_workflow_builder".to_string(), "unlock_parallel_execution".to_string()],
            tags: vec!["workflow".to_string(), "advanced".to_string()],
        }
    }

    fn create_team_tutorial() -> Tutorial {
        Tutorial {
            id: "team_collaboration".to_string(),
            title: "Team Collaboration".to_string(),
            description: "Learn how to create teams, share workflows, and collaborate with team members on automation projects.".to_string(),
            category: TutorialCategory::TeamCollaboration,
            difficulty: TutorialDifficulty::Intermediate,
            estimated_minutes: 12,
            steps: vec![
                TutorialStep {
                    id: "create_team".to_string(),
                    title: "Create a Team".to_string(),
                    description: "Set up your first team to collaborate with colleagues.".to_string(),
                    component: "teams-page".to_string(),
                    action_required: ActionType::Navigate {
                        route: "/teams/new".to_string(),
                    },
                    help_text: "Teams allow you to share workflows, templates, and knowledge bases with colleagues.".to_string(),
                    estimated_duration_seconds: 60,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "invite_members".to_string(),
                    title: "Invite Team Members".to_string(),
                    description: "Add team members by email and assign roles.".to_string(),
                    component: "invite-modal".to_string(),
                    action_required: ActionType::Input {
                        field: "member-email".to_string(),
                        value: None,
                        placeholder: Some("colleague@company.com".to_string()),
                    },
                    help_text: "Assign roles: Viewer (read-only), Editor (can modify), Admin (full access).".to_string(),
                    estimated_duration_seconds: 90,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "share_workflow".to_string(),
                    title: "Share a Workflow".to_string(),
                    description: "Share one of your workflows with the team.".to_string(),
                    component: "workflow-list".to_string(),
                    action_required: ActionType::Click {
                        selector: "[data-testid='share-workflow']".to_string(),
                    },
                    help_text: "Shared workflows can be viewed, edited, or executed by team members based on their role.".to_string(),
                    estimated_duration_seconds: 60,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "view_team_activity".to_string(),
                    title: "View Team Activity".to_string(),
                    description: "Monitor team member activity and workflow executions.".to_string(),
                    component: "activity-feed".to_string(),
                    action_required: ActionType::Complete,
                    help_text: "The activity feed shows who executed workflows, modified templates, or shared resources.".to_string(),
                    estimated_duration_seconds: 90,
                    validation_criteria: None,
                },
            ],
            prerequisites: vec!["workflow_orchestration".to_string()],
            rewards: vec!["badge_team_leader".to_string()],
            tags: vec!["collaboration".to_string(), "teams".to_string()],
        }
    }

    fn create_browser_automation_tutorial() -> Tutorial {
        Tutorial {
            id: "browser_automation".to_string(),
            title: "Browser Automation Basics".to_string(),
            description: "Automate web interactions like form filling, data extraction, and web scraping using the browser automation tools.".to_string(),
            category: TutorialCategory::AdvancedFeatures,
            difficulty: TutorialDifficulty::Intermediate,
            estimated_minutes: 18,
            steps: vec![
                TutorialStep {
                    id: "launch_browser".to_string(),
                    title: "Launch Automated Browser".to_string(),
                    description: "Start a browser session that can be controlled by your automations.".to_string(),
                    component: "browser-tools".to_string(),
                    action_required: ActionType::Click {
                        selector: "[data-testid='launch-browser']".to_string(),
                    },
                    help_text: "The automated browser supports Chromium, Firefox, and WebKit engines.".to_string(),
                    estimated_duration_seconds: 45,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "navigate_to_url".to_string(),
                    title: "Navigate to URL".to_string(),
                    description: "Use the navigate action to go to a webpage.".to_string(),
                    component: "browser-console".to_string(),
                    action_required: ActionType::Input {
                        field: "url-input".to_string(),
                        value: Some("https://example.com".to_string()),
                        placeholder: Some("Enter URL...".to_string()),
                    },
                    help_text: "You can navigate to any URL. The browser supports JavaScript, cookies, and modern web features.".to_string(),
                    estimated_duration_seconds: 60,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "inspect_elements".to_string(),
                    title: "Inspect Page Elements".to_string(),
                    description: "Use the element picker to select elements on the page.".to_string(),
                    component: "element-picker".to_string(),
                    action_required: ActionType::Click {
                        selector: "[data-testid='element-picker']".to_string(),
                    },
                    help_text: "Click on any element to get its selector (CSS, XPath, or ID). Use this to interact with elements.".to_string(),
                    estimated_duration_seconds: 120,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "fill_form".to_string(),
                    title: "Fill Out a Form".to_string(),
                    description: "Automate form filling by typing into input fields.".to_string(),
                    component: "browser-console".to_string(),
                    action_required: ActionType::Complete,
                    help_text: "Forms can be filled automatically using the 'type' action with a selector and text value.".to_string(),
                    estimated_duration_seconds: 90,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "extract_data".to_string(),
                    title: "Extract Page Data".to_string(),
                    description: "Use selectors to extract text, attributes, or structured data from the page.".to_string(),
                    component: "data-extractor".to_string(),
                    action_required: ActionType::Click {
                        selector: "[data-testid='extract-data']".to_string(),
                    },
                    help_text: "Extracted data can be saved to files, databases, or passed to other workflow steps.".to_string(),
                    estimated_duration_seconds: 120,
                    validation_criteria: None,
                },
            ],
            prerequisites: vec!["basic_getting_started".to_string()],
            rewards: vec!["badge_web_scraper".to_string(), "unlock_stealth_mode".to_string()],
            tags: vec!["browser".to_string(), "automation".to_string(), "advanced".to_string()],
        }
    }

    fn create_database_integration_tutorial() -> Tutorial {
        Tutorial {
            id: "database_integration".to_string(),
            title: "Database Integration".to_string(),
            description: "Connect to databases, run queries, and integrate database operations into your automation workflows.".to_string(),
            category: TutorialCategory::Integrations,
            difficulty: TutorialDifficulty::Advanced,
            estimated_minutes: 20,
            steps: vec![
                TutorialStep {
                    id: "add_connection".to_string(),
                    title: "Add Database Connection".to_string(),
                    description: "Configure a new database connection with credentials.".to_string(),
                    component: "database-connections".to_string(),
                    action_required: ActionType::Navigate {
                        route: "/integrations/databases".to_string(),
                    },
                    help_text: "Supported databases: PostgreSQL, MySQL, SQLite, MongoDB, and more. Credentials are encrypted.".to_string(),
                    estimated_duration_seconds: 120,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "test_connection".to_string(),
                    title: "Test Connection".to_string(),
                    description: "Verify your database connection works correctly.".to_string(),
                    component: "connection-test".to_string(),
                    action_required: ActionType::Click {
                        selector: "[data-testid='test-connection']".to_string(),
                    },
                    help_text: "The test checks network connectivity, authentication, and database availability.".to_string(),
                    estimated_duration_seconds: 60,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "write_query".to_string(),
                    title: "Write Your First Query".to_string(),
                    description: "Use the SQL editor to write and test queries.".to_string(),
                    component: "sql-editor".to_string(),
                    action_required: ActionType::Input {
                        field: "sql-query".to_string(),
                        value: Some("SELECT * FROM users LIMIT 10".to_string()),
                        placeholder: Some("Write SQL query...".to_string()),
                    },
                    help_text: "The editor provides syntax highlighting, autocomplete, and schema inspection.".to_string(),
                    estimated_duration_seconds: 180,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "parameterize_query".to_string(),
                    title: "Use Query Parameters".to_string(),
                    description: "Make queries dynamic with parameters passed from workflow steps.".to_string(),
                    component: "sql-editor".to_string(),
                    action_required: ActionType::Complete,
                    help_text: "Use {{variable_name}} syntax to inject workflow variables into queries safely (prevents SQL injection).".to_string(),
                    estimated_duration_seconds: 120,
                    validation_criteria: None,
                },
                TutorialStep {
                    id: "integrate_workflow".to_string(),
                    title: "Add Query to Workflow".to_string(),
                    description: "Add your database query as a step in an automation workflow.".to_string(),
                    component: "workflow-builder".to_string(),
                    action_required: ActionType::Complete,
                    help_text: "Query results can be used by subsequent workflow steps or saved to files.".to_string(),
                    estimated_duration_seconds: 120,
                    validation_criteria: None,
                },
            ],
            prerequisites: vec!["workflow_orchestration".to_string()],
            rewards: vec!["badge_data_engineer".to_string(), "unlock_batch_queries".to_string()],
            tags: vec!["database".to_string(), "integration".to_string(), "advanced".to_string()],
        }
    }
}
