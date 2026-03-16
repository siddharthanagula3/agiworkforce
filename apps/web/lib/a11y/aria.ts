/**
 * Accessibility Utility: ARIA Helper Functions
 * WCAG 2.1 AA Compliance
 *
 * Common ARIA patterns and utilities for accessible React components
 */

/**
 * Common ARIA attributes and their expected values
 */
export const ARIA = {
  /**
   * Indicates an element is loading or processing
   * Used for async operations, file uploads, etc.
   */
  busy: (isBusy: boolean) => ({
    'aria-busy': isBusy ? 'true' : 'false',
  }),

  /**
   * Indicates an element is disabled
   * Always prefer native disabled attribute when possible
   */
  disabled: (isDisabled: boolean) => ({
    'aria-disabled': isDisabled ? 'true' : 'false',
  }),

  /**
   * Provides an accessible name for an element
   * Use when visual label is not available
   */
  label: (label: string) => ({
    'aria-label': label,
  }),

  /**
   * Associates an element with a label by ID
   * More semantic than aria-label when a separate label element exists
   */
  labelledBy: (id: string) => ({
    'aria-labelledby': id,
  }),

  /**
   * Provides additional description
   * Complements aria-label
   */
  describedBy: (id: string) => ({
    'aria-describedby': id,
  }),

  /**
   * Indicates expanded/collapsed state
   * Use with disclosure buttons, accordions, etc.
   */
  expanded: (isExpanded: boolean) => ({
    'aria-expanded': isExpanded ? 'true' : 'false',
  }),

  /**
   * Indicates if a popup menu is open
   * Combine with aria-expanded
   */
  hasPopup: (type: 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog' = 'menu') => ({
    'aria-haspopup': type,
  }),

  /**
   * Indicates selected state in a list
   */
  selected: (isSelected: boolean) => ({
    'aria-selected': isSelected ? 'true' : 'false',
  }),

  /**
   * Indicates checked state for checkboxes, radio buttons, toggles
   */
  checked: (isChecked: boolean | 'mixed') => ({
    'aria-checked': typeof isChecked === 'boolean' ? (isChecked ? 'true' : 'false') : 'mixed',
  }),

  /**
   * Indicates hidden state
   * Note: use CSS visibility: hidden or display: none for true hiding
   */
  hidden: (isHidden: boolean) => ({
    'aria-hidden': isHidden ? 'true' : 'false',
  }),

  /**
   * Indicates sort direction
   */
  sort: (direction: 'ascending' | 'descending' | 'none' | 'other') => ({
    'aria-sort': direction,
  }),

  /**
   * Indicates current page in a list of pages
   */
  current: (isCurrent: boolean, type = 'page') => ({
    'aria-current': isCurrent ? type : undefined,
  }),

  /**
   * Indicates if a textbox has autocomplete
   */
  autoComplete: (type: 'inline' | 'list' | 'both' | 'none' = 'none') => ({
    'aria-autocomplete': type,
  }),

  /**
   * Sets list size and current position for infinite scroll
   */
  setSize: (total: number) => ({
    'aria-setsize': total.toString(),
  }),

  /**
   * Sets current position in list
   */
  posinSet: (position: number) => ({
    'aria-posinset': position.toString(),
  }),

  /**
   * Indicates error state and message association
   */
  error: (hasError: boolean, messageId?: string) => {
    const attrs: Record<string, string> = {
      'aria-invalid': hasError ? 'true' : 'false',
    };
    if (hasError && messageId) {
      attrs['aria-describedby'] = messageId;
    }
    return attrs;
  },

  /**
   * Indicates required field
   */
  required: (isRequired: boolean) => ({
    'aria-required': isRequired ? 'true' : 'false',
  }),

  /**
   * Indicates readonly state
   */
  readOnly: (isReadOnly: boolean) => ({
    'aria-readonly': isReadOnly ? 'true' : 'false',
  }),

  /**
   * For live regions that announce content changes
   */
  live: (politeness: 'polite' | 'assertive' = 'polite', atomic = false) => ({
    'aria-live': politeness,
    'aria-atomic': atomic ? 'true' : 'false',
  }),

  /**
   * Indicates modal dialog behavior
   */
  modal: (isModal: boolean) => ({
    'aria-modal': isModal ? 'true' : 'false',
  }),

  /**
   * Indicates element controls another element
   */
  controls: (id: string) => ({
    'aria-controls': id,
  }),

  /**
   * Indicates element owns children not in DOM tree
   */
  owns: (id: string) => ({
    'aria-owns': id,
  }),

  /**
   * Indicates element is related to another
   */
  flowTo: (id: string) => ({
    'aria-flowto': id,
  }),
} as const;

/**
 * Common ARIA roles
 * Note: Use semantic HTML when possible (button, input, nav, etc.)
 */
export const ROLES = {
  /**
   * Region containing application-specific commands
   */
  toolbar: 'toolbar',

  /**
   * A box that describes the characteristics of an object
   */
  tooltip: 'tooltip',

  /**
   * A dialog providing information to the user
   */
  alertDialog: 'alertdialog',

  /**
   * A live region containing important, time-sensitive information
   */
  alert: 'alert',

  /**
   * A container for a set of form controls
   */
  group: 'group',

  /**
   * A set of related interactive components
   */
  radioGroup: 'radiogroup',

  /**
   * A list of items where only one can be selected
   */
  listbox: 'listbox',

  /**
   * A list of items
   */
  list: 'list',

  /**
   * An item in a list
   */
  listItem: 'listitem',

  /**
   * A region containing navigation links
   */
  navigation: 'navigation',

  /**
   * A perceivable region containing content that is relevant
   */
  region: 'region',

  /**
   * A tab in a tab list
   */
  tab: 'tab',

  /**
   * A list of tabs
   */
  tabList: 'tablist',

  /**
   * A container for tab content
   */
  tabPanel: 'tabpanel',

  /**
   * A complex structure with multiple rows or columns
   */
  table: 'table',

  /**
   * A row of cells
   */
  row: 'row',

  /**
   * A header cell for a row or column
   */
  columnHeader: 'columnheader',

  /**
   * A header cell for a row or column
   */
  rowHeader: 'rowheader',

  /**
   * A cell in a table
   */
  cell: 'cell',

  /**
   * A tree structure with parent-child relationships
   */
  tree: 'tree',

  /**
   * An item in a tree
   */
  treeItem: 'treeitem',

  /**
   * A menu that opens from a button
   */
  menu: 'menu',

  /**
   * An item in a menu
   */
  menuItem: 'menuitem',

  /**
   * A button with a menu
   */
  menuButton: 'menubutton',

  /**
   * A modal dialog
   */
  dialog: 'dialog',

  /**
   * A slider control
   */
  slider: 'slider',

  /**
   * A progress bar
   */
  progressBar: 'progressbar',

  /**
   * A spinbutton (number input)
   */
  spinButton: 'spinbutton',

  /**
   * A link
   */
  link: 'link',

  /**
   * A button
   */
  button: 'button',

  /**
   * A checkbox
   */
  checkbox: 'checkbox',

  /**
   * A radio button
   */
  radio: 'radio',

  /**
   * A switch toggle
   */
  switch: 'switch',

  /**
   * A main content region
   */
  main: 'main',

  /**
   * Complementary content
   */
  complementary: 'complementary',

  /**
   * Application-specific component
   */
  application: 'application',
} as const;

/**
 * Helper to set aria-live attributes for announcements
 */
export function getLiveRegionAttrs(priority: 'polite' | 'assertive' = 'polite', atomic = true) {
  return {
    'aria-live': priority,
    'aria-atomic': atomic ? 'true' : 'false',
  };
}

/**
 * Keyboard event helpers
 */
export const KEYS = {
  Enter: 'Enter',
  Space: ' ',
  Escape: 'Escape',
  Tab: 'Tab',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
} as const;

/**
 * Check if a key press should activate an element
 */
export function isActivationKey(event: React.KeyboardEvent): boolean {
  return event.key === KEYS.Enter || event.key === KEYS.Space;
}

/**
 * Check if a key press should close a menu
 */
export function isCloseKey(event: React.KeyboardEvent): boolean {
  return event.key === KEYS.Escape;
}

/**
 * Check if a key press is a navigation arrow
 */
export function isNavigationKey(event: React.KeyboardEvent): boolean {
  return [KEYS.ArrowUp, KEYS.ArrowDown, KEYS.ArrowLeft, KEYS.ArrowRight].includes(event.key as any);
}
