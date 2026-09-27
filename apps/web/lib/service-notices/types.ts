export type ServiceNoticeKind = 'incident' | 'maintenance';
export type ServiceNoticeTone = 'danger' | 'warning' | 'info';

export interface ServiceNotice {
  id: string;
  kind: ServiceNoticeKind;
  tone: ServiceNoticeTone;
  message: string;
  href: string;
  linkLabel: string;
}
