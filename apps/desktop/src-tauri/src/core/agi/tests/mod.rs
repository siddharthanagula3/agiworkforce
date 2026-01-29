//! Comprehensive AGI Core Test Suite
//!
//! This module provides comprehensive test coverage for the AGI core system including:
//! - Core tests: Basic AGI configuration, capabilities, and goal handling
//! - Executor tests: Tool execution context and result handling
//! - Runtime tests: Goal execution limits and timeout handling
//! - Planner tests: Plan generation and step validation
//! - Failure recovery tests: The 3-strike abandonment rule and graceful degradation
//! - Knowledge tests: Knowledge base operations
//! - Learning tests: Learning system behavior
//! - Memory tests: AGI memory management
//! - Outcome tracker tests: Outcome tracking and success rates
//! - Process reasoning tests: Process type identification and reasoning
//! - Resources tests: Resource management
//! - Security tests: Security validation
//! - Tool integration tests: Tool registry and capabilities

// Core configuration and capability tests
pub mod core_tests;

// Tool execution and error handling tests
pub mod executor_tests;

// Runtime limit tests (iterations, timeouts, consecutive failures)
pub mod runtime_tests;

// Plan generation and step validation tests
pub mod planner_tests;

// 3-strike rule and graceful degradation tests
pub mod failure_recovery_tests;

// Knowledge base tests
pub mod knowledge_tests;

// Learning system tests
pub mod learning_tests;

// AGI memory tests
pub mod memory_tests;

// Outcome tracking tests
pub mod outcome_tracker_tests;

// Process reasoning tests
pub mod process_reasoning_tests;

// Resource management tests
pub mod resources_tests;

// Security validation tests
pub mod security_tests;

// Tool registry and integration tests
pub mod tool_integration_tests;
