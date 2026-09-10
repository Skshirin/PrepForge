// ============================================================================
// Shared Constants
// ============================================================================

/**
 * Default study minutes per day.
 * This is the assumed available preparation time per day when building
 * the schedule. Documented in README as a key design decision.
 */
export const DEFAULT_MINUTES_PER_DAY = 120;

/**
 * Time allocation per difficulty level (in minutes) before scaling.
 * These are the base values; the schedule allocator scales them
 * proportionally to fit the total available time.
 */
export const BASE_MINUTES_BY_DIFFICULTY: Record<1 | 2 | 3, number> = {
  1: 15,
  2: 20,
  3: 30,
};

/**
 * Minimum study time per question after scaling (in minutes).
 * Prevents questions from being allocated too little time.
 */
export const MIN_MINUTES_PER_QUESTION = 10;

/**
 * Category sort weights — higher weight = higher priority in scheduling.
 * Used to break ties when sorting questions for schedule placement.
 */
export const CATEGORY_WEIGHT: Record<string, number> = {
  'system-design': 4,
  'technical': 3,
  'behavioural': 2,
  'company-fit': 1,
};

/**
 * Maximum number of coverage passes before giving up.
 */
export const MAX_COVERAGE_PASSES = 3;
