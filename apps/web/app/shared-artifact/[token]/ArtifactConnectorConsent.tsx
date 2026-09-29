'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Spinner } from '@agiworkforce/ui';
import type { ArtifactRuntimeConnectorTool } from '@agiworkforce/cloud-contracts';

import type { ArtifactConsentAnswer, ArtifactConsentRequest } from './usePublishedArtifactRuntime';

export interface ArtifactConnectorConsentProps {
  request: ArtifactConsentRequest;
  appNames: string;
  onAnswer: (answer: ArtifactConsentAnswer) => void;
}

function unavailableNote(
  tool: ArtifactRuntimeConnectorTool,
  t: ReturnType<typeof useTranslation>['t'],
): string {
  return tool.unavailableReason === 'blocked'
    ? t('artifactPublish.runtimeToolBlocked', 'Blocked in your settings.')
    : t(
        'artifactPublish.runtimeToolNeedsApproval',
        'Asks before each use, so this app cannot use it.',
      );
}

export function ArtifactConnectorConsent({
  request,
  appNames,
  onAnswer,
}: ArtifactConnectorConsentProps) {
  const { t } = useTranslation('chat');
  const [choices, setChoices] = useState<ReadonlyMap<string, boolean>>(new Map());
  const asksForConnectors = request.connectorIds.length > 0;
  const loading = asksForConnectors && request.connectors === null && request.error === null;

  useEffect(() => {
    setChoices(new Map());
  }, [request.connectorIds, request.initialAllowedTools]);

  const toolEnabled = (tool: ArtifactRuntimeConnectorTool): boolean =>
    tool.available &&
    (choices.get(tool.name) ?? request.initialAllowedTools?.includes(tool.name) ?? true);

  const toggleTool = (name: string, enabled: boolean) => {
    setChoices((current) => new Map(current).set(name, enabled));
  };

  const allowedTools = (): string[] =>
    (request.connectors ?? []).flatMap((connector) =>
      connector.tools.filter(toolEnabled).map((tool) => tool.name),
    );

  return (
    <section
      aria-label={t('artifactPublish.runtimeConsentLabel', 'AI permission')}
      aria-live="polite"
      className="flex flex-col gap-3 rounded-lg border border-border/40 bg-muted/40 px-4 py-3 text-sm text-foreground"
      data-testid="artifact-runtime-consent"
    >
      <p>
        {asksForConnectors
          ? t(
              'artifactPublish.runtimeConsentConnectors',
              "This app wants to use AI with your account and read or change data in {{apps}}. It sees what those apps return, and each request counts toward your plan's usage.",
              { apps: appNames },
            )
          : t(
              'artifactPublish.runtimeConsent',
              "This app wants to use AI with your account. Each request counts toward your plan's usage.",
            )}
      </p>

      {loading ? (
        <Spinner
          size="sm"
          aria-label={t('artifactPublish.runtimeConnectorsLoading', 'Checking your connected apps')}
        />
      ) : null}

      {request.error ? (
        <p role="alert" className="text-danger">
          {request.error}
        </p>
      ) : null}

      {request.connectors?.map((connector) => (
        <fieldset key={connector.id} className="flex flex-col gap-1.5">
          <legend className="font-medium">{connector.label}</legend>
          {connector.connected ? (
            <ul className="flex flex-col gap-1.5">
              {connector.tools.map((tool) => {
                const inputId = `artifact-tool-${connector.id}-${tool.name}`;
                return (
                  <li key={tool.name} className="flex items-start gap-2">
                    <Checkbox
                      id={inputId}
                      checked={toolEnabled(tool)}
                      disabled={!tool.available}
                      onCheckedChange={(checked) => toggleTool(tool.name, checked === true)}
                      className="mt-0.5"
                    />
                    <label htmlFor={inputId} className="min-w-0 flex-1">
                      <span className="block">{tool.label}</span>
                      {tool.available ? null : (
                        <span className="block text-xs text-muted-foreground">
                          {unavailableNote(tool, t)}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t(
                'artifactPublish.runtimeConnectorNotConnected',
                'Not connected. Connect it in Settings, Connectors, to use this part of the app.',
              )}
            </p>
          )}
        </fieldset>
      ))}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={loading}
          onClick={() => onAnswer({ allowed: true, allowedTools: allowedTools() })}
        >
          {t('artifactPublish.runtimeAllow', 'Allow')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onAnswer({ allowed: false, allowedTools: [] })}
        >
          {t('artifactPublish.runtimeDecline', "Don't allow")}
        </Button>
      </div>
    </section>
  );
}
