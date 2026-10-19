import type { ChatOutputFormat } from './skills';

export const PROJECT_STUDIO_GROUNDING =
  "Use only this project's sources. Cite the source each point comes from, and say plainly where the sources do not cover something.";

export const PROJECT_STUDIO_OUTPUT_IDS = [
  'briefing',
  'study-guide',
  'faq',
  'timeline',
  'mind-map',
  'data-table',
  'slide-deck',
  'infographic',
  'quiz',
  'flashcards',
  'learning-overview',
] as const;

export type ProjectStudioOutputId = (typeof PROJECT_STUDIO_OUTPUT_IDS)[number];

export interface ProjectStudioOutput {
  id: ProjectStudioOutputId;
  label: string;
  description: string;
  prompt: string;
  officeFormat: ChatOutputFormat | null;
}

export const PROJECT_STUDIO_OUTPUTS: readonly ProjectStudioOutput[] = [
  {
    id: 'briefing',
    label: 'Briefing doc',
    description: 'Summary, key themes, facts and open questions',
    prompt: `Write a briefing document from this project's sources: an executive summary, then the key themes, the most important facts and figures, and any open questions. ${PROJECT_STUDIO_GROUNDING}`,
    officeFormat: null,
  },
  {
    id: 'study-guide',
    label: 'Study guide',
    description: 'Short-answer quiz, essay questions and a glossary',
    prompt: `Make a study guide from this project's sources: a short-answer quiz with an answer key, three essay questions, and a glossary of key terms. ${PROJECT_STUDIO_GROUNDING}`,
    officeFormat: null,
  },
  {
    id: 'faq',
    label: 'FAQ',
    description: 'Questions a newcomer would ask, answered',
    prompt: `Write a list of frequently asked questions a newcomer would have about this project's sources, each with a concise answer. ${PROJECT_STUDIO_GROUNDING}`,
    officeFormat: null,
  },
  {
    id: 'timeline',
    label: 'Timeline',
    description: 'Dated events and the people involved',
    prompt: `Build a timeline of the events in this project's sources as a Mermaid timeline diagram, followed by a dated list of each event and the people involved. ${PROJECT_STUDIO_GROUNDING}`,
    officeFormat: null,
  },
  {
    id: 'mind-map',
    label: 'Mind map',
    description: 'Main topics and how they connect',
    prompt: `Draw a mind map of the main topics in this project's sources and how they connect, as a Mermaid mindmap diagram. ${PROJECT_STUDIO_GROUNDING}`,
    officeFormat: null,
  },
  {
    id: 'data-table',
    label: 'Data table',
    description: 'Structured facts, one row per item',
    prompt: `Pull the structured facts in this project's sources into a data table, one row per item with a column for each attribute the sources give, as a markdown table. ${PROJECT_STUDIO_GROUNDING}`,
    officeFormat: null,
  },
  {
    id: 'slide-deck',
    label: 'Slide deck',
    description: 'A PowerPoint deck, one slide per theme',
    prompt: `Make a slide deck from this project's sources as a PowerPoint file: a title slide, one slide per key theme with short bullets, and a closing summary. ${PROJECT_STUDIO_GROUNDING}`,
    officeFormat: 'pptx',
  },
  {
    id: 'infographic',
    label: 'Infographic',
    description: 'A one-page visual summary',
    prompt: `Make a one-page infographic of this project's sources as a single self-contained SVG artifact: a title, three to six key facts or figures with short labels, and simple shapes or charts that show how they relate. Use no scripts or external images. ${PROJECT_STUDIO_GROUNDING}`,
    officeFormat: null,
  },
  {
    id: 'quiz',
    label: 'Quiz',
    description: 'Answer one question at a time',
    prompt: `Quiz me on this project's sources. Ask one multiple-choice question at a time with four options labelled A to D, then wait for my answer. After I answer, say whether it was right, explain why with the source it comes from, and then ask the next question. Ten questions, then give my score and the topics to review. ${PROJECT_STUDIO_GROUNDING}`,
    officeFormat: null,
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    description: 'Key terms, one card at a time',
    prompt: `Make a set of flashcards from this project's sources, one key term or fact per card. Show me the front of one card at a time and wait. When I reply, show the back with the source it comes from, ask whether I knew it, and then show the next card. At the end list the cards I missed. ${PROJECT_STUDIO_GROUNDING}`,
    officeFormat: null,
  },
  {
    id: 'learning-overview',
    label: 'Learning overview',
    description: 'Concepts in order, each with a check question',
    prompt: `Give me an interactive learning overview of this project's sources: list the core concepts in the order they build on each other, then teach the first one in a few sentences with an example and one question to check I understood. Wait for my answer before moving to the next concept. ${PROJECT_STUDIO_GROUNDING}`,
    officeFormat: null,
  },
];

export function projectStudioOutput(id: string): ProjectStudioOutput | undefined {
  return PROJECT_STUDIO_OUTPUTS.find((output) => output.id === id);
}
