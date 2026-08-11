'use client';

import Link from 'next/link';
import {
  createContext,
  useContext,
  useMemo,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from 'react';

interface SettingsNavigationContextValue {
  onNavigate: (section: string) => void;
  onExit?: () => void;
}

const SettingsSectionNavigationContext = createContext<SettingsNavigationContextValue | null>(null);

export function SettingsSectionNavigationProvider({
  onNavigate,
  onExit,
  children,
}: {
  onNavigate: (section: string) => void;
  onExit?: () => void;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ onNavigate, onExit }), [onExit, onNavigate]);

  return (
    <SettingsSectionNavigationContext.Provider value={value}>
      {children}
    </SettingsSectionNavigationContext.Provider>
  );
}

export function SettingsSectionLink({
  section,
  children,
  className,
  style,
}: {
  section: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const navigation = useContext(SettingsSectionNavigationContext);

  if (!navigation) {
    return (
      <Link href={`/settings/${section}`} className={className} style={style}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      style={{ background: 'transparent', border: 0, padding: 0, font: 'inherit', ...style }}
      onClick={() => navigation.onNavigate(section)}
    >
      {children}
    </button>
  );
}

/**
 * A real page navigation launched from the global Settings dialog.
 *
 * The dialog provider intentionally survives App Router page changes. Closing
 * it at this shared boundary prevents the old Settings surface from covering
 * the destination after links such as Team → Pricing are followed.
 */
export function SettingsPageLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  const navigation = useContext(SettingsSectionNavigationContext);

  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event);
        const opensInCurrentPage =
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          (!event.currentTarget.target || event.currentTarget.target === '_self');
        if (!event.defaultPrevented && opensInCurrentPage) navigation?.onExit?.();
      }}
    />
  );
}
