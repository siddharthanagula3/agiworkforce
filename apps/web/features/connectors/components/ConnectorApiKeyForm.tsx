'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';

import {
  ConnectorCredentialStatusResponseSchema,
  SaveConnectorCredentialResponseSchema,
  connectorCredentialsPath,
  connectorErrorMessage,
  type ConnectorCredentialStatusResponse,
  type SaveConnectorCredentialRequest,
  type SaveConnectorCredentialResponse,
} from '@agiworkforce/cloud-contracts';
import { Spinner } from '@agiworkforce/ui';

import { getCsrfToken } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

import { invalidateConnectorsCache } from '../hooks/use-connectors';

const CSRF_HEADER = 'x-csrf-token';
const JSON_CONTENT_TYPE = 'application/json';
const SHOWN_TOOL_NAMES = 6;

const API_KEY_LABEL = 'API key';
const SUBMIT_LABEL = 'Test and save';
const REPLACE_LABEL = 'Test and replace';
const SUBMITTING_LABEL = 'Testing the key';
const CANCEL_LABEL = 'Cancel';
const RETRY_LABEL = 'Try again';
const DOCUMENTATION_LABEL = 'Where to find this key';
const LOADING_LABEL = 'Checking how this server accepts a key';
const LOAD_FAILED_COPY = 'Could not read how this connector accepts a key.';
const SAVE_FAILED_COPY = 'The key could not be tested. Try again.';
const HEADER_HINT_PREFIX = 'Sent as the';
const HEADER_HINT_SUFFIX = 'header on every request, stored encrypted.';
const ALREADY_SAVED_COPY = 'A key is already saved. Entering a new one replaces it.';
const CONNECTED_PREFIX = 'Connected.';
const TOOLS_SUFFIX = 'tools discovered';
const NO_TOOLS_COPY = 'The server answered but lists no tools yet.';

const SaveResultSchema = SaveConnectorCredentialResponseSchema.pick({
  toolCount: true,
  toolNames: true,
});

type SaveResult = Pick<SaveConnectorCredentialResponse, 'toolCount' | 'toolNames'>;

export interface ConnectorApiKeyFormProps {
  connectorId: string;
  onConnected?: (result: SaveResult) => void;
  onCancel?: () => void;
}

export function ConnectorApiKeyForm({
  connectorId,
  onConnected,
  onCancel,
}: ConnectorApiKeyFormProps) {
  const inputId = useId();
  const [spec, setSpec] = useState<ConnectorCredentialStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SaveResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(connectorCredentialsPath(connectorId), { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(connectorErrorMessage(body, LOAD_FAILED_COPY));
        const parsed = ConnectorCredentialStatusResponseSchema.safeParse(body);
        if (!parsed.success) throw new Error(LOAD_FAILED_COPY);
        if (!cancelled) setSpec(parsed.data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setLoadError(toUserMessage(reason, LOAD_FAILED_COPY));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectorId, attempt]);

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const key = apiKey.trim();
      if (!key || saving) return;
      setSaving(true);
      setSaveError(null);
      try {
        const csrfToken = await getCsrfToken();
        const request: SaveConnectorCredentialRequest = { apiKey: key };
        const response = await fetch(connectorCredentialsPath(connectorId), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': JSON_CONTENT_TYPE, [CSRF_HEADER]: csrfToken },
          body: JSON.stringify(request),
        });
        const body: unknown = await response.json().catch(() => null);
        const parsed = response.ok ? SaveResultSchema.safeParse(body) : null;
        if (!parsed?.success) {
          setSaveError(connectorErrorMessage(body, SAVE_FAILED_COPY));
          return;
        }
        const result: SaveResult = parsed.data;
        setSaved(result);
        setApiKey('');
        invalidateConnectorsCache();
        onConnected?.(result);
      } catch (reason) {
        setSaveError(toUserMessage(reason, SAVE_FAILED_COPY));
      } finally {
        setSaving(false);
      }
    },
    [apiKey, connectorId, onConnected, saving],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/80 px-3 py-3 text-xs text-muted-foreground">
        <Spinner size="sm" aria-label={LOADING_LABEL} />
        {LOADING_LABEL}
      </div>
    );
  }

  if (loadError || !spec) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-border/80 px-3 py-3 text-xs text-muted-foreground"
      >
        <p>{loadError ?? LOAD_FAILED_COPY}</p>
        <button
          type="button"
          className="mt-2 font-medium text-foreground underline"
          onClick={() => setAttempt((value) => value + 1)}
        >
          {RETRY_LABEL}
        </button>
      </div>
    );
  }

  if (saved) {
    const shown = saved.toolNames.slice(0, SHOWN_TOOL_NAMES);
    return (
      <div
        role="status"
        className="space-y-2 rounded-lg border border-border/80 px-3 py-3 text-xs text-muted-foreground"
      >
        <p className="font-medium text-foreground">
          {CONNECTED_PREFIX} {saved.toolCount} {TOOLS_SUFFIX}.
        </p>
        {shown.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {shown.map((toolName) => (
              <li key={toolName} className="rounded-md bg-muted px-2 py-1 text-caption">
                {toolName}
              </li>
            ))}
          </ul>
        ) : (
          <p>{NO_TOOLS_COPY}</p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-border/80 px-3 py-3 text-xs"
      aria-label={`${spec.name} ${API_KEY_LABEL}`}
    >
      <div className="space-y-1">
        <label htmlFor={inputId} className="block text-xs font-semibold text-foreground">
          {API_KEY_LABEL}
        </label>
        <input
          id={inputId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          disabled={saving}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
        />
        <p className="text-muted-foreground">
          {HEADER_HINT_PREFIX} <code>{spec.headerName}</code> {HEADER_HINT_SUFFIX}
        </p>
        {spec.description ? <p className="text-muted-foreground">{spec.description}</p> : null}
        {spec.connected ? <p className="text-muted-foreground">{ALREADY_SAVED_COPY}</p> : null}
        {spec.documentationUrl ? (
          <a
            href={spec.documentationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block font-medium text-foreground underline"
          >
            {DOCUMENTATION_LABEL}
          </a>
        ) : null}
      </div>
      {saveError ? (
        <p role="alert" className="text-destructive-text">
          {saveError}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || apiKey.trim().length === 0}
          className="inline-flex min-h-8 items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {saving ? <Spinner size="sm" aria-label={SUBMITTING_LABEL} /> : null}
          {saving ? SUBMITTING_LABEL : spec.connected ? REPLACE_LABEL : SUBMIT_LABEL}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex min-h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground"
          >
            {CANCEL_LABEL}
          </button>
        ) : null}
      </div>
    </form>
  );
}
