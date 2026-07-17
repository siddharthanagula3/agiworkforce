/**
 * Expo route wrapper — /(app)/connectors
 * Reached from the chat "Add to Chat" sheet, the chat tab, and chat/[id].
 * Real implementation: apps/mobile/src/features/settings/cloud-connectors/index.tsx
 * (same API-backed screen as /(app)/settings/cloud-connectors — do NOT fork a
 * second implementation here; this used to render a local-only mock catalog
 * that never talked to the server, see docs/agent-context/known-flaws.md).
 * Do NOT add logic here.
 */
import CloudConnectorsScreen from '@/src/features/settings/cloud-connectors';

export default function ConnectorsRoute() {
  return <CloudConnectorsScreen backHref="/(app)/(tabs)/chat" />;
}
