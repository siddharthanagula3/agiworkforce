const SCRIPT_UNSAFE_CHARACTERS = /[<>\u2028\u2029]/gu;

export function toScriptLiteral(value: unknown): string {
  const json: string | undefined = JSON.stringify(value);
  if (json === undefined) return 'undefined';
  return json.replace(
    SCRIPT_UNSAFE_CHARACTERS,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
