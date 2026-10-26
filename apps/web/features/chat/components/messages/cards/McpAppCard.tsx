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
import {
  ConnectorCapabilityCatalogSchema,
  ConnectorMcpOperationResponseSchema,
  connectorCapabilitiesPath,
  connectorErrorMessage,
  connectorMcpPath,
  type ConnectorCapabilityCatalog,
  type ConnectorMcpOperationRequest,
  type ConnectorMcpOperationResponse,
} from '@agiworkforce/cloud-contracts';
import { TriangleAlert } from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';

import type { McpAppCardBody } from '@agiworkforce/types';
import { getCsrfToken } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import { logger } from '@shared/lib/logger';

export const MCP_APP_RESOURCE_MAX_BYTES = 2 * 1024 * 1024;
export const MCP_APP_TOO_LARGE_MESSAGE = "This app's content is too large to display.";
export const MCP_APP_SANDBOX_UNAVAILABLE_MESSAGE =
  "This app can't be displayed here, so the tool's result is shown instead.";

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

const DEVICE_PERMISSIONS = ['camera', 'microphone', 'geolocation', 'clipboardWrite'] as const;

type DevicePermission = (typeof DEVICE_PERMISSIONS)[number];

type DeviceGrant = 'unneeded' | 'pending' | 'granted' | 'denied';

const DEVICE_PERMISSION_LABEL: Record<DevicePermission, string> = {
  camera: 'camera',
  microphone: 'microphone',
  geolocation: 'location',
  clipboardWrite: 'clipboard',
};

export function requestedDevicePermissions(
  permissions: McpUiResourcePermissions | undefined,
): DevicePermission[] {
  if (!permissions) return [];
  return DEVICE_PERMISSIONS.filter((key) => permissions[key] !== undefined);
}

export function deviceAccessSentence(names: readonly DevicePermission[]): string {
  const labels = names.map((name) => DEVICE_PERMISSION_LABEL[name]);
  if (labels.length === 0) return 'This app wants to use this device.';
  if (labels.length === 1) return `This app wants to use your ${labels[0]}.`;
  const last = labels[labels.length - 1];
  return `This app wants to use your ${labels.slice(0, -1).join(', ')} and ${last}.`;
}

function permissionsForGrant(
  permissions: McpUiResourcePermissions | undefined,
  grant: DeviceGrant,
): McpUiResourcePermissions | undefined {
  if (!permissions || grant === 'granted') return permissions;
  const next: McpUiResourcePermissions = { ...permissions };
  for (const key of DEVICE_PERMISSIONS) delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}

interface PendingApproval {
  name: string;
  resolve: (approved: boolean) => void;
}

interface PlainResultFallback {
  notice: string;
  text: string;
}

class McpAppFallback extends Error {
  constructor(
    readonly reason: 'sandbox_origin_unavailable' | 'resource_too_large',
    readonly notice: string,
  ) {
    super(notice);
  }
}

function dedicatedSandboxUrl(): URL | null {
  const configuredOrigin = process.env['NEXT_PUBLIC_MCP_APP_SANDBOX_ORIGIN'];
  const sandboxUrl = new URL('/api/mcp-apps/sandbox', configuredOrigin || window.location.origin);
  if (sandboxUrl.origin !== window.location.origin) return sandboxUrl;
  // MCP Apps requires the sandbox proxy on an origin distinct from the host, so
  // a production build renders the plain result rather than degrade silently.
  return process.env.NODE_ENV === 'production' ? null : sandboxUrl;
}

function plainResultText(result: AppPayload['toolResult']): string {
  const text = result.content
    .map((block) =>
      block !== null &&
      typeof block === 'object' &&
      (block as Record<string, unknown>)['type'] === 'text' &&
      typeof (block as Record<string, unknown>)['text'] === 'string'
        ? ((block as Record<string, unknown>)['text'] as string)
        : null,
    )
    .filter((value): value is string => value !== null)
    .join('\n\n');
  if (text) return text;
  return result.structuredContent === undefined
    ? ''
    : JSON.stringify(result.structuredContent, null, 2);
}

function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

const MCP_APP_REQUEST_FAILED = 'MCP App request failed';

async function mcpOperation(
  connectorId: string,
  body: ConnectorMcpOperationRequest,
): Promise<ConnectorMcpOperationResponse> {
  const csrfToken = await getCsrfToken();
  const response = await fetch(connectorMcpPath(connectorId), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify(body),
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(connectorErrorMessage(json, MCP_APP_REQUEST_FAILED));
  const parsed = ConnectorMcpOperationResponseSchema.safeParse(json);
  if (!parsed.success) throw new Error(MCP_APP_REQUEST_FAILED);
  return parsed.data;
}

async function fetchCapabilityCatalog(
  connectorId: string,
): Promise<ConnectorCapabilityCatalog | null> {
  const response = await fetch(connectorCapabilitiesPath(connectorId), {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const parsed = ConnectorCapabilityCatalogSchema.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
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
  const byteLength =
    typeof content['text'] === 'string'
      ? new TextEncoder().encode(content['text']).byteLength
      : typeof content['blob'] === 'string'
        ? Math.floor((content['blob'].length * 3) / 4)
        : null;
  if (byteLength === null) throw new Error('The MCP App resource has no HTML body');
  if (byteLength > MCP_APP_RESOURCE_MAX_BYTES) {
    throw new McpAppFallback('resource_too_large', MCP_APP_TOO_LARGE_MESSAGE);
  }
  const html =
    typeof content['text'] === 'string' ? content['text'] : atob(content['blob'] as string);
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
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'fallback'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<PlainResultFallback | null>(null);
  const [height, setHeight] = useState(360);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const resourceKey = `${body.payloadId}\0${body.connectorId}\0${body.resourceUri}\0${body.toolName}`;
  const [trackedResourceKey, setTrackedResourceKey] = useState(resourceKey);
  const [deviceGrant, setDeviceGrant] = useState<DeviceGrant>('unneeded');
  const [deviceAsk, setDeviceAsk] = useState<DevicePermission[] | null>(null);
  if (trackedResourceKey !== resourceKey) {
    setTrackedResourceKey(resourceKey);
    setDeviceGrant('unneeded');
    setDeviceAsk(null);
  }

  useEffect(() => {
    let disposed = false;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const requestApproval = (name: string): Promise<boolean> =>
      new Promise((resolve) => setPendingApproval({ name, resolve }));

    const initialize = async () => {
      let payload: AppPayload | null = null;
      try {
        const payloadResponse = await fetch(`/api/mcp-apps/payload/${body.payloadId}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!payloadResponse.ok) throw new Error('This MCP App result expired or is unavailable');
        const appPayload = (await payloadResponse.json()) as AppPayload;
        if (
          appPayload.connectorId !== body.connectorId ||
          appPayload.resourceUri !== body.resourceUri ||
          appPayload.toolName !== body.toolName
        ) {
          throw new Error('MCP App payload identity mismatch');
        }
        payload = appPayload;
        const sandboxUrl = dedicatedSandboxUrl();
        if (!sandboxUrl) {
          throw new McpAppFallback(
            'sandbox_origin_unavailable',
            MCP_APP_SANDBOX_UNAVAILABLE_MESSAGE,
          );
        }
        const resourceEnvelope = await mcpOperation(body.connectorId, {
          operation: 'readResource',
          uri: body.resourceUri,
        });
        const resource = extractAppResource(resourceEnvelope, body.resourceUri);
        if (disposed) return;
        const requestedDevices = requestedDevicePermissions(resource.permissions);
        if (requestedDevices.length > 0 && deviceGrant === 'unneeded') {
          setDeviceAsk(requestedDevices);
          setDeviceGrant('pending');
          return;
        }
        if (requestedDevices.length > 0 && deviceGrant === 'pending') return;
        const grantedPermissions = permissionsForGrant(resource.permissions, deviceGrant);

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
            mcpOperation(body.connectorId, {
              operation: 'callTool',
              name: params.name,
              arguments: params.arguments ?? {},
              approved,
            });
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
          const response = await mcpOperation(body.connectorId, {
            operation: 'readResource',
            uri: params.uri,
          });
          return response.result as never;
        };
        bridge.onlistresources = async () => {
          const catalog = await fetchCapabilityCatalog(body.connectorId);
          return { resources: catalog?.resources ?? [] } as never;
        };
        bridge.onlistresourcetemplates = async () => {
          const catalog = await fetchCapabilityCatalog(body.connectorId);
          return { resourceTemplates: catalog?.resourceTemplates ?? [] } as never;
        };
        bridge.onlistprompts = async () => {
          const catalog = await fetchCapabilityCatalog(body.connectorId);
          return { prompts: catalog?.prompts ?? [] } as never;
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
          void bridge.sendToolInput({ arguments: appPayload.toolInput });
          void bridge.sendToolResult(appPayload.toolResult as never);
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
          if (resource.csp)
            sandboxUrl.searchParams.set('csp', base64Url(JSON.stringify(resource.csp)));
          const dedicatedOrigin = sandboxUrl.origin !== window.location.origin;
          iframe.setAttribute(
            'sandbox',
            dedicatedOrigin
              ? 'allow-scripts allow-same-origin allow-forms'
              : 'allow-scripts allow-forms',
          );
          const allow = buildAllowAttribute(grantedPermissions);
          if (allow) iframe.setAttribute('allow', allow);
          else iframe.removeAttribute('allow');
          iframe.src = sandboxUrl.toString();
        });
        if (disposed) return;
        await bridge.connect(
          new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!),
        );
        await bridge.sendSandboxResourceReady({
          html: resource.html,
          ...(resource.csp ? { csp: resource.csp } : {}),
          ...(grantedPermissions ? { permissions: grantedPermissions } : {}),
        });
      } catch (reason) {
        if (disposed) return;
        if (reason instanceof McpAppFallback && payload) {
          logger.error('[mcp-app] rendering the plain tool result instead of the app', {
            reason: reason.reason,
            connectorId: body.connectorId,
            toolName: body.toolName,
          });
          setFallback({ notice: reason.notice, text: plainResultText(payload.toolResult) });
          setStatus('fallback');
          return;
        }
        setStatus('error');
        setError(toUserMessage(reason, 'MCP App failed to load'));
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
  }, [body.connectorId, body.payloadId, body.resourceUri, body.toolName, deviceGrant]);

  return (
    <section className="my-2 overflow-hidden rounded-xl border border-border bg-card">
      {status === 'loading' && !deviceAsk ? (
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
      {status === 'fallback' && fallback ? (
        <div className="px-4 py-3 text-sm">
          <div className="flex gap-2 text-muted-foreground">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{fallback.notice}</span>
          </div>
          {fallback.text ? (
            <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-sm text-foreground">
              {fallback.text}
            </pre>
          ) : null}
        </div>
      ) : null}
      <iframe
        ref={iframeRef}
        title={`${body.toolName} interactive result`}
        className={
          status === 'error' || status === 'fallback' || deviceAsk
            ? 'hidden'
            : 'block w-full border-0'
        }
        style={{ height }}
        referrerPolicy="no-referrer"
      />
      {deviceAsk ? (
        <div className="border-t border-border bg-muted/50 px-4 py-3">
          <p className="text-xs text-foreground">{deviceAccessSentence(deviceAsk)}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
              onClick={() => {
                setDeviceGrant('granted');
                setDeviceAsk(null);
              }}
            >
              Allow once
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground"
              onClick={() => {
                setDeviceGrant('denied');
                setDeviceAsk(null);
              }}
            >
              Deny
            </button>
          </div>
        </div>
      ) : null}
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
