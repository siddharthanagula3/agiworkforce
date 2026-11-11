import { describe, expect, it } from 'vitest';
import type { ProductComparisonCardBody } from '@agiworkforce/types';
import { executeProductComparisonTool } from './product-comparison-tool-service';

const NOW = new Date('2026-11-09T12:00:00.000Z');

function longUrl(index: number): string {
  const prefix = `https://shop.example.com/p${index}/`;
  return `${prefix}${'a'.repeat(800 - prefix.length)}`;
}

function run(args: Record<string, unknown>) {
  return executeProductComparisonTool(args, {
    toolCallId: 'call-1',
    isRetrievedSource: () => true,
    now: () => NOW,
  });
}

function fourProducts(priceSourceIndex: number) {
  const sources = [1, 2, 3, 4].map((index) => ({ url: longUrl(index), title: `S${index}` }));
  return ['A', 'B', 'C', 'D'].map((name, row) => ({
    name,
    specs: [],
    sources,
    price: (row + 1) * 10,
    currency: 'USD',
    priceSourceUrl: longUrl(priceSourceIndex),
  }));
}

function cardBody(outcome: ReturnType<typeof run>): ProductComparisonCardBody {
  if (!outcome.ok) throw new Error(outcome.content);
  if (!outcome.card.recognized) throw new Error('card not recognized');
  return outcome.card.body as ProductComparisonCardBody;
}

describe('executeProductComparisonTool fitting', () => {
  it('keeps every price and its source when sources are trimmed to fit the card', () => {
    const outcome = run({ title: 'Four products', specLabels: [], products: fourProducts(4) });

    const body = cardBody(outcome);
    expect(body.products.map((product) => product.price?.amount)).toEqual([10, 20, 30, 40]);
    for (const product of body.products) {
      expect(product.sources.map((source) => source.url)).toContain(product.price?.sourceUrl);
      expect(product.sources.length).toBeLessThan(4);
    }
  });

  it('tells the model only about prices that the emitted card shows', () => {
    const outcome = run({ title: 'Four products', specLabels: [], products: fourProducts(4) });

    const body = cardBody(outcome);
    if (!outcome.ok) throw new Error(outcome.content);
    for (const product of body.products) {
      expect(outcome.content).toContain(`${product.name}: ${product.price?.amount} USD`);
    }
    expect(outcome.content).not.toContain('no price found');
    expect(outcome.content).toContain('shortened; prices are kept');
  });

  it('does not mention shortening when the first budget fits', () => {
    const outcome = run({
      title: 'Two products',
      specLabels: [],
      products: [
        {
          name: 'A',
          specs: [],
          sources: [{ url: 'https://shop.example.com/a', title: 'A' }],
          price: 10,
          currency: 'USD',
          priceSourceUrl: 'https://shop.example.com/a',
        },
        {
          name: 'B',
          specs: [],
          sources: [{ url: 'https://shop.example.com/b', title: 'B' }],
          price: 20,
          currency: 'USD',
          priceSourceUrl: 'https://shop.example.com/b',
        },
      ],
    });

    if (!outcome.ok) throw new Error(outcome.content);
    expect(outcome.content).not.toContain('shortened');
    expect(outcome.content).toContain('A: 10 USD');
  });

  it('keeps a price whose source is listed first', () => {
    const outcome = run({ title: 'Four products', specLabels: [], products: fourProducts(1) });

    const body = cardBody(outcome);
    expect(body.products.map((product) => product.price?.amount)).toEqual([10, 20, 30, 40]);
  });
});
