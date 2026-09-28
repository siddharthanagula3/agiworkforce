export class DirectoryScanCaution extends Error {
  readonly findings: readonly string[];
  readonly acknowledgements: readonly string[];

  constructor(message: string, findings: readonly string[], acknowledgements: readonly string[]) {
    super(message);
    this.name = 'DirectoryScanCaution';
    this.findings = findings;
    this.acknowledgements = acknowledgements;
  }
}

export function isDirectoryScanCaution(value: unknown): value is DirectoryScanCaution {
  return value instanceof DirectoryScanCaution;
}
