import { RATE_LIMITED_COPY, RATE_LIMITED_STATUS } from '../constants';

export class DirectoryRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'DirectoryRequestError';
    this.status = status;
  }
}

export function describeActionFailure(caught: unknown, fallback: string): Error {
  if (caught instanceof DirectoryRequestError && caught.status === RATE_LIMITED_STATUS) {
    return new Error(RATE_LIMITED_COPY);
  }
  return new Error(fallback);
}
