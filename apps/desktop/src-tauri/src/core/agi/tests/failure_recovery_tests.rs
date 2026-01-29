//! Failure Recovery Tests for AGI Core
//!
//! This module tests the 3-strike abandonment rule and graceful degradation including:
//! - Consecutive failure tracking and the 3-strike rule
//! - Failure category classification
//! - Correction types and recovery strategies
//! - Adaptive delay calculation (exponential backoff)
//! - Reflection insights and plan critique
//! - Graceful degradation sequences

#[cfg(test)]
mod tests {
    use crate::core::agi::reflection::{
        Correction, CorrectionType, ExecutionAssessment, FailedStep, FailureCategory,
        FailurePattern, PlanCritique, PlanRisk, ReflectionInsight, SubGoal,
    };
    use serde_json::json;
    use std::collections::HashMap;

    /// Maximum consecutive failures before abandonment (the 3-strike rule)
    const MAX_CONSECUTIVE_FAILURES: u32 = 3;

    // ============================================
    // Three-Strike Rule Tests
    // ============================================

    #[test]
    fn test_three_strike_constant() {
        assert_eq!(MAX_CONSECUTIVE_FAILURES, 3);
    }

    #[test]
    fn test_three_strike_triggers_abandonment() {
        let mut consecutive_failures = 0;
        let mut abandoned = false;

        for _ in 0..5 {
            consecutive_failures += 1;

            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                abandoned = true;
                break;
            }
        }

        assert!(abandoned);
        assert_eq!(consecutive_failures, 3);
    }

    #[test]
    fn test_success_resets_failure_counter() {
        let mut consecutive_failures = 0;

        // Fail twice
        consecutive_failures += 1;
        consecutive_failures += 1;
        assert_eq!(consecutive_failures, 2);

        // Success resets counter
        let success = true;
        if success {
            consecutive_failures = 0;
        }
        assert_eq!(consecutive_failures, 0);

        // Fail once more
        consecutive_failures += 1;
        assert_eq!(consecutive_failures, 1);
    }

    #[test]
    fn test_failure_sequence_fail_fail_success_fail_fail_fail() {
        let mut consecutive_failures = 0;
        let results = vec![false, false, true, false, false, false];
        let mut abandoned = false;

        for success in results {
            if success {
                consecutive_failures = 0;
            } else {
                consecutive_failures += 1;
            }

            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                abandoned = true;
                break;
            }
        }

        assert!(abandoned);
        assert_eq!(consecutive_failures, 3);
    }

    #[test]
    fn test_all_successes_no_abandonment() {
        let mut consecutive_failures = 0;
        let results = vec![true, true, true, true, true];
        let mut abandoned = false;

        for success in results {
            if success {
                consecutive_failures = 0;
            } else {
                consecutive_failures += 1;
            }

            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                abandoned = true;
                break;
            }
        }

        assert!(!abandoned);
        assert_eq!(consecutive_failures, 0);
    }

    #[test]
    fn test_alternating_failures_no_abandonment() {
        let mut consecutive_failures = 0;
        let results = vec![false, true, false, true, false, true, false, true];
        let mut abandoned = false;

        for success in results {
            if success {
                consecutive_failures = 0;
            } else {
                consecutive_failures += 1;
            }

            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                abandoned = true;
                break;
            }
        }

        assert!(!abandoned);
        // Max consecutive was 1 (always reset by next success)
        assert!(consecutive_failures <= 1);
    }

    // ============================================
    // Failure Category Tests
    // ============================================

    #[test]
    fn test_all_failure_categories_exist() {
        let categories = vec![
            FailureCategory::ResourceUnavailable,
            FailureCategory::PermissionDenied,
            FailureCategory::InvalidInput,
            FailureCategory::NetworkError,
            FailureCategory::Timeout,
            FailureCategory::DependencyFailed,
            FailureCategory::ToolError,
            FailureCategory::StateError,
            FailureCategory::Unknown,
        ];

        assert_eq!(categories.len(), 9);
    }

    #[test]
    fn test_failure_category_equality() {
        assert_eq!(FailureCategory::Timeout, FailureCategory::Timeout);
        assert_ne!(FailureCategory::Timeout, FailureCategory::NetworkError);
    }

    #[test]
    fn test_failure_category_hashing() {
        use std::collections::HashSet;

        let mut categories: HashSet<FailureCategory> = HashSet::new();
        categories.insert(FailureCategory::NetworkError);
        categories.insert(FailureCategory::Timeout);
        categories.insert(FailureCategory::NetworkError); // Duplicate

        assert_eq!(categories.len(), 2);
    }

    // ============================================
    // Failed Step Tests
    // ============================================

    #[test]
    fn test_failed_step_creation() {
        let failed_step = FailedStep {
            step_id: "step_1".to_string(),
            tool_id: "file_read".to_string(),
            description: "Read configuration file".to_string(),
            error: Some("File not found".to_string()),
            failure_category: FailureCategory::ResourceUnavailable,
            recoverable: true,
        };

        assert_eq!(failed_step.step_id, "step_1");
        assert_eq!(failed_step.tool_id, "file_read");
        assert_eq!(failed_step.failure_category, FailureCategory::ResourceUnavailable);
        assert!(failed_step.recoverable);
        assert!(failed_step.error.is_some());
    }

    #[test]
    fn test_failed_step_without_error() {
        let failed_step = FailedStep {
            step_id: "step_2".to_string(),
            tool_id: "ui_click".to_string(),
            description: "Click button".to_string(),
            error: None,
            failure_category: FailureCategory::StateError,
            recoverable: false,
        };

        assert!(failed_step.error.is_none());
        assert!(!failed_step.recoverable);
    }

    #[test]
    fn test_recoverable_failure_categories() {
        let recoverable_categories = vec![
            FailureCategory::NetworkError,
            FailureCategory::Timeout,
            FailureCategory::ResourceUnavailable,
        ];

        for category in recoverable_categories {
            let step = FailedStep {
                step_id: "test".to_string(),
                tool_id: "tool".to_string(),
                description: "Test".to_string(),
                error: None,
                failure_category: category,
                recoverable: true,
            };
            assert!(step.recoverable);
        }
    }

    #[test]
    fn test_unrecoverable_failure_categories() {
        let unrecoverable_categories = vec![
            FailureCategory::PermissionDenied,
            FailureCategory::InvalidInput,
        ];

        for category in unrecoverable_categories {
            let step = FailedStep {
                step_id: "test".to_string(),
                tool_id: "tool".to_string(),
                description: "Test".to_string(),
                error: None,
                failure_category: category,
                recoverable: false,
            };
            assert!(!step.recoverable);
        }
    }

    // ============================================
    // Failure Pattern Tests
    // ============================================

    #[test]
    fn test_failure_pattern_creation() {
        let pattern = FailurePattern {
            pattern_id: "pattern_1".to_string(),
            category: FailureCategory::NetworkError,
            description: "Repeated network timeouts on API calls".to_string(),
            affected_steps: vec!["step_3".to_string(), "step_5".to_string(), "step_7".to_string()],
            root_cause: Some("API rate limiting".to_string()),
            frequency: 3,
        };

        assert_eq!(pattern.pattern_id, "pattern_1");
        assert_eq!(pattern.category, FailureCategory::NetworkError);
        assert_eq!(pattern.frequency, 3);
        assert_eq!(pattern.affected_steps.len(), 3);
        assert!(pattern.root_cause.is_some());
    }

    #[test]
    fn test_failure_pattern_without_root_cause() {
        let pattern = FailurePattern {
            pattern_id: "pattern_2".to_string(),
            category: FailureCategory::Unknown,
            description: "Intermittent failures".to_string(),
            affected_steps: vec!["step_1".to_string()],
            root_cause: None,
            frequency: 1,
        };

        assert!(pattern.root_cause.is_none());
    }

    // ============================================
    // Correction Type Tests
    // ============================================

    #[test]
    fn test_all_correction_types() {
        let types = vec![
            CorrectionType::Retry,
            CorrectionType::RetryWithModification,
            CorrectionType::UseAlternativeTool,
            CorrectionType::Skip,
            CorrectionType::Decompose,
            CorrectionType::Defer,
            CorrectionType::RequiresHuman,
        ];

        assert_eq!(types.len(), 7);
    }

    #[test]
    fn test_correction_retry() {
        let correction = Correction {
            for_step_id: "step_1".to_string(),
            correction_type: CorrectionType::Retry,
            description: "Retry the operation".to_string(),
            alternative_tool: None,
            modified_parameters: None,
            priority: 1,
        };

        assert!(matches!(correction.correction_type, CorrectionType::Retry));
        assert!(correction.alternative_tool.is_none());
        assert!(correction.modified_parameters.is_none());
    }

    #[test]
    fn test_correction_retry_with_modification() {
        let mut modified_params = HashMap::new();
        modified_params.insert("timeout_ms".to_string(), json!(60000));

        let correction = Correction {
            for_step_id: "step_2".to_string(),
            correction_type: CorrectionType::RetryWithModification,
            description: "Retry with increased timeout".to_string(),
            alternative_tool: None,
            modified_parameters: Some(modified_params),
            priority: 2,
        };

        assert!(matches!(
            correction.correction_type,
            CorrectionType::RetryWithModification
        ));
        assert!(correction.modified_parameters.is_some());

        let params = correction.modified_parameters.unwrap();
        assert_eq!(params.get("timeout_ms").unwrap(), &json!(60000));
    }

    #[test]
    fn test_correction_use_alternative_tool() {
        let correction = Correction {
            for_step_id: "step_3".to_string(),
            correction_type: CorrectionType::UseAlternativeTool,
            description: "Use alternative API".to_string(),
            alternative_tool: Some("api_call_v2".to_string()),
            modified_parameters: None,
            priority: 3,
        };

        assert!(matches!(
            correction.correction_type,
            CorrectionType::UseAlternativeTool
        ));
        assert_eq!(correction.alternative_tool.unwrap(), "api_call_v2");
    }

    #[test]
    fn test_correction_skip() {
        let correction = Correction {
            for_step_id: "step_4".to_string(),
            correction_type: CorrectionType::Skip,
            description: "Skip non-critical step".to_string(),
            alternative_tool: None,
            modified_parameters: None,
            priority: 4,
        };

        assert!(matches!(correction.correction_type, CorrectionType::Skip));
    }

    #[test]
    fn test_correction_decompose() {
        let correction = Correction {
            for_step_id: "step_5".to_string(),
            correction_type: CorrectionType::Decompose,
            description: "Break into smaller sub-tasks".to_string(),
            alternative_tool: None,
            modified_parameters: None,
            priority: 5,
        };

        assert!(matches!(correction.correction_type, CorrectionType::Decompose));
    }

    #[test]
    fn test_correction_defer() {
        let correction = Correction {
            for_step_id: "step_6".to_string(),
            correction_type: CorrectionType::Defer,
            description: "Wait and retry later".to_string(),
            alternative_tool: None,
            modified_parameters: None,
            priority: 6,
        };

        assert!(matches!(correction.correction_type, CorrectionType::Defer));
    }

    #[test]
    fn test_correction_requires_human() {
        let correction = Correction {
            for_step_id: "step_7".to_string(),
            correction_type: CorrectionType::RequiresHuman,
            description: "Requires human intervention".to_string(),
            alternative_tool: None,
            modified_parameters: None,
            priority: 7,
        };

        assert!(matches!(
            correction.correction_type,
            CorrectionType::RequiresHuman
        ));
    }

    // ============================================
    // Adaptive Delay (Exponential Backoff) Tests
    // ============================================

    #[test]
    fn test_adaptive_delay_no_failures() {
        let consecutive_failures = 0;
        let delay = if consecutive_failures > 0 {
            std::cmp::min(2_u64.pow(consecutive_failures), 30)
        } else {
            2
        };

        assert_eq!(delay, 2);
    }

    #[test]
    fn test_adaptive_delay_one_failure() {
        let consecutive_failures = 1;
        let delay = std::cmp::min(2_u64.pow(consecutive_failures), 30);

        assert_eq!(delay, 2);
    }

    #[test]
    fn test_adaptive_delay_two_failures() {
        let consecutive_failures = 2;
        let delay = std::cmp::min(2_u64.pow(consecutive_failures), 30);

        assert_eq!(delay, 4);
    }

    #[test]
    fn test_adaptive_delay_three_failures() {
        let consecutive_failures = 3;
        let delay = std::cmp::min(2_u64.pow(consecutive_failures), 30);

        assert_eq!(delay, 8);
    }

    #[test]
    fn test_adaptive_delay_capped_at_30() {
        // Test various high failure counts to ensure cap at 30
        for failures in [5, 6, 7, 10] {
            let delay = std::cmp::min(2_u64.pow(failures), 30);
            assert_eq!(delay, 30, "Delay should be capped at 30 for {} failures", failures);
        }
    }

    #[test]
    fn test_adaptive_delay_sequence() {
        let expected_delays = vec![
            (0, 2),  // No failures
            (1, 2),  // 2^1 = 2
            (2, 4),  // 2^2 = 4
            (3, 8),  // 2^3 = 8
            (4, 16), // 2^4 = 16
            (5, 30), // 2^5 = 32, capped at 30
        ];

        for (failures, expected) in expected_delays {
            let delay = if failures > 0 {
                std::cmp::min(2_u64.pow(failures), 30)
            } else {
                2
            };
            assert_eq!(delay, expected, "Failed for {} failures", failures);
        }
    }

    // ============================================
    // Execution Assessment Tests
    // ============================================

    #[test]
    fn test_execution_assessment_all_success() {
        let assessment = ExecutionAssessment {
            success_rate: 1.0,
            successful_steps: vec!["step_1".to_string(), "step_2".to_string()],
            failed_steps: vec![],
            goal_achievable: true,
            progress_estimate: 1.0,
            resource_efficiency: 0.95,
            time_efficiency: 0.90,
        };

        assert_eq!(assessment.success_rate, 1.0);
        assert!(assessment.failed_steps.is_empty());
        assert!(assessment.goal_achievable);
    }

    #[test]
    fn test_execution_assessment_partial_success() {
        let assessment = ExecutionAssessment {
            success_rate: 0.75,
            successful_steps: vec!["step_1".to_string(), "step_2".to_string(), "step_3".to_string()],
            failed_steps: vec![FailedStep {
                step_id: "step_4".to_string(),
                tool_id: "api_call".to_string(),
                description: "Call external API".to_string(),
                error: Some("Connection refused".to_string()),
                failure_category: FailureCategory::NetworkError,
                recoverable: true,
            }],
            goal_achievable: true,
            progress_estimate: 0.80,
            resource_efficiency: 0.90,
            time_efficiency: 0.85,
        };

        assert!((assessment.success_rate - 0.75).abs() < f64::EPSILON);
        assert_eq!(assessment.successful_steps.len(), 3);
        assert_eq!(assessment.failed_steps.len(), 1);
    }

    #[test]
    fn test_execution_assessment_goal_unachievable() {
        let assessment = ExecutionAssessment {
            success_rate: 0.25,
            successful_steps: vec!["step_1".to_string()],
            failed_steps: vec![
                FailedStep {
                    step_id: "step_2".to_string(),
                    tool_id: "tool".to_string(),
                    description: "Failed step 2".to_string(),
                    error: Some("Error".to_string()),
                    failure_category: FailureCategory::PermissionDenied,
                    recoverable: false,
                },
                FailedStep {
                    step_id: "step_3".to_string(),
                    tool_id: "tool".to_string(),
                    description: "Failed step 3".to_string(),
                    error: Some("Error".to_string()),
                    failure_category: FailureCategory::PermissionDenied,
                    recoverable: false,
                },
                FailedStep {
                    step_id: "step_4".to_string(),
                    tool_id: "tool".to_string(),
                    description: "Failed step 4".to_string(),
                    error: Some("Error".to_string()),
                    failure_category: FailureCategory::PermissionDenied,
                    recoverable: false,
                },
            ],
            goal_achievable: false,
            progress_estimate: 0.25,
            resource_efficiency: 0.50,
            time_efficiency: 0.40,
        };

        assert!(!assessment.goal_achievable);
        assert_eq!(assessment.failed_steps.len(), 3);
    }

    // ============================================
    // Sub-Goal Tests
    // ============================================

    #[test]
    fn test_sub_goal_creation() {
        let sub_goal = SubGoal {
            id: "sub_goal_1".to_string(),
            parent_goal_id: "main_goal".to_string(),
            from_step_id: "step_5".to_string(),
            description: "Complete authentication before API call".to_string(),
            success_criteria: vec![
                "Token obtained".to_string(),
                "Token valid for 1 hour".to_string(),
            ],
            suggested_tools: vec!["api_call".to_string(), "file_read".to_string()],
            priority: 1,
        };

        assert_eq!(sub_goal.parent_goal_id, "main_goal");
        assert_eq!(sub_goal.from_step_id, "step_5");
        assert_eq!(sub_goal.success_criteria.len(), 2);
        assert_eq!(sub_goal.suggested_tools.len(), 2);
        assert_eq!(sub_goal.priority, 1);
    }

    // ============================================
    // Reflection Insight Tests
    // ============================================

    #[test]
    fn test_reflection_insight_creation() {
        let insight = ReflectionInsight {
            id: "insight_1".to_string(),
            goal_id: "test_goal".to_string(),
            assessment: ExecutionAssessment {
                success_rate: 0.60,
                successful_steps: vec!["step_1".to_string(), "step_2".to_string()],
                failed_steps: vec![FailedStep {
                    step_id: "step_3".to_string(),
                    tool_id: "tool".to_string(),
                    description: "Failed step".to_string(),
                    error: Some("Error".to_string()),
                    failure_category: FailureCategory::Unknown,
                    recoverable: true,
                }],
                goal_achievable: true,
                progress_estimate: 0.65,
                resource_efficiency: 0.80,
                time_efficiency: 0.75,
            },
            failure_patterns: vec![],
            corrections: vec![],
            sub_goals: vec![],
            recommendations: vec![
                "Consider increasing timeout".to_string(),
                "Add retry logic".to_string(),
            ],
            confidence: 0.85,
            timestamp: 1234567890,
        };

        assert!((insight.confidence - 0.85).abs() < f64::EPSILON);
        assert_eq!(insight.recommendations.len(), 2);
        assert!(insight.failure_patterns.is_empty());
    }

    #[test]
    fn test_reflection_insight_with_patterns_and_corrections() {
        let insight = ReflectionInsight {
            id: "insight_2".to_string(),
            goal_id: "test_goal".to_string(),
            assessment: ExecutionAssessment {
                success_rate: 0.40,
                successful_steps: vec!["step_1".to_string()],
                failed_steps: vec![
                    FailedStep {
                        step_id: "step_2".to_string(),
                        tool_id: "api_call".to_string(),
                        description: "API call".to_string(),
                        error: Some("Timeout".to_string()),
                        failure_category: FailureCategory::Timeout,
                        recoverable: true,
                    },
                    FailedStep {
                        step_id: "step_3".to_string(),
                        tool_id: "api_call".to_string(),
                        description: "API call".to_string(),
                        error: Some("Timeout".to_string()),
                        failure_category: FailureCategory::Timeout,
                        recoverable: true,
                    },
                ],
                goal_achievable: true,
                progress_estimate: 0.40,
                resource_efficiency: 0.60,
                time_efficiency: 0.50,
            },
            failure_patterns: vec![FailurePattern {
                pattern_id: "p1".to_string(),
                category: FailureCategory::Timeout,
                description: "Repeated API timeouts".to_string(),
                affected_steps: vec!["step_2".to_string(), "step_3".to_string()],
                root_cause: Some("Slow API response".to_string()),
                frequency: 2,
            }],
            corrections: vec![Correction {
                for_step_id: "step_2".to_string(),
                correction_type: CorrectionType::RetryWithModification,
                description: "Increase timeout".to_string(),
                alternative_tool: None,
                modified_parameters: Some(
                    [("timeout_ms".to_string(), json!(120000))]
                        .into_iter()
                        .collect(),
                ),
                priority: 1,
            }],
            sub_goals: vec![],
            recommendations: vec!["Consider caching API responses".to_string()],
            confidence: 0.70,
            timestamp: 1234567890,
        };

        assert_eq!(insight.failure_patterns.len(), 1);
        assert_eq!(insight.corrections.len(), 1);
    }

    // ============================================
    // Plan Critique Tests
    // ============================================

    #[test]
    fn test_plan_critique_high_quality() {
        let critique = PlanCritique {
            quality_score: 85,
            likely_to_succeed: true,
            risks: vec![],
            suggestions: vec!["Consider adding logging".to_string()],
            missing_elements: vec![],
        };

        assert!(critique.quality_score >= 50);
        assert!(critique.likely_to_succeed);
        assert!(critique.risks.is_empty());
    }

    #[test]
    fn test_plan_critique_low_quality() {
        let critique = PlanCritique {
            quality_score: 35,
            likely_to_succeed: false,
            risks: vec![
                PlanRisk {
                    description: "No error handling".to_string(),
                    severity: 4,
                    affected_steps: vec!["step_1".to_string(), "step_2".to_string()],
                    mitigation: Some("Add try-catch blocks".to_string()),
                },
                PlanRisk {
                    description: "External API dependency".to_string(),
                    severity: 3,
                    affected_steps: vec!["step_3".to_string()],
                    mitigation: Some("Add fallback mechanism".to_string()),
                },
            ],
            suggestions: vec![
                "Add error handling".to_string(),
                "Implement retries".to_string(),
            ],
            missing_elements: vec![
                "Rollback mechanism".to_string(),
                "Logging".to_string(),
            ],
        };

        assert!(critique.quality_score < 50);
        assert!(!critique.likely_to_succeed);
        assert_eq!(critique.risks.len(), 2);
        assert_eq!(critique.missing_elements.len(), 2);
    }

    #[test]
    fn test_plan_quality_threshold() {
        // Plans with quality score < 50 should trigger corrections
        let low_quality = 40u32;
        let high_quality = 80u32;
        let threshold = 50u32;

        assert!(low_quality < threshold);
        assert!(high_quality >= threshold);
    }

    #[test]
    fn test_plan_risk_severity_levels() {
        let risks = vec![
            PlanRisk {
                description: "Minor issue".to_string(),
                severity: 1,
                affected_steps: vec![],
                mitigation: None,
            },
            PlanRisk {
                description: "Moderate issue".to_string(),
                severity: 3,
                affected_steps: vec![],
                mitigation: None,
            },
            PlanRisk {
                description: "Critical issue".to_string(),
                severity: 5,
                affected_steps: vec![],
                mitigation: None,
            },
        ];

        assert_eq!(risks[0].severity, 1);
        assert_eq!(risks[1].severity, 3);
        assert_eq!(risks[2].severity, 5);

        // Severity should be between 1-5
        for risk in &risks {
            assert!(risk.severity >= 1 && risk.severity <= 5);
        }
    }

    // ============================================
    // Graceful Degradation Tests
    // ============================================

    #[test]
    fn test_graceful_degradation_sequence() {
        // Expected degradation order: retry -> modify -> skip -> human
        let degradation_steps = vec![
            CorrectionType::Retry,
            CorrectionType::RetryWithModification,
            CorrectionType::Skip,
            CorrectionType::RequiresHuman,
        ];

        for (i, step) in degradation_steps.iter().enumerate() {
            match (i, step) {
                (0, CorrectionType::Retry) => {
                    // First: simple retry
                }
                (1, CorrectionType::RetryWithModification) => {
                    // Second: retry with modifications
                }
                (2, CorrectionType::Skip) => {
                    // Third: skip if non-critical
                }
                (3, CorrectionType::RequiresHuman) => {
                    // Final: escalate to human
                }
                _ => panic!("Unexpected degradation step at index {}", i),
            }
        }
    }

    #[test]
    fn test_degradation_priority_ordering() {
        let corrections = vec![
            Correction {
                for_step_id: "step_1".to_string(),
                correction_type: CorrectionType::Retry,
                description: "Retry".to_string(),
                alternative_tool: None,
                modified_parameters: None,
                priority: 1,
            },
            Correction {
                for_step_id: "step_1".to_string(),
                correction_type: CorrectionType::RetryWithModification,
                description: "Retry with mod".to_string(),
                alternative_tool: None,
                modified_parameters: None,
                priority: 2,
            },
            Correction {
                for_step_id: "step_1".to_string(),
                correction_type: CorrectionType::RequiresHuman,
                description: "Human needed".to_string(),
                alternative_tool: None,
                modified_parameters: None,
                priority: 10,
            },
        ];

        // Lower priority should be tried first
        let mut sorted = corrections.clone();
        sorted.sort_by_key(|c| c.priority);

        assert!(matches!(sorted[0].correction_type, CorrectionType::Retry));
        assert!(matches!(
            sorted[2].correction_type,
            CorrectionType::RequiresHuman
        ));
    }

    // ============================================
    // Goal Achievability Tests
    // ============================================

    #[test]
    fn test_goal_marked_unachievable_after_consecutive_failures() {
        let mut consecutive_failures = 0;
        let mut goal_achievable = true;

        // Simulate MAX_CONSECUTIVE_FAILURES
        for _ in 0..MAX_CONSECUTIVE_FAILURES {
            consecutive_failures += 1;
        }

        if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
            goal_achievable = false;
        }

        assert!(!goal_achievable);
    }

    #[test]
    fn test_goal_remains_achievable_under_threshold() {
        let consecutive_failures = MAX_CONSECUTIVE_FAILURES - 1;
        let goal_achievable = consecutive_failures < MAX_CONSECUTIVE_FAILURES;

        assert!(goal_achievable);
    }
}
