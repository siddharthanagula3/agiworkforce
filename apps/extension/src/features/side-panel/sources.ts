import { renderIcon, Globe } from '../../assets/icons';
import { t, tPlural } from '../../i18n';
import { el } from './dom';
import type { SidePanelSource } from './chat-state';

const CITATION_MARKER = /(?<!\[)\[(\d{1,3})\](?![(:]|\[(?!\d{1,3}\]))/g;
const UNDECORATED_ANCESTORS = 'code, pre, a, .sp-citation';

let citationCardSequence = 0;

export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function buildSourceLink(source: SidePanelSource, className: string): HTMLAnchorElement {
  const link = el('a', {
    class: className,
    href: source.url,
    target: '_blank',
    rel: 'noopener noreferrer',
  });
  const site = el('span', { class: `${className}-site` });
  site.appendChild(renderIcon(Globe, 11));
  site.appendChild(document.createTextNode(sourceHost(source.url)));
  link.appendChild(site);
  link.appendChild(
    el('span', { class: `${className}-title` }, source.title || sourceHost(source.url)),
  );
  if (source.snippet) {
    link.appendChild(el('span', { class: `${className}-snippet` }, source.snippet));
  }
  if (source.publishedDate) {
    link.appendChild(el('span', { class: `${className}-date` }, source.publishedDate));
  }
  return link;
}

function buildCitationChip(sources: readonly SidePanelSource[]): HTMLElement {
  const first = sources[0]!;
  citationCardSequence += 1;
  const cardId = `sp-citation-card-${citationCardSequence}`;
  const wrapper = el('span', { class: 'sp-citation' });
  const label =
    sources.length > 1
      ? t('spCitationMore', [sourceHost(first.url), String(sources.length - 1)])
      : sourceHost(first.url);
  const chip = el(
    'a',
    {
      class: 'sp-citation__chip',
      href: first.url,
      target: '_blank',
      rel: 'noopener noreferrer',
      'aria-describedby': cardId,
    },
    label,
  );
  const card = el('span', { class: 'sp-citation__card', id: cardId });
  for (const source of sources) card.appendChild(buildSourceLink(source, 'sp-citation__source'));
  chip.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch' || wrapper.classList.contains('open')) return;
    wrapper.classList.add('open');
    placeCard();
    chip.addEventListener('click', (click) => click.preventDefault(), { once: true });
  });
  const placeCard = (): void => {
    card.style.left = '0px';
    const overflow = card.getBoundingClientRect().right - (window.innerWidth - 12);
    if (overflow > 0) card.style.left = `${-overflow}px`;
  };
  wrapper.addEventListener('mouseenter', placeCard);
  wrapper.addEventListener('focusin', placeCard);
  wrapper.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !wrapper.matches(':focus-within')) return;
    wrapper.classList.remove('open');
    chip.blur();
  });
  wrapper.addEventListener('focusout', (event) => {
    if (!wrapper.contains(event.relatedTarget as Node | null)) wrapper.classList.remove('open');
  });
  wrapper.appendChild(chip);
  wrapper.appendChild(card);
  return wrapper;
}

function citationTextNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node as Text;
    if (!text.data.includes('[')) continue;
    if (text.parentElement?.closest(UNDECORATED_ANCESTORS)) continue;
    nodes.push(text);
  }
  return nodes;
}

export function decorateCitations(root: HTMLElement, markers: readonly SidePanelSource[]): void {
  if (markers.length === 0) return;
  for (const node of citationTextNodes(root)) {
    const matches = [...node.data.matchAll(CITATION_MARKER)];
    if (matches.length === 0) continue;
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let index = 0;
    while (index < matches.length) {
      const start = matches[index]!.index;
      let end = start + matches[index]![0].length;
      const grouped: SidePanelSource[] = [];
      const addSource = (marker: string | undefined): void => {
        const source = markers[Number(marker) - 1];
        if (source && !grouped.includes(source)) grouped.push(source);
      };
      addSource(matches[index]![1]);
      index += 1;
      while (index < matches.length && node.data.slice(end, matches[index]!.index).trim() === '') {
        addSource(matches[index]![1]);
        end = matches[index]!.index + matches[index]![0].length;
        index += 1;
      }
      if (grouped.length === 0) continue;
      fragment.appendChild(document.createTextNode(node.data.slice(cursor, start)));
      fragment.appendChild(buildCitationChip(grouped));
      cursor = end;
    }
    if (cursor === 0) continue;
    fragment.appendChild(document.createTextNode(node.data.slice(cursor)));
    node.replaceWith(fragment);
  }
}

export function buildSourcesFooter(sources: readonly SidePanelSource[]): HTMLElement | null {
  if (sources.length === 0) return null;
  const details = el('details', { class: 'sp-sources' });
  const summary = el('summary', { class: 'sp-sources__summary' });
  summary.appendChild(renderIcon(Globe, 13));
  summary.appendChild(document.createTextNode(tPlural('spSourcesCount', sources.length)));
  details.appendChild(summary);
  const list = el('ol', { class: 'sp-sources__list', 'aria-label': t('spSourcesListLabel') });
  for (const source of sources) {
    const item = el('li', { class: 'sp-sources__item' });
    item.appendChild(buildSourceLink(source, 'sp-sources__link'));
    list.appendChild(item);
  }
  details.appendChild(list);
  return details;
}
