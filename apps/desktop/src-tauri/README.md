# AGI Workforce Rust Backend

High-performance Rust backend for the AGI Workforce desktop application built with Tauri 2.9.

## Overview

This Rust backend powers a sophisticated AI automation platform with capabilities including:

- **AGI Reasoning**: Goal-oriented planning and execution with reflection
- **LLM Routing**: Intelligent routing across multiple AI providers
- **Browser Automation**: Playwright/CDP-based web automation
- **Terminal Integration**: PTY-based terminal with AI assistance
- **Security**: Multi-layered security with policy engine and audit logging
- **MCP Integration**: Model Context Protocol for extensible tools
- **Real-time Sync**: WebSocket-based collaboration
- **Document Processing**: PDF, Word, Excel support

## Quick Start

### Prerequisites

- Rust 1.70+ (Rust 2021 edition)
- Node.js 22+ (for frontend)
- Platform-specific dependencies:
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools
  - Linux: build-essential, libwebkit2gtk-4.0-dev

### Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev:desktop

# Build for production
pnpm build:desktop

# Run tests
cargo test

# Run clippy
cargo clippy --all-targets --all-features

# Generate documentation
cargo doc --no-deps --open
```

## Architecture

### Module Structure

```
src/
├── core/           # Business logic and AI systems
│   ├── agent/      # Autonomous agents
│   ├── agi/        # AGI reasoning system
│   ├── llm/        # LLM router and providers
│   ├── mcp/        # Model Context Protocol
│   └── embeddings/ # Vector embeddings
├── sys/            # System commands and services
│   ├── commands/   # Tauri commands (API)
│   ├── security/   # Security subsystem
│   └── telemetry/  # Analytics and logging
├── data/           # Data persistence
│   ├── db/         # Database layer
│   ├── cache/      # Caching systems
│   └── analytics/  # ROI and metrics
├── automation/     # UI and browser automation
├── integrations/   # Third-party integrations
├── features/       # High-level features
│   ├── terminal/   # Terminal with AI
│   ├── document/   # Document processing
│   ├── tasks/      # Background tasks
│   └── teams/      # Team collaboration
└── ui/             # UI-related Rust code
```

### Key Technologies

- **Async Runtime**: Tokio with full features
- **Database**: SQLite with WAL mode
- **Serialization**: Serde (JSON, bincode)
- **HTTP**: Reqwest with rustls-tls
- **Cryptography**: AES-GCM, Argon2, PBKDF2
- **Concurrency**: Rayon, DashMap, parking_lot

## Documentation

Comprehensive documentation is available:

- **[Architecture Guide](./RUST_ARCHITECTURE.md)** - Module structure and design patterns
- **[Security Documentation](./SECURITY.md)** - Security model and best practices
- **[Commands Reference](./COMMANDS.md)** - Complete Tauri commands API
- **[Database Schema](./DATABASE.md)** - SQLite schema and migrations
- **[Code Examples](./EXAMPLES.md)** - Common patterns and recipes

### API Documentation

Generate and view Rust API docs:

```bash
cargo doc --no-deps --open
```

This will open comprehensive documentation for all public APIs with examples.

## Key Features

### AGI System

Goal-oriented reasoning with automatic planning and reflection:

```rust
// Submit a goal
let goal_id = agi_submit_goal(
    "Analyze codebase and create refactoring plan",
    Priority::High,
).await?;

// AGI automatically:
// 1. Creates execution plan
// 2. Reflects on plan for risks
// 3. Executes steps with resource tracking
// 4. Learns from outcomes
// 5. Provides recommendations
```

### Security Model

Multi-layered security with defense in depth:

- **Policy Engine**: Context-aware access control
- **Approval Workflows**: Human-in-the-loop for risky operations
- **Audit Logging**: Tamper-proof audit trail with hash chain
- **Secret Management**: Encrypted storage with machine-derived keys
- **RBAC**: Role-based access control
- **Rate Limiting**: Abuse prevention

### Browser Automation

Semantic browser automation:

```rust
// Find and click by description instead of brittle selectors
click_semantic("Submit button").await?;

// AI-powered element finding
let element = find_element_semantic("Email input field").await?;
```

### Terminal with AI

Integrated terminal with AI assistance:

```rust
// Get AI command suggestions
let suggestion = terminal_ai_suggest_command(
    "Find all TypeScript files modified in the last week"
).await?;

// Explain terminal errors
let explanation = terminal_ai_explain_error(error_output).await?;

// Generate smart commit messages
let message = terminal_smart_commit().await?;
```

## Database

SQLite database with optimized configuration:

**Location**: `~/.config/agiworkforce/agiworkforce.db`

**Pragmas**:
- WAL mode for concurrency
- 5 second busy timeout
- 64MB cache
- Foreign keys enabled

**Current Schema Version**: 45

**Migration System**: Automatic migrations on startup

See [DATABASE.md](./DATABASE.md) for complete schema documentation.

## Security

### Threat Model

Protected against:
- Unauthorized file access
- Malicious code execution
- Data exfiltration
- Prompt injection attacks
- Privilege escalation
- Credential theft
- Denial of service

### Key Security Features

**Machine-Derived Keys**: Secrets encrypted using keys derived from machine ID, ensuring secrets can only be decrypted on the same machine.

**Audit Trail**: Every security-relevant operation is logged with tamper detection via hash chaining.

**Policy-Based Access Control**: Fine-grained policies for file access, shell commands, network requests, etc.

See [SECURITY.md](./SECURITY.md) for complete security documentation.

## Performance

### Optimization Strategies

- **Connection Pooling**: Reuse database connections
- **Prepared Statements**: Cache SQL queries
- **Lazy Initialization**: Defer expensive operations
- **Parallel Processing**: Rayon for CPU-bound work
- **Async I/O**: Tokio for I/O-bound operations
- **Caching**: Multiple cache layers for frequently accessed data

### Benchmarks

Run benchmarks:

```bash
cargo bench
```

Benchmarks available:
- AGI planning performance
- Automation script execution
- Database query performance
- LLM response caching

## Testing

### Test Coverage

- Unit tests for business logic
- Integration tests for workflows
- Property-based tests for algorithms
- E2E tests with Playwright

### Running Tests

```bash
# All tests
cargo test

# Specific test
cargo test test_name

# With output
cargo test -- --nocapture

# Integration tests only
cargo test --test '*'

# Exclude slow tests
cargo test --lib
```

### Test Organization

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sync_function() {
        // Test synchronous code
    }

    #[tokio::test]
    async fn test_async_function() {
        // Test async code
    }

    #[serial_test::serial]
    #[tokio::test]
    async fn test_with_database() {
        // Test that needs exclusive access
    }
}
```

## Configuration

### Environment Variables

- `RUST_LOG`: Logging level (debug, info, warn, error)
- `DATABASE_PATH`: Override database location
- `OPENAI_API_KEY`: OpenAI API key
- `ANTHROPIC_API_KEY`: Anthropic API key

### Compile-Time Features

```toml
[features]
default = ["ocr"]
ocr = ["tesseract"]           # OCR support
local-llm = ["llama-cpp-2"]   # Local LLM support
webrtc-support = ["webrtc"]   # WebRTC support
sentry = ["dep:sentry"]       # Error reporting
```

Build with specific features:

```bash
cargo build --features local-llm
```

## Troubleshooting

### Common Issues

**Database Locked**:
- Ensure WAL mode is enabled
- Check `busy_timeout` is set
- Close connections promptly

**Compilation Errors**:
- Update Rust: `rustup update`
- Clean build: `cargo clean`
- Check platform dependencies

**Performance Issues**:
- Enable release mode: `cargo build --release`
- Check PRAGMA settings
- Review query plans: `EXPLAIN QUERY PLAN`

### Debug Logging

Enable debug logging:

```bash
RUST_LOG=debug cargo tauri dev
```

Filter by module:

```bash
RUST_LOG=agiworkforce_desktop::core::agi=debug cargo tauri dev
```

## Contributing

### Code Style

- Follow Rust conventions
- Run `cargo fmt` before committing
- Ensure `cargo clippy` passes
- Add rustdoc comments to public APIs
- Write tests for new features

### Lints

Project uses strict lints:

```toml
[lints.rust]
warnings = "warn"
unsafe_code = "warn"
unused = "deny"
unused_imports = "deny"
unused_variables = "deny"
```

### Pull Request Checklist

- [ ] Code formatted with `cargo fmt`
- [ ] Clippy warnings resolved
- [ ] Tests added and passing
- [ ] Documentation updated
- [ ] Security implications reviewed
- [ ] Performance impact considered

## Build and Release

### Development Build

```bash
pnpm dev:desktop
```

### Production Build

```bash
pnpm build:desktop
```

Creates:
- macOS: DMG installer
- Windows: EXE installer
- Linux: AppImage

### Release Process

1. Update version in `Cargo.toml`
2. Update `CHANGELOG.md`
3. Run tests: `cargo test`
4. Build release: `pnpm build:desktop`
5. Test installer
6. Tag release: `git tag v1.0.0`
7. Push: `git push --tags`

## License

See LICENSE file for details.

## Resources

### Internal Documentation

- [Architecture Guide](./RUST_ARCHITECTURE.md)
- [Security Guide](./SECURITY.md)
- [Commands Reference](./COMMANDS.md)
- [Database Schema](./DATABASE.md)
- [Code Examples](./EXAMPLES.md)

### External Resources

- [Tauri Documentation](https://tauri.app/v2/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [Tokio Tutorial](https://tokio.rs/tokio/tutorial)
- [SQLite Documentation](https://www.sqlite.org/docs.html)

## Support

For issues and questions:
- GitHub Issues: Report bugs and feature requests
- Discussions: Ask questions and share ideas
- Documentation: Check docs first

## Acknowledgments

Built with:
- Tauri - Cross-platform desktop framework
- Tokio - Async runtime
- SQLite - Embedded database
- Serde - Serialization framework
- And many other amazing Rust crates
