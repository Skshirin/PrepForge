// ============================================================================
// Batch Input / Output Types — Appendix B (exact field names)
// ============================================================================

import type { Kit } from './kit';

// ---- Batch Input -----------------------------------------------------------

/**
 * A single case in the batch input file.
 * Each case represents one job posting to generate a kit for.
 */
export interface BatchCase {
  /** Unique case identifier — must be preserved in output */
  id: string;
  /** Job description text */
  jd: string;
  /** Company website URL (may be localhost for evaluation) */
  company_url: string;
  /** Number of preparation days for the schedule */
  days: number;
}

/** The batch input file is a plain array of cases */
export type BatchInput = BatchCase[];

// ---- Batch Output ----------------------------------------------------------

/** Status of a single batch case result */
export type BatchCaseStatus = 'ok' | 'failed';

/** Error details for a failed batch case */
export interface BatchError {
  /** Machine-readable error code (e.g. "COMPANY_UNREACHABLE") */
  code: string;
  /** Human-readable error description */
  message: string;
}

/**
 * A single entry in the batch output kits array.
 * Exactly one entry per input case, keyed by id.
 */
export interface BatchResultEntry {
  /** The case id from the input — must match exactly */
  id: string;
  /** "ok" when a usable (even partial) kit was produced, "failed" otherwise */
  status: BatchCaseStatus;
  /** The generated kit, or null if status is "failed" */
  kit: Kit | null;
  /** Error details, or null if status is "ok" */
  error: BatchError | null;
}

/**
 * The complete batch output file structure.
 * Written by `npm run evaluate -- --input <cases.json> --output <kits.json>`
 */
export interface BatchOutput {
  /** Schema version */
  version: '1.0';
  /** ISO-8601 timestamp when the batch was generated */
  generated_at: string;
  /** One entry per input case, in any order */
  kits: BatchResultEntry[];
}
