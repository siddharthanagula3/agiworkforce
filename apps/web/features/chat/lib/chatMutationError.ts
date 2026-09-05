export async function readChatMutationError(response: Response, fallback: string): Promise<string> {
  const errorData = await response.json().catch(() => ({}));
  if (
    errorData &&
    typeof errorData === 'object' &&
    'error' in errorData &&
    errorData.error &&
    typeof errorData.error === 'object' &&
    'message' in errorData.error &&
    typeof errorData.error.message === 'string'
  ) {
    return errorData.error.message;
  }
  return fallback;
}
