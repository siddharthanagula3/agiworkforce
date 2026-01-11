/**
 * Cache Module
 *
 * High-performance caching layer for expensive operations:
 * - Codebase analysis (file trees, symbols, dependencies)
 * - Tool result caching (in-memory LRU cache for tool executions)
 * - LLM response caching (implemented in router/cache_manager.rs)
 * - Compilation results
 *
 * This module provides caching for both codebase analysis and tool execution results
 * to achieve <30 second task completion times for the AGI system.
 */
pub mod codebase;
pub mod llm_responses;
pub mod tool_results;
pub mod watcher_integration;

// Re-export codebase cache types
pub use codebase::{
    CacheStats, CacheType, CodebaseCache, DependencyEdge, DependencyGraph, DependencyNode,
    EdgeType, Export, FileMetadata, FileTree, FileTreeEntry, Import, NodeType, Symbol, SymbolKind,
    SymbolTable,
};

// Re-export watcher integration
pub use watcher_integration::{handle_directory_change, handle_file_change, handle_file_delete};

// Re-export LLM response cache types
pub use llm_responses::{CachedLLMResponse, LLMResponseCache};

// Re-export tool results cache types
pub use tool_results::{ToolCacheStats, ToolCacheTTLConfig, ToolResultCache, ToolResultCacheEntry};
