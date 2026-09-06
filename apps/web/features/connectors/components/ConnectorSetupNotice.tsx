'use client';

import { useConnectors } from '../hooks/use-connectors';

const NOTICE_LABEL = 'Deployment setup required';

export function ConnectorSetupNotice({ connectorId }: { connectorId: string }) {
  const { setupRequirements } = useConnectors();
  const requirement = setupRequirements[connectorId];
  if (!requirement) return null;
  return (
    <p
      role="note"
      aria-label={NOTICE_LABEL}
      className="rounded-lg border border-border/80 p-3 text-xs text-muted-foreground"
    >
      {requirement.message}
    </p>
  );
}
