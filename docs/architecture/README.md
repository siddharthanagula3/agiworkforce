# Architecture Documentation

_Updated: 2026-03-19 | Wave 5 Documentation Release_

This directory contains detailed architecture guides for AGI Workforce's advanced subsystems. Each document covers design decisions, component interactions, and implementation patterns.

## Core Guides

| Document                                 | Topic                        | Key Features                                          |
| ---------------------------------------- | ---------------------------- | ----------------------------------------------------- |
| [EVENT_TRIGGERS.md](./EVENT_TRIGGERS.md) | Event-driven agent execution | Cron, webhooks, file watchers, approval gates         |
| [AGENT_TO_AGENT.md](./AGENT_TO_AGENT.md) | Agent collaboration protocol | Task delegation, handoffs, capability discovery       |
| [MCP_APPS.md](./MCP_APPS.md)             | Interactive tool UIs         | Sandboxed iframes, real-time rendering, event routing |
| [CROSS_DEVICE.md](./CROSS_DEVICE.md)     | Multi-device synchronization | WebRTC streams, persistent threads, mobile dashboards |

## Quick Links

### For Feature Developers

- **Adding a new trigger type**: See [EVENT_TRIGGERS.md](./EVENT_TRIGGERS.md#trigger-configuration)
- **Building an MCP App**: See [MCP_APPS.md](./MCP_APPS.md#tool-server-implementation)
- **Implementing A2A handoff**: See [AGENT_TO_AGENT.md](./AGENT_TO_AGENT.md#pattern-3-conversation-handoff)
- **Supporting cross-device**: See [CROSS_DEVICE.md](./CROSS_DEVICE.md#data-flow-desktop--mobile)

### For Security Review

- **A2A authentication**: [AGENT_TO_AGENT.md#security](./AGENT_TO_AGENT.md#security)
- **MCP App sandboxing**: [MCP_APPS.md#security-considerations](./MCP_APPS.md#security-considerations)
- **Cross-device encryption**: [CROSS_DEVICE.md#security-considerations](./CROSS_DEVICE.md#security-considerations)
- **Event trigger validation**: [EVENT_TRIGGERS.md#security-considerations](./EVENT_TRIGGERS.md#security-considerations)

### For Integrations

- **Tool server responding with MCP App**: [MCP_APPS.md#returning-an-mcp-app](./MCP_APPS.md#returning-an-mcp-app)
- **Tool server handling A2A requests**: [AGENT_TO_AGENT.md#pattern-1-task-delegation-fire-and-forget](./AGENT_TO_AGENT.md#pattern-1-task-delegation-fire-and-forget)
- **Webhook trigger setup**: [EVENT_TRIGGERS.md#webhook-trigger](./EVENT_TRIGGERS.md#webhook-trigger)

## Architecture Principles

### 1. Transport Agnosticism

Systems are designed to work across multiple transport layers (in-process, HTTP, WebRTC) without code changes. A2A protocol and cross-device messaging exemplify this pattern.

### 2. Sandboxing

Untrusted content (MCP Apps, external tool outputs) run in sandboxed contexts (iframes, isolated processes) to prevent security escapes.

### 3. Approval Gates

Dangerous operations (tool execution, mobile approvals, long-running agents) require explicit user approval before proceeding.

### 4. Real-Time Streaming

Execution streams (agent actions, tool results) flow in real-time to relevant surfaces (desktop, mobile, web) via event channels and WebRTC.

### 5. Eventual Consistency

Cross-device state uses optimistic updates with eventual cloud sync, tolerating temporary inconsistency for responsiveness.

## Related Documentation

- **Security audit**: `docs/OWASP_AGENTIC_AUDIT.md` — Threat model, vulnerability assessment, mitigations
- **Competitive analysis**: `docs/DESKTOP_COMPETITIVE_AUDIT.md` — Features vs Claude Desktop, ChatGPT
- **Codebase metrics**: `docs/DESKTOP_ARCHITECTURE.md` — Module quality scores, IPC boundaries, LOC breakdown

## Contributing

When adding new subsystem docs:

1. Follow the structure: Overview → Architecture → Components → Patterns → Security → Future
2. Include code examples and type signatures from the actual implementation
3. Link to related guides in "Architecture Principles" section
4. Update this README with a new row in the "Core Guides" table

## Wave 5 Summary

These four documents capture the major architectural additions of Wave 5:

- **Event Triggers** enable automated workflows based on external events
- **A2A Protocol** enables agent collaboration and task delegation
- **MCP Apps** enable rich interactive UIs from tool servers
- **Cross-Device** enables persistent, synchronized experiences across all surfaces

Together, they represent a significant step toward an autonomous, collaborative, multi-device AI agent platform.
