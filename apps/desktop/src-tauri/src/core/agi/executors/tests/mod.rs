//! Executor Module Test Suite
//!
//! This module provides comprehensive test coverage for all tool executors including:
//! - File executor tests: File read, write, delete operations with security validation
//! - Git executor tests: Git operations (init, add, commit, status, push, clone)
//! - Database executor tests: SQL query validation and injection protection

// File operations executor tests
pub mod file_executor_tests;

// Git version control executor tests
pub mod git_executor_tests;

// Database operations executor tests
pub mod database_executor_tests;

// Granted-folder checks on executor path parameters
pub mod granted_paths_tests;
