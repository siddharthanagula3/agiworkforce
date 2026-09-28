'use client';

import {
  BookOpen,
  CalendarClock,
  FileText,
  LayoutList,
  Presentation,
  Table,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';

export interface ProjectStudioRequest {
  prompt: string;
  officeCreationEnabled: boolean;
}

interface StudioOutput {
  id: string;
  label: string;
  icon: LucideIcon;
  prompt: string;
  officeCreationEnabled: boolean;
}

const GROUNDING =
  "Use only this project's sources. Cite the source each point comes from, and say plainly where the sources do not cover something.";

const STUDIO_OUTPUTS: readonly StudioOutput[] = [
  {
    id: 'briefing',
    label: 'Briefing doc',
    icon: FileText,
    prompt: `Write a briefing document from this project's sources: an executive summary, then the key themes, the most important facts and figures, and any open questions. ${GROUNDING}`,
    officeCreationEnabled: false,
  },
  {
    id: 'study-guide',
    label: 'Study guide',
    icon: BookOpen,
    prompt: `Make a study guide from this project's sources: a short-answer quiz with an answer key, three essay questions, and a glossary of key terms. ${GROUNDING}`,
    officeCreationEnabled: false,
  },
  {
    id: 'faq',
    label: 'FAQ',
    icon: LayoutList,
    prompt: `Write a list of frequently asked questions a newcomer would have about this project's sources, each with a concise answer. ${GROUNDING}`,
    officeCreationEnabled: false,
  },
  {
    id: 'timeline',
    label: 'Timeline',
    icon: CalendarClock,
    prompt: `Build a timeline of the events in this project's sources as a Mermaid timeline diagram, followed by a dated list of each event and the people involved. ${GROUNDING}`,
    officeCreationEnabled: false,
  },
  {
    id: 'mind-map',
    label: 'Mind map',
    icon: Waypoints,
    prompt: `Draw a mind map of the main topics in this project's sources and how they connect, as a Mermaid mindmap diagram. ${GROUNDING}`,
    officeCreationEnabled: false,
  },
  {
    id: 'data-table',
    label: 'Data table',
    icon: Table,
    prompt: `Pull the structured facts in this project's sources into a data table, one row per item with a column for each attribute the sources give, as a markdown table. ${GROUNDING}`,
    officeCreationEnabled: false,
  },
  {
    id: 'slide-deck',
    label: 'Slide deck',
    icon: Presentation,
    prompt: `Make a slide deck from this project's sources as a PowerPoint file: a title slide, one slide per key theme with short bullets, and a closing summary. ${GROUNDING}`,
    officeCreationEnabled: true,
  },
];

export function ProjectStudio({ onCreate }: { onCreate: (request: ProjectStudioRequest) => void }) {
  return (
    <section
      aria-labelledby="project-studio-title"
      data-testid="project-studio"
      style={{ marginBottom: 'var(--space-5)' }}
    >
      <h2
        id="project-studio-title"
        style={{
          margin: '0 0 var(--space-1)',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--agi-ink)',
        }}
      >
        Create from your sources
      </h2>
      <p style={{ margin: '0 0 var(--space-3)', fontSize: 12, color: 'var(--agi-ink-2)' }}>
        Each opens a new chat in this project, grounded in its sources.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        {STUDIO_OUTPUTS.map(({ id, label, icon: Icon, prompt, officeCreationEnabled }) => (
          <button
            key={id}
            type="button"
            data-testid={`project-studio-${id}`}
            onClick={() => onCreate({ prompt, officeCreationEnabled })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              minHeight: 36,
              padding: 'var(--space-2) var(--space-3)',
              borderRadius: 'var(--corner-pill)',
              border: '1px solid var(--agi-rule-strong)',
              background: 'transparent',
              color: 'var(--agi-ink)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <Icon style={{ width: 15, height: 15, color: 'var(--agi-ink-2)' }} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
