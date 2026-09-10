// ============================================================================
// Tests: Coverage Checker
// ============================================================================
//
// Covers:
//   - All requirements covered
//   - Some must-have requirements uncovered
//   - All requirements uncovered
//   - Zero questions (nothing covered)
//   - Zero requirements (vacuously covered)
//   - Mixed must/nice uncovered
//   - Determinism
//   - Coverage stats utility

import {
  checkCoverage,
  getCoverageStats,
  CoverageCheckInput,
} from '../services/coverage-checker';
import type { Question, Requirement } from '@trao/shared';

// ---- Test Data Factories ---------------------------------------------------

function makeRequirement(
  overrides: Partial<Requirement> & { id: string }
): Requirement {
  return {
    text: `Requirement ${overrides.id}`,
    kind: 'technical',
    priority: 'must',
    ...overrides,
  };
}

function makeQuestion(
  overrides: Partial<Question> & { id: string }
): Question {
  return {
    requirement_ids: [],
    category: 'technical',
    prompt: `Question ${overrides.id}`,
    answer_outline: 'Answer outline',
    difficulty: 2,
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Coverage Checker', () => {
  // --------------------------------------------------------------------------
  // All covered
  // --------------------------------------------------------------------------
  describe('all requirements covered', () => {
    it('returns isFullyCovered=true when every must-have has a question', () => {
      const requirements: Requirement[] = [
        makeRequirement({ id: 'r1', priority: 'must' }),
        makeRequirement({ id: 'r2', priority: 'must' }),
        makeRequirement({ id: 'r3', priority: 'nice' }),
      ];

      const questions: Question[] = [
        makeQuestion({ id: 'q1', requirement_ids: ['r1'] }),
        makeQuestion({ id: 'q2', requirement_ids: ['r2'] }),
        makeQuestion({ id: 'q3', requirement_ids: ['r3'] }),
      ];

      const result = checkCoverage({
        requirements,
        questions,
        passNumber: 1,
      });

      expect(result.isFullyCovered).toBe(true);
      expect(result.uncoveredMustRequirements).toHaveLength(0);
      expect(result.uncoveredNiceRequirements).toHaveLength(0);
      expect(result.coverage.uncovered_requirement_ids).toEqual([]);
      expect(result.coverage.passes).toBe(1);
    });

    it('considers a requirement covered even if only one of many questions references it', () => {
      const requirements: Requirement[] = [
        makeRequirement({ id: 'r1', priority: 'must' }),
      ];

      const questions: Question[] = [
        makeQuestion({ id: 'q1', requirement_ids: ['r1'] }),
        makeQuestion({ id: 'q2', requirement_ids: ['r1'] }),
        makeQuestion({ id: 'q3', requirement_ids: [] }),
      ];

      const result = checkCoverage({
        requirements,
        questions,
        passNumber: 1,
      });

      expect(result.isFullyCovered).toBe(true);
      expect(result.coverage.uncovered_requirement_ids).toEqual([]);
    });

    it('handles a question covering multiple requirements', () => {
      const requirements: Requirement[] = [
        makeRequirement({ id: 'r1', priority: 'must' }),
        makeRequirement({ id: 'r2', priority: 'must' }),
      ];

      const questions: Question[] = [
        makeQuestion({ id: 'q1', requirement_ids: ['r1', 'r2'] }),
      ];

      const result = checkCoverage({
        requirements,
        questions,
        passNumber: 1,
      });

      expect(result.isFullyCovered).toBe(true);
      expect(result.coverage.uncovered_requirement_ids).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Some uncovered
  // --------------------------------------------------------------------------
  describe('some requirements uncovered', () => {
    it('identifies uncovered must-have requirements', () => {
      const requirements: Requirement[] = [
        makeRequirement({ id: 'r1', priority: 'must' }),
        makeRequirement({ id: 'r2', priority: 'must' }),
        makeRequirement({ id: 'r3', priority: 'must' }),
      ];

      const questions: Question[] = [
        makeQuestion({ id: 'q1', requirement_ids: ['r1'] }),
        // r2 and r3 have no questions
      ];

      const result = checkCoverage({
        requirements,
        questions,
        passNumber: 1,
      });

      expect(result.isFullyCovered).toBe(false);
      expect(result.uncoveredMustRequirements).toHaveLength(2);
      expect(result.uncoveredMustRequirements.map((r) => r.id).sort()).toEqual([
        'r2',
        'r3',
      ]);
      expect(result.coverage.uncovered_requirement_ids.sort()).toEqual([
        'r2',
        'r3',
      ]);
    });

    it('separates uncovered must from uncovered nice', () => {
      const requirements: Requirement[] = [
        makeRequirement({ id: 'r1', priority: 'must' }),
        makeRequirement({ id: 'r2', priority: 'nice' }),
        makeRequirement({ id: 'r3', priority: 'must' }),
      ];

      const questions: Question[] = [
        makeQuestion({ id: 'q1', requirement_ids: ['r1'] }),
        // r2 (nice) and r3 (must) uncovered
      ];

      const result = checkCoverage({
        requirements,
        questions,
        passNumber: 2,
      });

      expect(result.isFullyCovered).toBe(false);
      expect(result.uncoveredMustRequirements).toHaveLength(1);
      expect(result.uncoveredMustRequirements[0].id).toBe('r3');
      expect(result.uncoveredNiceRequirements).toHaveLength(1);
      expect(result.uncoveredNiceRequirements[0].id).toBe('r2');
      expect(result.coverage.passes).toBe(2);
    });

    it('is fully covered when only nice-to-have requirements are uncovered', () => {
      const requirements: Requirement[] = [
        makeRequirement({ id: 'r1', priority: 'must' }),
        makeRequirement({ id: 'r2', priority: 'nice' }),
      ];

      const questions: Question[] = [
        makeQuestion({ id: 'q1', requirement_ids: ['r1'] }),
        // r2 (nice) uncovered
      ];

      const result = checkCoverage({
        requirements,
        questions,
        passNumber: 1,
      });

      expect(result.isFullyCovered).toBe(true); // Only must matters
      expect(result.uncoveredNiceRequirements).toHaveLength(1);
      expect(result.coverage.uncovered_requirement_ids).toEqual(['r2']);
    });
  });

  // --------------------------------------------------------------------------
  // Zero questions
  // --------------------------------------------------------------------------
  describe('zero questions', () => {
    it('all requirements are uncovered', () => {
      const requirements: Requirement[] = [
        makeRequirement({ id: 'r1', priority: 'must' }),
        makeRequirement({ id: 'r2', priority: 'must' }),
      ];

      const result = checkCoverage({
        requirements,
        questions: [],
        passNumber: 1,
      });

      expect(result.isFullyCovered).toBe(false);
      expect(result.uncoveredMustRequirements).toHaveLength(2);
      expect(result.coverage.uncovered_requirement_ids).toEqual(['r1', 'r2']);
    });
  });

  // --------------------------------------------------------------------------
  // Zero requirements
  // --------------------------------------------------------------------------
  describe('zero requirements', () => {
    it('is vacuously fully covered', () => {
      const result = checkCoverage({
        requirements: [],
        questions: [
          makeQuestion({ id: 'q1', requirement_ids: [] }),
        ],
        passNumber: 1,
      });

      expect(result.isFullyCovered).toBe(true);
      expect(result.coverage.uncovered_requirement_ids).toEqual([]);
    });

    it('zero requirements and zero questions', () => {
      const result = checkCoverage({
        requirements: [],
        questions: [],
        passNumber: 1,
      });

      expect(result.isFullyCovered).toBe(true);
      expect(result.coverage.uncovered_requirement_ids).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // Pass number tracking
  // --------------------------------------------------------------------------
  describe('pass number tracking', () => {
    it('preserves the pass number in coverage output', () => {
      const input: CoverageCheckInput = {
        requirements: [makeRequirement({ id: 'r1', priority: 'must' })],
        questions: [makeQuestion({ id: 'q1', requirement_ids: ['r1'] })],
        passNumber: 3,
      };

      expect(checkCoverage(input).coverage.passes).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // Determinism
  // --------------------------------------------------------------------------
  describe('determinism', () => {
    it('produces identical output for identical input', () => {
      const input: CoverageCheckInput = {
        requirements: [
          makeRequirement({ id: 'r1', priority: 'must' }),
          makeRequirement({ id: 'r2', priority: 'nice' }),
          makeRequirement({ id: 'r3', priority: 'must' }),
        ],
        questions: [
          makeQuestion({ id: 'q1', requirement_ids: ['r1'] }),
        ],
        passNumber: 1,
      };

      const result1 = checkCoverage(input);
      const result2 = checkCoverage(input);

      expect(result1).toEqual(result2);
    });
  });

  // --------------------------------------------------------------------------
  // Coverage stats
  // --------------------------------------------------------------------------
  describe('getCoverageStats', () => {
    it('computes correct statistics', () => {
      const requirements: Requirement[] = [
        makeRequirement({ id: 'r1', priority: 'must' }),
        makeRequirement({ id: 'r2', priority: 'must' }),
        makeRequirement({ id: 'r3', priority: 'nice' }),
        makeRequirement({ id: 'r4', priority: 'nice' }),
      ];

      const questions: Question[] = [
        makeQuestion({ id: 'q1', requirement_ids: ['r1'] }),
        makeQuestion({ id: 'q2', requirement_ids: ['r3'] }),
        // r2 (must) and r4 (nice) uncovered
      ];

      const stats = getCoverageStats({
        requirements,
        questions,
        passNumber: 1,
      });

      expect(stats.totalRequirements).toBe(4);
      expect(stats.mustRequirements).toBe(2);
      expect(stats.niceRequirements).toBe(2);
      expect(stats.coveredTotal).toBe(2);
      expect(stats.coveredMust).toBe(1);
      expect(stats.coveredNice).toBe(1);
      expect(stats.uncoveredTotal).toBe(2);
      expect(stats.uncoveredMust).toBe(1);
      expect(stats.uncoveredNice).toBe(1);
      expect(stats.coveragePercentage).toBe(50);
      expect(stats.mustCoveragePercentage).toBe(50);
    });

    it('returns 100% for empty requirements', () => {
      const stats = getCoverageStats({
        requirements: [],
        questions: [],
        passNumber: 1,
      });

      expect(stats.coveragePercentage).toBe(100);
      expect(stats.mustCoveragePercentage).toBe(100);
    });
  });

  // --------------------------------------------------------------------------
  // Questions referencing non-existent requirements (graceful)
  // --------------------------------------------------------------------------
  describe('orphan question references', () => {
    it('does not crash when questions reference unknown requirement IDs', () => {
      const requirements: Requirement[] = [
        makeRequirement({ id: 'r1', priority: 'must' }),
      ];

      const questions: Question[] = [
        makeQuestion({ id: 'q1', requirement_ids: ['r1', 'r-nonexistent'] }),
      ];

      const result = checkCoverage({
        requirements,
        questions,
        passNumber: 1,
      });

      // r1 is covered by q1, orphan ref is ignored gracefully
      expect(result.isFullyCovered).toBe(true);
      expect(result.coverage.uncovered_requirement_ids).toEqual([]);
    });
  });
});
