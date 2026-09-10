// ============================================================================
// Tests: Kit Schema Validator (Zod)
// ============================================================================
//
// Covers:
//   - Valid complete kit passes
//   - Missing fields rejected
//   - Wrong types rejected
//   - schedule.days.length !== days_available rejected
//   - Invalid question_ids in schedule rejected
//   - Invalid requirement_ids in questions rejected
//   - Difficulty out of range rejected
//   - Float minutes rejected
//   - Extra fields allowed (passthrough)

import { validateKit } from '@trao/shared';
import type { Kit } from '@trao/shared';

// ---- Valid kit factory -----------------------------------------------------

function makeValidKit(): Kit {
  return {
    source: {
      company: 'Acme Corp',
      company_url: 'https://acme.com',
      role: 'Senior Engineer',
      location: 'Remote',
      jd_chars: 500,
      researched_at: '2026-09-01T09:12:44Z',
      pages_used: ['https://acme.com/', 'https://acme.com/about'],
    },
    company_brief: {
      summary: 'A technology company.',
      what_they_do: 'Build widgets.',
      sources: ['https://acme.com/about'],
    },
    role: {
      title: 'Senior Engineer',
      seniority: 'senior',
      responsibilities: ['Build systems', 'Mentor juniors'],
      requirements: [
        { id: 'r1', text: '5+ years React', kind: 'technical', priority: 'must' },
        { id: 'r2', text: 'Team leadership', kind: 'behavioural', priority: 'nice' },
      ],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'Explain React hooks.',
        answer_outline: 'useState, useEffect...',
        difficulty: 2,
      },
      {
        id: 'q2',
        requirement_ids: ['r2'],
        category: 'behavioural',
        prompt: 'Describe a leadership situation.',
        answer_outline: 'STAR method...',
        difficulty: 1,
      },
    ],
    flashcards: [
      {
        id: 'f1',
        front: 'What is useEffect?',
        back: 'A React hook for side effects.',
        requirement_ids: ['r1'],
      },
    ],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: 'Technical Deep Dive', question_ids: ['q1'], minutes: 60 },
        { day: 2, focus: 'Behavioural Preparation', question_ids: ['q2'], minutes: 60 },
      ],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 2,
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Kit Schema Validator', () => {
  // --------------------------------------------------------------------------
  // Valid kit
  // --------------------------------------------------------------------------
  describe('valid kit', () => {
    it('accepts a complete valid kit', () => {
      const result = validateKit(makeValidKit());
      expect(result.success).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Missing fields
  // --------------------------------------------------------------------------
  describe('missing fields', () => {
    it('rejects a kit without source', () => {
      const kit = makeValidKit();
      delete (kit as any).source;
      const result = validateKit(kit);
      expect(result.success).toBe(false);
    });

    it('rejects a kit without company_brief', () => {
      const kit = makeValidKit();
      delete (kit as any).company_brief;
      const result = validateKit(kit);
      expect(result.success).toBe(false);
    });

    it('rejects a kit without role', () => {
      const kit = makeValidKit();
      delete (kit as any).role;
      const result = validateKit(kit);
      expect(result.success).toBe(false);
    });

    it('rejects a kit without questions', () => {
      const kit = makeValidKit();
      delete (kit as any).questions;
      const result = validateKit(kit);
      expect(result.success).toBe(false);
    });

    it('rejects a kit without schedule', () => {
      const kit = makeValidKit();
      delete (kit as any).schedule;
      const result = validateKit(kit);
      expect(result.success).toBe(false);
    });

    it('rejects a kit without coverage', () => {
      const kit = makeValidKit();
      delete (kit as any).coverage;
      const result = validateKit(kit);
      expect(result.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Type constraints
  // --------------------------------------------------------------------------
  describe('type constraints', () => {
    it('rejects non-integer jd_chars', () => {
      const kit = makeValidKit();
      (kit.source as any).jd_chars = 123.5;
      const result = validateKit(kit);
      expect(result.success).toBe(false);
    });

    it('rejects float minutes in schedule', () => {
      const kit = makeValidKit();
      kit.schedule.days[0].minutes = 30.5;
      const result = validateKit(kit);
      expect(result.success).toBe(false);
    });

    it('rejects difficulty outside 1-3 range', () => {
      const kit = makeValidKit();
      (kit.questions[0] as any).difficulty = 4;
      const result = validateKit(kit);
      expect(result.success).toBe(false);
    });

    it('rejects difficulty of 0', () => {
      const kit = makeValidKit();
      (kit.questions[0] as any).difficulty = 0;
      const result = validateKit(kit);
      expect(result.success).toBe(false);
    });

    it('rejects invalid requirement kind', () => {
      const kit = makeValidKit();
      (kit.role.requirements[0] as any).kind = 'unknown';
      const result = validateKit(kit);
      expect(result.success).toBe(false);
    });

    it('rejects invalid requirement priority', () => {
      const kit = makeValidKit();
      (kit.role.requirements[0] as any).priority = 'optional';
      const result = validateKit(kit);
      expect(result.success).toBe(false);
    });

    it('rejects invalid question category', () => {
      const kit = makeValidKit();
      (kit.questions[0] as any).category = 'coding';
      const result = validateKit(kit);
      expect(result.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Cross-field: schedule.days.length === days_available
  // --------------------------------------------------------------------------
  describe('schedule day count', () => {
    it('rejects when days.length !== days_available', () => {
      const kit = makeValidKit();
      kit.schedule.days_available = 3; // but we only have 2 days
      const result = validateKit(kit);
      expect(result.success).toBe(false);
      if (!result.success) {
        const failed = result as { success: false; errors: Array<{ message: string }> };
        const msg = failed.errors.map((e) => e.message).join('; ');
        expect(msg).toContain('schedule.days has 2 entries but days_available is 3');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Cross-field: schedule question_ids reference existing questions
  // --------------------------------------------------------------------------
  describe('schedule question references', () => {
    it('rejects schedule referencing non-existent question ID', () => {
      const kit = makeValidKit();
      kit.schedule.days[0].question_ids = ['q-nonexistent'];
      const result = validateKit(kit);
      expect(result.success).toBe(false);
      if (!result.success) {
        const failed = result as { success: false; errors: Array<{ message: string }> };
        const msg = failed.errors.map((e) => e.message).join('; ');
        expect(msg).toContain('non-existent question "q-nonexistent"');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Cross-field: question requirement_ids reference existing requirements
  // --------------------------------------------------------------------------
  describe('question requirement references', () => {
    it('rejects question referencing non-existent requirement ID', () => {
      const kit = makeValidKit();
      kit.questions[0].requirement_ids = ['r-nonexistent'];
      const result = validateKit(kit);
      expect(result.success).toBe(false);
      if (!result.success) {
        const failed = result as { success: false; errors: Array<{ message: string }> };
        const msg = failed.errors.map((e) => e.message).join('; ');
        expect(msg).toContain('non-existent requirement "r-nonexistent"');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Flashcard requirement references
  // --------------------------------------------------------------------------
  describe('flashcard requirement references', () => {
    it('rejects flashcard referencing non-existent requirement ID', () => {
      const kit = makeValidKit();
      kit.flashcards[0].requirement_ids = ['r-nonexistent'];
      const result = validateKit(kit);
      expect(result.success).toBe(false);
      if (!result.success) {
        const failed = result as { success: false; errors: Array<{ message: string }> };
        const msg = failed.errors.map((e) => e.message).join('; ');
        expect(msg).toContain('non-existent requirement "r-nonexistent"');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Extra fields (passthrough — Appendix A says "may extend")
  // --------------------------------------------------------------------------
  describe('extra fields', () => {
    it('does not reject extra top-level fields', () => {
      const kit = makeValidKit() as any;
      kit.custom_feature = { enabled: true };
      // Zod strips unknown fields by default, but doesn't reject them
      const result = validateKit(kit);
      expect(result.success).toBe(true);
    });
  });
});
