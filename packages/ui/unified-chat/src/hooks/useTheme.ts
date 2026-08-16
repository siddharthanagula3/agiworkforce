import { useEffect } from 'react';

export function useTheme() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.documentElement.hasAttribute('data-theme-managed')) return;

    document.documentElement.classList.add('dark');
  }, []);
}
