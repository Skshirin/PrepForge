// ============================================================================
// Generation Job Routes (SSE + Status)
// ============================================================================
//
// GET /api/generation/:jobId/progress — Server-Sent Events (SSE) stream
// GET /api/generation/:jobId          — Polling fallback returning JSON

import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware';
import { GenerationJob } from '../models';
import { pipelineEvents } from '../pipeline/events';
import type { ProgressEvent } from '../pipeline/types';

export const generationRouter = Router();

// All generation routes require authentication
generationRouter.use(requireAuth);

/**
 * GET /api/generation/:jobId/progress
 * Server-Sent Events (SSE) stream for live generation progress.
 *
 * Handles:
 *   - Initial state delivery on connect/refresh
 *   - Real-time updates as stages run
 *   - Keepalive pings to prevent proxy/browser timeout
 *   - Terminal states (completed, partial, failed) close the stream
 *   - Clean up on client disconnect
 */
generationRouter.get('/:jobId/progress', async (req: Request, res: Response) => {
  const jobId = String(req.params.jobId);

  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    res.status(400).json({ error: 'Invalid jobId' });
    return;
  }

  const job = await GenerationJob.findById(jobId);
  if (!job) {
    res.status(404).json({ error: 'Generation job not found' });
    return;
  }

  // Verify ownership
  if (req.user && job.userId.toString() !== req.user._id.toString()) {
    res.status(403).json({ error: 'Forbidden: Access denied to this generation job' });
    return;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) {
    res.flushHeaders();
  }

  // Send initial progress immediately (critical for page refresh / reconnection)
  const initialCompletedStages = (job.stages || [])
    .filter((s) => s.status === 'completed')
    .map((s) => s.name);

  const initialEvent: ProgressEvent = {
    stage: job.currentStage || '',
    stageDescription: job.currentStage || 'Generation job status',
    progress: job.progress || 0,
    message:
      job.status === 'completed'
        ? 'Kit generated successfully'
        : job.status === 'partial'
        ? 'Kit ready with partial research'
        : job.status === 'failed'
        ? job.error?.message || 'Generation failed'
        : `Status: ${job.status}`,
    completedStages: initialCompletedStages,
    totalStages: job.stages?.length || 13,
    status: job.status,
  };

  res.write(`data: ${JSON.stringify(initialEvent)}\n\n`);

  // If already finished, close immediately
  if (['completed', 'partial', 'failed'].includes(job.status)) {
    res.end();
    return;
  }

  // Subscribe to live pipeline progress
  let isClosed = false;

  const onProgress = (event: ProgressEvent) => {
    if (isClosed) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);

    if (['completed', 'partial', 'failed'].includes(event.status)) {
      cleanup();
      res.end();
    }
  };

  pipelineEvents.onProgress(jobId, onProgress);

  // Heartbeat ping every 15s to keep connection alive
  const heartbeatTimer = setInterval(() => {
    if (isClosed) return;
    res.write(': ping\n\n');
  }, 15000);

  const cleanup = () => {
    if (isClosed) return;
    isClosed = true;
    clearInterval(heartbeatTimer);
    pipelineEvents.offProgress(jobId, onProgress);
  };

  req.on('close', cleanup);
  req.on('end', cleanup);
});

/**
 * GET /api/generation/:jobId
 * JSON endpoint for polling generation status.
 */
generationRouter.get('/:jobId', async (req: Request, res: Response) => {
  const jobId = String(req.params.jobId);

  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    res.status(400).json({ error: 'Invalid jobId' });
    return;
  }

  const job = await GenerationJob.findById(jobId);
  if (!job) {
    res.status(404).json({ error: 'Generation job not found' });
    return;
  }

  if (req.user && job.userId.toString() !== req.user._id.toString()) {
    res.status(403).json({ error: 'Forbidden: Access denied to this generation job' });
    return;
  }

  res.json({
    jobId: job._id.toString(),
    kitId: job.kitId.toString(),
    status: job.status,
    progress: job.progress,
    currentStage: job.currentStage,
    stages: job.stages,
    error: job.error,
    regenerateSection: job.regenerateSection,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
  });
});
