// ============================================================================
// Schedule Allocator — Deterministic (no LLM involvement)
// ============================================================================
//
// This module distributes interview preparation questions across a given
// number of days. The algorithm is fully deterministic: same inputs always
// produce the same output.
//
// Design decisions (documented in README):
//   - Default: 120 minutes per day of focused study
//   - Questions are sorted by priority (must > nice), then difficulty (3 > 2 > 1),
//     then category weight (system-design > technical > behavioural > company-fit)
//   - Harder / higher-priority material is placed earlier in the schedule
//   - Time per question is based on difficulty, then scaled proportionally
//   - When days exceed questions, extra days become "review" days
//   - All durations are integer minutes (Math.round, with redistribution)

import type { Question, Requirement, Schedule, ScheduleDay } from '@trao/shared';
import {
  DEFAULT_MINUTES_PER_DAY,
  BASE_MINUTES_BY_DIFFICULTY,
  MIN_MINUTES_PER_QUESTION,
  CATEGORY_WEIGHT,
} from '@trao/shared';

// ---- Public API ------------------------------------------------------------

export interface ScheduleAllocatorInput {
  /** Questions to schedule (must have valid IDs) */
  questions: Question[];
  /** Requirements from the role (used for priority lookup) */
  requirements: Requirement[];
  /** Number of days the user has for preparation */
  daysAvailable: number;
  /** Override minutes per day (default: 120) — useful for testing */
  minutesPerDay?: number;
}

/**
 * Build a preparation schedule distributing questions across exactly
 * `daysAvailable` days. This is pure arithmetic — no LLM calls.
 */
export function allocateSchedule(input: ScheduleAllocatorInput): Schedule {
  const {
    questions,
    requirements,
    daysAvailable,
    minutesPerDay = DEFAULT_MINUTES_PER_DAY,
  } = input;

  if (daysAvailable < 1) {
    throw new Error('daysAvailable must be at least 1');
  }

  // Edge case: no questions at all
  if (questions.length === 0) {
    return buildEmptySchedule(daysAvailable, minutesPerDay);
  }

  // Step 1: Build a priority lookup from requirements
  const requirementPriority = buildPriorityMap(requirements);

  // Step 2: Sort questions — harder/higher-priority first
  const sorted = sortQuestions(questions, requirementPriority);

  // Step 3: Assign raw time per question based on difficulty
  const rawTimes = sorted.map((q) => BASE_MINUTES_BY_DIFFICULTY[q.difficulty]);

  // Step 4: Scale times proportionally to fit total available time
  const totalAvailable = daysAvailable * minutesPerDay;
  const scaledTimes = scaleToTotal(rawTimes, totalAvailable, MIN_MINUTES_PER_QUESTION);

  // Step 5: Pack questions into days greedily
  const days = packIntoDays(sorted, scaledTimes, daysAvailable, minutesPerDay);

  return {
    days_available: daysAvailable,
    days,
  };
}

// ---- Internal helpers ------------------------------------------------------

/**
 * Build a map from requirement ID → priority for fast lookup.
 */
function buildPriorityMap(requirements: Requirement[]): Map<string, 'must' | 'nice'> {
  const map = new Map<string, 'must' | 'nice'>();
  for (const req of requirements) {
    map.set(req.id, req.priority);
  }
  return map;
}

/**
 * Determine the highest priority among a question's linked requirements.
 * If any requirement is "must", the question is treated as must-priority.
 */
function questionPriorityScore(
  q: Question,
  priorityMap: Map<string, 'must' | 'nice'>
): number {
  for (const rid of q.requirement_ids) {
    if (priorityMap.get(rid) === 'must') {
      return 2; // must = higher
    }
  }
  return 1; // nice or unlinked
}

/**
 * Sort questions for scheduling:
 *   1. Priority: must > nice (descending)
 *   2. Difficulty: 3 > 2 > 1 (descending — harder first)
 *   3. Category weight: system-design > technical > behavioural > company-fit
 *   4. Stable: by ID as tiebreaker for determinism
 */
function sortQuestions(
  questions: Question[],
  priorityMap: Map<string, 'must' | 'nice'>
): Question[] {
  return [...questions].sort((a, b) => {
    // 1. Priority (must=2, nice=1) — higher first
    const pa = questionPriorityScore(a, priorityMap);
    const pb = questionPriorityScore(b, priorityMap);
    if (pa !== pb) return pb - pa;

    // 2. Difficulty — higher first
    if (a.difficulty !== b.difficulty) return b.difficulty - a.difficulty;

    // 3. Category weight — higher first
    const ca = CATEGORY_WEIGHT[a.category] ?? 0;
    const cb = CATEGORY_WEIGHT[b.category] ?? 0;
    if (ca !== cb) return cb - ca;

    // 4. ID for stable ordering
    return a.id.localeCompare(b.id);
  });
}

/**
 * Scale an array of raw times proportionally so they sum to `totalMinutes`.
 * Ensures no value drops below `minPerItem`. All values are integers.
 *
 * Uses largest-remainder method for integer rounding to avoid off-by-one.
 */
function scaleToTotal(
  rawTimes: number[],
  totalMinutes: number,
  minPerItem: number
): number[] {
  const n = rawTimes.length;

  // If total time is less than n * minPerItem, just give everyone minPerItem
  if (totalMinutes <= n * minPerItem) {
    // Distribute evenly with whatever is available
    const perItem = Math.max(1, Math.floor(totalMinutes / n));
    const result = new Array(n).fill(perItem);
    // Distribute remainder
    let remaining = totalMinutes - perItem * n;
    for (let i = 0; i < n && remaining > 0; i++) {
      result[i]++;
      remaining--;
    }
    return result;
  }

  const rawSum = rawTimes.reduce((a, b) => a + b, 0);
  if (rawSum === 0) {
    // All difficulties somehow zero — distribute evenly
    const perItem = Math.floor(totalMinutes / n);
    const result = new Array(n).fill(perItem);
    let remaining = totalMinutes - perItem * n;
    for (let i = 0; i < n && remaining > 0; i++) {
      result[i]++;
      remaining--;
    }
    return result;
  }

  const scale = totalMinutes / rawSum;

  // First pass: scale and floor, enforce minimum
  const scaled = rawTimes.map((t) => {
    const ideal = t * scale;
    return Math.max(minPerItem, ideal);
  });

  // Largest-remainder method for integer rounding
  const floored = scaled.map((v) => Math.floor(v));
  const remainders = scaled.map((v, i) => ({
    index: i,
    remainder: v - floored[i],
  }));

  let currentTotal = floored.reduce((a, b) => a + b, 0);
  let deficit = totalMinutes - currentTotal;

  // Sort by remainder descending to distribute the deficit
  remainders.sort((a, b) => b.remainder - a.remainder);

  for (const { index } of remainders) {
    if (deficit <= 0) break;
    floored[index]++;
    deficit--;
  }

  return floored;
}

/**
 * Greedily pack sorted questions into days.
 * When there are more days than questions, extra days become review days.
 */
function packIntoDays(
  sortedQuestions: Question[],
  times: number[],
  daysAvailable: number,
  minutesPerDay: number
): ScheduleDay[] {
  const n = sortedQuestions.length;

  // Build question+time pairs
  const items = sortedQuestions.map((q, i) => ({
    question: q,
    minutes: times[i],
  }));

  // If we have more days than questions, we need to spread and add review days
  if (daysAvailable >= n && n > 0) {
    return buildSpreadSchedule(items, daysAvailable, minutesPerDay);
  }

  // Normal greedy bin-packing
  return buildPackedSchedule(items, daysAvailable, minutesPerDay);
}

/**
 * When days >= questions: each question gets its own slot, extras become review.
 */
function buildSpreadSchedule(
  items: Array<{ question: Question; minutes: number }>,
  daysAvailable: number,
  minutesPerDay: number
): ScheduleDay[] {
  const n = items.length;
  const days: ScheduleDay[] = [];

  // Distribute questions across the first N days (one per day)
  // But if days >> questions, spread them out evenly
  const studyDays = Math.min(n, daysAvailable);
  const spacing = daysAvailable > 1 ? Math.floor(daysAvailable / studyDays) : 1;

  // Track which day numbers get new questions
  const questionDayMap: Map<number, typeof items> = new Map();

  for (let i = 0; i < n; i++) {
    const dayNum = Math.min(i * spacing + 1, daysAvailable);
    if (!questionDayMap.has(dayNum)) {
      questionDayMap.set(dayNum, []);
    }
    questionDayMap.get(dayNum)!.push(items[i]);
  }

  // Build all days
  for (let d = 1; d <= daysAvailable; d++) {
    const dayItems = questionDayMap.get(d);

    if (dayItems && dayItems.length > 0) {
      // New material day
      const questionIds = dayItems.map((item) => item.question.id);
      const totalMinutes = Math.min(
        dayItems.reduce((sum, item) => sum + item.minutes, 0),
        minutesPerDay
      );
      const focus = determineFocus(dayItems.map((item) => item.question));

      days.push({
        day: d,
        focus,
        question_ids: questionIds,
        minutes: totalMinutes,
      });
    } else {
      // Review day — reference previously studied questions
      const previousQuestions = getPreviousQuestionIds(days);
      const reviewCount = Math.min(previousQuestions.length, 5);
      const reviewIds = previousQuestions.slice(0, reviewCount);

      days.push({
        day: d,
        focus: 'Review & Practice',
        question_ids: reviewIds,
        minutes: Math.min(minutesPerDay, reviewCount * 15),
      });
    }
  }

  return days;
}

/**
 * Normal greedy packing when days < questions.
 */
function buildPackedSchedule(
  items: Array<{ question: Question; minutes: number }>,
  daysAvailable: number,
  minutesPerDay: number
): ScheduleDay[] {
  const days: ScheduleDay[] = [];
  let itemIndex = 0;

  for (let d = 1; d <= daysAvailable; d++) {
    const isLastDay = d === daysAvailable;
    const dayQuestions: Question[] = [];
    let dayMinutes = 0;

    // On the last day, pack all remaining questions
    if (isLastDay) {
      while (itemIndex < items.length) {
        dayQuestions.push(items[itemIndex].question);
        dayMinutes += items[itemIndex].minutes;
        itemIndex++;
      }
    } else {
      // Fill this day up to capacity
      while (itemIndex < items.length && dayMinutes + items[itemIndex].minutes <= minutesPerDay) {
        dayQuestions.push(items[itemIndex].question);
        dayMinutes += items[itemIndex].minutes;
        itemIndex++;
      }

      // If no questions fit (single large question), take one anyway
      if (dayQuestions.length === 0 && itemIndex < items.length) {
        dayQuestions.push(items[itemIndex].question);
        dayMinutes += items[itemIndex].minutes;
        itemIndex++;
      }
    }

    const focus = dayQuestions.length > 0
      ? determineFocus(dayQuestions)
      : 'Review & Practice';

    days.push({
      day: d,
      focus,
      question_ids: dayQuestions.map((q) => q.id),
      minutes: dayMinutes,
    });
  }

  return days;
}

/**
 * Determine the focus label for a day based on the majority category.
 */
function determineFocus(questions: Question[]): string {
  if (questions.length === 0) return 'Review & Practice';

  const categoryCounts: Record<string, number> = {};
  for (const q of questions) {
    categoryCounts[q.category] = (categoryCounts[q.category] || 0) + 1;
  }

  const topCategory = Object.entries(categoryCounts).sort(
    (a, b) => b[1] - a[1]
  )[0][0];

  const labels: Record<string, string> = {
    'technical': 'Technical Deep Dive',
    'behavioural': 'Behavioural Preparation',
    'system-design': 'System Design',
    'company-fit': 'Company & Culture Fit',
  };

  return labels[topCategory] || 'Mixed Practice';
}

/**
 * Collect all question IDs from previously built schedule days.
 */
function getPreviousQuestionIds(days: ScheduleDay[]): string[] {
  const ids: string[] = [];
  for (const day of days) {
    ids.push(...day.question_ids);
  }
  return ids;
}

/**
 * Build an empty schedule when there are no questions.
 * Still produces exactly daysAvailable days as required.
 */
function buildEmptySchedule(daysAvailable: number, minutesPerDay: number): Schedule {
  const days: ScheduleDay[] = [];
  for (let d = 1; d <= daysAvailable; d++) {
    days.push({
      day: d,
      focus: 'General Preparation',
      question_ids: [],
      minutes: 0,
    });
  }
  return {
    days_available: daysAvailable,
    days,
  };
}
