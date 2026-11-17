/**
 * jsonb concatenation onto a non-object does not fail, it builds an array:
 * `'null'::jsonb || '{"a":1}'` is `[null, {"a": 1}]`, which every reader of a
 * metadata column refuses. An array is read as the merge of its object
 * elements in order, later keys winning, which is what the merges that built it
 * would have stored. Migration 0424 repairs stored rows with this same
 * expression, and its test holds the two equal.
 */
export function jsonbObjectSql(expression: string): string {
  return `(select case jsonb_typeof(candidate.value)
    when 'object' then candidate.value
    when 'array' then (
      select coalesce(jsonb_object_agg(field.key, field.value order by element.idx), '{}'::jsonb)
        from jsonb_array_elements(candidate.value) with ordinality as element(item, idx)
        cross join lateral jsonb_each(
          case when jsonb_typeof(element.item) = 'object' then element.item else '{}'::jsonb end
        ) as field
    )
    else '{}'::jsonb
  end
  from (select (${expression})::jsonb as value) as candidate)`;
}

export function mergeJsonbObjectSql(current: string, patch: string): string {
  return `(${jsonbObjectSql(current)} || ${jsonbObjectSql(patch)})`;
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function jsonObjectOf(value: unknown): Record<string, unknown> {
  if (isJsonObject(value)) return value;
  if (!Array.isArray(value)) return {};
  return Object.fromEntries(
    value.filter(isJsonObject).flatMap((element) => Object.entries(element)),
  );
}
