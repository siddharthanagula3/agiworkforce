import { BuildError } from './support-frontmatter.mjs';

export const PURCHASE_HELP_CATEGORY = 'billing';

export const PURCHASE_PASSAGE_OPEN = '{{#purchase}}';
export const PURCHASE_PASSAGE_CLOSE = '{{/purchase}}';

export const PURCHASE_VOCABULARY = Object.freeze([
  'access code',
  'access codes',
  'billed',
  'billing',
  'bought',
  'buy',
  'buying',
  'buys',
  'charged',
  'checkout',
  'credit',
  'credits',
  'invoice',
  'invoices',
  'paid',
  'pay',
  'paying',
  'payment',
  'payments',
  'pays',
  'prepaid',
  'price',
  'priced',
  'prices',
  'pricing',
  'purchase',
  'purchased',
  'purchases',
  'purchasing',
  'refund',
  'refunded',
  'refunds',
  'renew',
  'renewal',
  'renewals',
  'renewed',
  'renewing',
  'renews',
  'subscribe',
  'subscribed',
  'subscription',
  'subscriptions',
  'top-up',
  'top-ups',
  'upgrade',
  'upgraded',
  'upgrades',
  'upgrading',
]);

export const PURCHASE_VOCABULARY_EXCEPTIONS = Object.freeze(['payment card', 'payment cards']);

const VOCABULARY_PATTERN = new RegExp(
  `\\b(?:${PURCHASE_VOCABULARY.join('|')})\\b|\\$\\d|\\{\\{\\s*PLANS\\.`,
  'i',
);
const EXCEPTION_PATTERN = new RegExp(`\\b(?:${PURCHASE_VOCABULARY_EXCEPTIONS.join('|')})\\b`, 'gi');

const MARKER_LINES = new Set([PURCHASE_PASSAGE_OPEN, PURCHASE_PASSAGE_CLOSE]);

export function findPurchaseVocabulary(text) {
  const match = VOCABULARY_PATTERN.exec(text.replace(/\s+/g, ' ').replace(EXCEPTION_PATTERN, ' '));
  return match ? match[0] : null;
}

function isBlank(line) {
  return line === undefined || line.trim() === '';
}

function opensBlock(line) {
  return line === undefined || isBlank(line) || /^(?:[-*]|\d+\.)\s|^\||^```/.test(line);
}

export function isPhoneListedArticle(category) {
  return category !== PURCHASE_HELP_CATEGORY;
}

export function resolvePurchasePassages(text, where) {
  const lines = text.split('\n');
  const web = [];
  const phone = [];
  let open = false;
  lines.forEach((line, index) => {
    if (MARKER_LINES.has(line)) {
      const opening = line === PURCHASE_PASSAGE_OPEN;
      if (opening === open) {
        throw new BuildError(
          `${where}: ${line} ${opening ? 'opens a purchase passage inside another' : 'closes a purchase passage that was never opened'}`,
        );
      }
      if (index > 0 && !isBlank(lines[index - 1])) {
        throw new BuildError(`${where}: ${line} needs a blank line above it`);
      }
      if (!opensBlock(lines[index + 1])) {
        throw new BuildError(
          `${where}: ${line} must be followed by a blank line, a list item, a table or a code fence`,
        );
      }
      if (isBlank(web.at(-1))) web.pop();
      if (opening && isBlank(phone.at(-1))) phone.pop();
      open = opening;
      return;
    }
    if (line.includes('{{#') || line.includes('{{/')) {
      throw new BuildError(
        `${where}: a purchase passage marker must stand alone on its own line, as ${PURCHASE_PASSAGE_OPEN} or ${PURCHASE_PASSAGE_CLOSE}`,
      );
    }
    web.push(line);
    if (!open) phone.push(line);
  });
  if (open) throw new BuildError(`${where}: ${PURCHASE_PASSAGE_OPEN} is never closed`);
  const tidy = (kept) =>
    kept
      .join('\n')
      .trim()
      .replace(/\n{3,}/g, '\n\n');
  return { web: tidy(web), phone: tidy(phone) };
}

export function assertNoPurchaseVocabulary(text, where) {
  const found = findPurchaseVocabulary(text);
  if (found !== null) {
    throw new BuildError(
      `${where}: "${found}" is purchase vocabulary in an article the phone lists. Wrap the passage in ${PURCHASE_PASSAGE_OPEN} and ${PURCHASE_PASSAGE_CLOSE} lines, or reword it.`,
    );
  }
}
