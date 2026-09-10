// ============================================================================
// Pipeline Types
// ============================================================================
//
// Defines the Stage interface and PipelineContext that accumulates state
// as the generation pipeline progresses through its stages.

import type {
  Kit,
  KitSource,
  CompanyBrief,
  Role,
  Requirement,
  Question,
  Flashcard,
  Schedule,
  Coverage,
} from '@trao/shared';

/**
 * Context object passed through all pipeline stages.
 * Each stage reads what it needs and writes its outputs.
 * Accumulated progressively — earlier stages produce data for later ones.
 */
export interface PipelineContext {
  // ---- Input (set before pipeline starts) ---
  /** Raw job description text from user */
  jd: string;
  /** Company website URL */
  companyUrl: string;
  /** Number of preparation days */
  days: number;
  /** Kit ID in database (for progress updates) */
  kitId: string;
  /** User ID */
  userId: string;
  /** Generation job ID */
  jobId: string;
  /** Section to regenerate (null = full generation) */
  regenerateSection?: string | null;
  /** IDs of pinned items that must not be overwritten */
  pinnedItemIds?: Set<string>;

  // ---- Stage 1: Extract Requirements ---
  requirements?: Requirement[];

  // ---- Stage 2-3: Crawl & Find Hiring Page ---
  crawledPages?: Array<{
    url: string;
    title: string;
    content: string;
    isHiringPage: boolean;
  }>;
  pagesUsed?: string[];
  crawlFailed?: boolean;
  hiringPageFound?: boolean;

  // ---- Stage 4: Public Discussion ---
  publicDiscussion?: Array<{
    url: string;
    content: string;
    source: string;
  }>;

  // ---- Stage 5: Company Brief ---
  companyBrief?: CompanyBrief;

  // ---- Stage 6: Questions (per category) ---
  questions?: Question[];

  // ---- Stage 7: Flashcards ---
  flashcards?: Flashcard[];

  // ---- Stage 8-9: Coverage Check & Gap Fill ---
  coverage?: Coverage;
  coveragePassCount?: number;

  // ---- Stage 10: Schedule ---
  schedule?: Schedule;

  // ---- Stage 11: Final Kit ---
  kit?: Kit;

  // ---- Source metadata ---
  source?: KitSource;
  role?: Role;

  // ---- Error tracking ---
  errors: Array<{
    stage: string;
    error: string;
    recoverable: boolean;
  }>;

  // ---- Timing ---
  startedAt: Date;
}

/**
 * A single stage in the generation pipeline.
 * Stages run sequentially, each reading from and writing to the PipelineContext.
 */
export interface PipelineStage {
  /** Unique name for this stage (used in progress tracking) */
  name: string;
  /** Human-readable description shown in progress UI */
  description: string;
  /** Execute this stage, mutating the context */
  run(ctx: PipelineContext): Promise<void>;
  /**
   * Whether this stage should be skipped during section regeneration.
   * If a function, receives the section name and returns true to skip.
   */
  shouldSkipForRegeneration?: (section: string) => boolean;
}

/**
 * Progress event sent to the frontend via SSE.
 */
export interface ProgressEvent {
  stage: string;
  stageDescription: string;
  progress: number;
  message: string;
  completedStages: string[];
  totalStages: number;
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed';
}

/**
 * All pipeline stage names, in execution order.
 */
export const PIPELINE_STAGE_NAMES = [
  'extract_requirements',
  'crawl_company_site',
  'find_hiring_page',
  'search_public_discussion',
  'generate_company_brief',
  'generate_questions_technical',
  'generate_questions_behavioural',
  'generate_questions_system_design',
  'generate_questions_company_fit',
  'generate_flashcards',
  'coverage_check',
  'build_schedule',
  'validate_kit',
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGE_NAMES)[number];
