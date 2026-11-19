export class ResponseRatingError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string) {
    super(userMessage);
    this.name = 'ResponseRatingError';
    this.userMessage = userMessage;
  }
}
