import mongoose, { Schema, Document } from 'mongoose';

// ============================================================================
// GenerationJob Model
// ============================================================================
//
// Tracks the lifecycle of a kit generation run.
// State machine: queued → running → completed | partial | failed

export type JobStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed';

export interface IStageResult {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  /** Optional metadata (e.g. pages crawled, requirements extracted) */
  meta?: Record<string, unknown>;
}

export interface IGenerationJob extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  kitId: mongoose.Types.ObjectId;
  status: JobStatus;
  currentStage: string;
  progress: number; // 0-100
  stages: IStageResult[];
  error?: {
    code: string;
    message: string;
  };
  /** Which section to regenerate (null = full generation) */
  regenerateSection?: string | null;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const stageResultSchema = new Schema<IStageResult>(
  {
    name: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'skipped'],
      default: 'pending',
    },
    startedAt: Date,
    completedAt: Date,
    error: String,
    meta: Schema.Types.Mixed,
  },
  { _id: false }
);

const generationJobSchema = new Schema<IGenerationJob>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    kitId: {
      type: Schema.Types.ObjectId,
      ref: 'Kit',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'partial', 'failed'],
      default: 'queued',
      index: true,
    },
    currentStage: {
      type: String,
      default: '',
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    stages: {
      type: [stageResultSchema],
      default: [],
    },
    error: {
      type: new Schema(
        {
          code: { type: String, required: true },
          message: { type: String, required: true },
        },
        { _id: false }
      ),
      default: null,
    },
    regenerateSection: {
      type: String,
      default: null,
    },
    startedAt: Date,
    completedAt: Date,
  },
  {
    timestamps: true,
  }
);

export const GenerationJob = mongoose.model<IGenerationJob>(
  'GenerationJob',
  generationJobSchema
);
