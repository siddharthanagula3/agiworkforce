'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';

const neverChanges = () => () => {};
const onClientNavigation = () => false;
const onDocumentLoad = () => true;

export function ScrollToHashTarget() {
  const arrivedByDocumentLoad = useRef(
    useSyncExternalStore(neverChanges, onClientNavigation, onDocumentLoad),
  );

  useEffect(() => {
    if (arrivedByDocumentLoad.current) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, []);

  return null;
}
