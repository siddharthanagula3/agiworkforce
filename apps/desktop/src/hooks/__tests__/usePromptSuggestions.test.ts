/**
 * Tests for usePromptSuggestions Hook
 *
 * Tests pattern matching and suggestion generation for Gemini CLI-style
 * inline prompt suggestions.
 */

import { renderHook } from '@testing-library/react';
import { usePromptSuggestions } from '../usePromptSuggestions';

describe('usePromptSuggestions', () => {
  describe('Empty or Short Input', () => {
    it('should return empty array for empty input', () => {
      const { result } = renderHook(() => usePromptSuggestions(''));
      expect(result.current).toEqual([]);
    });

    it('should return empty array for input less than 3 characters', () => {
      const { result } = renderHook(() => usePromptSuggestions('ex'));
      expect(result.current).toEqual([]);
    });

    it('should return suggestions for input of exactly 3 characters', () => {
      const { result } = renderHook(() => usePromptSuggestions('fix'));
      expect(result.current.length).toBeGreaterThan(0);
    });
  });

  describe('Help Pattern', () => {
    it('should suggest help expansions for "help with" pattern', () => {
      const { result } = renderHook(() => usePromptSuggestions('help with debugging'));
      const suggestions = result.current;

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].type).toBe('expansion');
      expect(suggestions[0].text).toContain('debugging');
    });

    it('should include step-by-step suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('help with python'));
      const suggestions = result.current;
      const stepSuggestion = suggestions.find((s) => s.text.includes('step by step'));

      expect(stepSuggestion).toBeDefined();
      expect(stepSuggestion?.type).toBe('expansion');
    });

    it('should include example suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('help with react'));
      const suggestions = result.current;
      const exampleSuggestion = suggestions.find((s) => s.text.includes('examples'));

      expect(exampleSuggestion).toBeDefined();
      expect(exampleSuggestion?.type).toBe('expansion');
    });

    it('should include debugging suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('help with bugs'));
      const suggestions = result.current;
      const debugSuggestion = suggestions.find((s) => s.text.includes('debug'));

      expect(debugSuggestion).toBeDefined();
      expect(debugSuggestion?.type).toBe('alternative');
    });
  });

  describe('Write Pattern', () => {
    it('should suggest write expansions for "write a" pattern', () => {
      const { result } = renderHook(() => usePromptSuggestions('write a function for validation'));
      const suggestions = result.current;

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.every((s) => s.text.includes('function'))).toBe(true);
    });

    it('should include comments suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('write a script for automation'));
      const suggestions = result.current;
      const commentSuggestion = suggestions.find((s) => s.text.includes('comments'));

      expect(commentSuggestion).toBeDefined();
      expect(commentSuggestion?.type).toBe('expansion');
    });

    it('should include best practices suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('write a component'));
      const suggestions = result.current;
      const bestPracticesSuggestion = suggestions.find((s) => s.text.includes('best practices'));

      expect(bestPracticesSuggestion).toBeDefined();
    });

    it('should include error handling suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('write a handler'));
      const suggestions = result.current;
      const errorSuggestion = suggestions.find((s) => s.text.includes('error handling'));

      expect(errorSuggestion).toBeDefined();
    });
  });

  describe('Explain Pattern', () => {
    it('should suggest explain expansions for "explain" pattern', () => {
      const { result } = renderHook(() => usePromptSuggestions('explain closures'));
      const suggestions = result.current;

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].text).toContain('closures');
    });

    it('should include beginner-friendly suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('explain async'));
      const suggestions = result.current;
      const beginnerSuggestion = suggestions.find((s) => s.text.includes("like I'm 5"));

      expect(beginnerSuggestion).toBeDefined();
      expect(beginnerSuggestion?.type).toBe('alternative');
    });

    it('should include examples suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('explain promises'));
      const suggestions = result.current;
      const exampleSuggestion = suggestions.find((s) => s.text.includes('examples'));

      expect(exampleSuggestion).toBeDefined();
    });

    it('should include detail suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('explain recursion'));
      const suggestions = result.current;
      const detailSuggestion = suggestions.find((s) => s.text.includes('detail'));

      expect(detailSuggestion).toBeDefined();
    });
  });

  describe('How To Pattern', () => {
    it('should suggest how-to solutions', () => {
      const { result } = renderHook(() => usePromptSuggestions('how to sort array'));
      const suggestions = result.current;

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.text.includes('Python'))).toBe(true);
      expect(suggestions.some((s) => s.text.includes('JavaScript'))).toBe(true);
    });

    it('should include Python suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('how to read file'));
      const suggestions = result.current;
      const pythonSuggestion = suggestions.find((s) => s.text.includes('Python'));

      expect(pythonSuggestion).toBeDefined();
      expect(pythonSuggestion?.type).toBe('code');
    });

    it('should include JavaScript suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('how to parse json'));
      const suggestions = result.current;
      const jsSuggestion = suggestions.find((s) => s.text.includes('JavaScript'));

      expect(jsSuggestion).toBeDefined();
      expect(jsSuggestion?.type).toBe('code');
    });

    it('should include step-by-step suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('how to deploy'));
      const suggestions = result.current;
      const stepSuggestion = suggestions.find((s) => s.text.includes('step by step'));

      expect(stepSuggestion).toBeDefined();
    });
  });

  describe('Create Pattern', () => {
    it('should suggest creation options', () => {
      const { result } = renderHook(() => usePromptSuggestions('create a database'));
      const suggestions = result.current;

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should include tests suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('create a server'));
      const suggestions = result.current;
      const testSuggestion = suggestions.find((s) => s.text.includes('with tests'));

      expect(testSuggestion).toBeDefined();
    });

    it('should include from-scratch suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('create a project'));
      const suggestions = result.current;
      const scratchSuggestion = suggestions.find((s) => s.text.includes('from scratch'));

      expect(scratchSuggestion).toBeDefined();
    });

    it('should include documentation suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('create a library'));
      const suggestions = result.current;
      const docSuggestion = suggestions.find((s) => s.text.includes('documentation'));

      expect(docSuggestion).toBeDefined();
    });
  });

  describe('Fix Pattern', () => {
    it('should suggest fix improvements', () => {
      const { result } = renderHook(() => usePromptSuggestions('fix the bug'));
      const suggestions = result.current;

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should include explanation suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('fix the error'));
      const suggestions = result.current;
      const explainSuggestion = suggestions.find((s) => s.text.includes('explain'));

      expect(explainSuggestion).toBeDefined();
    });

    it('should include tests suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('fix issue'));
      const suggestions = result.current;
      const testSuggestion = suggestions.find((s) => s.text.includes('without breaking tests'));

      expect(testSuggestion).toBeDefined();
    });
  });

  describe('Optimize Pattern', () => {
    it('should suggest optimization approaches', () => {
      const { result } = renderHook(() => usePromptSuggestions('optimize query'));
      const suggestions = result.current;

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should include performance suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('optimize code'));
      const suggestions = result.current;
      const perfSuggestion = suggestions.find((s) => s.text.includes('performance'));

      expect(perfSuggestion).toBeDefined();
    });

    it('should include readability suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('optimize function'));
      const suggestions = result.current;
      const readSuggestion = suggestions.find((s) => s.text.includes('readability'));

      expect(readSuggestion).toBeDefined();
    });
  });

  describe('Refactor Pattern', () => {
    it('should suggest refactoring strategies', () => {
      const { result } = renderHook(() => usePromptSuggestions('refactor this'));
      const suggestions = result.current;

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should include modularity suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('refactor code'));
      const suggestions = result.current;
      const modularSuggestion = suggestions.find((s) => s.text.includes('modular'));

      expect(modularSuggestion).toBeDefined();
    });

    it('should include design patterns suggestion', () => {
      const { result } = renderHook(() => usePromptSuggestions('refactor component'));
      const suggestions = result.current;
      const designSuggestion = suggestions.find((s) => s.text.includes('design patterns'));

      expect(designSuggestion).toBeDefined();
    });
  });

  describe('Question Pattern', () => {
    it('should provide expansion suggestions for questions', () => {
      const { result } = renderHook(() => usePromptSuggestions('how do i use typescript?'));
      const suggestions = result.current;

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.text.includes('examples'))).toBe(true);
    });

    it('should suggest step-by-step for questions', () => {
      const { result } = renderHook(() => usePromptSuggestions('what is recursion?'));
      const suggestions = result.current;
      const stepSuggestion = suggestions.find((s) => s.text.includes('step by step'));

      expect(stepSuggestion).toBeDefined();
    });
  });

  describe('General Fallback Suggestions', () => {
    it('should provide general suggestions for short input', () => {
      const { result } = renderHook(() => usePromptSuggestions('test'));
      const suggestions = result.current;

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should include various general suggestions', () => {
      const { result } = renderHook(() => usePromptSuggestions('hello'));
      const suggestions = result.current;

      const hasExamples = suggestions.some((s) => s.text.includes('examples'));
      const hasSteps = suggestions.some((s) => s.text.includes('step by step'));
      const hasCode = suggestions.some((s) => s.text.includes('code'));

      expect(hasExamples || hasSteps || hasCode).toBe(true);
    });
  });

  describe('Suggestion Structure', () => {
    it('should return suggestions with all required properties', () => {
      const { result } = renderHook(() => usePromptSuggestions('explain test'));
      const suggestions = result.current;

      expect(suggestions.length).toBeGreaterThan(0);

      suggestions.forEach((suggestion) => {
        expect(suggestion).toHaveProperty('text');
        expect(suggestion).toHaveProperty('description');
        expect(suggestion).toHaveProperty('type');
        expect(suggestion).toHaveProperty('icon');

        expect(typeof suggestion.text).toBe('string');
        expect(typeof suggestion.description).toBe('string');
        expect(typeof suggestion.icon).toBe('string');
      });
    });

    it('should have valid suggestion types', () => {
      const { result } = renderHook(() => usePromptSuggestions('explain test'));
      const suggestions = result.current;
      const validTypes = ['continuation', 'expansion', 'alternative', 'code', 'question'];

      suggestions.forEach((suggestion) => {
        expect(validTypes).toContain(suggestion.type);
      });
    });

    it('should have emoji icons', () => {
      const { result } = renderHook(() => usePromptSuggestions('explain test'));
      const suggestions = result.current;

      suggestions.forEach((suggestion) => {
        // Emoji typically encoded as Unicode characters
        expect(suggestion.icon.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Memoization', () => {
    it('should return same suggestions for identical input', () => {
      const { result: result1 } = renderHook(() => usePromptSuggestions('explain test'));
      const { result: result2 } = renderHook(() => usePromptSuggestions('explain test'));

      expect(result1.current).toEqual(result2.current);
    });

    it('should return different suggestions for different input', () => {
      const { result: result1 } = renderHook(() => usePromptSuggestions('explain test'));
      const { result: result2 } = renderHook(() => usePromptSuggestions('write a function'));

      expect(result1.current).not.toEqual(result2.current);
    });
  });
});
