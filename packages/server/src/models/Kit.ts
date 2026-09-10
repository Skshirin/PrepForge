import mongoose, { Schema, Document } from 'mongoose';
import type {
  KitSource,
  CompanyBrief,
  Role,
  Question,
  Flashcard,
  Schedule,
  ScheduleDay,
  Coverage,
  Requirement,
} from '@trao/shared';

// ============================================================================
// Kit Model
// ============================================================================
//
// Embeds the full Appendix A structure plus application metadata:
//   - status: draft | generating | ready | failed
//   - editState: tracks which items are pinned/user-edited
//   - practiceState: tracks flashcard practice progress
//   - generationJobId: link to current/last generation job
//   - version: optimistic concurrency control

export type KitStatus = 'draft' | 'generating' | 'ready' | 'failed';

export interface IPinnedItem {
  editedAt: Date;
  /** Which section this item belongs to */
  section: 'questions' | 'flashcards' | 'company_brief' | 'schedule';
}

export interface IEditState {
  /** Map of item ID → pin metadata. Pinned items survive regeneration. */
  pinnedItems: Record<string, IPinnedItem>;
}

export interface IFlashcardProgress {
  flashcardId: string;
  /** 1 = not confident, 2 = somewhat, 3 = confident */
  confidence: number;
  lastReviewedAt: Date;
  reviewCount: number;
}

export interface IPracticeState {
  flashcardProgress: IFlashcardProgress[];
  lastSessionAt?: Date;
  totalSessions: number;
}

export interface IKit extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;

  // ---- Appendix A structure (embedded) ---
  source: KitSource;
  company_brief: CompanyBrief;
  role: Role;
  questions: Question[];
  flashcards: Flashcard[];
  schedule: Schedule;
  coverage: Coverage;

  // ---- Application metadata ---
  status: KitStatus;
  generationJobId?: mongoose.Types.ObjectId;
  editState: IEditState;
  practiceState: IPracticeState;
  version: number;

  // ---- Original input (for regeneration) ---
  originalJd: string;
  originalCompanyUrl: string;
  originalDays: number;

  createdAt: Date;
  updatedAt: Date;
}

// ---- Sub-schemas -----------------------------------------------------------

const requirementSubSchema = new Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    kind: { type: String, enum: ['technical', 'behavioural', 'domain'], required: true },
    priority: { type: String, enum: ['must', 'nice'], required: true },
  },
  { _id: false }
);

const questionSubSchema = new Schema(
  {
    id: { type: String, required: true },
    requirement_ids: { type: [String], default: [] },
    category: {
      type: String,
      enum: ['technical', 'behavioural', 'system-design', 'company-fit'],
      required: true,
    },
    prompt: { type: String, required: true },
    answer_outline: { type: String, default: '' },
    difficulty: { type: Number, enum: [1, 2, 3], required: true },
  },
  { _id: false }
);

const flashcardSubSchema = new Schema(
  {
    id: { type: String, required: true },
    front: { type: String, required: true },
    back: { type: String, required: true },
    requirement_ids: { type: [String], default: [] },
  },
  { _id: false }
);

const scheduleDaySubSchema = new Schema(
  {
    day: { type: Number, required: true },
    focus: { type: String, required: true },
    question_ids: { type: [String], default: [] },
    minutes: { type: Number, required: true },
  },
  { _id: false }
);

const pinnedItemSubSchema = new Schema(
  {
    editedAt: { type: Date, required: true },
    section: {
      type: String,
      enum: ['questions', 'flashcards', 'company_brief', 'schedule'],
      required: true,
    },
  },
  { _id: false }
);

const flashcardProgressSubSchema = new Schema(
  {
    flashcardId: { type: String, required: true },
    confidence: { type: Number, min: 1, max: 3, required: true },
    lastReviewedAt: { type: Date, required: true },
    reviewCount: { type: Number, default: 0 },
  },
  { _id: false }
);

// ---- Main Kit schema -------------------------------------------------------

const kitSchema = new Schema<IKit>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Appendix A: source
    source: {
      company: { type: String, default: '' },
      company_url: { type: String, default: '' },
      role: { type: String, default: '' },
      location: { type: String, default: '' },
      jd_chars: { type: Number, default: 0 },
      researched_at: { type: String, default: '' },
      pages_used: { type: [String], default: [] },
    },

    // Appendix A: company_brief
    company_brief: {
      summary: { type: String, default: '' },
      what_they_do: { type: String, default: '' },
      sources: { type: [String], default: [] },
    },

    // Appendix A: role
    role: {
      title: { type: String, default: '' },
      seniority: { type: String, default: '' },
      responsibilities: { type: [String], default: [] },
      requirements: { type: [requirementSubSchema], default: [] },
    },

    // Appendix A: questions
    questions: { type: [questionSubSchema], default: [] },

    // Appendix A: flashcards
    flashcards: { type: [flashcardSubSchema], default: [] },

    // Appendix A: schedule
    schedule: {
      days_available: { type: Number, default: 0 },
      days: { type: [scheduleDaySubSchema], default: [] },
    },

    // Appendix A: coverage
    coverage: {
      uncovered_requirement_ids: { type: [String], default: [] },
      passes: { type: Number, default: 0 },
    },

    // Application metadata
    status: {
      type: String,
      enum: ['draft', 'generating', 'ready', 'failed'],
      default: 'draft',
      index: true,
    },
    generationJobId: {
      type: Schema.Types.ObjectId,
      ref: 'GenerationJob',
    },
    editState: {
      pinnedItems: { type: Schema.Types.Mixed, default: {} },
    },
    practiceState: {
      flashcardProgress: { type: [flashcardProgressSubSchema], default: [] },
      lastSessionAt: Date,
      totalSessions: { type: Number, default: 0 },
    },
    version: {
      type: Number,
      default: 1,
    },

    // Original input for regeneration
    originalJd: { type: String, default: '' },
    originalCompanyUrl: { type: String, default: '' },
    originalDays: { type: Number, default: 5 },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient user kit listing
kitSchema.index({ userId: 1, createdAt: -1 });

export const Kit = mongoose.model<IKit>('Kit', kitSchema);
