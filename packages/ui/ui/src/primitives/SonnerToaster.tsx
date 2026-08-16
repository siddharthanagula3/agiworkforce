'use client';

import { Toaster as Sonner, toast as sonnerToast } from 'sonner';

type SonnerProps = React.ComponentProps<typeof Sonner>;

export interface SonnerToasterProps extends Omit<SonnerProps, 'theme'> {
  theme?: SonnerProps['theme'];
}

const SonnerToaster = ({ theme = 'system', ...props }: SonnerToasterProps) => {
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { SonnerToaster, sonnerToast };
