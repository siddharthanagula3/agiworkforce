export const FIELD_CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'in',
  'exists',
  'not_exists',
  'greater_than',
  'less_than',
] as const;

export type FieldConditionOperator = (typeof FIELD_CONDITION_OPERATORS)[number];

export type FieldConditionValue = string | number | boolean | Array<string | number>;

export interface FieldCondition {
  field: string;
  operator: FieldConditionOperator;
  value?: FieldConditionValue;
}

export class FieldConditionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FieldConditionError';
  }
}

const MAX_CONDITIONS = 10;
const MAX_PATH_DEPTH = 6;
const MAX_VALUE_LENGTH = 500;
const MAX_LIST_LENGTH = 50;
const PATH_SEGMENT_RE = /^[A-Za-z0-9_-]{1,64}$/;
const VALUELESS_OPERATORS: ReadonlySet<FieldConditionOperator> = new Set(['exists', 'not_exists']);

function isOperator(value: unknown): value is FieldConditionOperator {
  return (FIELD_CONDITION_OPERATORS as readonly unknown[]).includes(value);
}

function normalizeScalar(value: unknown): string | number | boolean {
  if (typeof value === 'string') {
    if (value.length > MAX_VALUE_LENGTH) {
      throw new FieldConditionError(
        `Condition values must be ${MAX_VALUE_LENGTH} characters or less`,
      );
    }
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  throw new FieldConditionError('Condition values must be text, numbers or true/false');
}

export function normalizeFieldConditions(value: unknown): FieldCondition[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) throw new FieldConditionError('Conditions must be a list');
  if (value.length > MAX_CONDITIONS) {
    throw new FieldConditionError(`At most ${MAX_CONDITIONS} conditions are allowed`);
  }
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new FieldConditionError('Each condition needs a field and an operator');
    }
    const record = entry as Record<string, unknown>;
    const unknownKeys = Object.keys(record).filter(
      (key) => !['field', 'operator', 'value'].includes(key),
    );
    if (unknownKeys.length > 0) {
      throw new FieldConditionError(`Unknown condition field: ${unknownKeys.join(', ')}`);
    }
    const field = typeof record['field'] === 'string' ? record['field'].trim() : '';
    const segments = field.split('.');
    if (
      !field ||
      segments.length > MAX_PATH_DEPTH ||
      !segments.every((s) => PATH_SEGMENT_RE.test(s))
    ) {
      throw new FieldConditionError(
        'Condition field must be a dotted path such as data.conclusion',
      );
    }
    const operator = record['operator'];
    if (!isOperator(operator)) {
      throw new FieldConditionError(
        `Condition operator must be one of ${FIELD_CONDITION_OPERATORS.join(', ')}`,
      );
    }
    if (VALUELESS_OPERATORS.has(operator)) {
      if (record['value'] !== undefined) {
        throw new FieldConditionError(`${operator} does not take a value`);
      }
      return { field, operator };
    }
    if (operator === 'in') {
      const list = record['value'];
      if (!Array.isArray(list) || list.length === 0 || list.length > MAX_LIST_LENGTH) {
        throw new FieldConditionError(`in needs a list of 1 to ${MAX_LIST_LENGTH} values`);
      }
      return {
        field,
        operator,
        value: list.map((item) => {
          const scalar = normalizeScalar(item);
          if (typeof scalar === 'boolean') {
            throw new FieldConditionError('in lists hold text or numbers');
          }
          return scalar;
        }),
      };
    }
    if (operator === 'greater_than' || operator === 'less_than') {
      if (typeof record['value'] !== 'number' || !Number.isFinite(record['value'])) {
        throw new FieldConditionError(`${operator} needs a number`);
      }
      return { field, operator, value: record['value'] };
    }
    return { field, operator, value: normalizeScalar(record['value']) };
  });
}

export function readFieldPath(subject: unknown, path: string): unknown {
  let current: unknown = subject;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) return undefined;
      current = current[Number(segment)];
      continue;
    }
    if (!Object.hasOwn(current, segment)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function comparable(value: unknown): string | number | boolean | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return null;
}

function textOf(value: unknown): string | null {
  if (typeof value === 'string') return value.toLowerCase();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).toLowerCase();
  return null;
}

function loosely(left: unknown, right: unknown): boolean {
  const a = comparable(left);
  if (a === null) return false;
  if (typeof a === 'string' && typeof right === 'string')
    return a.toLowerCase() === right.toLowerCase();
  return a === right || String(a) === String(right);
}

export function evaluateFieldCondition(condition: FieldCondition, subject: unknown): boolean {
  const actual = readFieldPath(subject, condition.field);
  switch (condition.operator) {
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'not_exists':
      return actual === undefined || actual === null;
    case 'equals':
      return loosely(actual, condition.value);
    case 'not_equals':
      return !loosely(actual, condition.value);
    case 'contains':
    case 'not_contains': {
      const needle = textOf(condition.value);
      const found = Array.isArray(actual)
        ? actual.some((item) => loosely(item, condition.value))
        : needle !== null && (textOf(actual)?.includes(needle) ?? false);
      return condition.operator === 'contains' ? found : !found;
    }
    case 'starts_with': {
      const prefix = textOf(condition.value);
      return prefix !== null && (textOf(actual)?.startsWith(prefix) ?? false);
    }
    case 'in':
      return (
        Array.isArray(condition.value) && condition.value.some((item) => loosely(actual, item))
      );
    case 'greater_than':
    case 'less_than': {
      const number =
        typeof actual === 'number' ? actual : typeof actual === 'string' ? Number(actual) : NaN;
      if (!Number.isFinite(number) || typeof condition.value !== 'number') return false;
      return condition.operator === 'greater_than'
        ? number > condition.value
        : number < condition.value;
    }
  }
}

export function evaluateFieldConditions(
  conditions: readonly FieldCondition[],
  subject: unknown,
): boolean {
  return conditions.every((condition) => evaluateFieldCondition(condition, subject));
}
