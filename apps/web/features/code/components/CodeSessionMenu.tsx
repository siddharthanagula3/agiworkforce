'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Download,
  LibraryBig,
  Link2,
  MoreHorizontal,
  Terminal,
  type Icon,
} from '@agiworkforce/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@agiworkforce/ui';
import { CODE_COPY, CODE_ROUTES } from '../code-surface';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;
const MENU_GLYPH_SIZE = 14;

interface MenuLink {
  href: string;
  label: string;
  glyph: Icon;
}

const OPEN_IN_LINKS: readonly MenuLink[] = [
  { href: CODE_ROUTES.desktop, label: CODE_COPY.openDesktop, glyph: Download },
];

export interface CodeSessionMenuProps {
  verbose: boolean;
  closed: boolean;
  onOpenTerminal: () => void;
  onSetVerbose: (verbose: boolean) => void;
  onEditEnvironment: () => void;
  onCloseSession: () => void;
}

export function CodeSessionMenu({
  verbose,
  closed,
  onOpenTerminal,
  onSetVerbose,
  onEditEnvironment,
  onCloseSession,
}: CodeSessionMenuProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    if (typeof window === 'undefined') return;
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
  };

  return (
    <DropdownMenu onOpenChange={(open) => open && setCopied(false)}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={styles['headerButton']} aria-label={CODE_COPY.sessionMenu}>
          <MoreHorizontal size={GLYPH_SIZE} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link href={CODE_ROUTES.artifacts}>
            <LibraryBig size={MENU_GLYPH_SIZE} aria-hidden="true" />
            <span className={styles['menuRowLabel']}>{CODE_COPY.artifacts}</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className={styles['menuRowLabel']}>{CODE_COPY.openIn}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={onOpenTerminal}>
              <Terminal size={MENU_GLYPH_SIZE} aria-hidden="true" />
              <span className={styles['menuRowLabel']}>{CODE_COPY.openTerminal}</span>
            </DropdownMenuItem>
            {OPEN_IN_LINKS.map(({ href, label, glyph: Glyph }) => (
              <DropdownMenuItem key={href} asChild>
                <Link href={href}>
                  <Glyph size={MENU_GLYPH_SIZE} aria-hidden="true" />
                  <span className={styles['menuRowLabel']}>{label}</span>
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className={styles['menuRowLabel']}>{CODE_COPY.transcriptView}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={verbose ? CODE_COPY.transcriptVerbose : CODE_COPY.transcriptNormal}
              onValueChange={(value) => onSetVerbose(value === CODE_COPY.transcriptVerbose)}
            >
              <DropdownMenuRadioItem value={CODE_COPY.transcriptNormal}>
                {CODE_COPY.transcriptNormal}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value={CODE_COPY.transcriptVerbose}>
                {CODE_COPY.transcriptVerbose}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void copyLink();
          }}
        >
          <Link2 size={MENU_GLYPH_SIZE} aria-hidden="true" />
          <span className={styles['menuRowLabel']}>
            {copied ? CODE_COPY.copiedLink : CODE_COPY.copyLink}
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={onEditEnvironment}>
          <span className={styles['menuRowLabel']}>{CODE_COPY.editEnvironment}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={closed} onSelect={onCloseSession}>
          <span className={styles['menuRowLabel']}>{CODE_COPY.closeSession}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
