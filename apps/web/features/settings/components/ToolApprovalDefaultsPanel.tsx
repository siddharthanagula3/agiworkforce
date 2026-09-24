'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchPreferenceNamespace,
  readAutonomousToolApprovalsAllowed,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import {
  TOOL_APPROVAL_POLICY_OPTIONS,
  TOOL_APPROVAL_PREFERENCE_NAMESPACE,
  WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY,
  WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_PREFERENCES,
  type ToolApprovalPolicy,
  type ToolApprovalPreferences,
} from '@shared/types/toolApprovalPolicy';
import { toUserMessage } from '@/lib/user-error-message';

const WORKSPACE_BLOCKS_AUTONOMY =
  'Your workspace does not allow skipping approvals. The server will ask before every action.';

export function ToolApprovalDefaultsPanel() {
  const [policy, setPolicy] = useState<ToolApprovalPolicy>(
    WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_PREFERENCES.defaultPolicy,
  );
  const [autonomyAvailable, setAutonomyAvailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPreferenceNamespace<ToolApprovalPreferences>(
      TOOL_APPROVAL_PREFERENCE_NAMESPACE,
      WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_PREFERENCES,
    )
      .then((value) => {
        if (cancelled) return;
        setPolicy(value.defaultPolicy);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(toUserMessage(error, 'Failed to load tool approvals'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The workspace decides this, never the client. An unreadable answer leaves
  // the option off, which matches what the tool gate would do with it anyway.
  useEffect(() => {
    let cancelled = false;
    readAutonomousToolApprovalsAllowed()
      .then((allowed) => {
        if (!cancelled) setAutonomyAvailable(allowed);
      })
      .catch(() => {
        if (!cancelled) setAutonomyAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(
    async (next: ToolApprovalPolicy) => {
      const previous = policy;
      setPolicy(next);
      setSaving(true);
      setSaveError(null);
      try {
        await savePreferenceNamespace<ToolApprovalPreferences>(TOOL_APPROVAL_PREFERENCE_NAMESPACE, {
          defaultPolicy: next,
        });
        setSavedAt(Date.now());
      } catch (error) {
        setPolicy(previous);
        setSaveError(toUserMessage(error, 'Failed to save tool approvals'));
      } finally {
        setSaving(false);
      }
    },
    [policy],
  );

  return (
    <section className="space-y-4" aria-labelledby="tool-approvals-heading">
      <div>
        <h3
          id="tool-approvals-heading"
          className="text-sm font-medium uppercase tracking-wider text-muted-foreground"
        >
          Tool approvals
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          The default answer for connector, plugin, and tool actions across this account. Per-tool
          Allow, Ask, and Deny choices in Connectors always win over this default.
        </p>
        <p
          className={`mt-2 text-xs ${loadError || saveError ? 'text-danger' : 'text-muted-foreground'}`}
          role="status"
        >
          {saving
            ? 'Saving...'
            : saveError
              ? `Save failed: ${saveError}`
              : loadError
                ? `Your saved default could not be loaded: ${loadError}`
                : savedAt
                  ? 'Saved'
                  : 'Synced to your account'}
        </p>
      </div>

      <div role="radiogroup" aria-label="Default approval for tool actions" className="space-y-2">
        {TOOL_APPROVAL_POLICY_OPTIONS.map((option) => {
          const unavailable = option.policy === 'autonomous' && !autonomyAvailable;
          return (
            <label
              key={option.policy}
              className={`flex items-start gap-3 rounded-lg border border-border/40 p-4 ${
                unavailable ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
            >
              <input
                type="radio"
                name="tool-approval-default"
                value={option.policy}
                checked={policy === option.policy}
                disabled={loadError !== null || saving || unavailable}
                onChange={() => void persist(option.policy)}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {option.label}
                  {option.policy === WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">Default</span>
                  ) : null}
                </span>
                <span className="block text-xs text-muted-foreground">{option.description}</span>
                {unavailable ? (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {WORKSPACE_BLOCKS_AUTONOMY}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
