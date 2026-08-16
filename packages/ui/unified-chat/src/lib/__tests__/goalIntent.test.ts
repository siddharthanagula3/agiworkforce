import { describe, it, expect } from 'vitest';
import { detectGoalIntent } from '../goalIntent';

describe('detectGoalIntent', () => {
  it('recognises an imperative task', () => {
    const intent = detectGoalIntent('Create a React component for user authentication');
    expect(intent.isGoal).toBe(true);
    expect(intent.verb).toBe('create');
  });

  it('recognises a multi-word verb', () => {
    expect(detectGoalIntent('Set up a staging environment for the API').isGoal).toBe(true);
    expect(detectGoalIntent('Clean up the unused exports in this package').isGoal).toBe(true);
  });

  it('rejects a greeting', () => {
    expect(detectGoalIntent('Hello').isGoal).toBe(false);
    expect(detectGoalIntent('hey there thanks').isGoal).toBe(false);
  });

  it('rejects a question even when it contains an action verb', () => {
    expect(detectGoalIntent('How do I create a React component?').isGoal).toBe(false);
    expect(detectGoalIntent('Should I refactor this module first').isGoal).toBe(false);
    expect(detectGoalIntent('Can you write a test for this').isGoal).toBe(false);
  });

  it('rejects a request phrased as a question without a mark', () => {
    expect(detectGoalIntent('what should I build next').isGoal).toBe(false);
  });

  it('rejects a verb that appears past the opening words', () => {
    expect(detectGoalIntent('I was wondering whether to build a new parser').isGoal).toBe(false);
  });

  it('rejects an imperative too short to be a task worth spawning', () => {
    expect(detectGoalIntent('fix it').isGoal).toBe(false);
    expect(detectGoalIntent('build').isGoal).toBe(false);
  });

  it('rejects empty and whitespace input', () => {
    expect(detectGoalIntent('').isGoal).toBe(false);
    expect(detectGoalIntent('   \n  ').isGoal).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(detectGoalIntent('MIGRATE THE DATABASE TO POSTGRES').isGoal).toBe(true);
  });
});
