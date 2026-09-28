import { getSupportCorpus } from './agent/corpus';
import { helpArticlePath } from './help-paths';

const TOPIC_MAX = 100;

const TOPIC_ALIASES: Readonly<Record<string, string>> = {
  permissions: 'tool-approvals',
  approvals: 'tool-approvals',
};

export function headingAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function readTopicParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const topic = headingAnchor((raw ?? '').slice(0, TOPIC_MAX));
  return topic.length > 0 ? topic : null;
}

export function resolveDocTopic(topic: string): string | null {
  const corpus = getSupportCorpus();
  if (!corpus.available) return null;
  const chunks = corpus.chunks.filter((chunk) => chunk.origin === 'markdown');
  const docId = TOPIC_ALIASES[topic] ?? topic;

  if (chunks.some((chunk) => chunk.docId === docId)) return helpArticlePath(docId);

  const section = chunks.find((chunk) => chunk.heading && headingAnchor(chunk.heading) === topic);
  if (section?.heading) {
    return `${helpArticlePath(section.docId)}#${headingAnchor(section.heading)}`;
  }

  const phrase = topic.replace(/-/g, ' ');
  const tagged = chunks.find((chunk) => chunk.tags.some((tag) => tag.toLowerCase() === phrase));
  return tagged ? helpArticlePath(tagged.docId) : null;
}
