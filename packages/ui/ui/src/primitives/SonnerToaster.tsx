'use client';

import { Toaster as Sonner, toast as sonnerToast } from 'sonner';

type SonnerProps = React.ComponentProps<typeof Sonner>;

export interface SonnerToasterProps extends Omit<SonnerProps, 'theme'> {
  /**
   * Current theme, injected by the host app. Upstream shadcn's version reads
   * this from next-themes' useTheme() directly, which is Next.js-specific;
   * this package stays framework-neutral, so callers pass their own resolved
   * theme (e.g. from next-themes on web, or a Tauri-side theme store on
   * desktop). Defaults to 'system'.
   *
   * next-themes apps: pass `theme={resolvedTheme}` from `useTheme()`, or wrap
   * this component in a small host-side component that does — bare
   * `<SonnerToaster />` renders 'system' and will not track the user's theme
   * toggle. This is a deliberate difference from `ThemeToggle` in this same
   * package, which reads/writes next-themes state directly: ThemeToggle
   * mutates theme (inherently coupled to next-themes), SonnerToaster only
   * consumes a resolved value (kept injectable so this package has no hard
   * next-themes dependency at its core). When web call sites migrate to this
   * package, swapping in a bare `<SonnerToaster />` is NOT a mechanical
   * find-replace for web's old `<SonnerToaster>` (apps/web/shared/ui/sonner.tsx),
   * which read next-themes internally — callers must add the `theme` prop or
   * a thin wrapper, or the toast surface will silently stop following the
   * user's theme choice.
   */
  theme?: SonnerProps['theme'];
}

const SonnerToaster = ({ theme = 'system', ...props }: SonnerToasterProps) => {
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { SonnerToaster, sonnerToast };
