'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AppBridge,
  buildAllowAttribute,
  McpUiResourceCspSchema,
  McpUiResourcePermissionsSchema,
  PostMessageTransport,
  RESOURCE_MIME_TYPE,
  type McpUiResourceCsp,
  type McpUiResourcePermissions,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import { TriangleAlert } from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';

import type { McpAppCardBody } from '@agiworkforce/types';
import { getCsrfToken } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

interface AppPayload {
  id: string;
  connectorId: string;
  resourceUri: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult: {
    isError?: boolean;
    structuredContent?: unknown;
    content: unknown[];
  };
}

interface AppResource {
  html: string;
  csp?: McpUiResourceCsp;
  permissions?: McpUiResourcePermissions;
}

interface PendingApproval {
  name: string;
  resolve: (approved: boolean) => void;
}

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

async function mcpOperation(connectorId: string, body: Record<string, unknown>): Promise<unknown> {
  const csrfToken = await getCsrfToken();
  const response = await fetch(`/api/connectors/${encodeURIComponent(connectorId)}/mcp`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(typeof json?.['error'] === 'string' ? json['error'] : 'MCP App request failed');
  }
  return json;
}

function extractAppResource(value: unknown, expectedUri: string): AppResource {
  const result = (value as { result?: { contents?: unknown[] } } | null)?.result;
  const content = result?.contents?.find(
    (candidate) =>
      candidate !== null &&
      typeof candidate === 'object' &&
      (candidate as Record<string, unknown>)['uri'] === expectedUri,
  ) as Record<string, unknown> | undefined;
  if (!content || content['mimeType'] !== RESOURCE_MIME_TYPE) {
    throw new Error('The MCP App resource did not return the required HTML MIME type');
  }
  const html =
    typeof content['text'] === 'string'
      ? content['text']
      : typeof content['blob'] === 'string'
        ? atob(content['blob'])
        : null;
  if (html === null) throw new Error('The MCP App resource has no HTML body');
  const metadata =
    content['_meta'] !== null && typeof content['_meta'] === 'object'
      ? (content['_meta'] as Record<string, unknown>)['ui']
      : undefined;
  const ui = metadata !== null && typeof metadata === 'object' ? metadata : {};
  const parsedCsp = McpUiResourceCspSchema.safeParse((ui as Record<string, unknown>)['csp']);
  const parsedPermissions = McpUiResourcePermissionsSchema.safeParse(
    (ui as Record<string, unknown>)['permissions'],
  );
  return {
    html,
    ...(parsedCsp.success ? { csp: parsedCsp.data } : {}),
    ...(parsedPermissions.success ? { permissions: parsedPermissions.data } : {}),
  };
}

export function McpAppCard({ body }: { body: McpAppCardBody }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [height, setHeight] = useState(360);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);

  useEffect(() => {
    let disposed = false;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const requestApproval = (name: string): Promise<boolean> =>
      new Promise((resolve) => setPendingApproval({ name, resolve }));

    const initialize = async () => {
      try {
        const payloadResponse = await fetch(`/api/mcp-apps/payload/${body.payloadId}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!payloadResponse.ok) throw new Error('This MCP App result expired or is unavailable');
        const payload = (await payloadResponse.json()) as AppPayload;
        if (
          payload.connectorId !== body.connectorId ||
          payload.resourceUri !== body.resourceUri ||
          payload.toolName !== body.toolName
        ) {
          throw new Error('MCP App payload identity mismatch');
        }
        const resourceEnvelope = await mcpOperation(body.connectorId, {
          operation: 'readResource',
          uri: body.resourceUri,
        });
        const resource = extractAppResource(resourceEnvelope, body.resourceUri);
        if (disposed) return;

        const bridge = new AppBridge(
          null,
          { name: 'AGI Workforce Web', version: '1' },
          { openLinks: {}, serverTools: {}, serverResources: {} },
          {
            hostContext: {
              platform: 'web',
              theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
              displayMode: 'inline',
              availableDisplayModes: ['inline'],
              containerDimensions: { maxHeight: 1_000 },
            },
          },
        );
        bridgeRef.current = bridge;
        bridge.oncalltool = async (params) => {
          const call = async (approved: boolean) =>
            (await mcpOperation(body.connectorId, {
              operation: 'callTool',
              name: params.name,
              arguments: params.arguments ?? {},
              approved,
            })) as { approvalRequired?: boolean; result?: unknown };
          let response = await call(false);
          if (response.approvalRequired) {
            const approved = await requestApproval(params.name);
            if (!approved) {
              return {
                isError: true,
                content: [{ type: 'text', text: 'The user declined this MCP App tool call.' }],
              };
            }
            response = await call(true);
          }
          return response.result as never;
        };
        bridge.onreadresource = async (params) => {
          const response = (await mcpOperation(body.connectorId, {
            operation: 'readResource',
            uri: params.uri,
          })) as { result?: unknown };
          return response.result as never;
        };
        bridge.onlistresources = async () => {
          const response = await fetch(
            `/api/connectors/${encodeURIComponent(body.connectorId)}/capabilities`,
            { credentials: 'include', cache: 'no-store' },
          );
          if (!response.ok) return { resources: [] };
          const catalog = (await response.json()) as { resources?: unknown[] };
          return { resources: catalog.resources ?? [] } as never;
        };
        bridge.onlistresourcetemplates = async () => {
          const response = await fetch(
            `/api/connectors/${encodeURIComponent(body.connectorId)}/capabilities`,
            { credentials: 'include', cache: 'no-store' },
          );
          if (!response.ok) return { resourceTemplates: [] };
          const catalog = (await response.json()) as { resourceTemplates?: unknown[] };
          return { resourceTemplates: catalog.resourceTemplates ?? [] } as never;
        };
        bridge.onlistprompts = async () => {
          const response = await fetch(
            `/api/connectors/${encodeURIComponent(body.connectorId)}/capabilities`,
            { credentials: 'include', cache: 'no-store' },
          );
          if (!response.ok) return { prompts: [] };
          const catalog = (await response.json()) as { prompts?: unknown[] };
          return { prompts: catalog.prompts ?? [] } as never;
        };
        bridge.onopenlink = async ({ url }) => {
          const parsed = new URL(url);
          if (parsed.protocol !== 'https:') throw new Error('MCP Apps may open HTTPS links only');
          window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
          return {};
        };
        bridge.onsizechange = ({ height: requestedHeight }) => {
          if (typeof requestedHeight === 'number') {
            setHeight(Math.max(180, Math.min(1_000, Math.round(requestedHeight))));
          }
        };
        bridge.oninitialized = () => {
          void bridge.sendToolInput({ arguments: payload.toolInput });
          void bridge.sendToolResult(payload.toolResult as never);
          setStatus('ready');
        };

        const readyMethod = 'ui/notifications/sandbox-proxy-ready';
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            window.removeEventListener('message', listener);
            reject(new Error('MCP App sandbox did not become ready'));
          }, 10_000);
          const listener = (event: MessageEvent) => {
            if (event.source !== iframe.contentWindow || event.data?.method !== readyMethod) return;
            window.clearTimeout(timeout);
            window.removeEventListener('message', listener);
            resolve();
          };
          window.addEventListener('message', listener);
          const configuredOrigin = process.env['NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN'];
          const sandboxUrl = new URL(
            '/api/mcp-apps/sandbox',
            configuredOrigin || window.location.origin,
          );
          if (resource.csp)
            sandboxUrl.searchParams.set('csp', base64Url(JSON.stringify(resource.csp)));
          const dedicatedOrigin = sandboxUrl.origin !== window.location.origin;
          iframe.setAttribute(
            'sandbox',
            dedicatedOrigin
              ? 'allow-scripts allow-same-origin allow-forms'
              : 'allow-scripts allow-forms',
          );
          const allow = buildAllowAttribute(resource.permissions);
          if (allow) iframe.setAttribute('allow', allow);
          iframe.src = sandboxUrl.toString();
        });
        if (disposed) return;
        await bridge.connect(
          new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!),
        );
        await bridge.sendSandboxResourceReady({
          html: resource.html,
          ...(resource.csp ? { csp: resource.csp } : {}),
          ...(resource.permissions ? { permissions: resource.permissions } : {}),
        });
      } catch (reason) {
        if (!disposed) {
          setStatus('error');
          setError(toUserMessage(reason, 'MCP App failed to load'));
        }
      }
    };
    void initialize();
    return () => {
      disposed = true;
      setPendingApproval((pending) => {
        pending?.resolve(false);
        return null;
      });
      void bridgeRef.current?.teardownResource({}).catch(() => undefined);
      void bridgeRef.current?.close().catch(() => undefined);
      bridgeRef.current = null;
    };
  }, [body.connectorId, body.payloadId, body.resourceUri, body.toolName]);

  return (
    <section className="my-2 overflow-hidden rounded-xl border border-border bg-card">
      {status === 'loading' ? (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
          <Spinner size="sm" aria-hidden="true" /> Loading MCP App…
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="flex gap-2 px-4 py-3 text-sm text-muted-foreground">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error ?? 'MCP App failed to load'}</span>
        </div>
      ) : null}
      <iframe
        ref={iframeRef}
        title={`${body.toolName} interactive result`}
        className={status === 'error' ? 'hidden' : 'block w-full border-0'}
        style={{ height }}
        referrerPolicy="no-referrer"
      />
      {pendingApproval ? (
        <div className="border-t border-border bg-muted/50 px-4 py-3">
          <p className="text-xs text-foreground">
            This App wants to run <span className="font-mono">{pendingApproval.name}</span>.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
              onClick={() => {
                pendingApproval.resolve(true);
                setPendingApproval(null);
              }}
            >
              Allow once
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground"
              onClick={() => {
                pendingApproval.resolve(false);
                setPendingApproval(null);
              }}
            >
              Deny
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
