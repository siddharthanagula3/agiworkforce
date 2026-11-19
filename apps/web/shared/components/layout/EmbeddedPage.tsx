'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  createContext,
  useContext,
  useMemo,
  type AnchorHTMLAttributes,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  embeddedAccountReturnPath,
  embeddedPageHref,
  embeddedSignInPath,
  isEmbeddedPageView,
} from '@/lib/embedded-page';

interface EmbeddedPageState {
  embedded: boolean;
  accountReturnPath: string | null;
  excludedPaths: ReadonlySet<string>;
}

const NOT_EMBEDDED: EmbeddedPageState = {
  embedded: false,
  accountReturnPath: null,
  excludedPaths: new Set(),
};

const EmbeddedPageContext = createContext<EmbeddedPageState>(NOT_EMBEDDED);

export function EmbeddedPageProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const embedded = isEmbeddedPageView(pathname, searchParams);
  const accountReturnPath = embeddedAccountReturnPath(pathname, searchParams);
  const value = useMemo<EmbeddedPageState>(
    () =>
      embedded ? { embedded: true, accountReturnPath, excludedPaths: new Set() } : NOT_EMBEDDED,
    [embedded, accountReturnPath],
  );
  return <EmbeddedPageContext.Provider value={value}>{children}</EmbeddedPageContext.Provider>;
}

export function EmbeddedPageExclusions({
  paths,
  children,
}: {
  paths: readonly string[];
  children: ReactNode;
}) {
  const parent = useContext(EmbeddedPageContext);
  const value = useMemo<EmbeddedPageState>(
    () =>
      parent.embedded
        ? { ...parent, excludedPaths: new Set([...parent.excludedPaths, ...paths]) }
        : parent,
    [parent, paths],
  );
  return <EmbeddedPageContext.Provider value={value}>{children}</EmbeddedPageContext.Provider>;
}

export function useEmbeddedPage(): boolean {
  return useContext(EmbeddedPageContext).embedded;
}

export function useEmbeddedAccountPage(): boolean {
  return useContext(EmbeddedPageContext).accountReturnPath !== null;
}

export function useEmbeddedSignInPath(): string | null {
  const { accountReturnPath } = useContext(EmbeddedPageContext);
  return accountReturnPath === null ? null : embeddedSignInPath(accountReturnPath);
}

export function usePageHref(href: string): string | null {
  const { embedded, excludedPaths } = useContext(EmbeddedPageContext);
  return embedded ? embeddedPageHref(href, excludedPaths) : href;
}

export function UnlessEmbedded({ children }: { children: ReactNode }) {
  return useEmbeddedPage() ? null : children;
}

type PageLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & {
  href: string;
  omitWhenEmbedded?: boolean;
};

export function PageLink({ href, omitWhenEmbedded = false, children, ...rest }: PageLinkProps) {
  const target = usePageHref(href);
  if (target === null) return omitWhenEmbedded ? null : <>{children}</>;
  return (
    <Link href={target} {...rest}>
      {children}
    </Link>
  );
}

type PageAnchorProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
};

export function PageAnchor({ href, children, ...rest }: PageAnchorProps) {
  const target = usePageHref(href);
  if (target === null) return <>{children}</>;
  return (
    <a href={target} {...rest}>
      {children}
    </a>
  );
}
