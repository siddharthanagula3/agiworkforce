import { Button, ButtonRow } from '@/features/marketing/components/system';

const FALLBACK_RETURN_PATH = '/chat';

export function SessionExpiredActions({ returnPath }: { returnPath: string | null }) {
  const returnTo = returnPath ?? FALLBACK_RETURN_PATH;

  return (
    <ButtonRow>
      <Button href={`/login/complete?redirectTo=${encodeURIComponent(returnTo)}`}>
        Sign in again
      </Button>
    </ButtonRow>
  );
}
