import { describe, expect, it } from 'vitest';

import {
  findPurchaseVocabulary,
  PURCHASE_HELP_CATEGORY,
} from '../../../scripts/lib/support-purchase-passages.mjs';
import * as helpArticles from '../help-articles';
import { getSupportCorpus } from '../agent/corpus';
import { corpusArtifactSchema } from '../agent/corpus/schema';
import rawCorpus from '../agent/corpus.generated.json';
import { getHelpArticle, helpArticlePath, purchaseHelpPaths } from '../help-articles';

function loaded(view: 'web' | 'phone') {
  const corpus = getSupportCorpus(view);
  if (!corpus.available) throw new Error(`the ${view} corpus did not load: ${corpus.reason}`);
  return corpus.chunks.filter((chunk) => chunk.origin === 'markdown');
}

const artifact = corpusArtifactSchema.parse(rawCorpus);

describe('help as a phone request sees it', () => {
  it('lists no article about purchasing, while the web lists them', () => {
    const webPurchase = loaded('web').filter((chunk) => chunk.category === PURCHASE_HELP_CATEGORY);
    expect(webPurchase.length).toBeGreaterThan(0);
    expect(loaded('phone').filter((chunk) => chunk.category === PURCHASE_HELP_CATEGORY)).toEqual(
      [],
    );
  });

  it('carries no purchase vocabulary in any title, heading, description or passage', () => {
    const phone = loaded('phone');
    expect(phone.length).toBeGreaterThan(100);
    const leaks = phone.flatMap((chunk) =>
      [chunk.docTitle, chunk.headingPath, chunk.description ?? '', chunk.text]
        .map((text) => findPurchaseVocabulary(text))
        .filter((found) => found !== null)
        .map((found) => `${chunk.id}: ${found}`),
    );
    expect(leaks).toEqual([]);
  });

  it('keeps a marked passage on the web and leaves it out for the phone', () => {
    const marked = artifact.documents.flatMap((document) =>
      document.chunks
        .filter((chunk) => chunk.phoneText !== undefined)
        .map((chunk) => ({ docId: document.id, chunk })),
    );
    expect(marked.length).toBeGreaterThan(10);
    for (const { docId, chunk } of marked) {
      const web = getHelpArticle(docId)?.sections.find((section) => section.id === chunk.id);
      const phone = getHelpArticle(docId, 'phone')?.sections.find(
        (section) => section.id === chunk.id,
      );
      expect(findPurchaseVocabulary(web?.text ?? ''), chunk.id).not.toBeNull();
      expect(web?.text.includes('{{'), chunk.id).toBe(false);
      if (chunk.phoneText === null) {
        expect(phone, chunk.id).toBeUndefined();
      } else {
        expect(phone?.text.length, chunk.id).toBeLessThan(web?.text.length ?? 0);
        expect(findPurchaseVocabulary(phone?.text ?? ''), chunk.id).toBeNull();
      }
    }
  });

  it('keeps the words of the sign-up article on the web and drops only its upgrade sentence for the phone', () => {
    const web = getHelpArticle('signing-up')
      ?.sections.map((section) => section.text)
      .join('\n');
    const phone = getHelpArticle('signing-up', 'phone')
      ?.sections.map((section) => section.text)
      .join('\n');

    expect(web).toContain('the upgrade waitlist');
    expect(web).toContain('it has no waitlist and no invite code to redeem');
    expect(phone).not.toContain('upgrade');
    expect(phone).toContain('it has no waitlist and no invite code to redeem');
  });

  it('hides every web article the phone does not list, and the purchase collection', () => {
    const phoneDocs = new Set(loaded('phone').map((chunk) => chunk.docId));
    const hidden = new Set(purchaseHelpPaths());
    for (const chunk of loaded('web')) {
      expect(hidden.has(helpArticlePath(chunk.docId)), chunk.docId).toBe(
        !phoneDocs.has(chunk.docId),
      );
    }
    expect(hidden.has(`/help/collections/${PURCHASE_HELP_CATEGORY}`)).toBe(true);
    for (const document of artifact.documents) {
      expect(document.onPhone, document.id).toBe(phoneDocs.has(document.id));
    }
  });

  it.each([
    ['install-the-cli', 'Managed cloud access from the CLI requires one of these plans'],
    ['workspace-administration', 'Creating one needs a'],
    ['delete-your-account', 'cancelling the deletion turns its renewal back on'],
    ['glossary', 'Keep going after a usage limit'],
  ])('keeps the plan requirement in %s on the web and leaves it out for the phone', (id, text) => {
    const words = (view: 'web' | 'phone') =>
      (getHelpArticle(id, view)?.sections ?? [])
        .map((section) => section.text)
        .join(' ')
        .replace(/\s+/g, ' ');
    expect(words('web')).toContain(text);
    expect(words('phone').length).toBeGreaterThan(0);
    expect(words('phone')).not.toContain(text);
  });

  it('drops the CLI managed cloud section from the phone, heading included', () => {
    const headings = (view: 'web' | 'phone') =>
      getHelpArticle('install-the-cli', view)?.sections.map((section) => section.heading);
    expect(headings('web')).toContain('Managed cloud from the CLI');
    expect(headings('phone')).not.toContain('Managed cloud from the CLI');
  });

  it('names the same purchase category as the corpus builder', () => {
    expect(helpArticles.PURCHASE_HELP_CATEGORY).toBe(PURCHASE_HELP_CATEGORY);
  });

  it('does not answer a phone request for a purchase article', () => {
    const purchase = artifact.documents.find(
      (document) => document.category === PURCHASE_HELP_CATEGORY,
    );
    expect(purchase).toBeDefined();
    expect(getHelpArticle(purchase?.id ?? '')).not.toBeNull();
    expect(getHelpArticle(purchase?.id ?? '', 'phone')).toBeNull();
  });
});
