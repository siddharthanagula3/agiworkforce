import { z } from 'zod';

export const SERVICE_NOTICES_PATH = '/api/status/notices';

export const ServiceNoticeSchema = z.object({
  id: z.string(),
  kind: z.enum(['incident', 'maintenance']),
  tone: z.enum(['danger', 'warning', 'info']),
  message: z.string(),
  href: z.string(),
  linkLabel: z.string(),
});
export type ServiceNotice = z.infer<typeof ServiceNoticeSchema>;
export type ServiceNoticeKind = ServiceNotice['kind'];
export type ServiceNoticeTone = ServiceNotice['tone'];

export const ServiceNoticeListSchema = z.object({ notices: z.array(ServiceNoticeSchema) });
export type ServiceNoticeList = z.infer<typeof ServiceNoticeListSchema>;
