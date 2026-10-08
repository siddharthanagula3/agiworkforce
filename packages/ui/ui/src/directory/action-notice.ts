export class DirectoryActionNotice extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectoryActionNotice';
  }
}

export function isDirectoryActionNotice(value: unknown): value is DirectoryActionNotice {
  return value instanceof DirectoryActionNotice;
}

export class DirectoryActionConfirmation extends Error {
  readonly title: string;
  readonly confirmLabel: string;
  readonly run: () => Promise<string | void> | string | void;

  constructor(
    title: string,
    description: string,
    confirmLabel: string,
    run: () => Promise<string | void> | string | void,
  ) {
    super(description);
    this.name = 'DirectoryActionConfirmation';
    this.title = title;
    this.confirmLabel = confirmLabel;
    this.run = run;
  }
}

export function isDirectoryActionConfirmation(
  value: unknown,
): value is DirectoryActionConfirmation {
  return value instanceof DirectoryActionConfirmation;
}
