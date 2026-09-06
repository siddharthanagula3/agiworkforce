export class DirectoryActionNotice extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectoryActionNotice';
  }
}

export function isDirectoryActionNotice(value: unknown): value is DirectoryActionNotice {
  return value instanceof DirectoryActionNotice;
}
