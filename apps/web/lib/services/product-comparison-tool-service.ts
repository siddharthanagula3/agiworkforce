import 'server-only';

import { z } from 'zod';
import { parseInteractiveCardDelta } from '@agiworkforce/cloud-contracts';
import {
  INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH,
  INTERACTIVE_CARD_SCHEMA_VERSION,
  PRODUCT_COMPARISON_BEST_FOR_MAX_LENGTH,
  PRODUCT_COMPARISON_MAX_PRODUCTS,
  PRODUCT_COMPARISON_MAX_SOURCES,
  PRODUCT_COMPARISON_MAX_SPECS,
  PRODUCT_COMPARISON_MERCHANT_MAX_LENGTH,
  PRODUCT_COMPARISON_MIN_PRODUCTS,
  PRODUCT_COMPARISON_NAME_MAX_LENGTH,
  PRODUCT_COMPARISON_SPEC_LABEL_MAX_LENGTH,
  PRODUCT_COMPARISON_SPEC_VALUE_MAX_LENGTH,
  PRODUCT_COMPARISON_TITLE_MAX_LENGTH,
  PRODUCT_COMPARISON_TOOL_NAME,
  type InteractiveCard,
  type InteractiveCardSource,
  type ProductComparisonCardBody,
  type ProductComparisonProduct,
} from '@agiworkforce/types';

export const PRODUCT_COMPARISON_CARD_KIND = 'product-comparison.v1';

const SOURCE_TITLE_MAX_LENGTH = 120;
const URL_MAX_LENGTH = 2_048;
const CURRENCY_CODE_RE = /^[A-Z]{3}$/;
const FITTING_BUDGETS = [
  { sources: PRODUCT_COMPARISON_MAX_SOURCES, specValue: PRODUCT_COMPARISON_SPEC_VALUE_MAX_LENGTH },
  { sources: 2, specValue: 80 },
  { sources: 1, specValue: 40 },
] as const;

const PURCHASE_RE =
  /\b(?:buy|buying|purchase|purchasing|shopping|shop for|prices?|priced|pricing|cheap(?:er|est)?|budget|deals?|worth (?:buying|getting|it)|(?:under|below|less than) \$?\d)/i;
const CHOICE_RE =
  /\b(?:compare|comparison|vs\.?|versus|which|best|top \d+|recommend(?:ation)?s?|alternatives?|or)\b/i;

export function isProductComparisonTool(name: string): boolean {
  return name === PRODUCT_COMPARISON_TOOL_NAME;
}

export function asksForProductComparison(message: string): boolean {
  return PURCHASE_RE.test(message) && CHOICE_RE.test(message);
}

function clipped(max: number) {
  return z
    .string()
    .trim()
    .transform((value) => value.slice(0, max));
}

const ProductComparisonInputSchema = z.object({
  title: clipped(PRODUCT_COMPARISON_TITLE_MAX_LENGTH).pipe(z.string().min(1)),
  specLabels: z
    .array(clipped(PRODUCT_COMPARISON_SPEC_LABEL_MAX_LENGTH).pipe(z.string().min(1)))
    .max(PRODUCT_COMPARISON_MAX_SPECS)
    .default([]),
  products: z
    .array(
      z.object({
        name: clipped(PRODUCT_COMPARISON_NAME_MAX_LENGTH).pipe(z.string().min(1)),
        bestFor: clipped(PRODUCT_COMPARISON_BEST_FOR_MAX_LENGTH).optional(),
        price: z.number().finite().nonnegative().optional(),
        currency: z.string().trim().toUpperCase().optional(),
        priceSourceUrl: z.string().trim().optional(),
        merchant: clipped(PRODUCT_COMPARISON_MERCHANT_MAX_LENGTH).optional(),
        buyUrl: z.string().trim().optional(),
        specs: z.array(z.string()).default([]),
        sources: z
          .array(z.object({ url: z.string().trim(), title: z.string().trim().default('') }))
          .default([]),
      }),
    )
    .min(PRODUCT_COMPARISON_MIN_PRODUCTS)
    .max(PRODUCT_COMPARISON_MAX_PRODUCTS),
});

type ProductComparisonInput = z.infer<typeof ProductComparisonInputSchema>;
type ProductInput = ProductComparisonInput['products'][number];

export function productComparisonToolDefinition() {
  return {
    type: 'function' as const,
    function: {
      name: PRODUCT_COMPARISON_TOOL_NAME,
      description:
        'Show the products the user is choosing between as a comparison card: each product with its price, the store selling it, a buy link and its key specs side by side. Use it after searching the web, when the user is deciding what to buy between two to four specific products. Every price source, buy link and source must be a URL that a web search or page fetch returned in this turn; any other URL is left out of the card. Give every product the same spec labels in the same order, and leave a value empty when it is unknown.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            maxLength: PRODUCT_COMPARISON_TITLE_MAX_LENGTH,
            description: 'A short title, such as Noise-cancelling headphones under $400.',
          },
          specLabels: {
            type: 'array',
            maxItems: PRODUCT_COMPARISON_MAX_SPECS,
            items: { type: 'string', maxLength: PRODUCT_COMPARISON_SPEC_LABEL_MAX_LENGTH },
            description: 'The specs to compare, in order, such as Battery life or Weight.',
          },
          products: {
            type: 'array',
            minItems: PRODUCT_COMPARISON_MIN_PRODUCTS,
            maxItems: PRODUCT_COMPARISON_MAX_PRODUCTS,
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  maxLength: PRODUCT_COMPARISON_NAME_MAX_LENGTH,
                  description: 'The product name with its brand and model.',
                },
                bestFor: {
                  type: 'string',
                  maxLength: PRODUCT_COMPARISON_BEST_FOR_MAX_LENGTH,
                  description: 'Who or what it suits best, in a few words.',
                },
                price: {
                  type: 'number',
                  minimum: 0,
                  description: 'The current price as a number, such as 349.99.',
                },
                currency: {
                  type: 'string',
                  description: 'The ISO 4217 code of the price currency, such as USD.',
                },
                priceSourceUrl: {
                  type: 'string',
                  description: 'The URL of the page that showed this price.',
                },
                merchant: {
                  type: 'string',
                  maxLength: PRODUCT_COMPARISON_MERCHANT_MAX_LENGTH,
                  description: 'The store selling it at that price.',
                },
                buyUrl: {
                  type: 'string',
                  description: "The product's page at that store.",
                },
                specs: {
                  type: 'array',
                  items: { type: 'string', maxLength: PRODUCT_COMPARISON_SPEC_VALUE_MAX_LENGTH },
                  description: 'One value per spec label, in the same order; empty when unknown.',
                },
                sources: {
                  type: 'array',
                  maxItems: PRODUCT_COMPARISON_MAX_SOURCES,
                  items: {
                    type: 'object',
                    properties: {
                      url: { type: 'string' },
                      title: { type: 'string', maxLength: SOURCE_TITLE_MAX_LENGTH },
                    },
                    required: ['url', 'title'],
                    additionalProperties: false,
                  },
                  description: 'Pages from this turn that back the price and specs.',
                },
              },
              required: ['name', 'specs', 'sources'],
              additionalProperties: false,
            },
          },
        },
        required: ['title', 'specLabels', 'products'],
        additionalProperties: false,
      },
    },
  };
}

export type ProductComparisonToolOutcome =
  { ok: true; content: string; card: InteractiveCard } | { ok: false; content: string };

export interface ProductComparisonExecutionContext {
  toolCallId: string;
  isRetrievedSource: (url: string) => boolean;
  now?: () => Date;
}

const INVALID_INPUT_MESSAGE =
  `${PRODUCT_COMPARISON_TOOL_NAME} needs a title, the spec labels and between ` +
  `${PRODUCT_COMPARISON_MIN_PRODUCTS} and ${PRODUCT_COMPARISON_MAX_PRODUCTS} products, each ` +
  'with a name, one spec value per label and its sources.';

const UNGROUNDED_MESSAGE =
  `${PRODUCT_COMPARISON_TOOL_NAME} needs at least ${PRODUCT_COMPARISON_MIN_PRODUCTS} products ` +
  "backed by pages a web search or page fetch returned in this turn. Search for each product's " +
  'price first, then call it again with the URLs those results gave. Do not invent URLs.';

const TOO_LARGE_MESSAGE =
  'The comparison did not fit in one card. Compare fewer products or fewer specs.';

interface Omission {
  product: string;
  detail: 'price' | 'buy link' | 'source';
}

function httpsUrl(value: string | undefined): string | undefined {
  if (!value || value.length > URL_MAX_LENGTH) return undefined;
  try {
    return new URL(value).protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

function hostnameOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

function groundedProduct(
  input: ProductInput,
  index: number,
  labelCount: number,
  context: ProductComparisonExecutionContext,
  omissions: Omission[],
): ProductComparisonProduct | null {
  const grounded = (value: string | undefined, detail: Omission['detail']): string | undefined => {
    if (!value) return undefined;
    const url = httpsUrl(value);
    if (url && context.isRetrievedSource(url)) return url;
    omissions.push({ product: input.name, detail });
    return undefined;
  };

  const sources: InteractiveCardSource[] = [];
  for (const source of input.sources) {
    const url = grounded(source.url, 'source');
    if (!url || sources.some((known) => known.url === url)) continue;
    sources.push({
      url,
      title: (source.title || hostnameOf(url)).slice(0, SOURCE_TITLE_MAX_LENGTH),
    });
  }

  const priceSource =
    input.price !== undefined && input.currency && CURRENCY_CODE_RE.test(input.currency)
      ? grounded(input.priceSourceUrl, 'price')
      : undefined;
  if (priceSource && !sources.some((source) => source.url === priceSource)) {
    sources.unshift({ url: priceSource, title: hostnameOf(priceSource) });
  }
  if (sources.length === 0) return null;

  const buyUrl = grounded(input.buyUrl, 'buy link');
  const merchant = input.merchant || (buyUrl ? hostnameOf(buyUrl) : undefined);
  return {
    id: `product-${index + 1}`,
    name: input.name,
    ...(input.bestFor ? { bestFor: input.bestFor } : {}),
    ...(priceSource && input.price !== undefined && input.currency
      ? { price: { amount: input.price, currency: input.currency, sourceUrl: priceSource } }
      : {}),
    ...(merchant ? { merchant: merchant.slice(0, PRODUCT_COMPARISON_MERCHANT_MAX_LENGTH) } : {}),
    ...(buyUrl ? { buyUrl } : {}),
    specs: Array.from({ length: labelCount }, (_, row) =>
      (input.specs[row] ?? '').trim().slice(0, PRODUCT_COMPARISON_SPEC_VALUE_MAX_LENGTH),
    ),
    sources: sources.slice(0, PRODUCT_COMPARISON_MAX_SOURCES),
  };
}

function priceLabel(product: ProductComparisonProduct): string {
  if (!product.price) return 'no price found';
  const at = product.merchant ? ` at ${product.merchant}` : '';
  return `${product.price.amount} ${product.price.currency}${at}`;
}

function fallbackText(body: ProductComparisonCardBody): string {
  return body.products
    .map((product) =>
      [
        `${product.name}: ${priceLabel(product)}`,
        ...(product.buyUrl ? [product.buyUrl] : []),
        ...body.specLabels.map((label, row) => `${label}: ${product.specs[row] || 'not listed'}`),
      ].join('\n'),
    )
    .join('\n\n');
}

function omissionLines(omissions: readonly Omission[]): string[] {
  if (omissions.length === 0) return [];
  const described = omissions.map((omission) => `the ${omission.detail} for ${omission.product}`);
  return [
    `Left out because no search or fetch in this turn returned that URL: ${[...new Set(described)].join('; ')}.`,
  ];
}

function modelSummary(
  body: ProductComparisonCardBody,
  omissions: readonly Omission[],
  droppedProducts: readonly string[],
): string {
  return [
    `Rendered a comparison card titled "${body.title}" above your reply, with each product's price, store, buy link and specs side by side. The user can already see it.`,
    ...body.products.map(
      (product, index) =>
        `${index + 1}. ${product.name}: ${priceLabel(product)}${product.buyUrl ? ', buy link shown' : ', no buy link'}`,
    ),
    ...omissionLines(omissions),
    ...(droppedProducts.length > 0
      ? [
          `Not shown, because none of their sources came from this turn: ${droppedProducts.join(', ')}.`,
        ]
      : []),
    `Prices are as of ${body.checkedAt} and can change; say so if you mention them.`,
    'Follow it with your recommendation and the trade-offs that decide it. Do not repeat the specs table, the prices or the links.',
  ].join('\n');
}

function buildCard(
  body: ProductComparisonCardBody,
  context: ProductComparisonExecutionContext,
): InteractiveCard | null {
  for (const budget of FITTING_BUDGETS) {
    const fitted: ProductComparisonCardBody = {
      ...body,
      products: body.products.map(({ price, ...product }) => {
        const sources = product.sources.slice(0, budget.sources);
        const kept =
          price && sources.some((source) => source.url === price.sourceUrl) ? price : undefined;
        return {
          ...product,
          ...(kept ? { price: kept } : {}),
          specs: product.specs.map((value) => value.slice(0, budget.specValue)),
          sources,
        };
      }),
    };
    const rawCard = {
      schemaVersion: INTERACTIVE_CARD_SCHEMA_VERSION,
      cardId: context.toolCallId,
      kind: PRODUCT_COMPARISON_CARD_KIND,
      createdAt: body.checkedAt,
      fallback: { headline: fitted.title, text: fallbackText(fitted) },
      producedBy: { toolCallId: context.toolCallId, toolName: PRODUCT_COMPARISON_TOOL_NAME },
      body: fitted,
    };
    if (JSON.stringify(rawCard).length > INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH) continue;
    const card = parseInteractiveCardDelta({ card: rawCard });
    if (card?.recognized && card.kind === PRODUCT_COMPARISON_CARD_KIND) return card;
  }
  return null;
}

export function executeProductComparisonTool(
  args: Record<string, unknown>,
  context: ProductComparisonExecutionContext,
): ProductComparisonToolOutcome {
  const parsed = ProductComparisonInputSchema.safeParse(args);
  if (!parsed.success) return { ok: false, content: INVALID_INPUT_MESSAGE };
  const input = parsed.data;

  const omissions: Omission[] = [];
  const droppedProducts: string[] = [];
  const products: ProductComparisonProduct[] = [];
  for (const product of input.products) {
    const grounded = groundedProduct(
      product,
      products.length,
      input.specLabels.length,
      context,
      omissions,
    );
    if (grounded) products.push(grounded);
    else droppedProducts.push(product.name);
  }
  if (products.length < PRODUCT_COMPARISON_MIN_PRODUCTS) {
    return { ok: false, content: UNGROUNDED_MESSAGE };
  }

  const body: ProductComparisonCardBody = {
    title: input.title,
    specLabels: input.specLabels,
    products,
    checkedAt: (context.now ?? (() => new Date()))().toISOString(),
  };
  const card = buildCard(body, context);
  if (!card) return { ok: false, content: TOO_LARGE_MESSAGE };
  return {
    ok: true,
    content: modelSummary(body, omissions, droppedProducts),
    card,
  };
}
