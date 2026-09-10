// ============================================================================
// Tests: Pipeline Stages, Context Accumulation & Event Bus
// ============================================================================

import {
  ALL_STAGES,
  PIPELINE_STAGE_NAMES,
  pipelineEvents,
  PipelineContext,
  ProgressEvent,
} from '../pipeline';

describe('Pipeline Stages & Execution', () => {
  it('defines exactly 13 stages matching the pipeline specification', () => {
    expect(PIPELINE_STAGE_NAMES).toHaveLength(13);
    expect(ALL_STAGES).toHaveLength(13);

    const stageNames = ALL_STAGES.map((s) => s.name);
    expect(stageNames).toEqual(PIPELINE_STAGE_NAMES);
  });

  it('runs all stub stages sequentially and accumulates a complete Kit in context', async () => {
    const ctx: PipelineContext = {
      jd: 'Senior Software Engineer with TypeScript, Distributed Systems, and Node.js experience.',
      companyUrl: 'https://example.com',
      days: 5,
      kitId: '507f1f77bcf86cd799439011',
      userId: '507f1f77bcf86cd799439012',
      jobId: '507f1f77bcf86cd799439013',
      errors: [],
      startedAt: new Date(),
    };

    for (const stage of ALL_STAGES) {
      await stage.run(ctx);
    }

    // Context should have all Appendix A fields populated
    expect(ctx.source).toBeDefined();
    expect(ctx.source?.company_url).toBe('https://example.com');
    expect(ctx.source?.jd_chars).toBe(ctx.jd.length);

    expect(ctx.role).toBeDefined();
    expect(ctx.companyBrief).toBeDefined();
    expect(ctx.schedule).toBeDefined();
    expect(ctx.schedule?.days_available).toBe(5);
    expect(ctx.schedule?.days).toHaveLength(5); // ScheduleAllocator deterministic allocation

    expect(ctx.coverage).toBeDefined();
    expect(ctx.kit).toBeDefined();
    expect(ctx.kit?.source).toBeDefined();
    expect(ctx.kit?.schedule.days).toHaveLength(5);
    expect(ctx.errors).toHaveLength(0);
  });

  it('correctly filters stages for section regeneration', () => {
    // Test skip logic for 'questions_technical'
    const techStages = ALL_STAGES.filter(
      (s) => !s.shouldSkipForRegeneration || !s.shouldSkipForRegeneration('questions_technical')
    );

    const techNames = techStages.map((s) => s.name);
    expect(techNames).toContain('generate_questions_technical');
    expect(techNames).not.toContain('crawl_company_site');
    expect(techNames).not.toContain('generate_questions_behavioural');
    expect(techNames).not.toContain('generate_flashcards');
    // Always-run stages
    expect(techNames).toContain('coverage_check');
    expect(techNames).toContain('build_schedule');
    expect(techNames).toContain('validate_kit');
  });

  it('pipeline event bus correctly publishes and subscribes to events', (done) => {
    const testJobId = 'test-job-456';
    const receivedEvents: ProgressEvent[] = [];

    const listener = (event: ProgressEvent) => {
      receivedEvents.push(event);
      if (event.status === 'completed') {
        expect(receivedEvents).toHaveLength(2);
        expect(receivedEvents[0].progress).toBe(50);
        expect(receivedEvents[1].progress).toBe(100);
        pipelineEvents.offProgress(testJobId, listener);
        done();
      }
    };

    pipelineEvents.onProgress(testJobId, listener);

    pipelineEvents.emitProgress(testJobId, {
      stage: 'extract_requirements',
      stageDescription: 'Extracting requirements',
      progress: 50,
      message: 'Halfway through',
      completedStages: ['extract_requirements'],
      totalStages: 13,
      status: 'running',
    });

    pipelineEvents.emitProgress(testJobId, {
      stage: '',
      stageDescription: 'Done',
      progress: 100,
      message: 'Finished',
      completedStages: ['extract_requirements', 'validate_kit'],
      totalStages: 13,
      status: 'completed',
    });
  });
});
