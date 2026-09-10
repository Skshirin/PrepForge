// ============================================================================
// Coverage Checker — Deterministic (no LLM involvement)
// ============================================================================
//
// Compares the set of "must" requirements against the question bank to find
// which requirements have no question covering them.
//
// This is deterministic application logic per the assessment specification:
//   "Comparing the extracted requirements against the generated questions
//    to find the gaps is likewise your code's decision to make, not the model's."

import type { Requirement, Question, Coverage } from '@trao/shared';

// ---- Public API ------------------------------------------------------------

export interface CoverageCheckInput {
  /** All requirements extracted from the JD */
  requirements: Requirement[];
  /** All questions generated so far */
  questions: Question[];
  /** Current pass number (1-indexed) */
  passNumber: number;
}

export interface CoverageCheckResult {
  /** The coverage object for the kit */
  coverage: Coverage;
  /** True if all must-have requirements are covered */
  isFullyCovered: boolean;
  /** Only the must-have requirements that lack any question */
  uncoveredMustRequirements: Requirement[];
  /** Nice-to-have requirements that lack any question (informational) */
  uncoveredNiceRequirements: Requirement[];
}

/**
 * Check which requirements are covered by at least one question.
 *
 * A requirement is "covered" if at least one question includes its ID
 * in `requirement_ids`. The coverage object in the kit only lists
 * requirements with no coverage at all.
 *
 * This function is deterministic: same inputs always produce the same output.
 */
export function checkCoverage(input: CoverageCheckInput): CoverageCheckResult {
  const { requirements, questions, passNumber } = input;

  // Build a set of all requirement IDs that are referenced by at least one question
  const coveredIds = new Set<string>();
  for (const question of questions) {
    for (const rid of question.requirement_ids) {
      coveredIds.add(rid);
    }
  }

  // Find uncovered requirements, split by priority
  const uncoveredMust: Requirement[] = [];
  const uncoveredNice: Requirement[] = [];
  const allUncoveredIds: string[] = [];

  for (const req of requirements) {
    if (!coveredIds.has(req.id)) {
      allUncoveredIds.push(req.id);
      if (req.priority === 'must') {
        uncoveredMust.push(req);
      } else {
        uncoveredNice.push(req);
      }
    }
  }

  return {
    coverage: {
      uncovered_requirement_ids: allUncoveredIds,
      passes: passNumber,
    },
    isFullyCovered: uncoveredMust.length === 0,
    uncoveredMustRequirements: uncoveredMust,
    uncoveredNiceRequirements: uncoveredNice,
  };
}

/**
 * Get detailed coverage statistics for reporting.
 */
export function getCoverageStats(input: CoverageCheckInput): {
  totalRequirements: number;
  mustRequirements: number;
  niceRequirements: number;
  coveredTotal: number;
  coveredMust: number;
  coveredNice: number;
  uncoveredTotal: number;
  uncoveredMust: number;
  uncoveredNice: number;
  coveragePercentage: number;
  mustCoveragePercentage: number;
} {
  const { requirements, questions } = input;
  const result = checkCoverage(input);

  const mustCount = requirements.filter((r) => r.priority === 'must').length;
  const niceCount = requirements.filter((r) => r.priority === 'nice').length;

  const coveredMust = mustCount - result.uncoveredMustRequirements.length;
  const coveredNice = niceCount - result.uncoveredNiceRequirements.length;
  const coveredTotal = requirements.length - result.coverage.uncovered_requirement_ids.length;

  return {
    totalRequirements: requirements.length,
    mustRequirements: mustCount,
    niceRequirements: niceCount,
    coveredTotal,
    coveredMust,
    coveredNice,
    uncoveredTotal: result.coverage.uncovered_requirement_ids.length,
    uncoveredMust: result.uncoveredMustRequirements.length,
    uncoveredNice: result.uncoveredNiceRequirements.length,
    coveragePercentage:
      requirements.length > 0
        ? Math.round((coveredTotal / requirements.length) * 100)
        : 100,
    mustCoveragePercentage:
      mustCount > 0 ? Math.round((coveredMust / mustCount) * 100) : 100,
  };
}
