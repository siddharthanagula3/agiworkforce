'use client';

import { useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Check, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@agiworkforce/ui';

export interface PickerMember {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

const EMAIL_TOKEN = /[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/g;

export function memberDisplayName(member: Pick<PickerMember, 'name' | 'email'>): string {
  return member.name || member.email || 'Unnamed member';
}

function initialsOf(member: Pick<PickerMember, 'name' | 'email'>): string {
  const source = memberDisplayName(member).replace(/@.*/, '');
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length >= 2 ? `${parts[0]![0]}${parts[parts.length - 1]![0]}` : source.slice(0, 2);
  return letters.toUpperCase();
}

export function MemberAvatar({ member, size = 24 }: { member: PickerMember; size?: number }) {
  return (
    <Avatar style={{ width: size, height: size }} aria-hidden>
      {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" /> : null}
      <AvatarFallback
        style={{
          background: 'var(--bg-hover)',
          color: 'var(--text-1)',
          fontSize: Math.max(10, Math.round(size * 0.42)),
          fontWeight: 600,
        }}
      >
        {initialsOf(member)}
      </AvatarFallback>
    </Avatar>
  );
}

export function MemberIdentity({ member, detail }: { member: PickerMember; detail?: string }) {
  const name = memberDisplayName(member);
  const secondary = [member.email && member.email !== name ? member.email : null, detail]
    .filter(Boolean)
    .join(' · ');
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
      <MemberAvatar member={member} />
      <span style={{ display: 'grid', minWidth: 0 }}>
        <span
          style={{
            color: 'var(--text-1)',
            fontSize: 13,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </span>
        {secondary ? (
          <span
            style={{
              color: 'var(--text-3)',
              fontSize: 12,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {secondary}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function matches(member: PickerMember, query: string): boolean {
  if (!query) return true;
  return member.name.toLowerCase().includes(query) || member.email.toLowerCase().includes(query);
}

interface MemberPickerProps {
  members: readonly PickerMember[];
  selectedIds: readonly string[];
  onChange: (userIds: string[]) => void;
  label: string;
  placeholder?: string;
  multiple?: boolean;
  disabled?: boolean;
}

export function MemberPicker({
  members,
  selectedIds,
  onChange,
  label,
  placeholder = 'Search by name or email',
  multiple = true,
  disabled = false,
}: MemberPickerProps) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listboxId = `${baseId}-listbox`;
  const statusId = `${baseId}-status`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const byId = useMemo(() => new Map(members.map((member) => [member.userId, member])), [members]);
  const selectedMembers = selectedIds
    .map((userId) => byId.get(userId))
    .filter((member): member is PickerMember => Boolean(member));
  const normalized = query.trim().toLowerCase();
  const results = members.filter((member) => matches(member, normalized));
  const activeOption = open ? results[Math.min(activeIndex, results.length - 1)] : undefined;

  const optionId = (userId: string) => `${baseId}-option-${userId}`;

  const toggle = (member: PickerMember) => {
    setPasteNotice(null);
    if (!multiple) {
      onChange([member.userId]);
      setQuery('');
      setOpen(false);
      return;
    }
    onChange(
      selected.has(member.userId)
        ? selectedIds.filter((userId) => userId !== member.userId)
        : [...selectedIds, member.userId],
    );
    setQuery('');
  };

  const remove = (userId: string) => {
    onChange(selectedIds.filter((id) => id !== userId));
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex((index) => (results.length === 0 ? 0 : (index + 1) % results.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(Math.max(results.length - 1, 0));
        return;
      }
      setActiveIndex((index) =>
        results.length === 0 ? 0 : (index - 1 + results.length) % results.length,
      );
    } else if (event.key === 'Home' && open) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End' && open) {
      event.preventDefault();
      setActiveIndex(Math.max(results.length - 1, 0));
    } else if (event.key === 'Enter') {
      if (activeOption) {
        event.preventDefault();
        toggle(activeOption);
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
      } else if (query) {
        event.preventDefault();
        setQuery('');
      }
    } else if (event.key === 'Backspace' && !query && selectedIds.length > 0) {
      onChange(selectedIds.slice(0, -1));
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (!multiple) return;
    const emails = event.clipboardData.getData('text').match(EMAIL_TOKEN) ?? [];
    if (emails.length < 2) return;
    event.preventDefault();
    const byEmail = new Map(members.map((member) => [member.email.toLowerCase(), member]));
    const next = [...selectedIds];
    const unknown: string[] = [];
    for (const email of emails) {
      const member = byEmail.get(email.toLowerCase());
      if (!member) unknown.push(email);
      else if (!next.includes(member.userId)) next.push(member.userId);
    }
    onChange(next);
    setQuery('');
    setPasteNotice(
      unknown.length === 0
        ? null
        : `Not a member of this workspace: ${unknown.join(', ')}. Invite them from Members first.`,
    );
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--space-1)', minWidth: 0 }}>
      <label htmlFor={inputId} style={{ color: 'var(--text-2)', fontSize: 12 }}>
        {label}
      </label>
      <div
        style={{ position: 'relative' }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        <div
          className="focus-within:ring-2 focus-within:ring-ring"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 'var(--space-1)',
            minHeight: 36,
            padding: 'calc(var(--space-1) / 2) var(--space-2)',
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-base)',
          }}
        >
          {selectedMembers.map((member) => (
            <span
              key={member.userId}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-1)',
                padding:
                  'calc(var(--space-1) / 2) calc(var(--space-1) / 2) calc(var(--space-1) / 2) var(--space-1)',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--bg-hover)',
                color: 'var(--text-1)',
                fontSize: 12,
              }}
            >
              <MemberAvatar member={member} size={18} />
              {memberDisplayName(member)}
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(member.userId)}
                aria-label={`Remove ${memberDisplayName(member)}`}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  border: 0,
                  borderRadius: 'var(--radius-pill)',
                  background: 'transparent',
                  color: 'var(--text-2)',
                  cursor: 'pointer',
                }}
              >
                <X size={12} aria-hidden />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeOption ? optionId(activeOption.userId) : undefined}
            aria-describedby={pasteNotice ? statusId : undefined}
            autoComplete="off"
            disabled={disabled}
            value={query}
            placeholder={!multiple && selectedMembers.length > 0 ? 'Search to change' : placeholder}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            style={{
              flex: '1 1 140px',
              minWidth: 0,
              minHeight: 30,
              border: 0,
              outline: 'none',
              background: 'transparent',
              color: 'var(--text-1)',
              fontSize: 12,
            }}
          />
        </div>
        <ul
          id={listboxId}
          role="listbox"
          aria-label={label}
          aria-multiselectable={multiple || undefined}
          hidden={!open}
          style={{
            position: 'absolute',
            zIndex: 'var(--z-dropdown)',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: 264,
            overflowY: 'auto',
            margin: 0,
            padding: 'var(--space-1)',
            listStyle: 'none',
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elev)',
            boxShadow: 'var(--elevation-2)',
          }}
        >
          {results.length === 0 ? (
            <li
              role="presentation"
              style={{ padding: 'var(--space-2)', color: 'var(--text-3)', fontSize: 12 }}
            >
              {members.length === 0
                ? 'There is no one else in this workspace yet.'
                : `No member matches "${query.trim()}".`}
            </li>
          ) : (
            results.map((member) => {
              const isSelected = selected.has(member.userId);
              const isActive = activeOption?.userId === member.userId;
              return (
                <li
                  key={member.userId}
                  id={optionId(member.userId)}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActiveIndex(results.indexOf(member))}
                  onClick={() => toggle(member)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--space-2)',
                    minHeight: 44,
                    padding: 'var(--space-1) var(--space-2)',
                    borderRadius: 'var(--radius-sm)',
                    background: isActive ? 'var(--bg-hover)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <MemberIdentity member={member} />
                  {isSelected ? (
                    <Check
                      size={14}
                      aria-hidden
                      style={{ color: 'var(--text-1)', flexShrink: 0 }}
                    />
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </div>
      {pasteNotice ? (
        <p
          id={statusId}
          role="status"
          style={{ margin: 0, color: 'var(--settings-destructive-text)', fontSize: 12 }}
        >
          {pasteNotice}
        </p>
      ) : null}
    </div>
  );
}
