const postsInFlight = new Set<Promise<unknown>>();

export async function trackPushRegistrationPost<T>(post: Promise<T>): Promise<T> {
  postsInFlight.add(post);
  try {
    return await post;
  } finally {
    postsInFlight.delete(post);
  }
}

export async function pushRegistrationPostsSettled(): Promise<void> {
  await Promise.allSettled([...postsInFlight]);
}
