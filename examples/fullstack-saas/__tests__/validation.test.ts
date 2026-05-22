import { describe, expect, it } from 'vitest';
import { createProjectSchema, createTaskSchema, slugify, updateTaskSchema } from '@/lib/validation';

describe('validation', () => {
  it('normalizes project slugs', () => {
    expect(slugify('Résumé Roadmap / Q3')).toBe('resume-roadmap-q3');
  });

  it('validates project creation payloads', () => {
    expect(createProjectSchema.parse({ name: 'Launch', description: '' })).toEqual({
      name: 'Launch',
      description: '',
    });
    expect(() => createProjectSchema.parse({ name: 'x' })).toThrow();
  });

  it('validates task create and update payloads', () => {
    expect(createTaskSchema.parse({ title: 'Ship billing', priority: 'urgent' }).priority).toBe(
      'urgent',
    );
    expect(updateTaskSchema.parse({ status: 'done' })).toEqual({ status: 'done' });
    expect(() => updateTaskSchema.parse({})).toThrow();
  });
});
