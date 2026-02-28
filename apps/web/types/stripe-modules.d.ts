/**
 * Type declarations for Stripe packages that are not installed as dependencies.
 * These provide minimal type stubs to satisfy TypeScript compilation.
 */

declare module '@stripe/stripe-js' {
  export interface Stripe {
    confirmPayment(options: {
      elements: StripeElements;
      confirmParams: { return_url: string };
      redirect?: string;
    }): Promise<{ error?: { message: string }; paymentIntent?: unknown }>;
    confirmSetup(options: {
      elements: StripeElements;
      confirmParams: { return_url: string };
      redirect?: string;
    }): Promise<{ error?: { message: string }; setupIntent?: unknown }>;
  }

  export interface StripeElements {
    create(type: string, options?: Record<string, unknown>): unknown;
    getElement(type: string): unknown;
  }

  export interface StripeElementsOptions {
    clientSecret?: string;
    appearance?: Record<string, unknown>;
  }

  export function loadStripe(
    publishableKey: string,
    options?: Record<string, unknown>,
  ): Promise<Stripe | null>;
}

declare module '@stripe/react-stripe-js' {
  export function useStripe(): import('@stripe/stripe-js').Stripe | null;
  export function useElements(): import('@stripe/stripe-js').StripeElements | null;
}
