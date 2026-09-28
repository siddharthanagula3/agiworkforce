'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@agiworkforce/ui';
import type { UpgradePromotionSummary } from '../services/stripe-payments';
import { formatBillingMoney } from '../lib/billing-format';

function describePromotion(promotion: UpgradePromotionSummary): string {
  const amount =
    promotion.percentOff !== null
      ? `${promotion.percentOff}% off`
      : promotion.amountOffCents !== null && promotion.currency
        ? `${formatBillingMoney(promotion.amountOffCents, promotion.currency)} off`
        : 'A discount';
  if (promotion.duration === 'forever') return `${amount} every billing period`;
  if (promotion.duration === 'repeating' && promotion.durationInMonths) {
    return `${amount} for ${promotion.durationInMonths} ${promotion.durationInMonths === 1 ? 'month' : 'months'}`;
  }
  return `${amount} this payment`;
}

export interface UpgradePromotionCodeProps {
  inputId: string;
  promotion: UpgradePromotionSummary | null;
  pending: boolean;
  error: string | null;
  onApply: (code: string) => void;
  onRemove: () => void;
}

export function UpgradePromotionCode({
  inputId,
  promotion,
  pending,
  error,
  onApply,
  onRemove,
}: UpgradePromotionCodeProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = input.trim();
    if (!code || pending) return;
    onApply(code);
  }

  function remove() {
    setInput('');
    onRemove();
  }

  return (
    <section aria-label="Promotion code" className="flex flex-col gap-2 text-sm">
      {promotion ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            Promotion {promotion.code}: {describePromotion(promotion)}.
          </span>
          <button
            type="button"
            onClick={remove}
            className="font-medium underline underline-offset-2 pointer-coarse:min-h-11"
          >
            Remove
          </button>
        </p>
      ) : open ? (
        <form onSubmit={submit} className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor={inputId}>
            Promotion code
          </label>
          <input
            id={inputId}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="Promotion code"
            className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 pointer-coarse:h-11"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="pointer-coarse:h-11"
            disabled={!input.trim() || pending}
            isLoading={pending}
          >
            Apply
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="self-start font-medium underline underline-offset-2 pointer-coarse:min-h-11"
        >
          Add a promotion code
        </button>
      )}
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
