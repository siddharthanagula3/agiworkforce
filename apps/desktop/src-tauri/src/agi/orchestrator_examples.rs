/// Example usage patterns for the AgentOrchestrator
///
/// This file demonstrates common patterns for using parallel agent orchestration
/// to achieve complex goals with multiple concurrent agents.

#![allow(dead_code)]

use super::*;
use crate::automation::AutomationService;
use crate::router::LLMRouter;
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;

/// Example 1: Parallel Code Analysis
///
/// Spawns 4 agents to analyze different aspects of a codebase simultaneously
pub async fn example_parallel_code_analysis(
    orchestrator: &AgentOrchestrator,
) -> anyhow::Result<Vec<AgentResult>> {
    let goals = vec![
        Goal {
            id: "goal_analysis_bugs".to_string(),
            description: "Analyze codebase for potential bugs and security vulnerabilities"
                .to_string(),
            priority: Priority::High,
            deadline: None,
            constraints: vec![],
            success_criteria: vec![
                "Identify at least 10 potential issues".to_string(),
                "Categorize by severity".to_string(),
            ],
        },
        Goal {
            id: "goal_analysis_tests".to_string(),
            description: "Analyze test coverage and suggest missing tests".to_string(),
            priority: Priority::Medium,
            deadline: None,
            constraints: vec![],
            success_criteria: vec!["Generate test coverage report".to_string()],
        },
        Goal {
            id: "goal_analysis_docs".to_string(),
            description: "Review documentation quality and identify gaps".to_string(),
            priority: Priority::Low,
            deadline: None,
            constraints: vec![],
            success_criteria: vec!["List undocumented functions".to_string()],
        },
        Goal {
            id: "goal_analysis_perf".to_string(),
            description: "Identify performance bottlenecks and optimization opportunities"
                .to_string(),
            priority: Priority::Medium,
            deadline: None,
            constraints: vec![],
            success_criteria: vec!["Profile hot code paths".to_string()],
        },
    ];

    let agent_ids = orchestrator.spawn_parallel(goals).await?;

    println!("Spawned {} agents for parallel code analysis", agent_ids.len());

    // Wait for all agents to complete
    let results = orchestrator.wait_for_all().await;

    println!("Analysis complete. Results:");
    for result in &results {
        println!(
            "  - Agent {}: {} in {}ms",
            result.agent_id,
            if result.success { "Success" } else { "Failed" },
            result.execution_time_ms
        );
    }

    Ok(results)
}

/// Example 2: Sequential Workflow
///
/// Demonstrates sequential agent execution where each agent depends on previous results
pub async fn example_sequential_workflow(
    orchestrator: &AgentOrchestrator,
) -> anyhow::Result<Vec<AgentResult>> {
    // Step 1: Design database schema
    let goal1 = Goal {
        id: "goal_design_schema".to_string(),
        description: "Design database schema for user authentication system".to_string(),
        priority: Priority::High,
        deadline: None,
        constraints: vec![],
        success_criteria: vec!["Generate SQL migration files".to_string()],
    };

    let agent1_id = orchestrator.spawn_agent(goal1).await?;
    println!("Agent 1 (schema design) spawned: {}", agent1_id);

    // Wait for agent 1 to complete
    loop {
        if let Some(status) = orchestrator.get_agent_status(&agent1_id).await {
            if status.status == AgentState::Completed {
                println!("Schema design complete!");
                break;
            } else if status.status == AgentState::Failed {
                return Err(anyhow::anyhow!("Schema design failed"));
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }

    // Step 2: Implement backend API (depends on schema)
    let goal2 = Goal {
        id: "goal_implement_api".to_string(),
        description: "Implement REST API endpoints for authentication using the designed schema"
            .to_string(),
        priority: Priority::High,
        deadline: None,
        constraints: vec![],
        success_criteria: vec!["Generate API handlers".to_string()],
    };

    let agent2_id = orchestrator.spawn_agent(goal2).await?;
    println!("Agent 2 (API implementation) spawned: {}", agent2_id);

    // Wait for agent 2 to complete
    loop {
        if let Some(status) = orchestrator.get_agent_status(&agent2_id).await {
            if status.status == AgentState::Completed {
                println!("API implementation complete!");
                break;
            } else if status.status == AgentState::Failed {
                return Err(anyhow::anyhow!("API implementation failed"));
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }

    // Step 3: Write tests (depends on API)
    let goal3 = Goal {
        id: "goal_write_tests".to_string(),
        description: "Write comprehensive tests for authentication API".to_string(),
        priority: Priority::Medium,
        deadline: None,
        constraints: vec![],
        success_criteria: vec!["Achieve 90% code coverage".to_string()],
    };

    let agent3_id = orchestrator.spawn_agent(goal3).await?;
    println!("Agent 3 (test writing) spawned: {}", agent3_id);

    // Wait for all to complete
    let results = orchestrator.wait_for_all().await;

    println!("Sequential workflow complete!");
    Ok(results)
}

/// Example 3: Resource Locking
///
/// Demonstrates how to prevent conflicts when multiple agents need the same resources
pub async fn example_resource_locking(
    orchestrator: &AgentOrchestrator,
) -> anyhow::Result<()> {
    let resource_lock = orchestrator.get_resource_lock();

    // Agent 1 tries to acquire file lock
    let file_path = std::path::PathBuf::from("/workspace/src/main.rs");
    let _guard1 = resource_lock.try_acquire_file(&file_path)?;

    println!("Agent 1 acquired lock on {}", file_path.display());

    // Agent 2 tries to acquire the same file lock (will fail)
    match resource_lock.try_acquire_file(&file_path) {
        Ok(_) => println!("Agent 2 acquired lock (unexpected!)"),
        Err(e) => println!("Agent 2 blocked: {}", e),
    }

    // Release lock
    drop(_guard1);

    // Now Agent 2 can acquire the lock
    let _guard2 = resource_lock.try_acquire_file(&file_path)?;
    println!("Agent 2 acquired lock after Agent 1 released it");

    Ok(())
}

/// Example 4: Supervisor-Worker Pattern
///
/// One supervisor agent delegates work to multiple worker agents
pub async fn example_supervisor_worker(
    orchestrator: &AgentOrchestrator,
) -> anyhow::Result<Vec<AgentResult>> {
    // Supervisor agent analyzes the task and breaks it down
    let supervisor_goal = Goal {
        id: "goal_supervisor".to_string(),
        description: "Analyze project requirements and create task breakdown".to_string(),
        priority: Priority::Critical,
        deadline: None,
        constraints: vec![],
        success_criteria: vec!["Generate task list with dependencies".to_string()],
    };

    let supervisor_id = orchestrator.spawn_agent(supervisor_goal).await?;
    println!("Supervisor agent spawned: {}", supervisor_id);

    // Wait for supervisor to complete
    loop {
        if let Some(status) = orchestrator.get_agent_status(&supervisor_id).await {
            if status.status == AgentState::Completed {
                break;
            } else if status.status == AgentState::Failed {
                return Err(anyhow::anyhow!("Supervisor failed"));
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }

    // Now spawn worker agents based on supervisor's breakdown
    let worker_goals = vec![
        Goal {
            id: "goal_worker_1".to_string(),
            description: "Implement user registration feature".to_string(),
            priority: Priority::High,
            deadline: None,
            constraints: vec![],
            success_criteria: vec![],
        },
        Goal {
            id: "goal_worker_2".to_string(),
            description: "Implement login feature".to_string(),
            priority: Priority::High,
            deadline: None,
            constraints: vec![],
            success_criteria: vec![],
        },
        Goal {
            id: "goal_worker_3".to_string(),
            description: "Implement password reset feature".to_string(),
            priority: Priority::Medium,
            deadline: None,
            constraints: vec![],
            success_criteria: vec![],
        },
    ];

    let worker_ids = orchestrator.spawn_parallel(worker_goals).await?;
    println!("Spawned {} worker agents", worker_ids.len());

    // Wait for all workers to complete
    let results = orchestrator.wait_for_all().await;

    println!("Supervisor-worker pattern complete!");
    Ok(results)
}

/// Example 5: Monitoring and Status Updates
///
/// Demonstrates real-time monitoring of agent progress
pub async fn example_monitoring(orchestrator: &AgentOrchestrator) -> anyhow::Result<()> {
    // Spawn some agents
    let goals = vec![
        Goal {
            id: "goal_task_1".to_string(),
            description: "Task 1: Long-running analysis".to_string(),
            priority: Priority::Medium,
            deadline: None,
            constraints: vec![],
            success_criteria: vec![],
        },
        Goal {
            id: "goal_task_2".to_string(),
            description: "Task 2: Data processing".to_string(),
            priority: Priority::Medium,
            deadline: None,
            constraints: vec![],
            success_criteria: vec![],
        },
    ];

    let agent_ids = orchestrator.spawn_parallel(goals).await?;

    // Monitor progress
    loop {
        let statuses = orchestrator.list_active_agents().await;

        if statuses.is_empty() {
            println!("All agents completed!");
            break;
        }

        println!("\n=== Agent Status ===");
        for status in &statuses {
            println!(
                "  {} [{}]: {}% - {:?}",
                status.name, status.id, status.progress, status.status
            );
            if let Some(ref step) = status.current_step {
                println!("    Current: {}", step);
            }
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }

    Ok(())
}

/// Example 6: Conditional Execution
///
/// Execute agents conditionally based on previous results
pub async fn example_conditional_execution(
    orchestrator: &AgentOrchestrator,
) -> anyhow::Result<Vec<AgentResult>> {
    // First, run a diagnostic agent
    let diagnostic_goal = Goal {
        id: "goal_diagnostic".to_string(),
        description: "Run diagnostic tests on the system".to_string(),
        priority: Priority::High,
        deadline: None,
        constraints: vec![],
        success_criteria: vec!["Identify system health status".to_string()],
    };

    let diagnostic_id = orchestrator.spawn_agent(diagnostic_goal).await?;

    // Wait for diagnostic to complete
    loop {
        if let Some(status) = orchestrator.get_agent_status(&diagnostic_id).await {
            if status.status == AgentState::Completed {
                println!("Diagnostics complete - system is healthy");

                // Conditionally spawn optimization agent
                let optimization_goal = Goal {
                    id: "goal_optimize".to_string(),
                    description: "Optimize system performance".to_string(),
                    priority: Priority::Low,
                    deadline: None,
                    constraints: vec![],
                    success_criteria: vec![],
                };

                orchestrator.spawn_agent(optimization_goal).await?;
                break;
            } else if status.status == AgentState::Failed {
                println!("Diagnostics failed - spawning repair agent");

                // Spawn repair agent instead
                let repair_goal = Goal {
                    id: "goal_repair".to_string(),
                    description: "Repair system issues".to_string(),
                    priority: Priority::Critical,
                    deadline: None,
                    constraints: vec![],
                    success_criteria: vec![],
                };

                orchestrator.spawn_agent(repair_goal).await?;
                break;
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }

    // Wait for all agents to complete
    let results = orchestrator.wait_for_all().await;
    Ok(results)
}

/// Example 7: Cleanup and Resource Management
///
/// Demonstrates proper cleanup of completed agents
pub async fn example_cleanup(orchestrator: &AgentOrchestrator) -> anyhow::Result<()> {
    // Spawn multiple agents
    let goals = vec![
        Goal {
            id: "goal_cleanup_1".to_string(),
            description: "Quick task 1".to_string(),
            priority: Priority::Low,
            deadline: None,
            constraints: vec![],
            success_criteria: vec![],
        },
        Goal {
            id: "goal_cleanup_2".to_string(),
            description: "Quick task 2".to_string(),
            priority: Priority::Low,
            deadline: None,
            constraints: vec![],
            success_criteria: vec![],
        },
    ];

    orchestrator.spawn_parallel(goals).await?;

    // Periodically cleanup completed agents
    loop {
        let active_agents = orchestrator.list_active_agents().await;

        if active_agents.is_empty() {
            break;
        }

        // Cleanup any completed agents
        let removed = orchestrator.cleanup_completed().await?;
        if removed > 0 {
            println!("Cleaned up {} completed agents", removed);
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
    }

    println!("All agents completed and cleaned up");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: These are integration-style tests that would require full setup
    // They are marked as ignored by default and should be run manually

    #[tokio::test]
    #[ignore]
    async fn test_parallel_execution() {
        // Setup would go here
        // let orchestrator = setup_orchestrator();
        // example_parallel_code_analysis(&orchestrator).await.unwrap();
    }

    #[tokio::test]
    #[ignore]
    async fn test_resource_locking() {
        // Setup would go here
        // let orchestrator = setup_orchestrator();
        // example_resource_locking(&orchestrator).await.unwrap();
    }
}
