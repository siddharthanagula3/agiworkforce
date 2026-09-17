'use client';

import { useCallback, useState, type KeyboardEvent } from 'react';

export interface UseComboboxOptions<T> {
  items: readonly T[];
  listboxId: string;
  expanded: boolean;
  getOptionId: (item: T) => string;
  onSelect: (item: T) => void;
  onEscape?: () => void;
}

export interface ComboboxInputProps {
  role: 'combobox';
  'aria-expanded': boolean;
  'aria-haspopup': 'listbox';
  'aria-autocomplete': 'list';
  'aria-controls': string;
  'aria-activedescendant': string | undefined;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

export interface ComboboxOptionProps {
  id: string;
  role: 'option';
  'aria-selected': boolean;
  onMouseEnter: () => void;
}

export interface UseComboboxResult<T> {
  activeIndex: number;
  activeItem: T | undefined;
  setActiveIndex: (index: number) => void;
  inputProps: ComboboxInputProps;
  getOptionProps: (item: T) => ComboboxOptionProps;
}

export function useCombobox<T>({
  items,
  listboxId,
  expanded,
  getOptionId,
  onSelect,
  onEscape,
}: UseComboboxOptions<T>): UseComboboxResult<T> {
  const [rawIndex, setActiveIndex] = useState(0);
  const lastIndex = items.length - 1;
  const activeIndex = Math.max(0, Math.min(rawIndex, lastIndex));
  const activeItem = items[activeIndex];

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex(Math.min(activeIndex + 1, lastIndex));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex(Math.max(activeIndex - 1, 0));
      } else if (event.key === 'Home') {
        event.preventDefault();
        setActiveIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setActiveIndex(Math.max(lastIndex, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (activeItem !== undefined) onSelect(activeItem);
      } else if (event.key === 'Escape' && onEscape) {
        onEscape();
      }
    },
    [activeIndex, activeItem, lastIndex, onEscape, onSelect],
  );

  const getOptionProps = useCallback(
    (item: T): ComboboxOptionProps => {
      const index = items.indexOf(item);
      return {
        id: getOptionId(item),
        role: 'option',
        'aria-selected': index === activeIndex,
        onMouseEnter: () => setActiveIndex(index),
      };
    },
    [activeIndex, getOptionId, items],
  );

  return {
    activeIndex,
    activeItem,
    setActiveIndex,
    inputProps: {
      role: 'combobox',
      'aria-expanded': expanded,
      'aria-haspopup': 'listbox',
      'aria-autocomplete': 'list',
      'aria-controls': listboxId,
      'aria-activedescendant': activeItem !== undefined ? getOptionId(activeItem) : undefined,
      onKeyDown,
    },
    getOptionProps,
  };
}
