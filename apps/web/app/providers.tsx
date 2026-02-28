'use client';

import { I18nextProvider } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import i18n from './i18n';
import { QueryProvider } from '@shared/stores/query-client';
import { CommandPaletteProvider } from '@/components/CommandPalette/CommandPaletteProvider';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Ensure i18n is initialized
    const initI18n = async () => {
      if (i18n && !i18n.isInitialized) {
        await i18n.init();
      }
      setIsReady(true);
    };
    initI18n();
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <QueryProvider>
      <I18nextProvider i18n={i18n}>
        {children}
        <CommandPaletteProvider />
        <Toaster position="top-center" richColors closeButton />
      </I18nextProvider>
    </QueryProvider>
  );
}
