# Architecture Documentation

Technical architecture documentation for AGI Workforce.

## Overview

AGI Workforce is built as a multi-tier distributed system with:

- **Desktop App**: Tauri (Rust + React) with local SQLite
- **Web Platform**: Next.js 16 for billing and device sync
- **Backend Services**: Express API Gateway + WebSocket Signaling

## Documents

| Document                                    | Description                      |
| ------------------------------------------- | -------------------------------- |
| [Overview](overview.md)                     | High-level system architecture   |
| [WebSocket Protocol](websocket-protocol.md) | Real-time communication protocol |
| [Database](database/)                       | Database schema and patterns     |

## Core Principles

1. **Chat-First**: All functionality through natural language
2. **Full Autonomy**: AI completes goals without step-by-step approval
3. **Undo-Based Safety**: All actions are reversible
4. **Hidden Complexity**: MCP and technical details are invisible to users

## See Also

- [ARCHITECTURE.md](../../ARCHITECTURE.md) - Complete architecture reference
- [CLAUDE.md](../../CLAUDE.md) - Development guidelines
