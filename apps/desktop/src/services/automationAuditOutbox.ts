import { CLOUD_API_BASE_URL } from '../api/cloudApi';
import { selectHasCloudAccountSession, useAuthStore } from '../stores/auth';
import { invoke } from '../utils/ipc';
import { desktopInstallId } from './deviceRegistryHeartbeat';
import { createManagedCloudRequestContext } from './managedCloudRequestContext';

const BATCH_SIZE = 200;
const FLUSH_INTERVAL_MS = 15_000;

interface AutomationAuditOutboxRow {
  id: number;
  report: Record<string, unknown>;
}

interface AutomationAuditResponse {
  accepted: number;
}

export async function flushAutomationAuditOutbox(): Promise<boolean> {
  if (!selectHasCloudAccountSession(useAuthStore.getState())) return false;

  const rows = await invoke<AutomationAuditOutboxRow[]>('automation_audit_outbox_list', {
    request: { max: BATCH_SIZE },
  });
  if (rows.length === 0) return true;

  const deviceId = desktopInstallId();
  const request = createManagedCloudRequestContext('Automation audit outbox');
  const response = await request.fetch(`${CLOUD_API_BASE_URL}/api/automation/outcomes`, {
    method: 'POST',
    headers: await request.getHeaders(),
    body: JSON.stringify({
      outcomes: rows.map(({ report }) => ({
        ...report,
        deviceId: report['deviceId'] ?? deviceId,
      })),
    }),
  });
  if (!response.ok) return false;

  const result = (await response.json()) as AutomationAuditResponse;
  if (result.accepted !== rows.length) return false;

  const deleted = await invoke<number>('automation_audit_outbox_ack', {
    request: { ids: rows.map(({ id }) => id) },
  });
  return deleted === rows.length;
}

export function initializeAutomationAuditOutbox(): () => void {
  const flush = () => void flushAutomationAuditOutbox().catch(() => false);
  flush();
  const timer = window.setInterval(flush, FLUSH_INTERVAL_MS);
  window.addEventListener('online', flush);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener('online', flush);
    flush();
  };
}
