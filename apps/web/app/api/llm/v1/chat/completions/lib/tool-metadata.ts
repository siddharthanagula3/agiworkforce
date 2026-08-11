/**
 * @file Server-owned tool metadata model (finding CON-10).
 *
 * WHY THIS EXISTS: destructiveness used to be a five-substring guess
 * (`name.includes('delete') || includes('write') || includes('create') ||
 * includes('update') || includes('remove')`) duplicated in
 * `apps/desktop/src/features/connectors/ConnectorGallery.tsx` and
 * `apps/desktop/src-tauri/src/core/llm/tool_executor/mod.rs`. That guess
 * classifies `send_email`, `post_message`, `post_issue_comment`,
 * `share_document`, `publish`, `deploy`, `revoke` and `invite` as
 * NON-destructive — including two of the three shipped GitHub connector tools.
 * A published comment cannot be un-published, so treating it as harmless is a
 * real safety defect, not a cosmetic one.
 *
 * This module replaces the guess with an explicit, declared model. Every tool
 * the platform ships declares four properties:
 *
 *   - `actionClass`  — what the call DOES:
 *       'read'           observes state, changes nothing
 *       'write'          creates or mutates state inside our trust boundary
 *       'delete'         destroys state
 *       'execute'        runs caller-supplied code
 *       'external_send'  emits something into a third-party system where other
 *                        people can see it (comments, reviews, messages, mail)
 *   - `reversible`   — whether the caller can undo the effect from inside the
 *                      product afterwards. A sandbox folder is reversible; a
 *                      posted GitHub comment is not (it fires notifications and
 *                      may be mirrored to email before any deletion).
 *   - `acceptsUntrustedContent` — whether the tool RETURNS content authored by
 *                      someone other than the user (web pages, search results,
 *                      pull-request diffs). Such content lands in the model
 *                      context and is a prompt-injection carrier.
 *   - `createsEgressPath` — whether calling the tool can move bytes out of the
 *                      trust boundary in an attacker-influenceable way (a URL,
 *                      a query string, a comment body, arbitrary sandbox
 *                      network access).
 *
 * NOT `server-only`: this is a pure lookup table with no I/O, imported by the
 * agentic tool loop AND by `/api/connectors/permissions` (which derives the
 * persisted `destructive` column from it — finding CON-9 — instead of trusting
 * a client-supplied boolean the live web client never even sends).
 */

import { parseQualifiedToolName } from '@/lib/mcp-tool-executor';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';

/** What a tool call actually does. See the file docstring for semantics. */
export type ToolActionClass = 'read' | 'write' | 'delete' | 'execute' | 'external_send';

export interface ToolMetadata {
  actionClass: ToolActionClass;
  /** Can the user undo this from inside the product after it happened? */
  reversible: boolean;
  /** Does the result carry content authored outside the user's trust boundary? */
  acceptsUntrustedContent: boolean;
  /** Can this call move bytes out of the trust boundary? */
  createsEgressPath: boolean;
  /**
   * True only for entries this module actually declares. `false` marks the
   * conservative fallback applied to unknown MCP/connector tools, so callers
   * can log/telemeter "we guessed" separately from "we know".
   */
  declared: boolean;
}

/** Platform (first-party) tool names, matching the executors in the tool loop. */
export const PLATFORM_TOOL_METADATA: Readonly<Record<string, ToolMetadata>> = Object.freeze({
  // Platform search. Read-only with respect to our own state, but the QUERY is
  // model-authored and leaves the boundary, and the RESULTS are attacker-
  // authored web text — so it is both an untrusted-content source and an
  // egress path.
  web_search: {
    actionClass: 'read',
    reversible: true,
    acceptsUntrustedContent: true,
    createsEgressPath: true,
    declared: true,
  },
  // Builds provider search URLs locally and displays them behind explicit user
  // buttons. No request leaves the boundary until the user chooses a provider.
  search_maps: {
    actionClass: 'read',
    reversible: true,
    acceptsUntrustedContent: false,
    createsEgressPath: false,
    declared: true,
  },
  // SSRF-guarded single-page fetch. Same reasoning as web_search: the URL is a
  // classic exfiltration channel (secrets pasted into a query string) and the
  // page body is untrusted.
  url_fetch: {
    actionClass: 'read',
    reversible: true,
    acceptsUntrustedContent: true,
    createsEgressPath: true,
    declared: true,
  },
  // E2B sandbox code execution. Arbitrary model-authored code with network
  // access: the widest egress path the platform offers, and not undoable.
  execute_code: {
    actionClass: 'execute',
    reversible: false,
    acceptsUntrustedContent: false,
    createsEgressPath: true,
    declared: true,
  },
  // Sandbox file write — overwrites in place, so not reversible.
  write_file: {
    actionClass: 'write',
    reversible: false,
    acceptsUntrustedContent: false,
    createsEgressPath: false,
    declared: true,
  },
  // Creating a sandbox folder is additive and trivially undone.
  create_folder: {
    actionClass: 'write',
    reversible: true,
    acceptsUntrustedContent: false,
    createsEgressPath: false,
    declared: true,
  },
  // Managed Office file generation writes a NEW file into the user's own media
  // library; it never overwrites and the user can delete it.
  create_office_file: {
    actionClass: 'write',
    reversible: true,
    acceptsUntrustedContent: false,
    createsEgressPath: false,
    declared: true,
  },
  // Skill activation reads a server-owned catalog entry. The catalog is
  // operator-curated, so it is not treated as an untrusted-content source.
  skill: {
    actionClass: 'read',
    reversible: true,
    acceptsUntrustedContent: false,
    createsEgressPath: false,
    declared: true,
  },
});

/**
 * Shipped GitHub connector tools (`GITHUB_TOOL_DEFS` in
 * `lib/user-connector-tools.ts`), keyed by BARE tool name under serverId
 * `github`.
 */
const GITHUB_TOOL_METADATA: Readonly<Record<string, ToolMetadata>> = Object.freeze({
  // A PR diff is authored by whoever opened the pull request — on a public
  // repository that is an anonymous third party. Prime prompt-injection input.
  get_pull_request_diff: {
    actionClass: 'read',
    reversible: true,
    acceptsUntrustedContent: true,
    createsEgressPath: false,
    declared: true,
  },
  // Publishing a comment notifies subscribers and is mirrored to email before
  // any later deletion can take effect: irreversible, and the body is a
  // free-form egress channel. The legacy substring guess called this
  // NON-destructive.
  post_issue_comment: {
    actionClass: 'external_send',
    reversible: false,
    acceptsUntrustedContent: false,
    createsEgressPath: true,
    declared: true,
  },
  post_pull_request_review: {
    actionClass: 'external_send',
    reversible: false,
    acceptsUntrustedContent: false,
    createsEgressPath: true,
    declared: true,
  },
});

const CONNECTOR_TOOL_METADATA: Readonly<Record<string, Readonly<Record<string, ToolMetadata>>>> =
  Object.freeze({
    github: GITHUB_TOOL_METADATA,
  });

/**
 * Conservative classification for a tool this module does not declare — every
 * user-added custom MCP server, and every operator-mapped remote connector.
 *
 * UNKNOWN MEANS WRITE, NOT READ. A remote MCP server can name a mutating tool
 * anything at all (`list_and_archive`, `fetch_and_send`), so a name-shaped
 * guess is exactly the failure this module exists to remove. Unknown tools are
 * therefore treated as irreversible writes that both consume untrusted content
 * and provide egress: they never run in parallel with anything, they never
 * auto-approve on the lethal-trifecta path, and they count as destructive.
 */
export const UNKNOWN_TOOL_METADATA: ToolMetadata = Object.freeze({
  actionClass: 'write',
  reversible: false,
  acceptsUntrustedContent: true,
  createsEgressPath: true,
  declared: false,
});

/**
 * Resolve metadata for a tool as the loop sees it. `name` may be a bare
 * platform tool name (`web_search`) or an MCP-qualified name
 * (`mcp__github__post_issue_comment`).
 */
export function resolveToolMetadata(name: string): ToolMetadata {
  const platform = PLATFORM_TOOL_METADATA[name];
  if (platform) return platform;

  const parsed = parseQualifiedToolName(name);
  if (parsed) {
    const connector = CONNECTOR_TOOL_METADATA[parsed.serverId]?.[parsed.toolName];
    if (connector) return connector;
  }
  return UNKNOWN_TOOL_METADATA;
}

/**
 * Resolve metadata from a (connectorId, toolName) pair — the shape the
 * connector permission store and `/api/connectors/permissions` speak.
 */
export function resolveConnectorToolMetadata(connectorId: string, toolName: string): ToolMetadata {
  return (
    CONNECTOR_TOOL_METADATA[connectorId]?.[toolName] ??
    PLATFORM_TOOL_METADATA[toolName] ??
    UNKNOWN_TOOL_METADATA
  );
}

/**
 * Server-side destructiveness verdict (finding CON-9). A call is destructive
 * when it deletes, when it publishes into a third-party system, or when it
 * mutates/executes without being undoable. Read-only and reversible writes are
 * not destructive.
 */
export function isDestructiveToolMetadata(metadata: ToolMetadata): boolean {
  switch (metadata.actionClass) {
    case 'read':
      return false;
    case 'delete':
    case 'external_send':
      return true;
    case 'write':
    case 'execute':
      return !metadata.reversible;
  }
}

/** Convenience wrapper used by the connector permissions route. */
export function isDestructiveConnectorTool(connectorId: string, toolName: string): boolean {
  return isDestructiveToolMetadata(resolveConnectorToolMetadata(connectorId, toolName));
}

/**
 * Parallel-safety (finding SYS-25). Only DECLARED read-class tools may run
 * concurrently: they observe state and cannot race each other. Everything else
 * — writes, deletes, executions, external sends, and every undeclared MCP tool
 * — serializes, preserving the loop's "mutating tools are serial" guarantee.
 */
export function isParallelSafeTool(name: string): boolean {
  const metadata = resolveToolMetadata(name);
  return metadata.declared && metadata.actionClass === 'read';
}

/**
 * Does this tool call open an egress path? Used as the `E` term of the
 * lethal-trifecta check (finding CON-19).
 */
export function toolCreatesEgressPath(name: string): boolean {
  return resolveToolMetadata(name).createsEgressPath;
}

/**
 * Does this tool call pull untrusted (third-party-authored) content into the
 * model context? Used to raise the `U` term of the lethal-trifecta check once
 * such a call has actually completed in this turn.
 */
export function toolAcceptsUntrustedContent(name: string): boolean {
  return resolveToolMetadata(name).acceptsUntrustedContent;
}

/**
 * Is this offered tool a SENSITIVE SOURCE — i.e. can it reach data that belongs
 * to the user, from OUTSIDE this conversation? Used as the `S` term of the
 * lethal-trifecta check (finding CON-19).
 *
 * Derived rather than declared, because sensitivity is a property of WHERE a
 * tool reads from, which the offered-catalog entry already records: anything
 * namespaced through MCP (`mcp__<server>__<tool>`) — operator-mapped
 * connectors, the user's own custom remote MCP servers, the first-party GitHub
 * built-in — reaches a system the user separately authenticated to.
 *
 * DELIBERATELY EXCLUDED, and why:
 *   - `web_search` / `url_fetch` read PUBLIC pages. They are the exfiltration
 *     end of the trifecta (`E`), not the private-data end.
 *   - `execute_code` reaches only the conversation's own E2B workspace, whose
 *     contents this conversation put there and which the model already has in
 *     context. Counting it would escalate ordinary "search the web, then run
 *     some code" turns — a large false-positive rate for no added protection,
 *     since reading back this conversation's own files grants the attacker
 *     nothing they did not already have.
 *   - `create_office_file` / `skill` read nothing private.
 *
 * The consequence is that the check bites exactly where it matters: a turn with
 * a connected connector, where an `allow` verdict would otherwise have
 * auto-executed an egress tool right after untrusted content entered context.
 */
export function isSensitiveSourceTool(
  def: Pick<WebMcpToolDef, 'qualifiedName' | 'origin'>,
): boolean {
  if (PLATFORM_TOOL_METADATA[def.qualifiedName]) return false;
  return parseQualifiedToolName(def.qualifiedName) !== null || def.origin === 'connector';
}
