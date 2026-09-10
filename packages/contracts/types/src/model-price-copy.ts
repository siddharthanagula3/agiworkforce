import { formatCreditsPerMillionTokens } from './credits';

export const MODEL_PRICE_NOTE = 'Credits reflect canonical value; token counts vary by model.';

const UNKNOWN_PRICE = 'N/A';

function perMillion(usdPerMillionTokens: number | undefined, kind: string): string {
  if (usdPerMillionTokens === undefined) return `${UNKNOWN_PRICE} / 1M ${kind}`;
  const credits = formatCreditsPerMillionTokens(usdPerMillionTokens).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
  return `${credits} credits / 1M ${kind}`;
}

/**
 * A model's official price, in the one unit a customer is ever quoted. The
 * catalogue records list rates in dollars per million tokens; nothing built
 * from them reaches a customer surface without passing through here.
 */
export function formatModelPriceInCredits(
  inputUsdPerMillionTokens?: number,
  outputUsdPerMillionTokens?: number,
  cachedUsdPerMillionTokens?: number,
): string {
  if (inputUsdPerMillionTokens === undefined && outputUsdPerMillionTokens === undefined) {
    return UNKNOWN_PRICE;
  }
  if (inputUsdPerMillionTokens === 0 && outputUsdPerMillionTokens === 0) {
    return 'Included';
  }
  return [
    perMillion(inputUsdPerMillionTokens, 'input'),
    perMillion(outputUsdPerMillionTokens, 'output'),
    ...(cachedUsdPerMillionTokens === undefined
      ? []
      : [perMillion(cachedUsdPerMillionTokens, 'cached')]),
  ].join(' · ');
}
