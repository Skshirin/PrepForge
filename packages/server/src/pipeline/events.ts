import { EventEmitter } from 'events';
import type { ProgressEvent } from './types';

// ============================================================================
// Pipeline Event Bus
// ============================================================================
//
// In-process event emitter that broadcasts pipeline progress events.
// Used by SSE clients to stream real-time updates as stages run.

class PipelineEventBus extends EventEmitter {
  constructor() {
    super();
    // Allow many simultaneous SSE listeners without warning
    this.setMaxListeners(100);
  }

  emitProgress(jobId: string, event: ProgressEvent): boolean {
    return this.emit(`job:${jobId}`, event);
  }

  onProgress(jobId: string, listener: (event: ProgressEvent) => void): this {
    return this.on(`job:${jobId}`, listener);
  }

  offProgress(jobId: string, listener: (event: ProgressEvent) => void): this {
    return this.off(`job:${jobId}`, listener);
  }
}

export const pipelineEvents = new PipelineEventBus();
