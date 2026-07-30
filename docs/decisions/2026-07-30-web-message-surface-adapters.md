# Keep Web Message and Thinking Components as Surface Adapters

Status: Accepted

Date: 2026-07-30

Owners: Chat platform and Web

## Context

`@agiworkforce/unified-chat` is the suite spine and owns portable chat
primitives. Desktop renders its package `MessageBubble`, `ThinkingBlock`, and
`ToolCallCard` directly. Web predates that shell and its message boundary also
owns browser/account behaviors that are not present in the portable message
contract:

- authenticated tool-approval resume and expired-turn recovery;
- edit, regenerate, delete, pin, reaction, branch, and read-aloud actions;
- research, citations, source contributions, paywall, and artifact projection;
- image/video regeneration and attachment lightboxes;
- web-specific streaming animation and reduced-motion behavior.

Replacing Web's message component with the smaller package component would
either remove those behaviors or move Web stores, auth, billing, and routing
dependencies into the shared package. Both outcomes make the shared boundary
less honest.

The tool-call renderer has no such conflict. Web already maps its object-shaped
tool call into the package `ToolCallCard`, keeping approval transport in its
adapter.

## Decision

The shared package owns message, thinking, and tool-call presentation
primitives. Web may keep `MessageBubble` and `ThinkingBlock` as surface
adapters while they own the browser/account behaviors above.

Web must not fork `ToolCallCard`; its adapter continues to delegate rendering
to `@agiworkforce/unified-chat`. New host-neutral rendering or accessibility
behavior belongs in the package first. New Web-only transport, billing, store,
or browser behavior stays in the Web adapter.

The exception must be revisited when the package message contract can express
Web's action callbacks, research/media projections, and streaming lifecycle
without importing Web stores or authentication.

## Consequences

Desktop and Web deliberately have different message orchestration components,
but reusable rendering continues to converge in the package. The boundary is
explicit and reviewable instead of being an accidental fork. Web retains its
tested account and browser behavior, while the already-shared tool-call path
prevents the most security-sensitive card from drifting.
