import { resolveProjectAccentHex, resolveProjectIcon } from '@agiworkforce/ui';

export function AgentAvatar({
  icon,
  accentColor,
  size = 'md',
}: {
  icon: string;
  accentColor: string;
  size?: 'md' | 'lg';
}) {
  const Icon = resolveProjectIcon(icon);
  return (
    <span
      aria-hidden="true"
      className={
        size === 'lg'
          ? 'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-muted'
          : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted'
      }
      style={{ color: resolveProjectAccentHex(accentColor) }}
    >
      <Icon className={size === 'lg' ? 'h-6 w-6' : 'h-4 w-4'} />
    </span>
  );
}
