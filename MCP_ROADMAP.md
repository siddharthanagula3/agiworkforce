# MCP (Model Context Protocol) Roadmap

## Current Status

**Last Updated:** November 10, 2025

### What Exists Today

The AGI Workforce project has **two MCP-related directories**:

1. **`apps/desktop/src-tauri/src/mcp/`** - Model Context Protocol client infrastructure
   - `client.rs` - MCP client implementation
   - `config.rs` - MCP configuration
   - `registry.rs` - MCP server registry
   - **Status:** ✅ Fully implemented

2. **`apps/desktop/src-tauri/src/mcps/`** - MCP Server Implementations (EMPTY)
   - `mod.rs` - Empty module (2 lines)
   - **Status:** ❌ Not implemented (placeholder only)

### Core Tools vs Extended MCP Tools

**Core Tools (✅ Implemented):**
- File operations (read, write)
- UI automation (screenshot, click, type)
- Browser automation (navigate, click, extract)
- Code execution (terminal commands)
- Database operations (query, execute, transactions)
- API calls (HTTP requests, uploads, downloads)
- Document processing (read, search, OCR)
- LLM integration (reasoning, code analysis)

**Extended MCP Tools (⚠️ Stubbed):**
- Email (send, fetch) - Returns placeholder messages
- Calendar (create events, list events) - Returns placeholder messages
- Cloud storage (upload, download) - Returns placeholder messages
- Productivity (create tasks) - Returns placeholder messages

---

## Architecture Decision

### Option A: Full MCP Implementation (4-6 weeks)

Implement dedicated MCP servers for each extended feature:

```
apps/desktop/src-tauri/src/mcps/
├── audio/          # Audio processing MCP
├── clipboard/      # Clipboard operations MCP
├── comms/          # Email, SMS, messaging MCP
├── database/       # Advanced database MCP (beyond core)
├── document/       # Document generation/editing MCP
├── http/           # Advanced HTTP/webhook MCP
├── productivity/   # Notion, Trello, Asana MCP
├── screen_ocr/     # Advanced OCR MCP
├── search/         # Web search MCP
├── security/       # Security scanning MCP
├── vcs/            # Git, version control MCP
└── window_app/     # Advanced window management MCP
```

**Pros:**
- Follows MCP standard architecture
- Clean separation of concerns
- Each MCP can be developed/tested independently
- Extensible for future plugins

**Cons:**
- Significant development time (4-6 weeks)
- Adds complexity
- May be over-engineering for current needs

**Implementation Effort:**
- Email MCP: 3-5 days (IMAP/SMTP integration)
- Calendar MCP: 4-6 days (Google/Outlook OAuth)
- Cloud Storage MCP: 5-7 days (Drive/Dropbox/OneDrive)
- Productivity MCP: 4-6 days (Notion/Trello/Asana APIs)
- Other MCPs: 2-3 days each

---

### Option B: Inline Implementation (1-2 weeks)

Extend existing tools directly without separate MCP servers:

```
apps/desktop/src-tauri/src/
├── communications/  # Email, calendar, SMS
├── cloud/           # Cloud storage integrations
├── productivity/    # Productivity app integrations
└── (existing modules remain)
```

**Pros:**
- Faster implementation (1-2 weeks vs 4-6 weeks)
- Simpler architecture
- No additional MCP overhead
- Fits current project structure

**Cons:**
- Less modular
- Harder to swap implementations
- Not following strict MCP standard

**Implementation Effort:**
- Email module: 2-3 days
- Calendar module: 3-4 days
- Cloud storage module: 4-5 days
- Productivity module: 3-4 days

---

### Option C: Defer Extended Features (Recommended for Alpha)

**Keep current approach** and clearly document extended tools as "Future Roadmap":

**Pros:**
- Focus on core functionality first
- Get to production faster
- Can implement based on actual user demand
- Core tools (22 implemented) are sufficient for Alpha/Beta

**Cons:**
- Extended features remain unavailable
- Some documentation cleanup needed

**Actions Required:**
- ✅ Update STATUS.md to clearly mark extended tools as stubbed (DONE)
- ✅ Update AUDIT_REPORT.md with honest assessment (DONE)
- ✅ Create this MCP_ROADMAP.md (DONE)
- Document stubbed tools will return "configuration required" messages

---

## Recommendation: **Option C for Now, Option B for Beta**

### Phase 1: Alpha (Current) ✅
- ✅ Core 22 tools fully operational
- ✅ Extended tools clearly marked as stubbed
- ✅ Documentation accurate
- **Timeline:** Complete

### Phase 2: Beta (Optional - Based on User Demand)
- Implement inline email/calendar/cloud/productivity modules (Option B)
- **Timeline:** 1-2 weeks when prioritized
- **Trigger:** User feedback indicates need for these features

### Phase 3: Production (Future)
- Consider full MCP implementation (Option A) if plugin ecosystem desired
- **Timeline:** 4-6 weeks when prioritized
- **Trigger:** Need for extensible plugin architecture

---

## Current mcps/ Directory Status

**File:** `apps/desktop/src-tauri/src/mcps/mod.rs`

```rust
// Empty module - MCP servers not yet implemented
// See MCP_ROADMAP.md for implementation plan
```

**Decision:** Keep empty for now. Remove from CLAUDE.md references until implemented.

---

## Extended Tool Implementation Guide

When implementing extended tools (Option B), follow this pattern:

### Example: Email Tool

```rust
// apps/desktop/src-tauri/src/communications/email.rs

use async_imap::Client;
use lettre::{Message, SmtpTransport, Transport};

pub struct EmailService {
    imap_client: Client<TlsStream<TcpStream>>,
    smtp_transport: SmtpTransport,
}

impl EmailService {
    pub async fn send(&self, to: &str, subject: &str, body: &str) -> Result<()> {
        let email = Message::builder()
            .to(to.parse()?)
            .subject(subject)
            .body(body.to_string())?;

        self.smtp_transport.send(&email)?;
        Ok(())
    }

    pub async fn fetch(&self, folder: &str, limit: usize) -> Result<Vec<Email>> {
        // IMAP fetch implementation
        todo!()
    }
}
```

### Integration Pattern

1. Create service in dedicated module
2. Add Tauri command wrapper
3. Register command in main.rs
4. Add to tool_executor.rs execution switch
5. Update documentation
6. Add integration tests

---

## Dependencies Already Available

These crates are already in Cargo.toml for extended tool implementation:

- **Email:** `async-imap = "0.9"`, `lettre = "0.11"`, `mailparse = "0.15"`
- **Database:** `tokio-postgres`, `mysql_async`, `mongodb`, `redis`
- **HTTP:** `reqwest`, `oauth2`

**Action Required:** Just implement the services and connect to tools.

---

## Testing Strategy

### Core Tools (Implemented)
- ✅ Unit tests for tool definitions
- ✅ Integration tests for file operations
- ⏳ E2E tests (Playwright) - Next phase

### Extended Tools (When Implemented)
- Mock tests for API interactions
- Integration tests with real services (opt-in)
- Error handling tests

---

## Metrics

### Current (Alpha)
- Core tools: 22/22 (100%)
- Extended tools: 0/7 (0%, stubbed)
- Test coverage: ~15-20% (after new tests)
- Overall completeness: 75% (sufficient for Alpha)

### Target (Beta)
- Core tools: 22/22 (100%)
- Extended tools: 4/7 (57%, email/calendar/cloud/productivity)
- Test coverage: 50%+
- Overall completeness: 90%

### Target (Production)
- Core tools: 22/22 (100%)
- Extended tools: 7/7 (100%)
- Test coverage: 70%+
- Overall completeness: 100%

---

## FAQ

**Q: Why is mcps/ empty?**
A: We opted to focus on core tools first. Extended MCP tools are planned for Beta based on user demand.

**Q: When will email/calendar/cloud tools work?**
A: These are stubbed for Alpha. Implementation planned for Beta if users request them (1-2 week effort).

**Q: Can I use the core tools now?**
A: Yes! All 22 core tools (file, UI, browser, database, API, document, code, LLM) are fully operational.

**Q: What's the difference between mcp/ and mcps/?**
A: `mcp/` is the MCP client infrastructure (implemented). `mcps/` was planned for MCP servers (deferred).

---

## References

- **MCP Specification:** https://modelcontextprotocol.io/
- **Core Tools:** See STATUS.md "Fully Operational Tools" section
- **Audit Report:** See AUDIT_REPORT.md section 2.1 and 2.2
- **Dependencies:** See apps/desktop/src-tauri/Cargo.toml lines 171-176

---

**Conclusion:** The mcps/ directory is intentionally empty for now. Core functionality is complete. Extended tools will be implemented in Beta based on actual user needs, not speculative features.
