'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/identity/client';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { toUserMessage } from '@/lib/user-error-message';
import { WORK_DESCRIPTIONS } from '@/features/settings/constants/work-descriptions';
import { ONBOARDING_USE_CASES } from '../lib/use-cases';
import {
  completeOnboarding,
  loadOnboardingSeed,
  skipOnboarding,
} from '../lib/onboarding-preferences';
import { StarterPrompts } from './StarterPrompts';

const TOTAL_STEPS = 2;
const CHAT_PATH = '/chat';

type Step = 1 | 2;

export function OnboardingWizard() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [step, setStep] = useState<Step>(1);
  const [preferredName, setPreferredName] = useState('');
  const [workDescription, setWorkDescription] = useState('');
  const [primaryUseCase, setPrimaryUseCase] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void loadOnboardingSeed().then((seed) => {
      if (cancelled) return;
      const fallbackName = user?.firstName || user?.fullName?.split(' ')[0] || '';
      setPreferredName(seed.preferredName || fallbackName);
      setWorkDescription(seed.workDescription);
      setSeeded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.firstName, user?.fullName]);

  useEffect(() => {
    if (seeded && step === 1) nameInputRef.current?.focus();
  }, [seeded, step]);

  const finish = useCallback(
    async (useCase: string | null, prompt?: string) => {
      setSubmitting(true);
      setError(null);
      try {
        await completeOnboarding({ preferredName, workDescription, primaryUseCase: useCase });
        router.replace(
          prompt ? `${CHAT_PATH}?starterPrompt=${encodeURIComponent(prompt)}` : CHAT_PATH,
        );
      } catch (caught) {
        setError(toUserMessage(caught, 'Failed to save your preferences'));
        setSubmitting(false);
      }
    },
    [preferredName, router, workDescription],
  );

  const skip = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await skipOnboarding();
      router.replace(CHAT_PATH);
    } catch (caught) {
      setError(toUserMessage(caught, 'Failed to skip setup'));
      setSubmitting(false);
    }
  }, [router]);

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center gap-4 p-6">
      <Card className="w-full">
        <CardHeader>
          <p className="text-xs font-medium text-muted-foreground">
            Step {step} of {TOTAL_STEPS}
          </p>
          {step === 1 ? (
            <>
              <CardTitle as="h1">What should we call you?</CardTitle>
              <CardDescription>
                This personalizes your chats. Change it anytime in settings.
              </CardDescription>
            </>
          ) : (
            <>
              <CardTitle as="h1">What do you want to do first?</CardTitle>
              <CardDescription>We will suggest a few prompts to get you started.</CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          {error && (
            <p role="alert" className="mb-3 text-sm text-danger">
              {error}
            </p>
          )}

          {step === 1 ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                setStep(2);
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="onboarding-name">Preferred name</Label>
                <Input
                  id="onboarding-name"
                  ref={nameInputRef}
                  value={preferredName}
                  onChange={(event) => setPreferredName(event.target.value)}
                  placeholder="Your name"
                  maxLength={60}
                  autoComplete="given-name"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="onboarding-role">What best describes your work?</Label>
                <Select value={workDescription} onValueChange={setWorkDescription}>
                  <SelectTrigger id="onboarding-role">
                    <SelectValue placeholder="Select one" />
                  </SelectTrigger>
                  <SelectContent>
                    {WORK_DESCRIPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void skip()}
                  disabled={submitting}
                >
                  Skip for now
                </Button>
                <Button type="submit" disabled={submitting || !preferredName.trim()}>
                  Continue
                </Button>
              </div>
            </form>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void finish(primaryUseCase || null);
              }}
            >
              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">What do you want to do first?</legend>
                <RadioGroup value={primaryUseCase} onValueChange={setPrimaryUseCase}>
                  {ONBOARDING_USE_CASES.map((useCase) => (
                    <Label
                      key={useCase.value}
                      htmlFor={`onboarding-use-case-${useCase.value}`}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm font-normal transition-colors',
                        primaryUseCase === useCase.value
                          ? 'border-primary bg-primary/5'
                          : 'border-input hover:bg-accent',
                      )}
                    >
                      <RadioGroupItem
                        id={`onboarding-use-case-${useCase.value}`}
                        value={useCase.value}
                        className="mt-0.5"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="font-medium text-foreground">{useCase.label}</span>
                        <span className="text-xs text-muted-foreground">{useCase.description}</span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </fieldset>
              <StarterPrompts
                useCase={primaryUseCase || null}
                onSelect={(prompt) => void finish(primaryUseCase || null, prompt)}
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(1)}
                  disabled={submitting}
                >
                  Back
                </Button>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void skip()}
                    disabled={submitting}
                  >
                    Skip for now
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Finishing…' : 'Finish'}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
