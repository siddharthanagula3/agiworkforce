'use client';

import {
  BookOpen,
  CalendarClock,
  FileText,
  GraduationCap,
  Layers,
  LayoutList,
  ListChecks,
  PanelsTopLeft,
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

const MARKED_DOCUMENT =
  'Reply with one ```markdown fenced block whose first line is <!-- @artifact -->, so it opens as a document.';

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
    id: 'quiz',
    label: 'Quiz',
    icon: ListChecks,
    prompt: `Make an interactive quiz from this project's sources: ten questions mixing multiple choice and short answer, each with an explanation that names the source it comes from and up to two hints. Write it as a ~~~quiz block of JSON {"title", "questions": [{"type": "multiple_choice", "question", "options", "answer": <index of the right option>, "explanation", "hints"}, {"type": "short_answer", "question", "answer", "accept", "explanation", "hints"}]} under a one-line introduction. ${MARKED_DOCUMENT} ${GROUNDING}`,
    officeCreationEnabled: false,
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    icon: Layers,
    prompt: `Make a set of twenty flashcards from this project's sources, one key term, fact or idea per card, with the source on the back. Write it as a ~~~flashcards block of JSON {"title", "cards": [{"front", "back"}]} under a one-line introduction. ${MARKED_DOCUMENT} ${GROUNDING}`,
    officeCreationEnabled: false,
  },
  {
    id: 'learning-overview',
    label: 'Learning overview',
    icon: GraduationCap,
    prompt: `Make an interactive learning overview of this project's sources: a short outline of what to learn in order, then one section per key concept with a plain explanation and one worked example, and finish with a five-question check written as a ~~~quiz block of JSON {"title", "questions": [{"type": "multiple_choice", "question", "options", "answer": <index>, "explanation"}]}. ${MARKED_DOCUMENT} ${GROUNDING}`,
    officeCreationEnabled: false,
  },
  {
    id: 'infographic',
    label: 'Infographic',
    icon: PanelsTopLeft,
    prompt: `Make a one-page infographic of this project's sources as a single self-contained HTML artifact: a headline, the five to seven most important numbers or facts as large labelled figures, one simple chart drawn in inline SVG where the sources give data, and short sections with icons drawn in CSS or inline SVG. No external images, fonts or scripts. List the sources in a small footer. Reply with one \`\`\`html fenced block whose first line is <!-- @artifact -->. ${GROUNDING}`,
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
