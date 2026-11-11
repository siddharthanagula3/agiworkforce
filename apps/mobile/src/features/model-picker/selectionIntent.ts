import { useModelStore } from './store';

let latestClaim = 0;

export function claimModelSelection(): () => boolean {
  latestClaim += 1;
  const claim = latestClaim;
  const selectedAtClaim = useModelStore.getState().selectedModel;
  return () => claim === latestClaim && useModelStore.getState().selectedModel === selectedAtClaim;
}
