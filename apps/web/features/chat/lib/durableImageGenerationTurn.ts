export type DurableImageGenerationOutcome =
  | { status: 'completed'; imageUrl: string }
  | { status: 'prompt-persistence-failed'; error: unknown }
  | { status: 'generation-failed'; error: unknown }
  | { status: 'result-persistence-failed'; imageUrl: string; error: unknown };

interface DurableImageGenerationBase {
  temporary: boolean;
  beforeGenerate: () => void | Promise<void>;
  generate: () => Promise<string>;
  onGenerated: (imageUrl: string) => void | Promise<void>;
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
