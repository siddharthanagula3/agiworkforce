/**
 * SkillMentionPicker Component
 *
 * Dropdown picker that appears when the user types "@" in the chat input.
 * Shows a filtered list of AI skills with keyboard navigation support.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

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
 * Static list of commonly used skills for the mention picker.
 * These map to the .agi/employees/ markdown skill files.
 */
const AVAILABLE_SKILLS: MentionSkill[] = [
  // Technical
  { id: 'senior-software-engineer', name: 'Software Engineer', category: 'Technical' },
  { id: 'frontend-engineer', name: 'Frontend Engineer', category: 'Technical' },
  { id: 'backend-engineer', name: 'Backend Engineer', category: 'Technical' },
  { id: 'system-architect', name: 'System Architect', category: 'Technical' },
  { id: 'senior-devops-engineer', name: 'DevOps Engineer', category: 'Technical' },
  { id: 'code-reviewer', name: 'Code Reviewer', category: 'Technical' },
  { id: 'debugger', name: 'Debugger', category: 'Technical' },
  { id: 'senior-qa-engineer', name: 'QA Engineer', category: 'Technical' },
  { id: 'senior-ui-ux-designer', name: 'UI/UX Designer', category: 'Technical' },
  { id: 'product-manager', name: 'Product Manager', category: 'Technical' },
  // Creative
  { id: 'photographer', name: 'Photographer', category: 'Creative' },
  { id: 'video-editor', name: 'Video Editor', category: 'Creative' },
  { id: 'illustrator', name: 'Illustrator', category: 'Creative' },
  { id: 'music-producer', name: 'Music Producer', category: 'Creative' },
  { id: '3d-artist', name: '3D Artist', category: 'Creative' },
  // Education
  { id: 'expert-tutor', name: 'Expert Tutor', category: 'Education' },
  { id: 'language-tutor', name: 'Language Tutor', category: 'Education' },
  { id: 'sat-act-tutor', name: 'SAT/ACT Tutor', category: 'Education' },
  // Finance
  { id: 'financial-advisor', name: 'Financial Advisor', category: 'Finance' },
  { id: 'cpa-tax-specialist', name: 'CPA Tax Specialist', category: 'Finance' },
  { id: 'investment-advisor', name: 'Investment Advisor', category: 'Finance' },
  // Healthcare
  { id: 'health-advisor', name: 'Health Advisor', category: 'Healthcare' },
  { id: 'nutritionist', name: 'Nutritionist', category: 'Healthcare' },
  { id: 'personal-trainer', name: 'Personal Trainer', category: 'Healthcare' },
  { id: 'mental-health-therapist', name: 'Mental Health Therapist', category: 'Healthcare' },
  // Legal
  { id: 'ai-lawyer', name: 'AI Lawyer', category: 'Legal' },
  // Lifestyle
  { id: 'travel-advisor', name: 'Travel Advisor', category: 'Lifestyle' },
  { id: 'expert-chef', name: 'Expert Chef', category: 'Lifestyle' },
  { id: 'life-coach', name: 'Life Coach', category: 'Lifestyle' },
  { id: 'career-counselor', name: 'Career Counselor', category: 'Lifestyle' },
  { id: 'personal-finance-coach', name: 'Personal Finance Coach', category: 'Lifestyle' },
];

const MAX_RESULTS = 8;

export const SkillMentionPicker: React.FC<SkillMentionPickerProps> = ({
  query,
  onSelect,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return AVAILABLE_SKILLS.slice(0, MAX_RESULTS);
    return AVAILABLE_SKILLS.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    ).slice(0, MAX_RESULTS);
  }, [query]);

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
