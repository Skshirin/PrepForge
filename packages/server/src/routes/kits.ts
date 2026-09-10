// ============================================================================
// Kit CRUD & Generation Routes
// ============================================================================

import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { requireAuth } from '../middleware';
import { Kit, GenerationJob } from '../models';
import { startPipeline } from '../pipeline/orchestrator';

export const kitRouter = Router();

// All kit routes require authentication
kitRouter.use(requireAuth);

// ---- Validation Schemas ----------------------------------------------------

const createKitSchema = z.object({
  jd: z.string().min(10, 'Job description must be at least 10 characters'),
  companyUrl: z
    .string()
    .optional()
    .default('')
    .transform((val) => {
      const trimmed = (val || '').trim();
      if (!trimmed) return '';
      let urlStr = trimmed;
      if (!/^https?:\/\//i.test(urlStr)) {
        urlStr = `https://${urlStr}`;
      }
      try {
        new URL(urlStr);
        return urlStr;
      } catch {
        return '';
      }
    }),
  days: z.number().int().min(1).max(60).optional().default(5),
  roleTitle: z.string().optional(),
});

const updateKitSchema = z.object({
  version: z.number().int().optional(),
  company_brief: z.any().optional(),
  role: z.any().optional(),
  questions: z.array(z.any()).optional(),
  flashcards: z.array(z.any()).optional(),
  schedule: z.any().optional(),
  coverage: z.any().optional(),
  editState: z.any().optional(),
  practiceState: z.any().optional(),
});

const regenerateSchema = z.object({
  section: z.enum([
    'company_brief',
    'questions',
    'questions_technical',
    'questions_behavioural',
    'questions_system_design',
    'questions_company_fit',
    'flashcards',
    'schedule',
  ]).nullable().optional(),
  pinnedItemIds: z.array(z.string()).optional().default([]),
});

const exportSchema = z.object({
  format: z.enum(['json', 'markdown']).optional().default('json'),
});

// ---- Routes ----------------------------------------------------------------

/**
 * POST /api/kits
 * Trigger interview kit generation asynchronously.
 * Returns { kitId, jobId } immediately with HTTP 202 Accepted.
 */
kitRouter.post('/', async (req: Request, res: Response) => {
  const parseResult = createKitSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.issues,
    });
    return;
  }

  const { jd, companyUrl, days, roleTitle } = parseResult.data;
  const userId = req.user!._id;

  // Create initial Kit document
  const kit = await Kit.create({
    userId,
    status: 'generating',
    originalJd: jd,
    originalCompanyUrl: companyUrl,
    originalDays: days,
    source: {
      company: '',
      company_url: companyUrl,
      role: roleTitle || '',
      location: '',
      jd_chars: jd.length,
      researched_at: new Date().toISOString(),
      pages_used: [],
    },
    role: {
      title: roleTitle || 'Pending Generation',
      seniority: '',
      responsibilities: [],
      requirements: [],
    },
    questions: [],
    flashcards: [],
    schedule: {
      days_available: days,
      days: [],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 0,
    },
    version: 1,
  });

  // Launch pipeline asynchronously
  const jobId = await startPipeline({
    kitId: kit._id.toString(),
    userId: userId.toString(),
    jd,
    companyUrl,
    days,
  });

  res.status(202).json({
    message: 'Kit generation queued',
    kitId: kit._id.toString(),
    jobId,
  });
});

/**
 * GET /api/kits
 * List all kits belonging to current user.
 */
kitRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!._id;

  const kits = await Kit.find({ userId })
    .select('_id status source role schedule version createdAt updatedAt generationJobId')
    .sort({ createdAt: -1 })
    .lean();

  const formatted = kits.map((k) => ({
    id: k._id.toString(),
    status: k.status,
    company: k.source?.company || '',
    companyUrl: k.source?.company_url || '',
    roleTitle: k.role?.title || '',
    days: k.schedule?.days_available || 0,
    version: k.version,
    generationJobId: k.generationJobId?.toString(),
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
  }));

  res.json({ kits: formatted });
});

/**
 * GET /api/kits/:id
 * Retrieve a full kit by ID.
 */
kitRouter.get('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid kit ID' });
    return;
  }

  const kit = await Kit.findById(id);
  if (!kit) {
    res.status(404).json({ error: 'Kit not found' });
    return;
  }

  if (kit.userId.toString() !== req.user!._id.toString()) {
    res.status(403).json({ error: 'Forbidden: You do not own this kit' });
    return;
  }

  res.json({ kit });
});

/**
 * PUT /api/kits/:id
 * Update kit with optimistic concurrency control.
 */
kitRouter.put('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid kit ID' });
    return;
  }

  const parseResult = updateKitSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.issues,
    });
    return;
  }

  const kit = await Kit.findById(id);
  if (!kit) {
    res.status(404).json({ error: 'Kit not found' });
    return;
  }

  if (kit.userId.toString() !== req.user!._id.toString()) {
    res.status(403).json({ error: 'Forbidden: You do not own this kit' });
    return;
  }

  const data = parseResult.data;

  // Optimistic concurrency control check
  if (data.version !== undefined && data.version !== kit.version) {
    res.status(409).json({
      error: 'Conflict: Kit was modified by another session',
      currentVersion: kit.version,
    });
    return;
  }

  // Apply updates
  if (data.company_brief !== undefined) kit.company_brief = data.company_brief;
  if (data.role !== undefined) kit.role = data.role;
  if (data.questions !== undefined) kit.questions = data.questions;
  if (data.flashcards !== undefined) kit.flashcards = data.flashcards;
  if (data.schedule !== undefined) kit.schedule = data.schedule;
  if (data.coverage !== undefined) kit.coverage = data.coverage;
  if (data.editState !== undefined) kit.editState = data.editState;
  if (data.practiceState !== undefined) kit.practiceState = data.practiceState;

  kit.version += 1;
  await kit.save();

  res.json({
    message: 'Kit updated successfully',
    kit,
  });
});

/**
 * POST /api/kits/:id/regenerate
 * Trigger section-level or full regeneration of an existing kit.
 */
kitRouter.post('/:id/regenerate', async (req: Request, res: Response) => {
  const id = String(req.params.id);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid kit ID' });
    return;
  }

  const parseResult = regenerateSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.issues,
    });
    return;
  }

  const kit = await Kit.findById(id);
  if (!kit) {
    res.status(404).json({ error: 'Kit not found' });
    return;
  }

  if (kit.userId.toString() !== req.user!._id.toString()) {
    res.status(403).json({ error: 'Forbidden: You do not own this kit' });
    return;
  }

  const { section, pinnedItemIds } = parseResult.data;

  // Launch pipeline for regeneration
  const jobId = await startPipeline({
    kitId: kit._id.toString(),
    userId: req.user!._id.toString(),
    jd: kit.originalJd,
    companyUrl: kit.originalCompanyUrl,
    days: kit.originalDays,
    regenerateSection: section || null,
    pinnedItemIds: pinnedItemIds || [],
  });

  res.status(202).json({
    message: `Regeneration queued for ${section || 'full kit'}`,
    jobId,
    kitId: kit._id.toString(),
  });
});

/**
 * POST /api/kits/:id/export
 * Export kit as JSON or Markdown.
 */
kitRouter.post('/:id/export', async (req: Request, res: Response) => {
  const id = String(req.params.id);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid kit ID' });
    return;
  }

  const parseResult = exportSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.issues,
    });
    return;
  }

  const kit = await Kit.findById(id);
  if (!kit) {
    res.status(404).json({ error: 'Kit not found' });
    return;
  }

  if (kit.userId.toString() !== req.user!._id.toString()) {
    res.status(403).json({ error: 'Forbidden: You do not own this kit' });
    return;
  }

  const { format } = parseResult.data;

  if (format === 'markdown') {
    const md = formatKitMarkdown(kit);
    const company = (kit.source?.company || 'interview').toLowerCase().replace(/[^a-z0-9]/g, '-');
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${company}-interview-kit.md"`);
    res.send(md);
    return;
  }

  // Default JSON export matching Appendix A
  const jsonExport = {
    source: kit.source,
    company_brief: kit.company_brief,
    role: kit.role,
    questions: kit.questions,
    flashcards: kit.flashcards,
    schedule: kit.schedule,
    coverage: kit.coverage,
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="interview-kit-${id}.json"`);
  res.json(jsonExport);
});

/**
 * DELETE /api/kits/:id
 * Delete a kit and associated generation jobs.
 */
kitRouter.delete('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);

  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid kit ID' });
    return;
  }

  const kit = await Kit.findById(id);
  if (!kit) {
    res.status(404).json({ error: 'Kit not found' });
    return;
  }

  if (kit.userId.toString() !== req.user!._id.toString()) {
    res.status(403).json({ error: 'Forbidden: You do not own this kit' });
    return;
  }

  await Kit.findByIdAndDelete(id);
  await GenerationJob.deleteMany({ kitId: kit._id });

  res.json({ success: true, message: 'Kit deleted successfully' });
});

// ---- Markdown Formatter Helper ---------------------------------------------

function formatKitMarkdown(kit: any): string {
  const lines: string[] = [];
  const company = kit.source?.company || 'Company';
  const roleTitle = kit.role?.title || 'Target Role';

  lines.push(`# Interview Preparation Kit: ${roleTitle} at ${company}`);
  lines.push('');
  lines.push(`- **Website:** ${kit.source?.company_url || 'N/A'}`);
  lines.push(`- **Preparation Schedule:** ${kit.schedule?.days_available || 0} days`);
  lines.push(`- **Researched At:** ${kit.source?.researched_at || 'N/A'}`);
  lines.push('');

  // Company Brief
  lines.push('## 1. Company Brief');
  lines.push('');
  lines.push(kit.company_brief?.summary || 'No summary available.');
  lines.push('');
  lines.push('### What They Do');
  lines.push('');
  lines.push(kit.company_brief?.what_they_do || 'No details available.');
  lines.push('');

  // Role & Requirements
  lines.push(`## 2. Role Overview: ${roleTitle} (${kit.role?.seniority || 'Unspecified'})`);
  lines.push('');
  if (kit.role?.responsibilities?.length) {
    lines.push('### Responsibilities');
    kit.role.responsibilities.forEach((resp: string) => {
      lines.push(`- ${resp}`);
    });
    lines.push('');
  }

  if (kit.role?.requirements?.length) {
    lines.push('### Requirements');
    kit.role.requirements.forEach((req: any) => {
      lines.push(`- **[${req.priority?.toUpperCase()}]** (${req.kind}) ${req.text} \`[${req.id}]\``);
    });
    lines.push('');
  }

  // Schedule
  if (kit.schedule?.days?.length) {
    lines.push(`## 3. Preparation Schedule (${kit.schedule.days_available} Days)`);
    lines.push('');
    kit.schedule.days.forEach((d: any) => {
      lines.push(`### Day ${d.day}: ${d.focus} (${d.minutes} mins)`);
      if (d.question_ids?.length) {
        lines.push(`- **Questions to practice:** ${d.question_ids.join(', ')}`);
      }
      lines.push('');
    });
  }

  // Questions
  if (kit.questions?.length) {
    lines.push('## 4. Interview Questions');
    lines.push('');
    kit.questions.forEach((q: any, idx: number) => {
      lines.push(`### Question ${idx + 1} [${q.category?.toUpperCase()}]`);
      lines.push(`**Prompt:** ${q.prompt}`);
      lines.push(`- **Difficulty:** ${'★'.repeat(q.difficulty || 1)} (Level ${q.difficulty})`);
      lines.push(`- **ID:** \`${q.id}\``);
      if (q.requirement_ids?.length) {
        lines.push(`- **Addresses Requirements:** ${q.requirement_ids.join(', ')}`);
      }
      if (q.answer_outline) {
        lines.push('');
        lines.push('**Answer Outline / Key Points:**');
        lines.push(q.answer_outline);
      }
      lines.push('');
    });
  }

  // Flashcards
  if (kit.flashcards?.length) {
    lines.push('## 5. Flashcards');
    lines.push('');
    kit.flashcards.forEach((f: any, idx: number) => {
      lines.push(`### Flashcard ${idx + 1}`);
      lines.push(`**Front:** ${f.front}`);
      lines.push(`**Back:** ${f.back}`);
      lines.push('');
    });
  }

  // Coverage
  lines.push('## 6. Coverage Report');
  lines.push('');
  lines.push(`- **Coverage verification passes:** ${kit.coverage?.passes || 0}`);
  if (kit.coverage?.uncovered_requirement_ids?.length) {
    lines.push(`- **Uncovered requirements:** ${kit.coverage.uncovered_requirement_ids.join(', ')}`);
  } else {
    lines.push('- **Status:** 100% of Must-Have requirements are covered by questions.');
  }
  lines.push('');

  return lines.join('\n');
}
