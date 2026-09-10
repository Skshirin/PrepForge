// ============================================================================
// Tests: Schedule Allocator
// ============================================================================
//
// Covers:
//   - 1-day schedule
//   - 5-day schedule (normal case)
//   - 60-day schedule (review days)
//   - Zero questions
//   - Questions with mixed priorities and difficulties
//   - Integer-only minutes (no floats)
//   - Day count matches days_available exactly
//   - All question IDs appear in schedule
//   - Harder/must-have material placed earlier

import { allocateSchedule, ScheduleAllocatorInput } from '../services/schedule-allocator';
import type { Question, Requirement } from '@trao/shared';

// ---- Test Data Factories ---------------------------------------------------

function makeRequirement(overrides: Partial<Requirement> & { id: string }): Requirement {
  return {
    text: `Requirement ${overrides.id}`,
    kind: 'technical',
    priority: 'must',
    ...overrides,
  };
}

function makeQuestion(overrides: Partial<Question> & { id: string }): Question {
  return {
    requirement_ids: [],
    category: 'technical',
    prompt: `Question ${overrides.id}`,
    answer_outline: 'Answer outline',
    difficulty: 2,
    ...overrides,
  };
}

// ---- Shared fixtures -------------------------------------------------------

const baseRequirements: Requirement[] = [
  makeRequirement({ id: 'r1', text: '5+ years React', kind: 'technical', priority: 'must' }),
  makeRequirement({ id: 'r2', text: 'Node.js experience', kind: 'technical', priority: 'must' }),
  makeRequirement({ id: 'r3', text: 'Team leadership', kind: 'behavioural', priority: 'must' }),
  makeRequirement({ id: 'r4', text: 'AWS knowledge', kind: 'technical', priority: 'nice' }),
  makeRequirement({ id: 'r5', text: 'GraphQL', kind: 'technical', priority: 'nice' }),
];

const baseQuestions: Question[] = [
  makeQuestion({ id: 'q1', requirement_ids: ['r1'], category: 'technical', difficulty: 3 }),
  makeQuestion({ id: 'q2', requirement_ids: ['r1'], category: 'technical', difficulty: 2 }),
  makeQuestion({ id: 'q3', requirement_ids: ['r2'], category: 'technical', difficulty: 2 }),
  makeQuestion({ id: 'q4', requirement_ids: ['r3'], category: 'behavioural', difficulty: 1 }),
  makeQuestion({ id: 'q5', requirement_ids: ['r2', 'r3'], category: 'system-design', difficulty: 3 }),
  makeQuestion({ id: 'q6', requirement_ids: ['r4'], category: 'technical', difficulty: 1 }),
  makeQuestion({ id: 'q7', requirement_ids: ['r5'], category: 'company-fit', difficulty: 1 }),
  makeQuestion({ id: 'q8', requirement_ids: ['r1', 'r2'], category: 'system-design', difficulty: 3 }),
];

// ============================================================================
// TESTS
// ============================================================================

describe('Schedule Allocator', () => {
  // --------------------------------------------------------------------------
  // Invariant tests (must hold for every valid input)
  // --------------------------------------------------------------------------
  describe('invariants', () => {
    const inputs: Array<{ name: string; input: ScheduleAllocatorInput }> = [
      {
        name: '1 day, 8 questions',
        input: { questions: baseQuestions, requirements: baseRequirements, daysAvailable: 1 },
      },
      {
        name: '5 days, 8 questions',
        input: { questions: baseQuestions, requirements: baseRequirements, daysAvailable: 5 },
      },
      {
        name: '60 days, 8 questions',
        input: { questions: baseQuestions, requirements: baseRequirements, daysAvailable: 60 },
      },
      {
        name: '3 days, 1 question',
        input: {
          questions: [baseQuestions[0]],
          requirements: baseRequirements,
          daysAvailable: 3,
        },
      },
    ];

    it.each(inputs)(
      '$name: schedule.days.length === days_available',
      ({ input }) => {
        const schedule = allocateSchedule(input);
        expect(schedule.days.length).toBe(input.daysAvailable);
        expect(schedule.days_available).toBe(input.daysAvailable);
      }
    );

    it.each(inputs)('$name: every day has integer minutes', ({ input }) => {
      const schedule = allocateSchedule(input);
      for (const day of schedule.days) {
        expect(Number.isInteger(day.minutes)).toBe(true);
        expect(day.minutes).toBeGreaterThanOrEqual(0);
      }
    });

    it.each(inputs)('$name: day numbers are 1-indexed sequential', ({ input }) => {
      const schedule = allocateSchedule(input);
      for (let i = 0; i < schedule.days.length; i++) {
        expect(schedule.days[i].day).toBe(i + 1);
      }
    });

    it.each(inputs)('$name: every day has a non-empty focus', ({ input }) => {
      const schedule = allocateSchedule(input);
      for (const day of schedule.days) {
        expect(day.focus).toBeTruthy();
        expect(day.focus.length).toBeGreaterThan(0);
      }
    });

    it.each(inputs)(
      '$name: all question IDs in schedule refer to input questions',
      ({ input }) => {
        const schedule = allocateSchedule(input);
        const validIds = new Set(input.questions.map((q) => q.id));
        for (const day of schedule.days) {
          for (const qid of day.question_ids) {
            expect(validIds.has(qid)).toBe(true);
          }
        }
      }
    );
  });

  // --------------------------------------------------------------------------
  // 1-day schedule
  // --------------------------------------------------------------------------
  describe('1-day schedule', () => {
    it('packs all questions into a single day', () => {
      const schedule = allocateSchedule({
        questions: baseQuestions,
        requirements: baseRequirements,
        daysAvailable: 1,
      });

      expect(schedule.days).toHaveLength(1);
      expect(schedule.days_available).toBe(1);

      // All question IDs should appear
      const allIds = new Set(baseQuestions.map((q) => q.id));
      const scheduledIds = new Set(schedule.days[0].question_ids);
      expect(scheduledIds).toEqual(allIds);
    });

    it('allocates exactly minutesPerDay total minutes', () => {
      const schedule = allocateSchedule({
        questions: baseQuestions,
        requirements: baseRequirements,
        daysAvailable: 1,
        minutesPerDay: 120,
      });

      expect(schedule.days[0].minutes).toBe(120);
    });
  });

  // --------------------------------------------------------------------------
  // 5-day schedule (normal case)
  // --------------------------------------------------------------------------
  describe('5-day schedule', () => {
    it('distributes 8 questions across 5 days', () => {
      const schedule = allocateSchedule({
        questions: baseQuestions,
        requirements: baseRequirements,
        daysAvailable: 5,
      });

      expect(schedule.days).toHaveLength(5);

      // Every question should appear at least once across all days
      const scheduledIds = new Set(schedule.days.flatMap((d) => d.question_ids));
      for (const q of baseQuestions) {
        expect(scheduledIds.has(q.id)).toBe(true);
      }
    });

    it('places harder/must-have material earlier', () => {
      const schedule = allocateSchedule({
        questions: baseQuestions,
        requirements: baseRequirements,
        daysAvailable: 5,
      });

      // Day 1 should contain at least one difficulty-3 must-have question
      const day1Questions = schedule.days[0].question_ids;
      const day1HasHardMust = day1Questions.some((id) => {
        const q = baseQuestions.find((bq) => bq.id === id);
        return q && q.difficulty === 3;
      });
      expect(day1HasHardMust).toBe(true);
    });

    it('total minutes across all days equals daysAvailable × minutesPerDay', () => {
      const minutesPerDay = 120;
      const schedule = allocateSchedule({
        questions: baseQuestions,
        requirements: baseRequirements,
        daysAvailable: 5,
        minutesPerDay,
      });

      const totalMinutes = schedule.days.reduce((sum, d) => sum + d.minutes, 0);
      expect(totalMinutes).toBe(5 * minutesPerDay);
    });
  });

  // --------------------------------------------------------------------------
  // 60-day schedule (more days than questions — review days)
  // --------------------------------------------------------------------------
  describe('60-day schedule', () => {
    it('produces exactly 60 days', () => {
      const schedule = allocateSchedule({
        questions: baseQuestions,
        requirements: baseRequirements,
        daysAvailable: 60,
      });

      expect(schedule.days).toHaveLength(60);
      expect(schedule.days_available).toBe(60);
    });

    it('includes review days since days > questions', () => {
      const schedule = allocateSchedule({
        questions: baseQuestions,
        requirements: baseRequirements,
        daysAvailable: 60,
      });

      // Some days should be review days (focus includes "Review")
      const reviewDays = schedule.days.filter((d) =>
        d.focus.toLowerCase().includes('review')
      );
      expect(reviewDays.length).toBeGreaterThan(0);
    });

    it('all original questions appear at least once in the schedule', () => {
      const schedule = allocateSchedule({
        questions: baseQuestions,
        requirements: baseRequirements,
        daysAvailable: 60,
      });

      const scheduledIds = new Set(schedule.days.flatMap((d) => d.question_ids));
      for (const q of baseQuestions) {
        expect(scheduledIds.has(q.id)).toBe(true);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Zero questions
  // --------------------------------------------------------------------------
  describe('zero questions', () => {
    it('produces exactly daysAvailable empty days', () => {
      const schedule = allocateSchedule({
        questions: [],
        requirements: baseRequirements,
        daysAvailable: 5,
      });

      expect(schedule.days).toHaveLength(5);
      expect(schedule.days_available).toBe(5);

      for (const day of schedule.days) {
        expect(day.question_ids).toHaveLength(0);
        expect(day.minutes).toBe(0);
      }
    });

    it('1 day with zero questions', () => {
      const schedule = allocateSchedule({
        questions: [],
        requirements: [],
        daysAvailable: 1,
      });

      expect(schedule.days).toHaveLength(1);
      expect(schedule.days[0].question_ids).toEqual([]);
      expect(schedule.days[0].minutes).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Priority ordering
  // --------------------------------------------------------------------------
  describe('priority ordering', () => {
    it('must-have questions appear before nice-to-have in schedule', () => {
      const mustReqs = [
        makeRequirement({ id: 'r-must', priority: 'must' }),
      ];
      const niceReqs = [
        makeRequirement({ id: 'r-nice', priority: 'nice' }),
      ];
      const allReqs = [...mustReqs, ...niceReqs];

      const mustQ = makeQuestion({
        id: 'q-must',
        requirement_ids: ['r-must'],
        difficulty: 1,
      });
      const niceQ = makeQuestion({
        id: 'q-nice',
        requirement_ids: ['r-nice'],
        difficulty: 3, // Higher difficulty but lower priority
      });

      const schedule = allocateSchedule({
        questions: [niceQ, mustQ], // nice first in input
        requirements: allReqs,
        daysAvailable: 2,
      });

      // Must-have should be in day 1 despite lower difficulty
      expect(schedule.days[0].question_ids).toContain('q-must');
    });
  });

  // --------------------------------------------------------------------------
  // Determinism
  // --------------------------------------------------------------------------
  describe('determinism', () => {
    it('produces identical output for identical input', () => {
      const input: ScheduleAllocatorInput = {
        questions: baseQuestions,
        requirements: baseRequirements,
        daysAvailable: 5,
      };

      const result1 = allocateSchedule(input);
      const result2 = allocateSchedule(input);

      expect(result1).toEqual(result2);
    });

    it('produces identical output across 10 runs', () => {
      const input: ScheduleAllocatorInput = {
        questions: baseQuestions,
        requirements: baseRequirements,
        daysAvailable: 7,
      };

      const first = JSON.stringify(allocateSchedule(input));
      for (let i = 0; i < 10; i++) {
        expect(JSON.stringify(allocateSchedule(input))).toBe(first);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Edge cases
  // --------------------------------------------------------------------------
  describe('edge cases', () => {
    it('throws for daysAvailable < 1', () => {
      expect(() =>
        allocateSchedule({
          questions: baseQuestions,
          requirements: baseRequirements,
          daysAvailable: 0,
        })
      ).toThrow('daysAvailable must be at least 1');
    });

    it('single question across 1 day', () => {
      const schedule = allocateSchedule({
        questions: [baseQuestions[0]],
        requirements: baseRequirements,
        daysAvailable: 1,
      });

      expect(schedule.days).toHaveLength(1);
      expect(schedule.days[0].question_ids).toEqual(['q1']);
      expect(schedule.days[0].minutes).toBe(120); // Full day allocated
    });

    it('handles large number of questions with few days', () => {
      const manyQuestions = Array.from({ length: 50 }, (_, i) =>
        makeQuestion({
          id: `q${i}`,
          requirement_ids: ['r1'],
          difficulty: ((i % 3) + 1) as 1 | 2 | 3,
          category: ['technical', 'behavioural', 'system-design', 'company-fit'][i % 4] as any,
        })
      );

      const schedule = allocateSchedule({
        questions: manyQuestions,
        requirements: baseRequirements,
        daysAvailable: 3,
      });

      expect(schedule.days).toHaveLength(3);

      // All 50 questions should be scheduled
      const allScheduledIds = new Set(schedule.days.flatMap((d) => d.question_ids));
      expect(allScheduledIds.size).toBe(50);
    });

    it('custom minutesPerDay is respected', () => {
      const schedule = allocateSchedule({
        questions: baseQuestions,
        requirements: baseRequirements,
        daysAvailable: 1,
        minutesPerDay: 60,
      });

      expect(schedule.days[0].minutes).toBe(60);
    });
  });
});
