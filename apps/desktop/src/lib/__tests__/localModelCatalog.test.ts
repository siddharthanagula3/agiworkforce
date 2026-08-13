import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  notifyLocalModelCatalogChanged,
  subscribeToLocalModelCatalogChanges,
} from '../localModelCatalog';

describe('local model catalog notifications', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
  });

  it('notifies the desktop catalog owner with the verified change reason', () => {
    const listener = vi.fn();
    cleanups.push(subscribeToLocalModelCatalogChanges(listener));

    notifyLocalModelCatalogChanged('runtime-refresh');

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith('runtime-refresh');
  });

  it('stops notifications after the subscriber is removed', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToLocalModelCatalogChanges(listener);
    unsubscribe();

    notifyLocalModelCatalogChanged('background-health');

    expect(listener).not.toHaveBeenCalled();
  });
});
