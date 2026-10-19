'use client';

import { Label } from '@agiworkforce/ui';
import type { ProjectChatDefaults } from '@agiworkforce/cloud-contracts';
import { useSkillsList } from '@features/chat/hooks/use-skills-list';

const SKILL_FIELD_ID = 'ps-default-skill';

export function ProjectChatDefaultsField({
  value,
  onChange,
}: {
  value: ProjectChatDefaults;
  onChange: (next: ProjectChatDefaults) => void;
}) {
  const { skills, loading, error } = useSkillsList();
  const skillName = value.skillName ?? null;
  const skillListed = skillName === null || skills.some((skill) => skill.name === skillName);

  return (
    <div className="space-y-1.5">
      <p className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        New chats start with
      </p>
      <p className="text-xs text-muted-foreground">
        Tools switched on for every new chat in this project. You can still turn them off in any
        chat, and a tool your model or plan cannot use stays off.
      </p>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={value.codeExecution === true}
          onChange={(event) => onChange({ ...value, codeExecution: event.target.checked })}
          className="mt-0.5"
        />
        <span className="text-xs text-foreground">Run code</span>
      </label>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={value.research === true}
          onChange={(event) => onChange({ ...value, research: event.target.checked })}
          className="mt-0.5"
        />
        <span className="text-xs text-foreground">Research</span>
      </label>
      <Label htmlFor={SKILL_FIELD_ID} className="block pt-1 text-xs text-foreground">
        Skill
      </Label>
      <select
        id={SKILL_FIELD_ID}
        value={skillName ?? ''}
        disabled={loading && skillName === null}
        onChange={(event) => onChange({ ...value, skillName: event.target.value || null })}
        className="h-11 w-full rounded-xl border border-input bg-muted/40 px-3 text-sm text-foreground"
      >
        <option value="">No Skill</option>
        {!skillListed && skillName ? (
          <option value={skillName}>{`${skillName} (no longer in your Skills)`}</option>
        ) : null}
        {skills.map((skill) => (
          <option key={skill.name} value={skill.name}>
            {skill.name}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-danger-text">{error}</p> : null}
    </div>
  );
}
