import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDomElementReader } from '../src/features/content/elementReader';
import { approvalRequirement } from '../src/features/computer-use/approvalPolicy';
import { ELEMENT_LABEL_MAX_CHARS } from '../src/features/computer-use/cdpDriver';
import { LEVER_DOM_CONTROL_RULES } from '../src/features/content/autofill/lever';

afterEach(() => document.body.replaceChildren());

describe('shared portable DOM element observations', () => {
  it('keeps an autocomplete question stable while its suggestions change', () => {
    document.body.innerHTML =
      '<label><div class="application-label">Current location</div><div><input class="location-input" data-qa="location-input" name="location"><input type="hidden" name="selectedLocation"><div class="dropdown-results"><div class="dropdown-location">Austin, TX, USA</div></div><div class="dropdown-no-results" hidden>No matches</div></div></label>';
    const input = document.querySelector('input')!;
    const reader = createDomElementReader(LEVER_DOM_CONTROL_RULES);
    const signature = reader.signatureFor(input, ELEMENT_LABEL_MAX_CHARS);
    expect(reader.labelFor(input)).toBe('Current location');
    document.querySelector('.dropdown-results')!.textContent = 'A completely different result';
    expect(reader.signatureFor(input, ELEMENT_LABEL_MAX_CHARS)).toBe(signature);
  });

  it('reports committed selection only when the visible value matches the selected record', () => {
    document.body.innerHTML =
      '<label><div class="application-label">Current location</div><input class="location-input" data-qa="location-input" name="location"><input type="hidden" name="selectedLocation"><div class="dropdown-container" style="display:none"></div></label>';
    const input = document.querySelector<HTMLInputElement>('input')!;
    const hidden = document.querySelector<HTMLInputElement>('input[type=hidden]')!;
    const reader = createDomElementReader(LEVER_DOM_CONTROL_RULES);
    hidden.value = JSON.stringify({ name: 'Austin, TX, USA', privateId: 'DO_NOT_EXPOSE' });
    input.value = 'Austin';
    expect(reader.controlState(input).selectionCommitted).toBe(false);
    input.value = 'Austin, TX, USA';
    expect(reader.controlState(input).selectionCommitted).toBe(true);
    const popup = document.querySelector<HTMLElement>('.dropdown-container')!;
    popup.style.display = 'flex';
    expect(reader.controlState(input).selectionCommitted).toBe(false);
    popup.style.display = 'none';
    expect(JSON.stringify(reader.controlState(input))).not.toContain('DO_NOT_EXPOSE');
    hidden.value = '{invalid';
    expect(reader.controlState(input).selectionCommitted).toBe(false);
  });

  it('bounds scoped option discovery and excludes hidden or unrelated options', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 100,
      height: 20,
    } as DOMRect);
    document.body.innerHTML =
      '<input role="combobox" aria-controls="cities"><div id="cities" role="listbox"><div role="option">One</div><div role="option" hidden>Hidden</div><div role="option">Two</div></div><div role="option">Unrelated</div>';
    const reader = createDomElementReader();
    const input = document.querySelector('input')!;
    const candidates = [...document.querySelectorAll('*')];
    expect(
      reader.autocompleteOptions(input, candidates, 1).map((node) => node.textContent),
    ).toEqual(['One']);
    expect(
      reader.autocompleteOptions(input, candidates, 10).map((node) => node.textContent),
    ).toEqual(['One', 'Two']);
    expect(reader.autocompleteOptions(input, candidates, 0)).toEqual([]);
    vi.restoreAllMocks();
  });

  it('bounds untrusted control references instead of expanding the entire attribute', () => {
    document.body.innerHTML = '<input role="combobox">';
    const input = document.querySelector('input')!;
    input.setAttribute(
      'aria-controls',
      Array.from({ length: 10000 }, (_, index) => `missing-${index}`).join(' '),
    );
    const get = vi.spyOn(document, 'getElementById');
    expect(createDomElementReader().autocompleteScopes(input)).toEqual([]);
    expect(get.mock.calls.length).toBeLessThan(100);
    vi.restoreAllMocks();
  });
  it('reads associated labels and native checked states without an image', () => {
    document.body.innerHTML =
      '<label>Mushroom <input type="checkbox" name="topping" checked></label>';
    const input = document.querySelector('input')!;
    const reader = createDomElementReader();
    expect(reader.labelFor(input).trim()).toBe('Mushroom');
    expect(reader.controlState(input)).toMatchObject({ checked: true });
    input.checked = false;
    expect(reader.controlState(input)).toMatchObject({ checked: false });
  });

  it('resolves labels inside the element’s own shadow root', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<span id="question">Location</span><input aria-labelledby="question">';
    expect(createDomElementReader().labelFor(shadow.querySelector('input')!)).toBe('Location');
  });

  it('uses the owning frame constructors for native controls', () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    frame.contentDocument!.body.innerHTML = '<label>Large<input type="radio" checked></label>';
    const input = frame.contentDocument!.querySelector('input')!;
    const reader = createDomElementReader();
    expect(reader.labelFor(input)).toBe('Large');
    expect(reader.fieldValue(input)).toBe(true);
    expect(reader.controlState(input).checked).toBe(true);
  });

  it('does not inspect protected field contents to produce a label or state', () => {
    const input = document.createElement('input');
    input.type = 'password';
    input.name = 'password';
    document.body.append(input);
    Object.defineProperty(input, 'value', {
      get: () => {
        throw new Error('Field contents must not be read');
      },
    });
    const reader = createDomElementReader();
    expect(reader.labelFor(input)).toBe('password');
    expect(reader.controlState(input)).toEqual({});
  });

  it('reads ARIA toggle and expansion state while preserving native state precedence', () => {
    document.body.innerHTML =
      '<button aria-pressed="true" aria-expanded="false">Menu</button><input type="checkbox" aria-checked="true">';
    const reader = createDomElementReader();
    expect(reader.controlState(document.querySelector('button')!)).toMatchObject({
      pressed: true,
      expanded: false,
    });
    expect(reader.controlState(document.querySelector('input')!)).toMatchObject({ checked: false });
  });

  it('preserves visible image-button labels used by protected-action classification', () => {
    document.body.innerHTML = '<label>Confirm<input type="image" alt="Pay now"></label>';
    const element = document.querySelector('input')!;
    const signature = createDomElementReader().signatureFor(element, ELEMENT_LABEL_MAX_CHARS);
    expect(signature).toContain('Pay now');
    expect(signature).toContain('Confirm');
    expect(
      approvalRequirement({
        toolName: 'click',
        args: {},
        pageUrl: 'https://example.com',
        targetSignature: signature,
      }),
    ).toMatchObject({ alwaysAsk: true, reason: 'purchase' });
  });

  it('remains self-contained when serialized for a CDP execution world', () => {
    // llm-guardrail-allow: rebuilds the repository-owned factory exactly as the CDP driver does.
    const reader = new Function(`return (${createDomElementReader.toString()})();`)() as ReturnType<
      typeof createDomElementReader
    >;
    document.body.innerHTML = '<label>Onion<input type="checkbox" checked></label>';
    expect(reader.labelFor(document.querySelector('input')!)).toBe('Onion');
    expect(reader.controlState(document.querySelector('input')!).checked).toBe(true);
    expect(reader.signatureFor(document.querySelector('input')!, ELEMENT_LABEL_MAX_CHARS)).toBe(
      createDomElementReader().signatureFor(
        document.querySelector('input')!,
        ELEMENT_LABEL_MAX_CHARS,
      ),
    );
  });
});
