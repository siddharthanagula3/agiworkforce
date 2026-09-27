export interface MaintenanceWindow {
  startsAt: Date;
  endsAt: Date;
}

export function parseMaintenanceWindow(raw: string | undefined): MaintenanceWindow | null {
  if (!raw) return null;
  const [start, end, extra] = raw.trim().split('/');
  if (!start || !end || extra !== undefined) return null;
  const startsAt = new Date(start);
  const endsAt = new Date(end);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return null;
  return endsAt.getTime() > startsAt.getTime() ? { startsAt, endsAt } : null;
}
