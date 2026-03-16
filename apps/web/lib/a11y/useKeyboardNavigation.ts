/**
 * Accessibility Hook: Keyboard Navigation
 * WCAG 2.1 AA Compliance
 *
 * Provides keyboard navigation support for menus, lists, and other
 * components that need arrow key and Enter/Escape handling
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface KeyboardNavigationOptions {
  /**
   * Items to navigate through
   */
  items: any[];
  /**
   * Callback when selection changes
   */
  onSelect?: (item: any, index: number) => void;
  /**
   * Callback when Enter is pressed on selected item
   */
  onActivate?: (item: any, index: number) => void;
  /**
   * Callback when Escape is pressed
   */
  onCancel?: () => void;
  /**
   * Which direction to navigate (horizontal or vertical)
   */
  direction?: 'vertical' | 'horizontal';
  /**
   * Allow wrapping from last to first and vice versa
   */
  allowWrap?: boolean;
  /**
   * Whether to loop through items
   */
  loop?: boolean;
}

/**
 * Hook for managing keyboard navigation in a list or menu
 *
 * Usage:
 * ```tsx
 * const { selectedIndex, handleKeyDown } = useKeyboardNavigation({
 *   items: menuItems,
 *   onSelect: (item, index) => setSelected(item),
 *   onActivate: (item, index) => handleClick(item),
 * });
 *
 * return (
 *   <ul onKeyDown={handleKeyDown} role="menu">
 *     {menuItems.map((item, idx) => (
 *       <li key={idx} role="menuitem" aria-selected={idx === selectedIndex}>
 *         {item}
 *       </li>
 *     ))}
 *   </ul>
 * );
 * ```
 */
export function useKeyboardNavigation({
  items,
  onSelect,
  onActivate,
  onCancel,
  direction = 'vertical',
  allowWrap = true,
  loop = true,
}: KeyboardNavigationOptions) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const previousItemsLength = useRef(items.length);

  // Reset selection if items array changes significantly
  useEffect(() => {
    if (items.length === 0) {
      setSelectedIndex(0);
    } else if (selectedIndex >= items.length) {
      setSelectedIndex(Math.max(0, items.length - 1));
    }
    previousItemsLength.current = items.length;
  }, [items.length, selectedIndex]);

  const moveSelection = useCallback(
    (direction: 'next' | 'prev') => {
      if (items.length === 0) return;

      setSelectedIndex((current) => {
        let next = current;

        if (direction === 'next') {
          next = current + 1;
          if (next >= items.length) {
            next = loop ? 0 : current;
          }
        } else {
          next = current - 1;
          if (next < 0) {
            next = loop ? items.length - 1 : current;
          }
        }

        if (onSelect && next !== current) {
          onSelect(items[next], next);
        }

        return next;
      });
    },
    [items, onSelect, loop],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault();
          moveSelection('prev');
          break;

        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault();
          moveSelection('next');
          break;

        case 'Home':
          event.preventDefault();
          if (items.length > 0) {
            setSelectedIndex(0);
            onSelect?.(items[0], 0);
          }
          break;

        case 'End':
          event.preventDefault();
          if (items.length > 0) {
            const lastIndex = items.length - 1;
            setSelectedIndex(lastIndex);
            onSelect?.(items[lastIndex], lastIndex);
          }
          break;

        case 'Enter':
        case ' ':
          event.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < items.length) {
            onActivate?.(items[selectedIndex], selectedIndex);
          }
          break;

        case 'Escape':
          event.preventDefault();
          onCancel?.();
          break;

        default:
          break;
      }
    },
    [items, selectedIndex, moveSelection, onActivate, onCancel, onSelect],
  );

  return {
    selectedIndex,
    setSelectedIndex,
    moveSelection,
    handleKeyDown,
  };
}

/**
 * Hook for managing focus trap in modal or dropdown
 * Ensures focus stays within the component
 */
export function useFocusTrap(containerRef: React.RefObject<HTMLElement>, isActive = true) {
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ) as NodeListOf<HTMLElement>;

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    // Focus first element on mount
    firstElement.focus();

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, isActive]);
}

/**
 * Hook for character search in a list
 * Typing a character focuses the first item starting with that character
 */
export function useTypeahead(items: any[], getItemKey: (item: any) => string) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const searchQueryRef = useRef('');

  const handleCharacterKey = useCallback(
    (event: React.KeyboardEvent) => {
      const char = event.key.toLowerCase();

      // Only trigger for printable characters
      if (char.length !== 1 || !char.match(/[a-z0-9]/i)) return;

      event.preventDefault();

      // Clear search after 1 second of inactivity
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      setSearchQuery((prev) => {
        const query = prev + char;
        searchQueryRef.current = query;

        // Find first item matching the query
        const matchingIndex = items.findIndex((item) =>
          getItemKey(item).toLowerCase().startsWith(query.toLowerCase()),
        );

        searchTimeoutRef.current = setTimeout(() => {
          setSearchQuery('');
          searchQueryRef.current = '';
        }, 1000);

        return matchingIndex >= 0 ? query : prev;
      });
    },
    [items, getItemKey],
  );

  return { searchQuery, handleCharacterKey };
}
