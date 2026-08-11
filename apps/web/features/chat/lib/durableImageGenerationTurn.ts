export type DurableImageGenerationOutcome =
  | { status: 'completed'; imageUrl: string }
  | { status: 'prompt-persistence-failed'; error: unknown }
  | { status: 'generation-failed'; error: unknown }
  | { status: 'result-persistence-failed'; imageUrl: string; error: unknown };

interface DurableImageGenerationBase {
  /** Temporary chats deliberately cross no transcript-persistence boundary. */
  temporary: boolean;
  /** Runs after the prompt commit point and immediately before provider egress. */
  beforeGenerate: () => void | Promise<void>;
  generate: () => Promise<string>;
  /** Presents the returned asset before its transcript row is committed. */
  onGenerated: (imageUrl: string) => void | Promise<void>;
  /** Saves the already-created asset reference; must never generate another image. */
  persistResult: (imageUrl: string) => Promise<void>;
}

type DurableImageGenerationRequest =
  | (DurableImageGenerationBase & {
      mode: 'new';
      persistPrompt: () => Promise<void>;
    })
  | (DurableImageGenerationBase & {
      mode: 'regenerate';
    });

/**
 * Paid image turn commit protocol used by WebChatPage.
 *
 * New persisted turns must commit the user prompt before the provider request
 * can reserve credits or create media. Once the provider returns an asset, the
 * result save is awaited and its failure carries that same asset back to the
 * page for an idempotent transcript-only retry. Regeneration omits the prompt
 * write because it updates an existing assistant row, but follows the same
 * provider-once/result-save protocol.
 */
export async function runDurableImageGenerationTurn(
  request: DurableImageGenerationRequest,
): Promise<DurableImageGenerationOutcome> {
  if (!request.temporary && request.mode === 'new') {
    try {
      await request.persistPrompt();
    } catch (error) {
      return { status: 'prompt-persistence-failed', error };
    }
  }

  try {
    await request.beforeGenerate();
  } catch (error) {
    return { status: 'generation-failed', error };
  }

  let imageUrl: string;
  try {
    imageUrl = await request.generate();
  } catch (error) {
    return { status: 'generation-failed', error };
  }

  try {
    await request.onGenerated(imageUrl);
  } catch (error) {
    return { status: 'generation-failed', error };
  }

  if (!request.temporary) {
    try {
      await request.persistResult(imageUrl);
    } catch (error) {
      return { status: 'result-persistence-failed', imageUrl, error };
    }
  }

  return { status: 'completed', imageUrl };
}
