// ============================================================================
// Kit Structure Types — Appendix A (exact field names)
// ============================================================================

/**
 * Top-level kit structure. Every generated kit must conform to this shape.
 * Field names must match the assessment specification exactly.
 */
export interface Kit {
  source: KitSource;
  company_brief: CompanyBrief;
  role: Role;
  questions: Question[];
  flashcards: Flashcard[];
  schedule: Schedule;
  coverage: Coverage;
}

// ---- source ----------------------------------------------------------------

export interface KitSource {
  /** Company name extracted from JD or research */
  company: string;
  /** The company website URL provided by the user */
  company_url: string;
  /** Role title extracted from JD */
  role: string;
  /** Location extracted from JD (e.g. "Remote", "London, UK") */
  location: string;
  /** Character count of the original job description text */
  jd_chars: number;
  /** ISO-8601 timestamp when research was performed */
  researched_at: string;
  /** Every URL fetched during the research crawl */
  pages_used: string[];
}

// ---- company_brief ---------------------------------------------------------

export interface CompanyBrief {
  /** One-paragraph summary of the company */
  summary: string;
  /** What the company does / their product or service */
  what_they_do: string;
  /** URLs that actually contributed to the brief content */
  sources: string[];
}

// ---- role ------------------------------------------------------------------

export interface Role {
  /** Job title */
  title: string;
  /** Seniority level (e.g. "senior", "mid", "junior", "lead") */
  seniority: string;
  /** Key responsibilities listed in the JD */
  responsibilities: string[];
  /** Extracted requirements with classification */
  requirements: Requirement[];
}

/** Classification of a requirement's domain */
export type RequirementKind = 'technical' | 'behavioural' | 'domain';

/** Priority as expressed in the posting */
export type RequirementPriority = 'must' | 'nice';

export interface Requirement {
  /** Stable identifier within a kit (e.g. "r1", "r2") */
  id: string;
  /** The requirement text as found in / derived from the JD */
  text: string;
  /** Domain classification */
  kind: RequirementKind;
  /** Whether this is a must-have or nice-to-have */
  priority: RequirementPriority;
}

// ---- questions -------------------------------------------------------------

/** Question category — note these are different from RequirementKind */
export type QuestionCategory =
  | 'technical'
  | 'behavioural'
  | 'system-design'
  | 'company-fit';

export interface Question {
  /** Stable identifier within a kit (e.g. "q1", "q2") */
  id: string;
  /** Which requirement(s) this question covers */
  requirement_ids: string[];
  /** Question category */
  category: QuestionCategory;
  /** The interview question text */
  prompt: string;
  /** Suggested answer structure / key points */
  answer_outline: string;
  /** Difficulty level: 1 (easy), 2 (medium), 3 (hard) */
  difficulty: 1 | 2 | 3;
}

// ---- flashcards ------------------------------------------------------------

export interface Flashcard {
  /** Stable identifier within a kit (e.g. "f1", "f2") */
  id: string;
  /** Front of the flashcard (question / concept) */
  front: string;
  /** Back of the flashcard (answer / explanation) */
  back: string;
  /** Which requirement(s) this flashcard relates to */
  requirement_ids: string[];
}

// ---- schedule --------------------------------------------------------------

export interface Schedule {
  /** Number of days available for preparation */
  days_available: number;
  /** Exactly days_available entries, one per day */
  days: ScheduleDay[];
}

export interface ScheduleDay {
  /** Day number (1-indexed) */
  day: number;
  /** Focus area / theme for this day */
  focus: string;
  /** Question IDs to study on this day — must reference existing questions */
  question_ids: string[];
  /** Total study time in integer minutes */
  minutes: number;
}

// ---- coverage --------------------------------------------------------------

export interface Coverage {
  /** Requirement IDs that have no question covering them */
  uncovered_requirement_ids: string[];
  /** Number of coverage passes performed */
  passes: number;
}
