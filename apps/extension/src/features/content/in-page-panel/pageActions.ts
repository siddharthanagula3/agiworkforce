/**
 * Page-aware action definitions for the in-page chat overlay.
 *
 * `getPageActions(url)` returns 3-4 quick-action chips appropriate for the
 * current page. Site-specific templates are checked first (YouTube watch pages,
 * GitHub PRs), then generic defaults are returned for all other pages.
 *
 * Each Action carries the chip label, a prompt template function, and an
 * optional icon (single Unicode character for zero-weight rendering).
 *
 * @module inPagePanel/pageActions
 */

export interface PageAction {
  label: string;
  icon: string;
  buildPrompt: (pageTitle: string, pageText: string) => string;
  id: string;
}

const GENERIC_ACTIONS: PageAction[] = [
  {
    id: 'summarize',
    label: 'Summarize',
    icon: '∑',
    buildPrompt: (title, text) =>
      `Summarize the following page titled "${title}" in 3-5 bullet points:\n\n${text}`,
  },
  {
    id: 'key_points',
    label: 'Key points',
    icon: '•',
    buildPrompt: (title, text) =>
      `Extract the most important key points from this page titled "${title}":\n\n${text}`,
  },
  {
    id: 'qa',
    label: 'Q&A',
    icon: '?',
    buildPrompt: (title, text) =>
      `Based on this page titled "${title}", what are the most likely questions a reader would have, and what are their answers?\n\n${text}`,
  },
  {
    id: 'translate',
    label: 'Translate',
    icon: '\u{1F310}',
    buildPrompt: (title, text) =>
      `Translate the following content from the page titled "${title}" into English (or summarize it in English if it is already in English):\n\n${text}`,
  },
];

const YOUTUBE_ACTIONS: PageAction[] = [
  {
    id: 'yt_summarize',
    label: 'Summarize video',
    icon: '▶',
    buildPrompt: (title, _text) =>
      `Summarize the YouTube video titled "${title}". Focus on the main topics, key arguments, and conclusions presented.`,
  },
  {
    id: 'yt_timestamps',
    label: 'Key timestamps',
    icon: '⏱',
    buildPrompt: (title, _text) =>
      `For the YouTube video titled "${title}", identify and describe the key timestamps and what happens at each section of the video.`,
  },
  {
    id: 'yt_qa',
    label: 'Q&A',
    icon: '?',
    buildPrompt: (title, _text) =>
      `What are the most important questions and answers from the YouTube video titled "${title}"?`,
  },
];

const GITHUB_PR_ACTIONS: PageAction[] = [
  {
    id: 'gh_explain',
    label: 'Explain diff',
    icon: '\u{1F50D}',
    buildPrompt: (title, text) =>
      `Explain the changes in this GitHub pull request titled "${title}". Describe what was changed, why it might have been changed, and any potential impact:\n\n${text}`,
  },
  {
    id: 'gh_review',
    label: 'Review comments',
    icon: '✎',
    buildPrompt: (title, text) =>
      `Act as a code reviewer and suggest review comments for this GitHub pull request titled "${title}". Focus on correctness, maintainability, and potential issues:\n\n${text}`,
  },
  {
    id: 'gh_summary',
    label: 'PR summary',
    icon: '∑',
    buildPrompt: (title, text) =>
      `Write a concise summary of this GitHub pull request titled "${title}" suitable for a team standup:\n\n${text}`,
  },
];

function isYouTubeWatch(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === 'www.youtube.com' || parsed.hostname === 'youtube.com') &&
      parsed.pathname === '/watch' &&
      parsed.searchParams.has('v')
    );
  } catch {
    return false;
  }
}

function isGitHubPR(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'github.com' && /^\/[^/]+\/[^/]+\/pull\/\d+/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function getPageActions(url: string): PageAction[] {
  if (isYouTubeWatch(url)) return YOUTUBE_ACTIONS;
  if (isGitHubPR(url)) return GITHUB_PR_ACTIONS;
  return GENERIC_ACTIONS;
}

export function truncatePageText(raw: string, maxChars = 30_000): string {
  const collapsed = raw
    .replace(/[\t\u00A0 ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return collapsed.length <= maxChars ? collapsed : collapsed.slice(0, maxChars);
}

export { redactSecrets as redactSensitiveText } from '@agiworkforce/utils/logger';
