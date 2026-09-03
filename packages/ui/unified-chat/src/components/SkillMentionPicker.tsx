import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/utils';

export interface MentionSkill {
  id: string;
  name: string;
  category: string;
}

export interface SkillMentionPickerProps {
  query: string;
  skills: MentionSkill[];
  onSelect: (skill: MentionSkill) => void;
  onClose: () => void;
}

const MAX_RESULTS = 8;

export const SkillMentionPicker: React.FC<SkillMentionPickerProps> = ({
  query,
  skills,
  onSelect,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return skills.slice(0, MAX_RESULTS);
    return skills
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q),
      )
      .slice(0, MAX_RESULTS);
  }, [query, skills]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length, query]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev >= filtered.length - 1 ? 0 : prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev <= 0 ? filtered.length - 1 : prev - 1));
      } else if (e.key === 'Enter' && filtered.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const skill = filtered[selectedIndex];
        if (skill) onSelect(skill);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [filtered, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedIndex]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className={cn(
        'absolute bottom-full left-0 z-50 mb-2 w-72 max-h-72 overflow-y-auto',
        'rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--popover))] shadow-2xl backdrop-blur-xl',
      )}
      role="listbox"
      aria-label="Skill mentions"
    >
      <div className="px-3 py-2 border-b border-[hsl(var(--border))]">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          AI Skills, type to filter
        </span>
      </div>
      {filtered.map((skill, i) => (
        <button
          type="button"
          key={skill.id}
          role="option"
          aria-selected={i === selectedIndex}
          className={cn(
            'w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors text-sm',
            i === selectedIndex
              ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground'
              : 'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]',
          )}
          onClick={() => onSelect(skill)}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <span className="font-medium truncate">{skill.name}</span>
          <span className="text-[12px] text-muted-foreground shrink-0">{skill.category}</span>
        </button>
      ))}
    </div>
  );
};

export default SkillMentionPicker;
