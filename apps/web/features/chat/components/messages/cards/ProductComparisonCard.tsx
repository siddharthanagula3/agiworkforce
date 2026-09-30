'use client';

import { ExternalLink, Scale } from '@agiworkforce/icons';
import type {
  InteractiveCardSource,
  ProductComparisonCardBody,
  ProductComparisonPrice,
} from '@agiworkforce/types';

const NEW_TAB_HINT = '(opens in a new tab)';
const PRICE_NOT_FOUND = 'Price not found';
const SPEC_NOT_LISTED = 'Not listed';

function formatPrice(price: ProductComparisonPrice): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: price.currency }).format(
      price.amount,
    );
  } catch {
    return `${price.amount} ${price.currency}`;
  }
}

function formatCheckedAt(checkedAt: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(checkedAt));
}

function hostnameOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

function SourceLinks({ sources }: { sources: InteractiveCardSource[] }) {
  return (
    <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[color:var(--chat-text-muted)]">
      {sources.map((source, index) => (
        <li key={source.url} className="min-w-0">
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1 rounded-control underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11"
          >
            <span className="tabular-nums">{index + 1}</span>
            <span className="truncate">{hostnameOf(source.url)}</span>
            <span className="sr-only">
              : {source.title} {NEW_TAB_HINT}
            </span>
          </a>
        </li>
      ))}
    </ol>
  );
}

export interface ProductComparisonCardProps {
  body: ProductComparisonCardBody;
}

export function ProductComparisonCard({ body }: ProductComparisonCardProps) {
  return (
    <section
      aria-label={body.title}
      data-testid="interactive-card-product-comparison"
      className="my-3 overflow-hidden rounded-2xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)]"
    >
      <div className="px-3 pb-2 pt-3">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-[color:var(--chat-text-primary)]">
          <Scale
            className="size-4 shrink-0 text-[color:var(--chat-accent-primary-text)]"
            aria-hidden="true"
          />
          <span className="truncate">{body.title}</span>
        </p>
        <p className="mt-0.5 text-xs text-[color:var(--chat-text-muted)]">
          Prices checked {formatCheckedAt(body.checkedAt)}
        </p>
      </div>

      <ul data-testid="product-comparison-products" className="grid gap-2 px-3 pb-3 sm:grid-cols-2">
        {body.products.map((product) => (
          <li
            key={product.id}
            data-testid="product-comparison-product"
            className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-[var(--chat-border)] p-3"
          >
            <p className="text-sm font-semibold text-[color:var(--chat-text-primary)]">
              {product.name}
            </p>
            {product.bestFor ? (
              <p className="text-xs text-[color:var(--chat-text-secondary)]">{product.bestFor}</p>
            ) : null}
            {product.price ? (
              <p className="text-base font-semibold tabular-nums text-[color:var(--chat-text-primary)]">
                {formatPrice(product.price)}
                {product.merchant ? (
                  <span className="ms-1.5 text-xs font-normal text-[color:var(--chat-text-secondary)]">
                    at {product.merchant}
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="text-xs text-[color:var(--chat-text-secondary)]">{PRICE_NOT_FOUND}</p>
            )}
            {product.buyUrl ? (
              <a
                href={product.buyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-8 w-fit items-center gap-1.5 rounded-lg bg-[var(--chat-accent-primary)] px-2.5 text-sm font-medium text-[color:var(--chat-accent-on-primary)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11"
              >
                {product.merchant ? `Buy at ${product.merchant}` : 'View product'}
                <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="sr-only"> {NEW_TAB_HINT}</span>
              </a>
            ) : null}
            <SourceLinks sources={product.sources} />
          </li>
        ))}
      </ul>

      {body.specLabels.length > 0 ? (
        <div
          role="region"
          aria-label={`Specs for ${body.title}`}
          tabIndex={0}
          className="overflow-x-auto border-t border-[var(--chat-border-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--chat-focus-ring)]"
        >
          <table data-testid="product-comparison-specs" className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-[var(--chat-border-subtle)]">
                <th
                  scope="col"
                  className="px-3 py-2 text-xs font-medium text-[color:var(--chat-text-secondary)]"
                >
                  Spec
                </th>
                {body.products.map((product) => (
                  <th
                    key={product.id}
                    scope="col"
                    className="min-w-28 px-3 py-2 text-xs font-medium text-[color:var(--chat-text-primary)]"
                  >
                    {product.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.specLabels.map((label, row) => (
                <tr
                  key={`${row}:${label}`}
                  className="border-b border-[var(--chat-border-subtle)] last:border-b-0"
                >
                  <th
                    scope="row"
                    className="px-3 py-2 text-xs font-medium text-[color:var(--chat-text-secondary)]"
                  >
                    {label}
                  </th>
                  {body.products.map((product) => {
                    const value = product.specs[row];
                    return (
                      <td
                        key={product.id}
                        className={
                          value
                            ? 'px-3 py-2 text-[color:var(--chat-text-primary)]'
                            : 'px-3 py-2 text-[color:var(--chat-text-secondary)]'
                        }
                      >
                        {value || SPEC_NOT_LISTED}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
