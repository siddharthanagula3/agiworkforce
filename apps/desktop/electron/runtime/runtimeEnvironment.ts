import { GUARD_LIFTING_ENVIRONMENT } from '@agiworkforce/local-runtime-contract';

export { GUARD_LIFTING_ENVIRONMENT };

export function withoutGuardLifting(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([name]) => !GUARD_LIFTING_ENVIRONMENT.includes(name.toUpperCase()),
    ),
  );
}
