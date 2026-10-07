import type { ReactNode } from 'react';
import {
  ArrowUp,
  FileText,
  FolderClosed,
  Library,
  Lock,
  Paperclip,
  Search,
  SquarePen,
} from 'lucide-react';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { ILLUSTRATION_LABEL, RECENTS, type Recent } from './content';

export type WindowSize = 'hero' | 'stage' | 'mini';
export type NavItem = 'projects' | 'library' | 'none';

export const ICON_SIZE = 16;
export const ICON_STROKE = 1.75;
const BRAND_MARK_SIZE = 18;
const LOCK_SIZE = 13;

export function WindowBar({ url, children }: { url: string; children?: ReactNode }) {
  return (
    <div className="f1-win-bar">
      <span className="f1-win-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="f1-win-url" aria-hidden="true">
        <Lock size={LOCK_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
        <span>{url}</span>
      </span>
      <span className="f1-win-bar-end">
        <span>{ILLUSTRATION_LABEL}</span>
        {children}
      </span>
    </div>
  );
}

export function Window({
  url,
  label,
  size = 'stage',
  recent,
  nav = 'none',
  bar,
  children,
}: {
  url: string;
  label: string;
  size?: WindowSize;
  recent?: Recent;
  nav?: NavItem;
  bar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="f1-win" data-size={size} data-illustration aria-label={label}>
      <WindowBar url={url}>{bar}</WindowBar>
      <div className="f1-win-body" aria-hidden="true">
        <div className="f1-side">
          <p className="f1-side-brand">
            <AgiMark size={BRAND_MARK_SIZE} />
            AGI
          </p>
          <p className="f1-side-item">
            <SquarePen size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
            New chat
          </p>
          <p className="f1-side-item">
            <Search size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
            Search
          </p>
          <p className="f1-side-item" data-on={nav === 'projects' ? 'true' : undefined}>
            <FolderClosed size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
            Projects
          </p>
          <p className="f1-side-item" data-on={nav === 'library' ? 'true' : undefined}>
            <Library size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
            Library
          </p>
          <p className="f1-side-group">Recents</p>
          {RECENTS.map((item) => (
            <p key={item} className="f1-side-item" data-on={item === recent ? 'true' : undefined}>
              {item}
            </p>
          ))}
        </div>
        <div className="f1-pane">{children}</div>
      </div>
    </figure>
  );
}

export function Prompt({
  file,
  children,
}: {
  file?: { name: string; pages: number };
  children: ReactNode;
}) {
  return (
    <div className="f1-user">
      {file ? (
        <span className="f1-chip">
          <FileText size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" />
          {file.name}
          <span className="f1-chip-meta">{file.pages} pages</span>
        </span>
      ) : null}
      <p>{children}</p>
    </div>
  );
}

export function ToolRow({ children }: { children: ReactNode }) {
  return (
    <p className="f1-tool">
      <svg className="f1-tool-check" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M3 8.5l3 3 7-7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {children}
    </p>
  );
}

export function Receipt({ segments }: { segments: readonly string[] }) {
  return (
    <p className="f1-receipt">
      <span className="f1-receipt-dot" />
      {segments.map((segment) => (
        <span key={segment} className="f1-receipt-seg">
          {segment}
        </span>
      ))}
    </p>
  );
}

export function Answer({
  sections,
}: {
  sections: ReadonlyArray<{
    heading: string;
    items: ReadonlyArray<readonly [string, string]>;
  }>;
}) {
  return (
    <div className="f1-answer">
      {sections.map((section) => (
        <div key={section.heading} className="f1-answer-block">
          <p className="f1-answer-h">{section.heading}</p>
          {section.items.map(([term, detail]) => (
            <p key={term} className="f1-answer-row">
              <strong>{term}.</strong> {detail}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

export function Composer({
  placeholder,
  picker,
  attach = true,
}: {
  placeholder: string;
  picker?: string;
  attach?: boolean;
}) {
  return (
    <div className="f1-composer">
      {attach ? <Paperclip size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden="true" /> : null}
      <span className="f1-composer-text">{placeholder}</span>
      {picker ? <span className="f1-composer-model">{picker}</span> : null}
      <span className="f1-send">
        <ArrowUp size={ICON_SIZE} strokeWidth={2} aria-hidden="true" />
      </span>
    </div>
  );
}
