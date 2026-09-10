// ============================================================================
// Zod Schema — Mirrors Appendix A Kit Structure Exactly
// ============================================================================
//
// This schema is used to validate:
//   1. LLM-generated kits before persisting
//   2. Batch output entries before writing
//   3. Loaded kit documents for integrity
//
// Constraints enforced:
//   - All Appendix A field names present
//   - difficulty is 1 | 2 | 3
//   - minutes is a non-negative integer
//   - schedule.days.length === schedule.days_available
//   - All question_ids in schedule reference existing question IDs
//   - requirement_ids in questions reference existing requirement IDs

import { z } from 'zod';

// ---- Primitives ------------------------------------------------------------

const requirementKindSchema = z.enum(['technical', 'behavioural', 'domain']);
const requirementPrioritySchema = z.enum(['must', 'nice']);
const questionCategorySchema = z.enum([
  'technical',
  'behavioural',
  'system-design',
  'company-fit',
]);
const difficultySchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

// ---- source ----------------------------------------------------------------

export const kitSourceSchema = z.object({
  company: z.string().min(1),
  company_url: z.string().url(),
  role: z.string().min(1),
  location: z.string(),
  jd_chars: z.number().int().nonnegative(),
  researched_at: z.string().min(1), // ISO-8601
  pages_used: z.array(z.string()),
});

// ---- company_brief ---------------------------------------------------------

export const companyBriefSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
  sources: z.array(z.string()),
});

// ---- role ------------------------------------------------------------------

export const requirementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  kind: requirementKindSchema,
  priority: requirementPrioritySchema,
});

export const roleSchema = z.object({
  title: z.string().min(1),
  seniority: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(requirementSchema),
});

// ---- questions -------------------------------------------------------------

export const questionSchema = z.object({
  id: z.string().min(1),
  requirement_ids: z.array(z.string().min(1)),
  category: questionCategorySchema,
  prompt: z.string().min(1),
  answer_outline: z.string(),
  difficulty: difficultySchema,
});

// ---- flashcards ------------------------------------------------------------

export const flashcardSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1),
  back: z.string().min(1),
  requirement_ids: z.array(z.string().min(1)),
});

// ---- schedule --------------------------------------------------------------

export const scheduleDaySchema = z.object({
  day: z.number().int().positive(),
  focus: z.string().min(1),
  question_ids: z.array(z.string().min(1)),
  minutes: z.number().int().nonnegative(),
});

export const scheduleSchema = z.object({
  days_available: z.number().int().positive(),
  days: z.array(scheduleDaySchema),
});

// ---- coverage --------------------------------------------------------------

export const coverageSchema = z.object({
  uncovered_requirement_ids: z.array(z.string()),
  passes: z.number().int().nonnegative(),
});

// ---- Complete Kit ----------------------------------------------------------

/**
 * The base kit schema validates field presence and types.
 * Use `kitSchema` (below) for the full validation including cross-field checks.
 */
const kitBaseSchema = z.object({
  source: kitSourceSchema,
  company_brief: companyBriefSchema,
  role: roleSchema,
  questions: z.array(questionSchema),
  flashcards: z.array(flashcardSchema),
  schedule: scheduleSchema,
  coverage: coverageSchema,
});

/**
 * Full kit schema with cross-field refinements:
 * 1. schedule.days.length === schedule.days_available
 * 2. All question_ids in schedule days refer to existing question IDs
 * 3. All requirement_ids in questions refer to existing requirement IDs
 */
export const kitSchema = kitBaseSchema.superRefine((kit, ctx) => {
  // ------ 1. Schedule day count must match days_available ------------------
  if (kit.schedule.days.length !== kit.schedule.days_available) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['schedule', 'days'],
      message:
        `schedule.days has ${kit.schedule.days.length} entries but ` +
        `days_available is ${kit.schedule.days_available}`,
    });
  }

  // ------ 2. Schedule question_ids must reference existing questions -------
  const questionIds = new Set(kit.questions.map((q) => q.id));

  for (let i = 0; i < kit.schedule.days.length; i++) {
    const day = kit.schedule.days[i];
    for (const qid of day.question_ids) {
      if (!questionIds.has(qid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['schedule', 'days', i, 'question_ids'],
          message: `schedule day ${day.day} references non-existent question "${qid}"`,
        });
      }
    }
  }

  // ------ 3. Question requirement_ids must reference existing requirements -
  const requirementIds = new Set(kit.role.requirements.map((r) => r.id));

  for (let i = 0; i < kit.questions.length; i++) {
    const q = kit.questions[i];
    for (const rid of q.requirement_ids) {
      if (!requirementIds.has(rid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['questions', i, 'requirement_ids'],
          message: `question "${q.id}" references non-existent requirement "${rid}"`,
        });
      }
    }
  }

  // ------ 4. Flashcard requirement_ids must reference existing requirements
  for (let i = 0; i < kit.flashcards.length; i++) {
    const f = kit.flashcards[i];
    for (const rid of f.requirement_ids) {
      if (!requirementIds.has(rid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['flashcards', i, 'requirement_ids'],
          message: `flashcard "${f.id}" references non-existent requirement "${rid}"`,
        });
      }
    }
  }
});

// ---- Batch schemas ---------------------------------------------------------

export const batchCaseSchema = z.object({
  id: z.string().min(1),
  jd: z.string().min(1),
  company_url: z.string().min(1), // May be localhost, so not .url()
  days: z.number().int().positive(),
});

export const batchInputSchema = z.array(batchCaseSchema);

export const batchErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
});

export const batchResultEntrySchema = z.discriminatedUnion('status', [
  z.object({
    id: z.string().min(1),
    status: z.literal('ok'),
    kit: kitBaseSchema, // Use base (without cross-ref checks) for batch leniency
    error: z.null(),
  }),
  z.object({
    id: z.string().min(1),
    status: z.literal('failed'),
    kit: z.null(),
    error: batchErrorSchema,
  }),
]);

export const batchOutputSchema = z.object({
  version: z.literal('1.0'),
  generated_at: z.string().min(1),
  kits: z.array(batchResultEntrySchema),
});

// ---- Utility: validate and return typed result ----------------------------

export type KitValidationResult =
  | { success: true; data: z.infer<typeof kitSchema> }
  | { success: false; errors: z.ZodIssue[] };

/**
 * Validate a kit object against the full Appendix A schema with cross-field checks.
 */
export function validateKit(data: unknown): KitValidationResult {
  const result = kitSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.issues };
}
