export interface SelectOptionChoice {
  value?: string;
  label?: string;
}

export interface SelectOptionReceipt {
  selectedValue: string;
  selectedLabel: string;
  eventSource: 'dom';
  changed: boolean;
}

export function selectOptionElement(
  element: Element,
  choice: SelectOptionChoice,
  mode: 'apply' | 'verify' = 'apply',
): SelectOptionReceipt {
  const maxTextCharacters = 2_048;
  const maxOptions = 1_000;
  if (
    !choice ||
    typeof choice !== 'object' ||
    Object.keys(choice).length !== 1 ||
    !Object.keys(choice).every((key) => key === 'value' || key === 'label') ||
    !['apply', 'verify'].includes(mode)
  )
    throw new Error('Select requires exactly one option value or label.');
  const field = Object.prototype.hasOwnProperty.call(choice, 'value') ? 'value' : 'label';
  const requested = choice[field];
  if (
    typeof requested !== 'string' ||
    requested.length > maxTextCharacters ||
    (field === 'label' && !requested.trim())
  )
    throw new Error('The exact option value or label is invalid or too long.');
  let selectBrand = false;
  try {
    const selectedIndex = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      'selectedIndex',
    )?.get;
    selectBrand = typeof selectedIndex?.call(element) === 'number';
  } catch {
    selectBrand = false;
  }
  if (!selectBrand || !element.isConnected)
    throw new Error('The current target is not a connected select control.');
  const select = element as HTMLSelectElement;
  if (select.multiple) throw new Error('This action requires a single-choice select control.');
  if (select.disabled || select.matches(':disabled'))
    throw new Error('The select control is disabled.');
  if (select.options.length > maxOptions)
    throw new Error('The select control exceeds the option inspection limit.');
  const matches = Array.from(select.options).filter((option) => option[field] === requested);
  if (matches.length !== 1)
    throw new Error(
      matches.length ? 'The exact option is ambiguous.' : 'The exact option was not found.',
    );
  const option = matches[0]!;
  let groupDisabled = false;
  if (option.parentElement?.localName === 'optgroup') {
    const disabled = Object.getOwnPropertyDescriptor(
      HTMLOptGroupElement.prototype,
      'disabled',
    )?.get;
    if (!disabled) throw new Error('The option group could not be verified.');
    groupDisabled = disabled.call(option.parentElement) === true;
  }
  if (option.disabled || groupDisabled) throw new Error('The requested option is disabled.');
  if (
    !option.label.trim() ||
    option.label.length > maxTextCharacters ||
    option.value.length > maxTextCharacters
  )
    throw new Error('The requested option has no bounded visible label.');
  const selectedValue = option.value;
  const selectedLabel = option.label;
  const selection = () => Array.from(select.options).filter((candidate) => candidate.selected);
  const previous = selection();
  const changed = previous.length !== 1 || previous[0] !== option;
  if (mode === 'apply' && changed) {
    select.selectedIndex = option.index;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const current = selection();
  if (
    !element.isConnected ||
    !option.isConnected ||
    current.length !== 1 ||
    current[0] !== option ||
    option.value !== selectedValue ||
    option.label !== selectedLabel
  )
    throw new Error(
      'The site did not retain the requested selection; it may already have received the change.',
    );
  return { selectedValue, selectedLabel, changed: mode === 'apply' && changed, eventSource: 'dom' };
}
