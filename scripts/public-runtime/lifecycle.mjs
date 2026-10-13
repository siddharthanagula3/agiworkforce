export async function withPublicRuntimeCleanup(work, close) {
  let result;
  let workFailed = false;
  let workError;
  try {
    result = await work();
  } catch (error) {
    workFailed = true;
    workError = error;
  }

  try {
    await close();
  } catch (closeError) {
    if (workFailed) {
      throw new AggregateError([workError, closeError], 'Public runtime work and cleanup failed', {
        cause: workError,
      });
    }
    throw closeError;
  }

  if (workFailed) throw workError;
  return result;
}
