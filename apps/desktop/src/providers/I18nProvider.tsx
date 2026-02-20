import { createContext, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../i18n';
import { useSettingsStore, selectLanguage, type Language } from '../stores/settingsStore';

type I18nProviderProps = {
  children: React.ReactNode;
};

type I18nProviderState = {
  language: Language;
  setLanguage: (language: Language) => void;
  isLoading: boolean;
};

const initialState: I18nProviderState = {
  language: 'en',
  setLanguage: () => null,
  isLoading: true,
};

const I18nProviderContext = createContext<I18nProviderState>(initialState);

export function I18nProvider({ children }: I18nProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const storedLanguage = useSettingsStore(selectLanguage);
  const { i18n } = useTranslation();
  const setLanguageStore = useSettingsStore((state) => state.setLanguage);

  useEffect(() => {
    // Sync i18n with settings store language preference
    if (storedLanguage && storedLanguage !== i18n.language) {
      i18n.changeLanguage(storedLanguage);
    }
    setIsLoading(false);
  }, [storedLanguage, i18n, setLanguageStore]);

  const value: I18nProviderState = {
    language: storedLanguage || 'en',
    setLanguage: (language: Language) => {
      i18n.changeLanguage(language);
      setLanguageStore(language);
    },
    isLoading,
  };

  return (
    <I18nProviderContext.Provider value={value}>
      {children}
    </I18nProviderContext.Provider>
  );
}

export const useI18nContext = () => {
  const context = useContext(I18nProviderContext);

  if (context === undefined) {
    throw new Error('useI18nContext must be used within an I18nProvider');
  }

  return context;
};
