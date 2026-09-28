import { isAllowedItineraryRouteUrl } from '@agiworkforce/cloud-contracts';
import {
  CLARIFY_OTHER_MAX_LENGTH,
  isResolvedPlace,
  type ClarifyAnswer,
  type ClarifyCardBody,
  type InteractiveCard,
  type InteractiveCardRenderContext,
  type InteractiveCardResponsePayload,
  type InteractiveCardSource,
  type ItineraryCardBody,
  type ItineraryRoute,
  type ItineraryTravelMode,
  type PlaceIdentity,
  type ProductComparisonCardBody,
  type ProductComparisonPrice,
} from '@agiworkforce/types';
import {
  renderIcon,
  CircleAlert,
  ExternalLink,
  MapPinned,
  Navigation,
  Scale,
} from '../../assets/icons';
import { t } from '../../i18n';
import { el } from './dom';
import { type AnswerFileAccess } from './generatedFiles';
import { buildPointsMapPreview, fittedMapView, type MapPreviewPoint } from './mapPreview';
import { sourceHost } from './sources';

function newTabHint(): HTMLElement {
  return el('span', { class: 'sp-visually-hidden' }, ` ${t('spOpensInNewTab')}`);
}

function externalLink(href: string, className: string): HTMLAnchorElement {
  return el('a', { class: className, href, target: '_blank', rel: 'noopener noreferrer' });
}

function cardHeading(icon: string, title: string): HTMLElement {
  const heading = el('div', { class: 'sp-interactive-card__heading' });
  heading.appendChild(renderIcon(icon, 15));
  heading.appendChild(el('div', { class: 'sp-interactive-card__headline' }, title));
  return heading;
}

function itineraryDirectionsLabel(mode: ItineraryTravelMode): string {
  switch (mode) {
    case 'walking':
      return t('spItineraryDirectionsWalking');
    case 'driving':
      return t('spItineraryDirectionsDriving');
    case 'transit':
      return t('spItineraryDirectionsTransit');
    case 'bicycling':
      return t('spItineraryDirectionsCycling');
  }
}

function itineraryRouteMessage(route: ItineraryRoute): string | null {
  if (route.status === 'available' || route.reason === 'too_few_stops') return null;
  if (route.reason === 'unresolved_stops') {
    return route.unresolvedStopCount === 1
      ? t('spItineraryRouteMissingOne')
      : t('spItineraryRouteMissingMany', [String(route.unresolvedStopCount)]);
  }
  return t('spItineraryRouteUnavailable');
}

function unresolvedPlaceLabel(place: PlaceIdentity | undefined): string {
  return place?.status === 'unresolved' &&
    (place.reason === 'provider_error' || place.reason === 'rate_limited')
    ? t('spItineraryPlaceLookupFailed')
    : t('spItineraryPlaceNotFound');
}

function buildItineraryStop(
  stop: ItineraryCardBody['stops'][number],
  place: PlaceIdentity | undefined,
): HTMLElement {
  const item = el('li', { class: 'sp-itinerary__stop' });
  item.appendChild(
    el('span', { class: 'sp-itinerary__pin', 'aria-hidden': 'true' }, String(stop.pin)),
  );
  const detail = el('div', { class: 'sp-itinerary__detail' });
  if (stop.startTimeLabel) {
    detail.appendChild(el('div', { class: 'sp-itinerary__time' }, stop.startTimeLabel));
  }
  detail.appendChild(
    el(
      'div',
      { class: 'sp-itinerary__place' },
      place?.status === 'resolved' ? place.displayName : (place?.query ?? ''),
    ),
  );
  if (place?.status === 'resolved') {
    detail.appendChild(el('div', { class: 'sp-itinerary__address' }, place.formattedAddress));
  } else {
    const missing = el('div', { class: 'sp-itinerary__missing' });
    missing.appendChild(renderIcon(CircleAlert, 13));
    missing.appendChild(document.createTextNode(unresolvedPlaceLabel(place)));
    detail.appendChild(missing);
  }
  if (stop.note) detail.appendChild(el('div', { class: 'sp-itinerary__note' }, stop.note));
  item.appendChild(detail);
  return item;
}

export function buildItineraryCard(
  body: ItineraryCardBody,
  access: AnswerFileAccess | undefined,
): HTMLElement {
  const section = el('section', {
    class: 'sp-interactive-card sp-interactive-card--itinerary',
    'aria-label': body.title,
    'data-card-kind': 'itinerary.v1',
  });
  section.appendChild(cardHeading(MapPinned, body.title));
  section.appendChild(el('div', { class: 'sp-interactive-card__meta' }, body.region.label));
  if (body.summary) {
    section.appendChild(el('div', { class: 'sp-interactive-card__text' }, body.summary));
  }

  const pinsByPlace = new Map<number, number[]>();
  for (const stop of body.stops) {
    pinsByPlace.set(stop.placeIndex, [...(pinsByPlace.get(stop.placeIndex) ?? []), stop.pin]);
  }
  const points: MapPreviewPoint[] = body.places.flatMap((place, index) =>
    place.status === 'resolved'
      ? [
          {
            latitude: place.lat,
            longitude: place.lng,
            label: (pinsByPlace.get(index) ?? []).join(', '),
          },
        ]
      : [],
  );
  const view = fittedMapView(points);
  if (view && access) {
    section.appendChild(
      buildPointsMapPreview(
        {
          label: t('spItineraryMapLabel', [body.title]),
          unavailableText: t('spItineraryMapUnavailable'),
          view,
          points,
        },
        access,
      ),
    );
  }

  const stops = el('ol', {
    class: 'sp-itinerary__stops',
    'aria-label': t('spItineraryStopsLabel'),
  });
  for (const stop of body.stops) {
    stops.appendChild(buildItineraryStop(stop, body.places[stop.placeIndex]));
  }
  section.appendChild(stops);

  const legs =
    body.route.status === 'available'
      ? body.route.legs.filter((leg) => isAllowedItineraryRouteUrl(leg.url))
      : [];
  if (body.route.status === 'available' && legs.length > 0) {
    const route = el('div', { class: 'sp-itinerary__route' });
    route.appendChild(
      el(
        'div',
        { class: 'sp-interactive-card__meta' },
        itineraryDirectionsLabel(body.route.travelMode),
      ),
    );
    const links = el('div', { class: 'sp-itinerary__legs' });
    for (const leg of legs) {
      const link = externalLink(leg.url, 'sp-itinerary__leg');
      link.appendChild(renderIcon(Navigation, 13));
      link.appendChild(document.createTextNode(leg.label));
      link.appendChild(newTabHint());
      links.appendChild(link);
    }
    route.appendChild(links);
    section.appendChild(route);
  } else {
    const message = itineraryRouteMessage(body.route);
    if (message) section.appendChild(el('div', { class: 'sp-interactive-card__meta' }, message));
  }

  const attribution = body.places.find(isResolvedPlace)?.attribution;
  if (attribution) {
    const line = el('div', { class: 'sp-interactive-card__meta' }, attribution.providerLabel);
    if (attribution.providerUrl?.startsWith('https://')) {
      line.appendChild(document.createTextNode(' · '));
      const terms = externalLink(attribution.providerUrl, 'sp-interactive-card__link');
      terms.appendChild(document.createTextNode(t('spItineraryTerms')));
      terms.appendChild(newTabHint());
      line.appendChild(terms);
    }
    section.appendChild(line);
  }
  return section;
}

function formatComparisonPrice(price: ProductComparisonPrice): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: price.currency }).format(
      price.amount,
    );
  } catch {
    return `${price.amount} ${price.currency}`;
  }
}

function formatCheckedAt(checkedAt: string): string {
  const date = new Date(checkedAt);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
    : checkedAt;
}

function buildComparisonSources(sources: readonly InteractiveCardSource[]): HTMLElement {
  const list = el('ol', { class: 'sp-comparison__sources' });
  sources.forEach((source, index) => {
    const link = externalLink(source.url, 'sp-comparison__source');
    link.appendChild(el('span', { class: 'sp-comparison__source-number' }, String(index + 1)));
    link.appendChild(el('span', { class: 'sp-comparison__source-host' }, sourceHost(source.url)));
    link.appendChild(
      el('span', { class: 'sp-visually-hidden' }, t('spComparisonSourceHidden', [source.title])),
    );
    list.appendChild(el('li', {}, link));
  });
  return list;
}

function buildComparisonProduct(
  product: ProductComparisonCardBody['products'][number],
): HTMLElement {
  const tile = el('li', { class: 'sp-comparison__product' });
  tile.appendChild(el('div', { class: 'sp-comparison__name' }, product.name));
  if (product.bestFor) {
    tile.appendChild(el('div', { class: 'sp-comparison__best-for' }, product.bestFor));
  }
  if (product.price) {
    const price = el(
      'div',
      { class: 'sp-comparison__price' },
      formatComparisonPrice(product.price),
    );
    if (product.merchant) {
      price.appendChild(
        el(
          'span',
          { class: 'sp-comparison__merchant' },
          t('spComparisonPriceAt', [product.merchant]),
        ),
      );
    }
    tile.appendChild(price);
  } else {
    tile.appendChild(
      el('div', { class: 'sp-comparison__best-for' }, t('spComparisonPriceNotFound')),
    );
  }
  if (product.buyUrl) {
    const buy = externalLink(product.buyUrl, 'sp-comparison__buy');
    buy.appendChild(
      document.createTextNode(
        product.merchant
          ? t('spComparisonBuyAt', [product.merchant])
          : t('spComparisonViewProduct'),
      ),
    );
    buy.appendChild(renderIcon(ExternalLink, 12));
    buy.appendChild(newTabHint());
    tile.appendChild(buy);
  }
  tile.appendChild(buildComparisonSources(product.sources));
  return tile;
}

function buildComparisonSpecs(body: ProductComparisonCardBody): HTMLElement {
  const region = el('div', {
    class: 'sp-comparison__specs',
    role: 'region',
    'aria-label': t('spComparisonSpecsLabel', [body.title]),
    tabindex: '0',
  });
  const table = el('table', { class: 'sp-comparison__table' });
  const headRow = el('tr');
  headRow.appendChild(el('th', { scope: 'col' }, t('spComparisonSpecHeading')));
  for (const product of body.products) {
    headRow.appendChild(el('th', { scope: 'col' }, product.name));
  }
  table.appendChild(el('thead', {}, headRow));
  const rows = el('tbody');
  body.specLabels.forEach((label, index) => {
    const row = el('tr');
    row.appendChild(el('th', { scope: 'row' }, label));
    for (const product of body.products) {
      const value = product.specs[index];
      row.appendChild(
        value
          ? el('td', {}, value)
          : el('td', { class: 'sp-comparison__unlisted' }, t('spComparisonSpecNotListed')),
      );
    }
    rows.appendChild(row);
  });
  table.appendChild(rows);
  region.appendChild(table);
  return region;
}

export function buildProductComparisonCard(body: ProductComparisonCardBody): HTMLElement {
  const section = el('section', {
    class: 'sp-interactive-card sp-interactive-card--comparison',
    'aria-label': body.title,
    'data-card-kind': 'product-comparison.v1',
  });
  section.appendChild(cardHeading(Scale, body.title));
  section.appendChild(
    el(
      'div',
      { class: 'sp-interactive-card__meta' },
      t('spComparisonPricesChecked', [formatCheckedAt(body.checkedAt)]),
    ),
  );
  const products = el('ul', { class: 'sp-comparison__products' });
  for (const product of body.products) products.appendChild(buildComparisonProduct(product));
  section.appendChild(products);
  if (body.specLabels.length > 0) section.appendChild(buildComparisonSpecs(body));
  return section;
}

interface ClarifyDraftEntry {
  optionIds: string[];
  otherText: string;
}

function describeClarifyAnswer(answer: ClarifyAnswer | undefined): string {
  if (!answer) return t('spClarifyNoAnswer');
  if (answer.kind === 'skipped') return t('spClarifySkipped');
  if (answer.kind === 'other') return answer.text;
  return answer.labels.length > 0 ? answer.labels.join(', ') : answer.optionIds.join(', ');
}

function clarifyExpiredText(
  reason: Extract<ClarifyCardBody['state'], { status: 'expired' }>['reason'],
): string {
  switch (reason) {
    case 'checkpoint_gone':
      return t('spClarifyExpiredEnded');
    case 'turn_failed':
      return t('spClarifyExpiredFailed');
    case 'superseded':
      return t('spClarifyExpiredSuperseded');
  }
}

export function clarifyAnswersFromResponse(
  body: ClarifyCardBody,
  payload: Extract<InteractiveCardResponsePayload, { kind: 'answers' }>,
): ClarifyAnswer[] {
  return body.questions.map((question) => {
    const entry = payload.answers.find((candidate) => candidate.question_id === question.id);
    const text = entry?.text?.trim() ?? '';
    if (text) return { questionId: question.id, kind: 'other', text };
    const options = question.options.filter((option) => entry?.option_ids?.includes(option.id));
    if (options.length === 0) return { questionId: question.id, kind: 'skipped' };
    return {
      questionId: question.id,
      kind: 'options',
      optionIds: options.map((option) => option.id),
      labels: options.map((option) => option.label),
    };
  });
}

export function clarifyAnswerMessage(
  body: ClarifyCardBody,
  answers: readonly ClarifyAnswer[],
): string {
  return answers
    .flatMap((answer) => {
      const question = body.questions.find((candidate) => candidate.id === answer.questionId);
      if (!question || answer.kind === 'skipped') return [];
      return [`${question.question} ${describeClarifyAnswer(answer)}`];
    })
    .join('\n');
}

export function buildClarifyCard(
  card: InteractiveCard,
  body: ClarifyCardBody,
  ctx: InteractiveCardRenderContext,
): HTMLElement {
  const section = el('section', {
    class: 'sp-interactive-card sp-interactive-card--clarify',
    'aria-label': card.fallback.headline,
    'data-card-kind': 'clarify.v1',
    'data-card-state': body.state.status,
  });
  section.appendChild(
    el('div', { class: 'sp-interactive-card__headline' }, body.prompt ?? card.fallback.headline),
  );
  if (body.state.status === 'expired') {
    section.appendChild(
      el('div', { class: 'sp-interactive-card__meta' }, clarifyExpiredText(body.state.reason)),
    );
  }
  if (body.state.status === 'dismissed') {
    section.appendChild(el('div', { class: 'sp-interactive-card__meta' }, t('spClarifyDismissed')));
  }

  const respond = ctx.onRespond;
  const interactive =
    body.state.status === 'pending' &&
    ctx.canRespond &&
    respond !== undefined &&
    !body.questions.some((question) => question.isSecret);
  const answers =
    body.state.status === 'answered'
      ? new Map(body.state.answers.map((answer) => [answer.questionId, answer]))
      : null;
  const draft = new Map<string, ClarifyDraftEntry>(
    body.questions.map((question) => [question.id, { optionIds: [], otherText: '' }]),
  );
  const send = el('button', { class: 'sp-clarify__send', type: 'button' }, t('spClarifySend'));
  const refreshSend = (): void => {
    send.disabled = ![...draft.values()].some(
      (entry) => entry.optionIds.length > 0 || entry.otherText.trim().length > 0,
    );
  };

  body.questions.forEach((question, questionIndex) => {
    const labelId = `sp-clarify-${card.cardId}-${questionIndex}`;
    const group = el('div', {
      class: 'sp-clarify__question',
      role: 'group',
      'aria-labelledby': labelId,
    });
    const label = el('div', { class: 'sp-clarify__label', id: labelId });
    label.appendChild(el('span', { class: 'sp-clarify__header' }, question.header));
    label.appendChild(el('span', {}, question.question));
    group.appendChild(label);
    if (answers) {
      group.appendChild(
        el('div', { class: 'sp-clarify__answer' }, describeClarifyAnswer(answers.get(question.id))),
      );
      section.appendChild(group);
      return;
    }
    const entry = draft.get(question.id)!;
    const optionButtons: HTMLButtonElement[] = [];
    const other = question.isOther
      ? el('input', {
          class: 'sp-clarify__other',
          type: 'text',
          maxlength: String(CLARIFY_OTHER_MAX_LENGTH),
          placeholder: t('spClarifyOtherPlaceholder'),
          'aria-label': t('spClarifyOtherLabel', [question.header]),
        })
      : null;
    const options = el('div', { class: 'sp-clarify__options' });
    for (const option of question.options) {
      const button = el(
        'button',
        {
          class: 'sp-clarify__option',
          type: 'button',
          'aria-pressed': 'false',
          ...(option.description ? { title: option.description } : {}),
        },
        option.label,
      );
      button.disabled = !interactive;
      button.addEventListener('click', () => {
        const selected = entry.optionIds.includes(option.id);
        entry.optionIds = question.multiSelect
          ? selected
            ? entry.optionIds.filter((id) => id !== option.id)
            : [...entry.optionIds, option.id]
          : selected
            ? []
            : [option.id];
        entry.otherText = '';
        if (other) other.value = '';
        question.options.forEach((candidate, index) =>
          optionButtons[index]?.setAttribute(
            'aria-pressed',
            String(entry.optionIds.includes(candidate.id)),
          ),
        );
        refreshSend();
      });
      optionButtons.push(button);
      options.appendChild(button);
    }
    group.appendChild(options);
    if (other) {
      other.disabled = !interactive;
      other.addEventListener('input', () => {
        entry.otherText = other.value;
        entry.optionIds = [];
        for (const button of optionButtons) button.setAttribute('aria-pressed', 'false');
        refreshSend();
      });
      group.appendChild(other);
    }
    section.appendChild(group);
  });

  if (interactive) {
    const actions = el('div', { class: 'sp-clarify__actions' });
    refreshSend();
    send.addEventListener('click', () =>
      respond({
        kind: 'answers',
        answers: body.questions.map((question) => {
          const entry = draft.get(question.id);
          const text = entry?.otherText.trim() ?? '';
          if (text) return { question_id: question.id, text };
          if (entry?.optionIds.length) {
            return { question_id: question.id, option_ids: [...entry.optionIds] };
          }
          return { question_id: question.id, skipped: true };
        }),
      }),
    );
    const dismiss = el(
      'button',
      { class: 'sp-clarify__dismiss', type: 'button' },
      t('spClarifyDismiss'),
    );
    dismiss.addEventListener('click', () => respond({ kind: 'dismiss' }));
    actions.appendChild(send);
    actions.appendChild(dismiss);
    section.appendChild(actions);
  }
  return section;
}
