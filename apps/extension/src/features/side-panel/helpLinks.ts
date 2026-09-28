import { renderIcon, ExternalLink } from '../../assets/icons';
import { FREE_TRIAL_GATEWAY } from '../cloud-bridge/freeTrialClient';
import { el } from './dom';

export type HelpArticleId =
  | 'agi-work'
  | 'artifacts'
  | 'keyboard-shortcuts'
  | 'memory'
  | 'projects'
  | 'schedules-and-triggers'
  | 'sharing-conversations'
  | 'temporary-chats'
  | 'tool-approvals'
  | 'usage-and-credits';

export const HELP_LINK_CSS = `
  .sp-help-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    width: fit-content;
    color: var(--agi-ext-accent-text);
    font-size: var(--type-caption-size);
    line-height: var(--type-caption-height);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .sp-help-link:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
`;

export function helpArticleUrl(docId: HelpArticleId): string {
  return `${FREE_TRIAL_GATEWAY}/help/${encodeURIComponent(docId)}?from=chrome-extension`;
}

export function buildHelpArticleLink(docId: HelpArticleId, label: string): HTMLAnchorElement {
  const link = el('a', {
    class: 'sp-help-link',
    href: helpArticleUrl(docId),
    target: '_blank',
    rel: 'noopener noreferrer',
  });
  link.appendChild(document.createTextNode(label));
  link.appendChild(renderIcon(ExternalLink, 12));
  return link;
}
