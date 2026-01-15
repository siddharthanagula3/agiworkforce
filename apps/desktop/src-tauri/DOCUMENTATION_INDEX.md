# AGI Workforce Rust Backend Documentation

Complete documentation index for the Rust backend.

## Quick Navigation

### Getting Started
- [README](./README.md) - Overview and quick start guide
- [EXAMPLES](./EXAMPLES.md) - Practical code examples

### Architecture
- [RUST_ARCHITECTURE](./RUST_ARCHITECTURE.md) - Complete architecture guide
  - Module structure (core, sys, data, automation, features, integrations, ui)
  - State management patterns
  - Error handling strategies
  - Async patterns with Tokio
  - Data flow diagrams
  - Performance optimization

### API Reference
- [COMMANDS](./COMMANDS.md) - Complete Tauri commands reference
  - AGI commands (goal submission, reflection, recommendations)
  - Chat commands (conversations, streaming, cost tracking)
  - File operations (read, write, delete with security)
  - LLM commands (provider routing, usage stats)
  - Browser automation (semantic selectors, screenshots)
  - Terminal commands (AI suggestions, error explanations)
  - MCP commands (tool registry, server management)
  - Security commands (approvals, audit logs)
  - Complete command index (200+ commands)

### Security
- [SECURITY](./SECURITY.md) - Comprehensive security documentation
  - Threat model and protected scenarios
  - Security layers (policy engine, approvals, audit, RBAC)
  - Authentication and authorization
  - Secret management with encryption
  - Policy engine usage
  - LLM security (prompt injection, guardrails)
  - Rate limiting
  - Secure coding practices
  - Security checklist

### Database
- [DATABASE](./DATABASE.md) - SQLite schema and operations
  - Database configuration and pragmas
  - Migration system documentation
  - Core tables (conversations, messages, settings)
  - Security tables (audit events, approvals, secrets)
  - Workflow tables (definitions, executions, logs)
  - Analytics tables (metrics, snapshots, milestones)
  - Query patterns and optimization
  - Backup and recovery procedures

### Code Examples
- [EXAMPLES](./EXAMPLES.md) - Practical Rust patterns
  - State management examples
  - Async patterns (tasks, parallel execution, timeouts)
  - Error handling (custom types, context, recovery)
  - Database operations (queries, transactions, async)
  - Security patterns (validation, policy checks, audit logging)
  - Event emission (progress updates, streaming)
  - Testing patterns (unit, integration, mocking)
  - Performance patterns (rayon, caching, lazy init)

## Documentation by Topic

### AI & Automation

**AGI System** (RUST_ARCHITECTURE.md):
- Goal-oriented reasoning
- Automatic planning and reflection
- Resource management
- Safety limits (1000 iterations, 5 min timeout)

**LLM Router** (COMMANDS.md):
- Multi-provider support (OpenAI, Anthropic, Google, etc.)
- Cost optimization
- Automatic fallback
- Streaming responses

**Browser Automation** (COMMANDS.md):
- Semantic element finding
- DOM operations
- Screenshot capture
- JavaScript execution

### Data & Persistence

**Database Schema** (DATABASE.md):
- 100+ tables
- Foreign key constraints
- Indexed queries
- Migration system

**Caching** (EXAMPLES.md):
- LRU cache pattern
- Codebase cache
- Query result caching

**Analytics** (DATABASE.md):
- Real-time metrics
- ROI calculation
- Usage tracking
- Milestone system

### Security & Compliance

**Policy Engine** (SECURITY.md):
- Context-aware policies
- Risk level calculation
- Workspace scoping
- Trust levels

**Audit Logging** (SECURITY.md):
- Tamper-proof hash chain
- Event integrity verification
- Comprehensive event types

**Secret Management** (SECURITY.md):
- AES-256-GCM encryption
- Machine-derived keys
- Secure storage in SQLite

### Development

**Testing** (EXAMPLES.md):
- Unit tests with assertions
- Async tests with tokio::test
- Integration tests with serial execution
- Property-based testing with proptest
- Mocking with mockall

**Error Handling** (EXAMPLES.md):
- Custom error types with thiserror
- Error context with anyhow
- Result mapping and recovery
- User-friendly error messages

**Performance** (RUST_ARCHITECTURE.md):
- Rayon for parallelism
- DashMap for concurrent maps
- Lazy initialization
- Connection pooling
- Query optimization

## Module Reference

### Core (`src/core/`)

**Purpose**: Business logic and AI systems

**Key Modules**:
- `agent/` - Autonomous agent infrastructure
- `agi/` - AGI reasoning with planning and reflection
- `llm/` - LLM router and provider management
- `mcp/` - Model Context Protocol integration
- `embeddings/` - Vector embeddings for semantic search

**Documentation**: RUST_ARCHITECTURE.md > Core

### System (`src/sys/`)

**Purpose**: System commands and services

**Key Modules**:
- `commands/` - 200+ Tauri commands organized by domain
- `security/` - Multi-layered security subsystem
- `telemetry/` - Analytics and monitoring
- `billing/` - Stripe integration
- `account/` - User account management

**Documentation**: RUST_ARCHITECTURE.md > System, COMMANDS.md

### Data (`src/data/`)

**Purpose**: Data persistence and caching

**Key Modules**:
- `db/` - Database layer with migrations
- `cache/` - Intelligent caching systems
- `analytics/` - ROI and metrics aggregation
- `settings/` - Settings management
- `metrics/` - Real-time metrics collection

**Documentation**: DATABASE.md, RUST_ARCHITECTURE.md > Data

### Automation (`src/automation/`)

**Purpose**: UI and browser automation

**Key Modules**:
- `screen/` - Screen capture and analysis
- `browser/` - Playwright/CDP browser automation
- `vision_planner.rs` - AI-powered UI automation

**Documentation**: COMMANDS.md > Browser Automation

### Integrations (`src/integrations/`)

**Purpose**: Third-party service integrations

**Key Modules**:
- `realtime/` - WebSocket-based collaboration
- `sync/` - Cloud synchronization
- `cloud/` - Cloud storage (Dropbox, Google Drive, OneDrive)
- `native_messaging/` - Browser extension communication

**Documentation**: RUST_ARCHITECTURE.md > Integrations

### Features (`src/features/`)

**Purpose**: High-level application features

**Key Modules**:
- `terminal/` - Integrated terminal with AI
- `document/` - PDF, Word, Excel processing
- `tasks/` - Background task management
- `teams/` - Team collaboration
- `workflows/` - Workflow marketplace

**Documentation**: RUST_ARCHITECTURE.md > Features

## Common Patterns

### Creating a New Command

1. Define command in `src/sys/commands/`
2. Add to `invoke_handler!` in `lib.rs`
3. Document in COMMANDS.md
4. Add tests
5. Update TypeScript types

See: EXAMPLES.md > State Management

### Adding a Database Table

1. Create migration in `src/data/db/migrations.rs`
2. Increment `CURRENT_VERSION`
3. Add to `MIGRATIONS` array
4. Add to `ALLOWED_TABLES` whitelist
5. Document in DATABASE.md

See: DATABASE.md > Migration System

### Implementing Security

1. Define policy in policy engine
2. Add approval workflow if high risk
3. Log to audit trail
4. Add RBAC permissions
5. Document in SECURITY.md

See: SECURITY.md > Policy Engine, EXAMPLES.md > Security Patterns

### Writing Tests

1. Add `#[cfg(test)]` module
2. Use `#[test]` or `#[tokio::test]`
3. Setup test fixtures
4. Assert results
5. Use `#[serial]` for database tests

See: EXAMPLES.md > Testing Patterns

## API Documentation

### Generating Docs

```bash
# Generate and open in browser
cargo doc --no-deps --open

# Include private items
cargo doc --no-deps --document-private-items --open

# Generate without opening
cargo doc --no-deps
```

Documentation will be in `target/doc/agiworkforce_desktop/index.html`.

### Documentation Coverage

All public APIs should have:
- Module-level documentation (`//!`)
- Function documentation (`///`)
- Parameter descriptions
- Return value descriptions
- Example usage
- Error conditions

Example:
```rust
/// Processes a user request and returns the result.
///
/// # Arguments
///
/// * `request` - The user's request string
/// * `context` - Additional context for processing
///
/// # Returns
///
/// Returns `Ok(Response)` on success or `Err` if processing fails.
///
/// # Examples
///
/// ```
/// let response = process_request("query", &context)?;
/// ```
///
/// # Errors
///
/// This function will return an error if:
/// - The request is empty
/// - The context is invalid
/// - Processing fails
pub fn process_request(request: &str, context: &Context) -> Result<Response> {
    // Implementation
}
```

## Troubleshooting Guide

### Build Issues

**Problem**: Compilation fails
- **Solution**: Run `cargo clean && cargo build`
- **Docs**: README.md > Troubleshooting

**Problem**: Missing dependencies
- **Solution**: Check platform-specific requirements
- **Docs**: README.md > Prerequisites

### Runtime Issues

**Problem**: Database locked errors
- **Solution**: Check WAL mode and busy_timeout
- **Docs**: DATABASE.md > Troubleshooting

**Problem**: Permission denied errors
- **Solution**: Review policy engine configuration
- **Docs**: SECURITY.md > Policy Engine

### Performance Issues

**Problem**: Slow queries
- **Solution**: Add indexes, use EXPLAIN QUERY PLAN
- **Docs**: DATABASE.md > Performance Optimization

**Problem**: High memory usage
- **Solution**: Check context memory limits, cache sizes
- **Docs**: RUST_ARCHITECTURE.md > Performance Patterns

## Additional Resources

### External Documentation

- [Tauri Docs](https://tauri.app/v2/) - Desktop framework
- [Tokio Tutorial](https://tokio.rs/tokio/tutorial) - Async runtime
- [Rust Book](https://doc.rust-lang.org/book/) - Language guide
- [SQLite Docs](https://www.sqlite.org/docs.html) - Database

### Crate Documentation

- [serde](https://docs.rs/serde/) - Serialization
- [rusqlite](https://docs.rs/rusqlite/) - SQLite bindings
- [reqwest](https://docs.rs/reqwest/) - HTTP client
- [anyhow](https://docs.rs/anyhow/) - Error handling
- [thiserror](https://docs.rs/thiserror/) - Error derive

## Contributing to Documentation

### Adding Documentation

1. Identify gaps in existing docs
2. Write clear, concise content
3. Add code examples
4. Update this index
5. Submit PR

### Documentation Standards

- Use Markdown for all docs
- Include code examples
- Link to related sections
- Keep examples simple and practical
- Update documentation with code changes

### Review Checklist

- [ ] All public APIs documented
- [ ] Examples compile and run
- [ ] Links are valid
- [ ] Spelling and grammar checked
- [ ] Index updated
- [ ] cargo doc builds without warnings

## Version History

### Current Version: 1.0.4

**Documentation Coverage**:
- ✅ Architecture guide
- ✅ Security documentation
- ✅ Commands reference
- ✅ Database schema
- ✅ Code examples
- ✅ README
- ✅ This index

**Rust API Docs**: Run `cargo doc --no-deps --open`

## Support

For documentation questions:
- Check relevant doc file first
- Search in cargo doc
- Open GitHub issue with "documentation" label
- Tag @rust-team for Rust-specific questions

## License

Documentation is licensed under the same terms as the project. See LICENSE file.

---

**Last Updated**: January 2026
**Maintained By**: AGI Workforce Development Team
**Questions?**: Check README.md or open an issue
