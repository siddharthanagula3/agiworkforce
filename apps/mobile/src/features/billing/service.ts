import { api } from '@/services/api';
import { FEATURES } from '@/lib/v1FeatureFlags';

export interface PortalSessionResult {
  url: string;
}

export async function fetchPortalSessionUrl(): Promise<string> {
  if (!FEATURES.billing) throw new Error('billing: cloud billing not available in v1');
  const data = await api.post<PortalSessionResult>('/api/portal');
  if (!data.url) {
    throw new Error('billing: portal-session response missing url field');
  }
  return data.url;
}
