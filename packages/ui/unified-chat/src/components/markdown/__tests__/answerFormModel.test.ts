import { describe, expect, it } from 'vitest';
import { parseForm } from '../answerSurfaces';
import {
  formFieldErrors,
  formSubmissionText,
  formValueText,
  initialFormValue,
} from '../answerFormModel';

const SPEC = parseForm(
  [
    'title: Trip',
    'text: City*',
    'date: Start | 2026-05-01',
    'select: Season | Spring | *Summer',
    'slider: Budget | 0 | 10 | 4 | k',
    'checks: Bring | *Camera | Map',
    'submit: Plan it | send',
  ].join('\n'),
)!;

describe('answer form model', () => {
  it('starts each field from the value the reply gave it', () => {
    expect(SPEC.fields.map(initialFormValue)).toEqual([
      '',
      '2026-05-01',
      'Summer',
      '4',
      ['Camera'],
    ]);
  });

  it('flags an empty required field, an impossible date and an out-of-range slider', () => {
    expect(formFieldErrors(SPEC, ['', '2026-02-30', 'Summer', '11', ['Camera']])).toEqual([
      0, 1, 3,
    ]);
    expect(formFieldErrors(SPEC, ['Kyoto', '2026-02-28', 'Summer', '10', []])).toEqual([]);
  });

  it('rejects a choice the field does not offer', () => {
    expect(formFieldErrors(SPEC, ['Kyoto', '', 'Winter', '4', ['Tent']])).toEqual([2, 4]);
  });

  it('writes the submission as the title then one line per field, with the slider unit', () => {
    const values = ['Kyoto', '2026-05-01', 'Summer', '4', ['Camera', 'Map']];
    expect(formValueText(SPEC.fields[3]!, '4')).toBe('4 k');
    expect(formSubmissionText(SPEC, values)).toBe(
      'Trip\nCity: Kyoto\nStart: 2026-05-01\nSeason: Summer\nBudget: 4 k\nBring: Camera, Map',
    );
  });
});
