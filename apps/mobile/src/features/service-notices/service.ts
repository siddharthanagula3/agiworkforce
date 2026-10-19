import {
  SERVICE_NOTICES_PATH,
  ServiceNoticeListSchema,
  type ServiceNotice,
} from '@agiworkforce/cloud-contracts';
import { API_URL } from '@/lib/constants';
import { api } from '@/services/api';

export async function fetchServiceNotices(signal?: AbortSignal): Promise<ServiceNotice[]> {
  const response = await api.get<unknown>(SERVICE_NOTICES_PATH, signal ? { signal } : undefined);
  return ServiceNoticeListSchema.parse(response).notices;
}

export function noticeUrl(href: string): string {
  return /^https?:\/\//i.test(href) ? href : `${API_URL.replace(/\/+$/, '')}${href}`;
}
