'use client';

import { useEffect } from 'react';

export function ForgetReturnedCode() {
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);
  return null;
}
