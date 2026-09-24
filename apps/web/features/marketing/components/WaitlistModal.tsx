'use client';

import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const WaitlistDialog = lazy(() =>
  import('./WaitlistDialog').then(({ WaitlistDialog: Component }) => ({ default: Component })),
);

export type WaitlistModalSource = 'website' | 'byok' | 'sync' | 'billing' | 'mobile' | 'other';

interface WaitlistModalContextValue {
  open: (source?: WaitlistModalSource) => void;
}

const WaitlistModalContext = createContext<WaitlistModalContextValue | null>(null);

export function useWaitlistModal(): WaitlistModalContextValue | null {
  return useContext(WaitlistModalContext);
}

export function WaitlistModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [source, setSource] = useState<WaitlistModalSource>('website');

  const open = useCallback((nextSource: WaitlistModalSource = 'website') => {
    setSource(nextSource);
    setIsOpen(true);
  }, []);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <WaitlistModalContext.Provider value={value}>
      {children}
      {isOpen ? (
        <Suspense fallback={null}>
          <WaitlistDialog source={source} onOpenChange={setIsOpen} />
        </Suspense>
      ) : null}
    </WaitlistModalContext.Provider>
  );
}

export function WaitlistTrigger({
  label = 'Discuss Enterprise access',
  source = 'website',
  className,
}: {
  label?: string;
  source?: WaitlistModalSource;
  className?: string;
}) {
  const modal = useWaitlistModal();

  if (!modal) {
    return (
      <a href="/waitlist" className={className}>
        {label}
      </a>
    );
  }

  return (
    <button type="button" className={className} onClick={() => modal.open(source)}>
      {label}
    </button>
  );
}
