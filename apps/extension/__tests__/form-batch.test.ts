import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capturePageObservation, fillObservedForm } from '../src/features/content/pageObservation';
import { parseFormFillPlan } from '../src/features/content/formFillPlan';
import { MAX_FILL_FIELDS } from '../src/features/content/pageElements';
import {
  CHAT_AUTOFILL_TOOL,
  parseChatBrowserToolCall,
} from '../src/features/computer-use/chatBrowserTools';

const URL = 'https://example.com/form';

beforeEach(() => {
  vi.stubGlobal('location', { href: URL });
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 20,
  } as DOMRect);
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent ?? '';
    },
  });
  document.body.innerHTML = `<form>
    <label>Name<input id="name"></label><label>Email<input id="email" type="email"></label>
    <label>Phone<input id="phone" type="tel"></label><label>Notes<textarea id="notes"></textarea></label>
    <label>City<select id="city"><option value=""></option><option value="bos">Boston</option></select></label>
    <fieldset><legend>Size</legend><label>Small<input id="small" type="radio" name="size"></label><label>Large<input id="large" type="radio" name="size"></label></fieldset>
    <label>Onion<input id="onion" type="checkbox"></label>
    <label>I agree to the terms<input id="consent" type="checkbox"></label>
    <input id="password" type="password"><input id="card" autocomplete="cc-number"><input id="file" type="file">
    <button id="submit" type="submit">Submit</button></form>`;
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, 'innerText');
});

function read() {
  const observation = capturePageObservation(URL);
  expect(observation.success).toBe(true);
  expect(observation.formSnapshotId).toBeTruthy();
  return observation.formSnapshotId!;
}

describe('one-plan native form filling', () => {
  it('verifies the last edited field after its blur handler has committed or rejected it', async () => {
    const input = document.querySelector<HTMLInputElement>('#name')!;
    input.addEventListener('blur', () => {
      input.value = '';
    });
    const result = await fillObservedForm({ fields: { '#name': 'Rejected on blur' } }, URL, read());
    expect(input.value).toBe('');
    expect(result.verified).toBe(false);
    expect(result.fields[0]).toMatchObject({ status: 'failed' });
    expect(result.fields[0]).not.toHaveProperty('verifiedValue');
  });
  it('defers an autocomplete without changing its query or claiming a selected answer', async () => {
    const input = document.querySelector<HTMLInputElement>('#name')!;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    const result = await fillObservedForm({ fields: { '#name': 'Austin' } }, URL, read());
    expect(input.value).toBe('');
    expect(result.verified).toBe(false);
    expect(result.fields[0]).toMatchObject({
      status: 'skipped',
      reason: expect.stringContaining('autocomplete'),
    });
    expect(result.fields[0]).not.toHaveProperty('verifiedValue');
  });
  it('fills text, textarea, dropdown, radio and checkbox fields in one verified operation without submission', async () => {
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    document.querySelector('form')!.addEventListener('submit', onSubmit);
    const result = await fillObservedForm(
      {
        fields: {
          '#name': 'Test Applicant',
          '#email': 'test@example.com',
          '#phone': '202-555-0118',
          '#notes': 'One complete\nanswer',
          '#city': 'Boston',
          '#large': true,
          '#onion': true,
        },
      },
      URL,
      read(),
    );
    expect(result.filledCount).toBe(7);
    expect(result.verified).toBe(true);
    expect(result.fields.find((field) => field.selector === '#name')).toMatchObject({
      verifiedValue: 'Test Applicant',
    });
    expect(result.fields.find((field) => field.selector === '#notes')).toMatchObject({
      verifiedValue: 'One complete\nanswer',
    });
    expect(result.fields.find((field) => field.selector === '#city')).toMatchObject({
      verifiedValue: 'Boston',
    });
    expect(result.fields.find((field) => field.selector === '#onion')).toMatchObject({
      verifiedValue: true,
    });
    expect(result.fields.every((field) => field.status === 'filled')).toBe(true);
    expect((document.getElementById('city') as HTMLSelectElement).value).toBe('bos');
    expect((document.getElementById('large') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('notes') as HTMLTextAreaElement).value).toBe(
      'One complete\nanswer',
    );
    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.submitted).toBe(false);
  });

  it('refuses protected controls and unobserved selectors while filling ordinary fields', async () => {
    const result = await fillObservedForm(
      {
        fields: {
          '#name': 'Test Applicant',
          '#password': 'secret',
          '#card': '4111111111111111',
          '#file': '/tmp/file',
          '#submit': 'Submit',
          '#consent': true,
        },
      },
      URL,
      read(),
    );
    expect(result.filledCount).toBe(1);
    expect(result.verified).toBe(false);
    expect(
      result.fields
        .filter((field) => field.status !== 'filled')
        .every((field) => field.verifiedValue === undefined),
    ).toBe(true);
    expect((document.getElementById('consent') as HTMLInputElement).checked).toBe(false);
    expect((document.getElementById('password') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('card') as HTMLInputElement).value).toBe('');
    expect(result.fields.filter((field) => field.status === 'skipped')).toHaveLength(5);
  });

  it('preserves existing answers unless the plan explicitly requests edits', async () => {
    const name = document.getElementById('name') as HTMLInputElement;
    name.value = 'Original';
    expect(
      (await fillObservedForm({ fields: { '#name': 'Changed' } }, URL, read())).filledCount,
    ).toBe(0);
    expect(name.value).toBe('Original');
    expect(
      (
        await fillObservedForm(
          { fields: { '#name': 'Changed' }, replaceExisting: true },
          URL,
          read(),
        )
      ).filledCount,
    ).toBe(1);
    expect(name.value).toBe('Changed');
  });

  it('does not write secret-looking values into ordinary fields', async () => {
    const result = await fillObservedForm(
      { fields: { '#notes': `sk-ant-${'A'.repeat(60)}` } },
      URL,
      read(),
    );
    expect(result.filledCount).toBe(0);
    expect(result.fields[0]?.reason).toContain('protected data');
    expect((document.getElementById('notes') as HTMLTextAreaElement).value).toBe('');
  });

  it('does not overwrite an answer edited after the observation, even with requested edits', async () => {
    const snapshot = read();
    const name = document.getElementById('name') as HTMLInputElement;
    name.value = 'Entered by the user after the read';
    const result = await fillObservedForm(
      { fields: { '#name': 'Changed' }, replaceExisting: true },
      URL,
      snapshot,
    );
    expect(result.filledCount).toBe(0);
    expect(name.value).toBe('Entered by the user after the read');
    expect(result.fields[0]?.reason).toContain('answer changed');
  });

  it('refuses a replaced field even if its selector and label match', async () => {
    const snapshot = read();
    const name = document.getElementById('name')!;
    name.replaceWith(name.cloneNode(true));
    const result = await fillObservedForm({ fields: { '#name': 'Changed' } }, URL, snapshot);
    expect(result.filledCount).toBe(0);
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('');
  });

  it('rechecks the signature after focus handlers run', async () => {
    const name = document.getElementById('name') as HTMLInputElement;
    name.addEventListener('focus', () => name.setAttribute('aria-label', 'One-time code'));
    const result = await fillObservedForm({ fields: { '#name': 'Changed' } }, URL, read());
    expect(result.filledCount).toBe(0);
    expect(name.value).toBe('');
  });

  it('checks each field again after earlier input handlers replace another field', async () => {
    document.getElementById('name')!.addEventListener('input', () => {
      const email = document.getElementById('email')!;
      email.replaceWith(email.cloneNode(true));
    });
    const result = await fillObservedForm(
      { fields: { '#name': 'Test', '#email': 'test@example.com' } },
      URL,
      read(),
    );
    expect(result.filledCount).toBe(1);
    expect((document.getElementById('email') as HTMLInputElement).value).toBe('');
  });

  it('reports a rejected or invalid retained value as failed', async () => {
    document.getElementById('name')!.addEventListener('input', (event) => {
      (event.target as HTMLInputElement).value = '';
    });
    const result = await fillObservedForm(
      { fields: { '#name': 'Test', '#email': 'invalid email' } },
      URL,
      read(),
    );
    expect(result.filledCount).toBe(0);
    expect(result.fields.every((field) => field.status === 'failed')).toBe(true);
    expect(result.verified).toBe(false);
    expect(result.fields.every((field) => field.verifiedValue === undefined)).toBe(true);
  });

  it('reports a selected option label without exposing its hidden option value', async () => {
    const hidden = `sk-ant-${'A'.repeat(60)}`;
    (document.querySelector('#city option[value="bos"]') as HTMLOptionElement).value = hidden;
    const result = await fillObservedForm({ fields: { '#city': 'Boston' } }, URL, read());
    expect(result.verified).toBe(true);
    expect(result.fields[0]).toMatchObject({ status: 'filled', verifiedValue: 'Boston' });
    expect(JSON.stringify(result)).not.toContain(hidden);
  });

  it('waits for queued input handlers before marking a native value verified', async () => {
    const name = document.getElementById('name') as HTMLInputElement;
    name.addEventListener('input', () => {
      setTimeout(() => {
        name.value = '';
      }, 0);
    });
    const result = await fillObservedForm({ fields: { '#name': 'Rejected later' } }, URL, read());
    expect(result.verified).toBe(false);
    expect(result.filledCount).toBe(0);
    expect(result.fields[0]).toMatchObject({ status: 'failed' });
    expect(result.fields[0]?.verifiedValue).toBeUndefined();
  });

  it('does not reuse a consumed or superseded observation', async () => {
    const old = read();
    const current = read();
    await expect(fillObservedForm({ fields: { '#name': 'Test' } }, URL, old)).rejects.toThrow(
      'Read the current page',
    );
    await fillObservedForm({ fields: { '#name': 'Test' } }, URL, current);
    await expect(fillObservedForm({ fields: { '#name': 'Other' } }, URL, current)).rejects.toThrow(
      'Read the current page',
    );
  });

  it('uses normal checkbox events so page state follows the retained control value', async () => {
    let pageState = false;
    const onion = document.getElementById('onion') as HTMLInputElement;
    const changed = vi.fn(() => {
      pageState = onion.checked;
    });
    onion.addEventListener('click', changed);
    expect((await fillObservedForm({ fields: { '#onion': true } }, URL, read())).filledCount).toBe(
      1,
    );
    expect(pageState).toBe(true);
    expect(
      (await fillObservedForm({ fields: { '#onion': false }, replaceExisting: true }, URL, read()))
        .filledCount,
    ).toBe(1);
    expect(pageState).toBe(false);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('refuses changed source URLs before any mutation', async () => {
    await expect(
      fillObservedForm({ fields: { '#name': 'Test' } }, `${URL}?changed`, read()),
    ).rejects.toThrow('Read the current page');
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('');
  });
});

describe('form plan validation', () => {
  it.each([
    null,
    [],
    {},
    { fields: {} },
    { fields: [] },
    { fields: { '#name': 3 } },
    { fields: { '': 'Test' } },
    { fields: { '#name': 'Test' }, submit: true },
    { fields: { '#name': 'Test' }, replaceExisting: 'true' },
    {
      fields: Object.fromEntries(
        Array.from({ length: MAX_FILL_FIELDS + 1 }, (_, i) => [`#f${i}`, 'Test']),
      ),
    },
  ])('rejects unsupported plans: %j', (value) => expect(parseFormFillPlan(value)).toBeNull());

  it('parses one bounded general plan as a direct form tool call', () => {
    const plan = { fields: { '#name': 'Test', '#onion': true }, replaceExisting: true };
    expect(
      parseChatBrowserToolCall({
        id: 'fill-1',
        function: { name: CHAT_AUTOFILL_TOOL, arguments: JSON.stringify(plan) },
      }),
    ).toEqual({ kind: 'fill_fields', toolCallId: 'fill-1', plan });
  });
});
