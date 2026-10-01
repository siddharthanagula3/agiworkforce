export function createSentryDataCollectionOptions(userInfo = false) {
  return {
    userInfo,
    cookies: false as const,
    httpHeaders: { request: false as const, response: false as const },
    httpBodies: [],
    urlQueryParams: false as const,
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false as const,
    queues: false as const,
    graphQL: { document: false, variables: false },
    stackFrameVariables: false as const,
    frameContextLines: 0,
  };
}
