'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Archive,
  ArchiveRestore,
  LibraryBig,
  Link2,
  MoreHorizontal,
  Pencil,
  Terminal,
  Trash2,
} from '@agiworkforce/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@agiworkforce/ui';
import { ContinueOnDesktop } from '@/features/desktop-host';
import { CODE_COPY, CODE_ROUTES } from '../code-surface';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;
const MENU_GLYPH_SIZE = 14;

export interface CodeSessionMenuProps {
  verbose: boolean;
  closed: boolean;
  archived: boolean;
  deletable: boolean;
  onOpenTerminal: () => void;
  onSetVerbose: (verbose: boolean) => void;
  onEditEnvironment: () => void;
  onRename: () => void;
  onShare: () => void;
  onSetArchived: (archived: boolean) => void;
  onDeleteSession: () => void;
  onCloseSession: () => void;
}

export function CodeSessionMenu({
  verbose,
  closed,
  archived,
  deletable,
  onOpenTerminal,
  onSetVerbose,
  onEditEnvironment,
  onRename,
  onShare,
  onSetArchived,
  onDeleteSession,
  onCloseSession,
}: CodeSessionMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
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
            <DropdownMenuItem asChild>
              <ContinueOnDesktop
                label={CODE_COPY.openDesktop}
                fallbackHref={CODE_ROUTES.desktop}
                glyphSize={MENU_GLYPH_SIZE}
                labelClassName={styles['menuRowLabel']}
              />
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem onSelect={onRename}>
          <Pencil size={MENU_GLYPH_SIZE} aria-hidden="true" />
          <span className={styles['menuRowLabel']}>{CODE_COPY.rename}</span>
        </DropdownMenuItem>

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
            setMenuOpen(false);
            onShare();
          }}
        >
          <Link2 size={MENU_GLYPH_SIZE} aria-hidden="true" />
          <span className={styles['menuRowLabel']}>{CODE_COPY.share}</span>
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={onEditEnvironment}>
          <span className={styles['menuRowLabel']}>{CODE_COPY.editEnvironment}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => onSetArchived(!archived)}>
          {archived ? (
            <ArchiveRestore size={MENU_GLYPH_SIZE} aria-hidden="true" />
          ) : (
            <Archive size={MENU_GLYPH_SIZE} aria-hidden="true" />
          )}
          <span className={styles['menuRowLabel']}>
            {archived ? CODE_COPY.unarchiveSession : CODE_COPY.archiveSession}
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem disabled={closed} onSelect={onCloseSession}>
          <span className={styles['menuRowLabel']}>{CODE_COPY.closeSession}</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          disabled={!deletable}
          className={styles['menuRowDestructive']}
          onSelect={onDeleteSession}
        >
          <Trash2 size={MENU_GLYPH_SIZE} aria-hidden="true" />
          <span className={styles['menuRowLabel']}>{CODE_COPY.deleteSession}</span>
        </DropdownMenuItem>

        {!deletable && (
          <DropdownMenuLabel className={styles['menuHint']}>
            {CODE_COPY.deleteNeedsClosed}
          </DropdownMenuLabel>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
