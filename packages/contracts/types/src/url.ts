const SLASH = 47;

export function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === SLASH) {
    end -= 1;
  }
  return end === value.length ? value : value.slice(0, end);
}
