/**
 * SkillMentionPicker Component
 *
 * Dropdown picker that appears when the user types "@" in the chat input.
 * Shows a filtered list of all 150 AI skills loaded from bundled .md files,
 * with keyboard navigation support.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { loadSkills, type LoadedSkill } from '../../lib/skillLoader';

export interface MentionSkill {
  id: string;
  name: string;
  category: string;
}

interface SkillMentionPickerProps {
  /** Text after the @ symbol used to filter skills */
  query: string;
  /** Called when a skill is selected */
  onSelect: (skill: MentionSkill) => void;
  /** Called when the picker should close */
  onClose: () => void;
}

/**
 * Converts a LoadedSkill to the MentionSkill shape used by the picker UI.
 * Formats the name for display by converting kebab-case to Title Case.
 */
function toMentionSkill(skill: LoadedSkill): MentionSkill {
  // Format name for display: "backend-engineer" -> "Backend Engineer"
  const displayName = skill.name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return {
    id: skill.id,
    name: displayName,
    category: skill.category,
  };
}

const MAX_RESULTS = 8;

export const SkillMentionPicker: React.FC<SkillMentionPickerProps> = ({
  query,
  onSelect,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Load all 150 skills from bundled .md files (cached after first call)
  const allSkills = useMemo(() => {
    try {
      return loadSkills().map(toMentionSkill);
    } catch (error) {
      console.error('Failed to load skills:', error);
      return [];
    }
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return allSkills.slice(0, MAX_RESULTS);
    return allSkills
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q),
      )
      .slice(0, MAX_RESULTS);
  }, [query, allSkills]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length, query]);

  // Keyboard navigation
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

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className={cn(
        'absolute bottom-full left-0 z-50 mb-2 w-72 max-h-72 overflow-y-auto',
        'rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--popover))] shadow-2xl backdrop-blur-xl',
        '',
      )}
      role="listbox"
      aria-label="Skill mentions"
    >
      <div className="px-3 py-2 border-b border-[hsl(var(--border))]">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          AI Skills — type to filter
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
          <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
            {skill.category}
          </span>
        </button>
      ))}
    </div>
  );
};

export default SkillMentionPicker;
