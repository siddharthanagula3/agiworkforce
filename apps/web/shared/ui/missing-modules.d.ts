// Type declarations for optional UI dependencies that are not installed.
// These stubs allow the code to compile without the actual packages.

declare module '@radix-ui/react-aspect-ratio' {
  import * as React from 'react';
  export const Root: React.FC<React.PropsWithChildren<{ ratio?: number; className?: string }>>;
}

declare module '@radix-ui/react-menubar' {
  import * as React from 'react';
  type BaseProps = React.HTMLAttributes<HTMLDivElement> & { className?: string; asChild?: boolean };
  export const Root: React.ForwardRefExoticComponent<
    BaseProps & React.RefAttributes<HTMLDivElement>
  >;
  export const Menu: React.FC<React.PropsWithChildren>;
  export const Group: React.FC<React.PropsWithChildren>;
  export const Portal: React.FC<React.PropsWithChildren>;
  export const Sub: React.FC<React.PropsWithChildren>;
  export const RadioGroup: React.FC<
    React.PropsWithChildren<{ value?: string; onValueChange?: (v: string) => void }>
  >;
  export const Trigger: React.ForwardRefExoticComponent<
    BaseProps & React.RefAttributes<HTMLButtonElement>
  >;
  export const SubTrigger: React.ForwardRefExoticComponent<
    BaseProps & React.RefAttributes<HTMLDivElement>
  >;
  export const SubContent: React.ForwardRefExoticComponent<
    BaseProps & React.RefAttributes<HTMLDivElement>
  >;
  export const Content: React.ForwardRefExoticComponent<
    BaseProps & {
      align?: string;
      alignOffset?: number;
      sideOffset?: number;
    } & React.RefAttributes<HTMLDivElement>
  >;
  export const Item: React.ForwardRefExoticComponent<
    BaseProps & React.RefAttributes<HTMLDivElement>
  >;
  export const CheckboxItem: React.ForwardRefExoticComponent<
    BaseProps & { checked?: boolean } & React.RefAttributes<HTMLDivElement>
  >;
  export const RadioItem: React.ForwardRefExoticComponent<
    BaseProps & { value: string } & React.RefAttributes<HTMLDivElement>
  >;
  export const ItemIndicator: React.FC<React.PropsWithChildren>;
  export const Label: React.ForwardRefExoticComponent<
    BaseProps & React.RefAttributes<HTMLDivElement>
  >;
  export const Separator: React.ForwardRefExoticComponent<
    BaseProps & React.RefAttributes<HTMLDivElement>
  >;
}

declare module '@radix-ui/react-navigation-menu' {
  import * as React from 'react';
  type BaseProps = React.HTMLAttributes<HTMLElement> & { className?: string; asChild?: boolean };
  export const Root: React.ForwardRefExoticComponent<BaseProps & React.RefAttributes<HTMLElement>>;
  export const List: React.ForwardRefExoticComponent<
    BaseProps & React.RefAttributes<HTMLUListElement>
  >;
  export const Item: React.FC<React.PropsWithChildren<BaseProps>>;
  export const Trigger: React.ForwardRefExoticComponent<
    BaseProps & React.RefAttributes<HTMLButtonElement>
  >;
  export const Content: React.ForwardRefExoticComponent<
    BaseProps & React.RefAttributes<HTMLDivElement>
  >;
  export const Link: React.ForwardRefExoticComponent<
    BaseProps & { href?: string } & React.RefAttributes<HTMLAnchorElement>
  >;
  export const Viewport: React.ForwardRefExoticComponent<
    BaseProps & React.RefAttributes<HTMLDivElement>
  >;
  export const Indicator: React.ForwardRefExoticComponent<
    BaseProps & React.RefAttributes<HTMLDivElement>
  >;
}

declare module '@radix-ui/react-radio-group' {
  import * as React from 'react';
  type BaseProps = React.HTMLAttributes<HTMLDivElement> & { className?: string; asChild?: boolean };
  export const Root: React.ForwardRefExoticComponent<
    BaseProps & {
      value?: string;
      onValueChange?: (v: string) => void;
      defaultValue?: string;
      disabled?: boolean;
    } & React.RefAttributes<HTMLDivElement>
  >;
  export const Item: React.ForwardRefExoticComponent<
    BaseProps & { value: string; disabled?: boolean } & React.RefAttributes<HTMLButtonElement>
  >;
  export const Indicator: React.ForwardRefExoticComponent<
    BaseProps & React.RefAttributes<HTMLSpanElement>
  >;
}

declare module '@radix-ui/react-toggle' {
  import * as React from 'react';
  type BaseProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    className?: string;
    asChild?: boolean;
    pressed?: boolean;
    defaultPressed?: boolean;
    onPressedChange?: (pressed: boolean) => void;
  };
  export const Root: React.ForwardRefExoticComponent<
    BaseProps & React.RefAttributes<HTMLButtonElement>
  >;
}

declare module '@radix-ui/react-toggle-group' {
  import * as React from 'react';
  type BaseProps = React.HTMLAttributes<HTMLDivElement> & { className?: string; asChild?: boolean };
  export const Root: React.ForwardRefExoticComponent<
    BaseProps & {
      type?: 'single' | 'multiple';
      value?: string | string[];
      onValueChange?: (value: string | string[]) => void;
    } & React.RefAttributes<HTMLDivElement>
  >;
  export const Item: React.ForwardRefExoticComponent<
    BaseProps & { value: string; disabled?: boolean } & React.RefAttributes<HTMLButtonElement>
  >;
}

declare module 'vaul' {
  import * as React from 'react';
  type BaseProps = React.HTMLAttributes<HTMLDivElement> & { className?: string };
  export namespace Drawer {
    const Root: React.FC<
      React.PropsWithChildren<{
        shouldScaleBackground?: boolean;
        open?: boolean;
        onOpenChange?: (open: boolean) => void;
      }>
    >;
    const Trigger: React.ForwardRefExoticComponent<
      BaseProps & React.RefAttributes<HTMLButtonElement>
    >;
    const Portal: React.FC<React.PropsWithChildren>;
    const Close: React.ForwardRefExoticComponent<
      BaseProps & React.RefAttributes<HTMLButtonElement>
    >;
    const Overlay: React.ForwardRefExoticComponent<BaseProps & React.RefAttributes<HTMLDivElement>>;
    const Content: React.ForwardRefExoticComponent<BaseProps & React.RefAttributes<HTMLDivElement>>;
    const Title: React.ForwardRefExoticComponent<
      BaseProps & React.RefAttributes<HTMLHeadingElement>
    >;
    const Description: React.ForwardRefExoticComponent<
      BaseProps & React.RefAttributes<HTMLParagraphElement>
    >;
  }
}

declare module 'embla-carousel-react' {
  type EmblaOptionsType = {
    axis?: 'x' | 'y';
    [key: string]: unknown;
  };
  type EmblaPluginType = unknown;
  type EmblaCarouselType = {
    canScrollPrev: () => boolean;
    canScrollNext: () => boolean;
    scrollPrev: () => void;
    scrollNext: () => void;
    on: (event: string, callback: (api: EmblaCarouselType) => void) => void;
    off: (event: string, callback: (api: EmblaCarouselType) => void) => void;
  };
  export type UseEmblaCarouselType = [
    (node: HTMLDivElement | null) => void,
    EmblaCarouselType | undefined,
  ];
  export default function useEmblaCarousel(
    options?: EmblaOptionsType,
    plugins?: EmblaPluginType[],
  ): UseEmblaCarouselType;
}

declare module 'input-otp' {
  import * as React from 'react';
  export const OTPInput: React.ForwardRefExoticComponent<
    {
      maxLength?: number;
      containerClassName?: string;
      className?: string;
      render?: (props: {
        slots: Array<{ char: string | undefined; hasFakeCaret: boolean; isActive: boolean }>;
      }) => React.ReactNode;
      [key: string]: unknown;
    } & React.RefAttributes<HTMLInputElement>
  >;
  export const OTPInputContext: React.Context<{
    slots: Array<{ char: string | undefined; hasFakeCaret: boolean; isActive: boolean }>;
  }>;
}

declare module 'dompurify' {
  interface Config {
    ALLOWED_TAGS?: string[];
    ALLOWED_ATTR?: string[];
    ALLOW_DATA_ATTR?: boolean;
    ADD_TAGS?: string[];
    ADD_ATTR?: string[];
    FORBID_TAGS?: string[];
    FORBID_ATTR?: string[];
    ALLOWED_URI_REGEXP?: RegExp;
    KEEP_CONTENT?: boolean;
    RETURN_DOM?: boolean;
    RETURN_DOM_FRAGMENT?: boolean;
    SANITIZE_NAMED_PROPS?: boolean;
    SANITIZE_DOM?: boolean;
    WHOLE_DOCUMENT?: boolean;
    [key: string]: unknown;
  }
  export { Config };
  const DOMPurify: {
    sanitize(html: string, config?: Config): string;
    addHook(hook: string, cb: (...args: unknown[]) => void): void;
    removeHook(hook: string): void;
    removeAllHooks(): void;
    isSupported: boolean;
  };
  export default DOMPurify;
}

declare module '@stripe/stripe-js' {
  export interface StripeElement {
    mount(domElement: string | HTMLElement): void;
    unmount(): void;
    destroy(): void;
    on(event: string, handler: (event: unknown) => void): void;
    off(event: string, handler?: (event: unknown) => void): void;
    update(options?: Record<string, unknown>): void;
  }
  export interface StripePaymentResult {
    error?: { type: string; message: string; code?: string };
    paymentIntent?: { id: string; status: string; client_secret: string };
    setupIntent?: { id: string; status: string; client_secret: string };
  }
  export interface Stripe {
    elements(options?: StripeElementsOptions): StripeElements;
    confirmPayment(options: Record<string, unknown>): Promise<StripePaymentResult>;
    confirmSetup(options: Record<string, unknown>): Promise<StripePaymentResult>;
    createPaymentMethod(
      options: Record<string, unknown>,
    ): Promise<{ error?: { message: string }; paymentMethod?: { id: string; type: string } }>;
    redirectToCheckout(options: Record<string, unknown>): Promise<{ error?: { message: string } }>;
  }
  export interface StripeElements {
    create(type: string, options?: Record<string, unknown>): StripeElement;
    getElement(type: string): StripeElement | null;
    submit(): Promise<{ error?: { message: string } }>;
  }
  export interface StripeElementsOptions {
    clientSecret?: string;
    appearance?: Record<string, unknown>;
    [key: string]: unknown;
  }
  export function loadStripe(
    publishableKey: string,
    options?: Record<string, unknown>,
  ): Promise<Stripe | null>;
}

declare module '@stripe/react-stripe-js' {
  import * as React from 'react';
  import type { Stripe, StripeElements, StripeElementsOptions } from '@stripe/stripe-js';
  export function useStripe(): Stripe | null;
  export function useElements(): StripeElements | null;
  export const Elements: React.FC<
    React.PropsWithChildren<{
      stripe: Stripe | Promise<Stripe | null> | null;
      options?: StripeElementsOptions;
    }>
  >;
  export const PaymentElement: React.FC<Record<string, unknown>>;
  export const CardElement: React.FC<Record<string, unknown>>;
}

declare module 'next-themes' {
  export function useTheme(): {
    theme: string | undefined;
    setTheme: (theme: string) => void;
    resolvedTheme: string | undefined;
    themes: string[];
    systemTheme: string | undefined;
  };
  export const ThemeProvider: React.FC<
    React.PropsWithChildren<{
      attribute?: string;
      defaultTheme?: string;
      enableSystem?: boolean;
      disableTransitionOnChange?: boolean;
      storageKey?: string;
      themes?: string[];
      forcedTheme?: string;
    }>
  >;
}
