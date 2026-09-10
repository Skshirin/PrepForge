// ============================================================================
// Pipeline Orchestrator
// ============================================================================
//
// Runs the generation pipeline stages sequentially, updating the
// GenerationJob document with progress after each stage.
//
// Design:
//   - Creates a GenerationJob with all stages in 'pending' state
//   - Runs each stage, updating status to 'running' → 'completed' | 'failed'
//   - On stage failure: marks as failed, records error, continues if recoverable
//   - On completion: persists the assembled kit to the Kit document
//   - Supports section-level regeneration by skipping irrelevant stages

import mongoose from 'mongoose';
import { GenerationJob, Kit } from '../models';
import type { IStageResult } from '../models';
import type { PipelineContext, PipelineStage } from './types';
import { ALL_STAGES } from './stages';
import { pipelineEvents } from './events';

export interface RunPipelineInput {
  kitId: string;
  userId: string;
  jd: string;
  companyUrl: string;
  days: number;
  /** Which section to regenerate (null = full generation) */
  regenerateSection?: string | null;
  /** IDs of pinned items to preserve during regeneration */
  pinnedItemIds?: string[];
}

export interface GenerateKitInput {
  jd: string;
  companyUrl?: string;
  days?: number;
}

/**
 * In-process pipeline runner for standalone / batch evaluation.
 * Runs all 13 pipeline stages sequentially without requiring MongoDB or HTTP.
 */
export async function generateKit(input: GenerateKitInput): Promise<any> {
  const { jd, companyUrl = '', days = 5 } = input;
  const ctx: PipelineContext = {
    jd,
    companyUrl,
    days,
    kitId: new mongoose.Types.ObjectId().toString(),
    userId: new mongoose.Types.ObjectId().toString(),
    jobId: new mongoose.Types.ObjectId().toString(),
    errors: [],
    startedAt: new Date(),
  };

  for (const stage of ALL_STAGES) {
    try {
      await stage.run(ctx);
    } catch (err: any) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      ctx.errors.push({
        stage: stage.name,
        error: errorMsg,
        recoverable: true,
      });
      console.warn(`[generateKit] Stage "${stage.name}" warning:`, errorMsg);
    }
  }

  const validationError = ctx.errors.find((e) => e.stage === 'validate_kit');
  if (validationError || !ctx.kit) {
    const mainError =
      validationError?.error ||
      (ctx.errors.length > 0 ? ctx.errors[0].error : 'Failed to generate kit');
    const err: any = new Error(mainError);
    err.code = 'PIPELINE_FAILED';
    throw err;
  }

  return ctx.kit;
}

/**
 * Start the generation pipeline for a kit.
 * Returns the GenerationJob ID immediately — actual work runs asynchronously.
 */
export async function startPipeline(input: RunPipelineInput): Promise<string> {
  const {
    kitId,
    userId,
    jd,
    companyUrl,
    days,
    regenerateSection = null,
    pinnedItemIds = [],
  } = input;

  // Determine which stages to run
  const stagesToRun = regenerateSection
    ? ALL_STAGES.filter(
        (s) =>
          !s.shouldSkipForRegeneration ||
          !s.shouldSkipForRegeneration(regenerateSection)
      )
    : ALL_STAGES;

  // Create the GenerationJob with all stages in 'pending'
  const stageRecords: IStageResult[] = stagesToRun.map((s) => ({
    name: s.name,
    status: 'pending' as const,
  }));

  const job = await GenerationJob.create({
    userId: new mongoose.Types.ObjectId(userId),
    kitId: new mongoose.Types.ObjectId(kitId),
    status: 'queued',
    currentStage: '',
    progress: 0,
    stages: stageRecords,
    regenerateSection,
  });

  // Update kit status to 'generating'
  await Kit.findByIdAndUpdate(kitId, {
    status: 'generating',
    generationJobId: job._id,
  });

  // Run pipeline asynchronously (fire and forget)
  runPipelineAsync(job._id.toString(), stagesToRun, {
    jd,
    companyUrl,
    days,
    kitId,
    userId,
    jobId: job._id.toString(),
    regenerateSection,
    pinnedItemIds: new Set(pinnedItemIds),
    errors: [],
    startedAt: new Date(),
  }).catch((err) => {
    console.error('[Pipeline] Unhandled orchestrator error:', err);
  });

  return job._id.toString();
}

/**
 * The actual async pipeline runner. Updates the GenerationJob as it progresses.
 */
async function runPipelineAsync(
  jobId: string,
  stages: PipelineStage[],
  ctx: PipelineContext
): Promise<void> {
  const totalStages = stages.length;
  const completedStages: string[] = [];
  let hasFailures = false;

  // Mark job as running
  await GenerationJob.findByIdAndUpdate(jobId, {
    status: 'running',
    startedAt: new Date(),
  });

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const progressPercent = Math.round(((i) / totalStages) * 100);

    // Update job: this stage is now running
    await GenerationJob.findByIdAndUpdate(jobId, {
      currentStage: stage.name,
      progress: progressPercent,
      $set: {
        [`stages.${i}.status`]: 'running',
        [`stages.${i}.startedAt`]: new Date(),
      },
    });

    pipelineEvents.emitProgress(jobId, {
      stage: stage.name,
      stageDescription: stage.description,
      progress: progressPercent,
      message: `Running: ${stage.description}`,
      completedStages: [...completedStages],
      totalStages,
      status: 'running',
    });

    try {
      await stage.run(ctx);

      // Mark stage as completed
      await GenerationJob.findByIdAndUpdate(jobId, {
        $set: {
          [`stages.${i}.status`]: 'completed',
          [`stages.${i}.completedAt`]: new Date(),
        },
      });
      completedStages.push(stage.name);

      pipelineEvents.emitProgress(jobId, {
        stage: stage.name,
        stageDescription: stage.description,
        progress: Math.round(((i + 1) / totalStages) * 100),
        message: `Completed: ${stage.description}`,
        completedStages: [...completedStages],
        totalStages,
        status: 'running',
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      hasFailures = true;

      // Record the error
      ctx.errors.push({
        stage: stage.name,
        error: errorMsg,
        recoverable: true,
      });

      // Mark stage as failed
      await GenerationJob.findByIdAndUpdate(jobId, {
        $set: {
          [`stages.${i}.status`]: 'failed',
          [`stages.${i}.completedAt`]: new Date(),
          [`stages.${i}.error`]: errorMsg,
        },
      });

      pipelineEvents.emitProgress(jobId, {
        stage: stage.name,
        stageDescription: stage.description,
        progress: Math.round(((i + 1) / totalStages) * 100),
        message: `Stage error: ${errorMsg}`,
        completedStages: [...completedStages],
        totalStages,
        status: 'running',
      });

      console.error(`[Pipeline] Stage "${stage.name}" failed:`, errorMsg);
      // Continue to next stage — partial results are better than none
    }
  }

  // Final progress
  const finalProgress = 100;
  const finalStatus = hasFailures
    ? ctx.kit
      ? 'partial'   // Had failures but produced some kit
      : 'failed'    // Had failures and no kit
    : 'completed';

  // Persist the assembled kit if we have one
  if (ctx.kit) {
    try {
      await persistKit(ctx);
    } catch (err) {
      console.error('[Pipeline] Failed to persist kit:', err);
      // Update job as failed if we can't save
      await GenerationJob.findByIdAndUpdate(jobId, {
        status: 'failed',
        progress: finalProgress,
        completedAt: new Date(),
        error: {
          code: 'PERSIST_FAILED',
          message: err instanceof Error ? err.message : 'Failed to save kit',
        },
      });

      pipelineEvents.emitProgress(jobId, {
        stage: '',
        stageDescription: 'Saving kit failed',
        progress: finalProgress,
        message: err instanceof Error ? err.message : 'Failed to save kit',
        completedStages,
        totalStages,
        status: 'failed',
      });

      await Kit.findByIdAndUpdate(ctx.kitId, { status: 'failed' });
      return;
    }
  }

  // Update job final status
  await GenerationJob.findByIdAndUpdate(jobId, {
    status: finalStatus,
    progress: finalProgress,
    currentStage: '',
    completedAt: new Date(),
    ...(finalStatus === 'failed' && {
      error: {
        code: 'PIPELINE_FAILED',
        message: ctx.errors.map((e) => `${e.stage}: ${e.error}`).join('; '),
      },
    }),
  });

  // Update kit status
  const kitStatus = finalStatus === 'completed' || finalStatus === 'partial'
    ? 'ready'
    : 'failed';
  await Kit.findByIdAndUpdate(ctx.kitId, { status: kitStatus });

  pipelineEvents.emitProgress(jobId, {
    stage: '',
    stageDescription: 'Pipeline finished',
    progress: finalProgress,
    message:
      finalStatus === 'completed'
        ? 'Kit generated successfully'
        : finalStatus === 'partial'
        ? 'Kit generated with partial research'
        : 'Kit generation failed',
    completedStages,
    totalStages,
    status: finalStatus,
  });

  console.log(
    `[Pipeline] Completed with status "${finalStatus}". ` +
    `${completedStages.length}/${totalStages} stages succeeded.`
  );
}

/**
 * Persist the assembled kit data to the Kit document.
 * During regeneration, merges new data with existing pinned items.
 */
async function persistKit(ctx: PipelineContext): Promise<void> {
  const kit = ctx.kit!;

  const existingKit = await Kit.findById(ctx.kitId);
  if (!existingKit) {
    throw new Error(`Kit ${ctx.kitId} not found`);
  }

  if (ctx.regenerateSection && ctx.pinnedItemIds && ctx.pinnedItemIds.size > 0) {
    // Section regeneration: merge new data, preserving pinned items
    const update = buildMergedUpdate(ctx.regenerateSection, kit, existingKit, ctx.pinnedItemIds);
    await Kit.findByIdAndUpdate(ctx.kitId, {
      ...update,
      $inc: { version: 1 },
    });
  } else {
    // Full generation: replace all kit data
    await Kit.findByIdAndUpdate(ctx.kitId, {
      source: kit.source,
      company_brief: kit.company_brief,
      role: kit.role,
      questions: kit.questions,
      flashcards: kit.flashcards,
      schedule: kit.schedule,
      coverage: kit.coverage,
      $inc: { version: 1 },
    });
  }
}

/**
 * Build a MongoDB update that merges regenerated section data with existing
 * kit data, preserving pinned items.
 */
function buildMergedUpdate(
  section: string,
  newKit: any,
  existingKit: any,
  pinnedIds: Set<string>
): Record<string, any> {
  const update: Record<string, any> = {};

  switch (section) {
    case 'company_brief':
      update.company_brief = newKit.company_brief;
      break;

    case 'questions':
    case 'questions_technical':
    case 'questions_behavioural':
    case 'questions_system_design':
    case 'questions_company_fit': {
      // Keep pinned questions, replace non-pinned
      const pinnedQuestions = (existingKit.questions || []).filter(
        (q: any) => pinnedIds.has(q.id)
      );
      const newQuestions = (newKit.questions || []).filter(
        (q: any) => !pinnedIds.has(q.id)
      );
      update.questions = [...pinnedQuestions, ...newQuestions];
      break;
    }

    case 'flashcards': {
      const pinnedFlashcards = (existingKit.flashcards || []).filter(
        (f: any) => pinnedIds.has(f.id)
      );
      const newFlashcards = (newKit.flashcards || []).filter(
        (f: any) => !pinnedIds.has(f.id)
      );
      update.flashcards = [...pinnedFlashcards, ...newFlashcards];
      break;
    }

    case 'schedule':
      update.schedule = newKit.schedule;
      break;

    default:
      // Unknown section — replace everything
      update.source = newKit.source;
      update.company_brief = newKit.company_brief;
      update.role = newKit.role;
      update.questions = newKit.questions;
      update.flashcards = newKit.flashcards;
      update.schedule = newKit.schedule;
      update.coverage = newKit.coverage;
  }

  // Always update coverage and schedule after any regeneration
  if (section !== 'schedule') {
    update.schedule = newKit.schedule;
  }
  update.coverage = newKit.coverage;

  return update;
}
