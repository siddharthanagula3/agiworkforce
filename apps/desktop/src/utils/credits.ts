/**
 * Credit formatting utilities
 *
 * Credits are stored in cents (1 cent = 1 credit).
 * Display credits as whole numbers instead of dollar amounts.
 */

/**
 * Format cents as credits (1 cent = 1 credit)
 * @param cents - Amount in cents
 * @returns Formatted credit string (e.g., "350 credits")
 */
export function formatCredits(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(cents)) {
    return '0 credits';
  }

  const credits = Math.round(cents);
  return `${credits.toLocaleString()} credit${credits === 1 ? '' : 's'}`;
}

/**
 * Format cents as a credit number only (without "credits" suffix)
 * @param cents - Amount in cents
 * @returns Formatted credit number (e.g., "350")
 */
export function formatCreditNumber(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(cents)) {
    return '0';
  }

  const credits = Math.round(cents);
  return credits.toLocaleString();
}

/**
 * Convert dollars to credits (for backward compatibility)
 * @param dollars - Amount in dollars
 * @returns Credits (1 dollar = 100 credits)
 */
export function dollarsToCredits(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Convert credits to dollars (for backward compatibility)
 * @param credits - Amount in credits
 * @returns Dollars
 */
export function creditsToDollars(credits: number): number {
  return credits / 100;
}
