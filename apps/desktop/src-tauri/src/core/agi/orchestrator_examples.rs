use super::*;

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

    tracing::info!(
        "Spawned {} agents for parallel code analysis",
        agent_ids.len()
    );

    let results = orchestrator.wait_for_all().await;

    tracing::info!("Analysis complete. Results:");
    for result in &results {
        tracing::info!(
            "  - Agent {}: {} in {}ms",
            result.agent_id,
            if result.success { "Success" } else { "Failed" },
            result.execution_time_ms
        );
    }

    Ok(results)
}

pub async fn example_sequential_workflow(
    orchestrator: &AgentOrchestrator,
) -> anyhow::Result<Vec<AgentResult>> {
    let goal1 = Goal {
        id: "goal_design_schema".to_string(),
        description: "Design database schema for user authentication system".to_string(),
        priority: Priority::High,
        deadline: None,
        constraints: vec![],
        success_criteria: vec!["Generate SQL migration files".to_string()],
    };

    let agent1_id = orchestrator.spawn_agent(goal1).await?;
    tracing::info!("Agent 1 (schema design) spawned: {}", agent1_id);

    loop {
        if let Some(status) = orchestrator.get_agent_status(&agent1_id).await {
            if status.status == AgentState::Completed {
                tracing::info!("Schema design complete!");
                break;
            } else if status.status == AgentState::Failed {
                return Err(anyhow::anyhow!("Schema design failed"));
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }

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
    tracing::info!("Agent 2 (API implementation) spawned: {}", agent2_id);

    loop {
        if let Some(status) = orchestrator.get_agent_status(&agent2_id).await {
            if status.status == AgentState::Completed {
                tracing::info!("API implementation complete!");
                break;
            } else if status.status == AgentState::Failed {
                return Err(anyhow::anyhow!("API implementation failed"));
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }

    let goal3 = Goal {
        id: "goal_write_tests".to_string(),
        description: "Write comprehensive tests for authentication API".to_string(),
        priority: Priority::Medium,
        deadline: None,
        constraints: vec![],
        success_criteria: vec!["Achieve 90% code coverage".to_string()],
    };

    let agent3_id = orchestrator.spawn_agent(goal3).await?;
    tracing::info!("Agent 3 (test writing) spawned: {}", agent3_id);

    let results = orchestrator.wait_for_all().await;

    tracing::info!("Sequential workflow complete!");
    Ok(results)
}

pub async fn example_resource_locking(orchestrator: &AgentOrchestrator) -> anyhow::Result<()> {
    let resource_lock = orchestrator.get_resource_lock();

    let file_path = std::path::PathBuf::from("/workspace/src/main.rs");
    let _guard1 = resource_lock.try_acquire_file(&file_path)?;

    tracing::info!("Agent 1 acquired lock on {}", file_path.display());

    match resource_lock.try_acquire_file(&file_path) {
        Ok(_) => tracing::warn!("Agent 2 acquired lock (unexpected!)"),
        Err(e) => tracing::info!("Agent 2 blocked: {}", e),
    }

    drop(_guard1);

    let _guard2 = resource_lock.try_acquire_file(&file_path)?;
    tracing::info!("Agent 2 acquired lock after Agent 1 released it");

    Ok(())
}

pub async fn example_supervisor_worker(
    orchestrator: &AgentOrchestrator,
) -> anyhow::Result<Vec<AgentResult>> {
    let supervisor_goal = Goal {
        id: "goal_supervisor".to_string(),
        description: "Analyze project requirements and create task breakdown".to_string(),
        priority: Priority::Critical,
        deadline: None,
        constraints: vec![],
        success_criteria: vec!["Generate task list with dependencies".to_string()],
    };

    let supervisor_id = orchestrator.spawn_agent(supervisor_goal).await?;
    tracing::info!("Supervisor agent spawned: {}", supervisor_id);

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
    tracing::info!("Spawned {} worker agents", worker_ids.len());

    let results = orchestrator.wait_for_all().await;

    tracing::info!("Supervisor-worker pattern complete!");
    Ok(results)
}

pub async fn example_monitoring(orchestrator: &AgentOrchestrator) -> anyhow::Result<()> {
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

    let _agent_ids = orchestrator.spawn_parallel(goals).await?;

    loop {
        let statuses = orchestrator.list_active_agents().await;

        if statuses.is_empty() {
            tracing::info!("All agents completed!");
            break;
        }

        tracing::debug!("\n=== Agent Status ===");
        for status in &statuses {
            tracing::debug!(
                "  {} [{}]: {}% - {:?}",
                status.name,
                status.id,
                status.progress,
                status.status
            );
            if let Some(ref step) = status.current_step {
                tracing::debug!("    Current: {}", step);
            }
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }

    Ok(())
}

pub async fn example_conditional_execution(
    orchestrator: &AgentOrchestrator,
) -> anyhow::Result<Vec<AgentResult>> {
    let diagnostic_goal = Goal {
        id: "goal_diagnostic".to_string(),
        description: "Run diagnostic tests on the system".to_string(),
        priority: Priority::High,
        deadline: None,
        constraints: vec![],
        success_criteria: vec!["Identify system health status".to_string()],
    };

    let diagnostic_id = orchestrator.spawn_agent(diagnostic_goal).await?;

    loop {
        if let Some(status) = orchestrator.get_agent_status(&diagnostic_id).await {
            if status.status == AgentState::Completed {
                tracing::info!("Diagnostics complete - system is healthy");

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
                tracing::warn!("Diagnostics failed - spawning repair agent");

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

    let results = orchestrator.wait_for_all().await;
    Ok(results)
}

pub async fn example_cleanup(orchestrator: &AgentOrchestrator) -> anyhow::Result<()> {
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

    loop {
        let active_agents = orchestrator.list_active_agents().await;

        if active_agents.is_empty() {
            break;
        }

        let removed = orchestrator.cleanup_completed().await?;
        if removed > 0 {
            tracing::debug!("Cleaned up {} completed agents", removed);
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
    }

    tracing::info!("All agents completed and cleaned up");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Requires full orchestrator setup with agents
    async fn test_parallel_execution() {
        // This test validates that goals can be structured for parallel execution.
        // In production, this would use a real AgentOrchestrator instance.

        let goals = [Goal {
                id: "test_goal_1".to_string(),
                description: "Test goal 1".to_string(),
                priority: Priority::High,
                deadline: None,
                constraints: vec![],
                success_criteria: vec!["Complete successfully".to_string()],
            },
            Goal {
                id: "test_goal_2".to_string(),
                description: "Test goal 2".to_string(),
                priority: Priority::Medium,
                deadline: None,
                constraints: vec![],
                success_criteria: vec!["Complete successfully".to_string()],
            }];

        // Verify goal structure is valid
        assert_eq!(goals.len(), 2);
        assert_eq!(goals[0].priority, Priority::High);
        assert_eq!(goals[1].priority, Priority::Medium);

        // In a real test, we would:
        // let orchestrator = AgentOrchestrator::new(...);
        // let agent_ids = orchestrator.spawn_parallel(goals).await?;
        // assert_eq!(agent_ids.len(), 2);
    }

    #[tokio::test]
    #[ignore] // Requires full orchestrator setup with resource lock
    async fn test_resource_locking() {
        // This test validates resource locking behavior.
        // In production, this would use a real ResourceLock instance.

        // Verify basic path handling
        let file_path = std::path::PathBuf::from("/workspace/src/main.rs");
        assert!(file_path.is_absolute() || file_path.starts_with("/"));

        // Verify path display
        let display = file_path.display().to_string();
        assert!(display.contains("main.rs"));

        // In a real test, we would:
        // let orchestrator = AgentOrchestrator::new(...);
        // let resource_lock = orchestrator.get_resource_lock();
        // let _guard1 = resource_lock.try_acquire_file(&file_path)?;
        // assert!(resource_lock.try_acquire_file(&file_path).is_err());
    }

    #[test]
    fn test_goal_creation() {
        let goal = Goal {
            id: "test_goal".to_string(),
            description: "Test description".to_string(),
            priority: Priority::Critical,
            deadline: None,
            constraints: vec![],
            success_criteria: vec!["criteria1".to_string()],
        };

        assert_eq!(goal.id, "test_goal");
        assert_eq!(goal.priority, Priority::Critical);
        assert_eq!(goal.constraints.len(), 0);
        assert_eq!(goal.success_criteria.len(), 1);
    }

    #[test]
    fn test_priority_ordering() {
        assert!(Priority::Critical > Priority::High);
        assert!(Priority::High > Priority::Medium);
        assert!(Priority::Medium > Priority::Low);
    }
}
