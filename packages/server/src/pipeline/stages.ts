// ============================================================================
// Real Pipeline Stages
// ============================================================================
//
// Implements all 13 pipeline stages:
//   1. extract_requirements: LLM extraction + fuzzy substring check (threshold 0.7)
//   2. crawl_company_site: Cheerio + BFS site crawler
//   3. find_hiring_page: LLM identification of hiring process pages
//   4. search_public_discussion: Google CSE + Reddit JSON API fallback
//   5. generate_company_brief: LLM brief from crawled pages
//   6-9. generate_questions: 4 separate LLM calls (technical, behavioural, system design, company fit)
//   10. generate_flashcards: LLM flashcards mapped to requirement IDs
//   11. coverage_check: Deterministic coverageChecker + gap-filling loop (up to 3 passes)
//   12. build_schedule: Deterministic scheduleAllocator (integer minutes, day count constraint)
//   13. validate_kit: Zod validation with assembly retry

import { z } from 'zod';
import { URL } from 'url';
import type { PipelineStage, PipelineContext } from './types';
import type { Question, Requirement, Flashcard, Kit } from '@trao/shared';
import { validateKit } from '@trao/shared';
import { callLLM } from '../services/llm';
import { crawlSite } from '../services/scraper';
import { searchPublicDiscussion } from '../services/discussion-search';
import { checkCoverage } from '../services/coverage-checker';
import { allocateSchedule } from '../services/schedule-allocator';

// ---- Fuzzy Substring Matcher (threshold 0.7) -------------------------------

export function isFuzzySubstring(query: string, text: string, threshold = 0.7): boolean {
  if (!query || !text) return false;

  const normQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const normText = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Direct substring
  if (normText.includes(normQuery)) {
    return true;
  }

  // 2. Token overlap ratio
  const queryWords = normQuery.split(' ').filter((w) => w.length > 2);
  if (queryWords.length === 0) return true;

  let matchedWords = 0;
  for (const word of queryWords) {
    if (normText.includes(word)) {
      matchedWords++;
    }
  }

  const ratio = matchedWords / queryWords.length;
  return ratio >= threshold;
}

// ---- Zod Schemas for LLM Generation ---------------------------------------

const extractRequirementsSchema = z.object({
  company: z.string().optional().default(''),
  role: z.object({
    title: z.string(),
    seniority: z.string(),
    responsibilities: z.array(z.string()).default([]),
  }),
  requirements: z.array(
    z.object({
      text: z.string(),
      kind: z.enum(['technical', 'behavioural', 'domain']),
      priority: z.enum(['must', 'nice']),
    })
  ),
});

const findHiringPageSchema = z.object({
  hiringPageUrls: z.array(z.string()).default([]),
  hiringProcessSummary: z.string().default(''),
});

const companyBriefSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
  sources: z.array(z.string()).default([]),
});

const questionItemSchema = z.object({
  requirement_ids: z.array(z.string()).default([]),
  prompt: z.string(),
  answer_outline: z.string().default(''),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

const questionsCategorySchema = z.object({
  questions: z.array(questionItemSchema),
});

const flashcardsSchema = z.object({
  flashcards: z.array(
    z.object({
      front: z.string(),
      back: z.string(),
      requirement_ids: z.array(z.string()).default([]),
    })
  ),
});

// ---- Stage 1: Extract Requirements ----------------------------------------

export const extractRequirementsStage: PipelineStage = {
  name: 'extract_requirements',
  description: 'Extracting requirements from job description',
  async run(ctx: PipelineContext) {
    console.log('[Pipeline] Stage 1: extract_requirements');

    let rawCompany = '';
    let roleTitle = 'Software Engineer';
    let seniority = 'Mid-Senior';
    let responsibilities: string[] = [];
    let candidateRequirements: Array<{
      text: string;
      kind: 'technical' | 'behavioural' | 'domain';
      priority: 'must' | 'nice';
    }> = [];

    if (process.env.GEMINI_API_KEY) {
      const systemPrompt =
        'Only extract requirements explicitly stated. Do not infer or invent. If few, say so. ' +
        'Extract role title, seniority, responsibilities, company name (if present), and all technical, behavioural, and domain requirements.';

      const userPrompt = `Job Description:\n${ctx.jd}`;

      try {
        const result = await callLLM(systemPrompt, userPrompt, extractRequirementsSchema);
        rawCompany = result.data.company || '';
        roleTitle = result.data.role.title || roleTitle;
        seniority = result.data.role.seniority || seniority;
        candidateRequirements = (result.data.requirements || []).map((r) => ({
          text: r.text || '',
          kind: (r.kind || 'technical') as 'technical' | 'behavioural' | 'domain',
          priority: (r.priority || 'must') as 'must' | 'nice',
        }));
      } catch (err) {
        console.warn('[Pipeline] LLM extraction error, using fallback parser:', err);
      }
    }

    // Heuristic fallback if LLM not configured or failed
    if (candidateRequirements.length === 0) {
      const lines = ctx.jd
        .split('\n')
        .map((l) => l.trim().replace(/^[-*•]\s*/, ''))
        .filter((l) => l.length > 15);

      candidateRequirements = lines.slice(0, 8).map((line, idx) => {
        const lower = line.toLowerCase();
        let kind: 'technical' | 'behavioural' | 'domain' = 'technical';
        if (lower.includes('team') || lower.includes('communicat') || lower.includes('lead') || lower.includes('collaborat')) {
          kind = 'behavioural';
        } else if (lower.includes('business') || lower.includes('domain') || lower.includes('industry')) {
          kind = 'domain';
        }

        const priority: 'must' | 'nice' = idx < 5 || lower.includes('required') || lower.includes('must') ? 'must' : 'nice';
        return { text: line, kind, priority };
      });
    }

    // Validate each requirement text exists in the original JD (fuzzy substring check, threshold 0.7)
    const validatedReqs: Requirement[] = [];
    let reqIndex = 1;

    for (const req of candidateRequirements) {
      if (isFuzzySubstring(req.text, ctx.jd, 0.7)) {
        validatedReqs.push({
          id: `req-${reqIndex++}`,
          text: req.text,
          kind: req.kind,
          priority: req.priority,
        });
      }
    }

    // Ensure at least 1 must-have requirement exists
    if (validatedReqs.length === 0) {
      validatedReqs.push({
        id: 'req-1',
        text: ctx.jd.slice(0, 100),
        kind: 'technical',
        priority: 'must',
      });
    }

    ctx.requirements = validatedReqs;
    ctx.role = {
      title: roleTitle,
      seniority,
      responsibilities,
      requirements: validatedReqs,
    };

    ctx.source = {
      company: rawCompany || (ctx.companyUrl ? new URL(ctx.companyUrl).hostname.replace(/^www\./, '').split('.')[0] : 'Company'),
      company_url: ctx.companyUrl,
      role: roleTitle,
      location: '',
      jd_chars: ctx.jd.length,
      researched_at: new Date().toISOString(),
      pages_used: ctx.pagesUsed || [],
    };
  },
  shouldSkipForRegeneration: (section) =>
    !['questions', 'flashcards', 'schedule'].includes(section),
};

// ---- Stage 2: Crawl Company Site -------------------------------------------

export const crawlCompanySiteStage: PipelineStage = {
  name: 'crawl_company_site',
  description: 'Crawling company website',
  async run(ctx: PipelineContext) {
    console.log('[Pipeline] Stage 2: crawl_company_site');

    if (!ctx.companyUrl || ctx.companyUrl.trim().length === 0) {
      ctx.crawledPages = [];
      ctx.pagesUsed = ctx.pagesUsed || [];
      return;
    }

    try {
      const result = await crawlSite(ctx.companyUrl, 20, 2);
      ctx.crawledPages = result.pages.map((p) => ({
        url: p.url,
        title: p.title,
        content: p.text,
        isHiringPage: false,
      }));

      ctx.pagesUsed = Array.from(new Set([...(ctx.pagesUsed || []), ...result.pagesUsed]));

      if (result.pages.length === 0) {
        ctx.crawlFailed = true;
      }
    } catch (err: any) {
      console.warn(`[Pipeline] crawlSite failed: ${err.message}`);
      ctx.crawlFailed = true;
      ctx.errors.push({
        stage: 'crawl_company_site',
        error: err.message,
        recoverable: true,
      });
      // Do not abort pipeline
    }
  },
  shouldSkipForRegeneration: (section) => section !== 'company_brief',
};

// ---- Stage 3: Find Hiring Page ---------------------------------------------

export const findHiringPageStage: PipelineStage = {
  name: 'find_hiring_page',
  description: 'Looking for hiring and careers pages',
  async run(ctx: PipelineContext) {
    console.log('[Pipeline] Stage 3: find_hiring_page');

    if (!ctx.crawledPages || ctx.crawledPages.length === 0) {
      ctx.hiringPageFound = false;
      return;
    }

    if (process.env.GEMINI_API_KEY) {
      const systemPrompt =
        'Identify which of the provided URLs and titles relate to the company hiring, interview process, or culture. ' +
        'If none contain hiring process info, return empty array.';

      const pagesList = ctx.crawledPages.map((p, idx) => `[${idx}] Title: ${p.title} | URL: ${p.url}`).join('\n');

      try {
        const res = await callLLM(systemPrompt, `Pages:\n${pagesList}`, findHiringPageSchema);
        const matchedUrls = new Set(res.data.hiringPageUrls);

        for (const page of ctx.crawledPages) {
          if (matchedUrls.has(page.url)) {
            page.isHiringPage = true;
          }
        }

        ctx.hiringPageFound = matchedUrls.size > 0;
        return;
      } catch (err: any) {
        console.warn('[Pipeline] LLM find hiring page failed:', err.message);
      }
    }

    // Heuristic fallback
    let found = false;
    for (const page of ctx.crawledPages) {
      const lower = (page.url + ' ' + page.title).toLowerCase();
      if (lower.includes('career') || lower.includes('job') || lower.includes('hiring') || lower.includes('interview')) {
        page.isHiringPage = true;
        found = true;
      }
    }
    ctx.hiringPageFound = found;
  },
  shouldSkipForRegeneration: (section) => section !== 'company_brief',
};

// ---- Stage 4: Search Public Discussion -------------------------------------

export const searchPublicDiscussionStage: PipelineStage = {
  name: 'search_public_discussion',
  description: 'Searching for public interview experiences',
  async run(ctx: PipelineContext) {
    console.log('[Pipeline] Stage 4: search_public_discussion');

    const companyName =
      ctx.source?.company ||
      (ctx.companyUrl ? new URL(ctx.companyUrl).hostname.replace(/^www\./, '').split('.')[0] : '');

    try {
      const discussionResults = await searchPublicDiscussion(companyName);
      ctx.publicDiscussion = discussionResults.map((d) => ({
        url: d.url,
        content: d.content,
        source: d.source,
      }));

      // Record any fetched discussion URLs in pagesUsed
      const discussionUrls = discussionResults.map((d) => d.url);
      ctx.pagesUsed = Array.from(new Set([...(ctx.pagesUsed || []), ...discussionUrls]));
    } catch (err: any) {
      console.warn(`[Pipeline] searchPublicDiscussion error: ${err.message}`);
      ctx.errors.push({
        stage: 'search_public_discussion',
        error: err.message,
        recoverable: true,
      });
      ctx.publicDiscussion = [];
      // Continue pipeline
    }
  },
  shouldSkipForRegeneration: (section) => section !== 'company_brief',
};

// ---- Stage 5: Generate Company Brief ---------------------------------------

export const generateCompanyBriefStage: PipelineStage = {
  name: 'generate_company_brief',
  description: 'Generating company brief',
  async run(ctx: PipelineContext) {
    console.log('[Pipeline] Stage 5: generate_company_brief');

    // Assemble text from crawled pages and discussion
    const crawledSnippets = (ctx.crawledPages || [])
      .slice(0, 5)
      .map((p) => `URL: ${p.url}\nTitle: ${p.title}\n${p.content.slice(0, 1500)}`)
      .join('\n\n');

    const discussionSnippets = (ctx.publicDiscussion || [])
      .map((d) => `Discussion (${d.source}): ${d.content.slice(0, 1000)}`)
      .join('\n\n');

    const combinedResearch = `${crawledSnippets}\n\n${discussionSnippets}`.trim();

    if (process.env.GEMINI_API_KEY && combinedResearch.length > 50) {
      const systemPrompt =
        'Only describe what is in the provided pages. If insufficient, say so honestly. ' +
        'Generate a concise company summary, an explanation of what they do, and list of sources used.';

      const userPrompt = `Research Data for ${ctx.source?.company || 'Target Company'}:\n${combinedResearch}`;

      try {
        const result = await callLLM(systemPrompt, userPrompt, companyBriefSchema);
        ctx.companyBrief = {
          summary: result.data.summary,
          what_they_do: result.data.what_they_do,
          sources: (result.data.sources && result.data.sources.length > 0) ? result.data.sources : (ctx.pagesUsed || []),
        };
        return;
      } catch (err: any) {
        console.warn('[Pipeline] LLM company brief generation error:', err.message);
      }
    }

    // Fallback if no research available or LLM skipped
    ctx.companyBrief = {
      summary: ctx.crawlFailed
        ? 'Website research could not be completed. Brief generated from job description context.'
        : `Company profile for ${ctx.source?.company || 'organization'}.`,
      what_they_do: 'Technology solutions and engineering services.',
      sources: ctx.pagesUsed && ctx.pagesUsed.length > 0 ? ctx.pagesUsed : [ctx.companyUrl].filter(Boolean),
    };
  },
  shouldSkipForRegeneration: (section) => section !== 'company_brief',
};

// ---- Stages 6a–6d: Generate Questions per Category -------------------------
// Four separate LLM calls with distinct system prompts and globally sequential question IDs (q1, q2, ...)

async function generateCategoryQuestions(
  ctx: PipelineContext,
  category: 'technical' | 'behavioural' | 'system-design' | 'company-fit',
  systemPrompt: string,
  startIdNumber: number
): Promise<Question[]> {
  const relevantReqs = (ctx.requirements || []).filter((r) => {
    if (category === 'technical') return r.kind === 'technical' || r.kind === 'domain';
    if (category === 'behavioural') return r.kind === 'behavioural';
    if (category === 'system-design') return r.kind === 'technical' || r.kind === 'domain';
    return true;
  });

  const hiringPages = (ctx.crawledPages || []).filter((p) => p.isHiringPage);
  const hiringContext = hiringPages.map((p) => p.content.slice(0, 500)).join(' ');

  if (process.env.GEMINI_API_KEY) {
    const userPrompt =
      `Role: ${ctx.role?.title || 'Engineer'}\n` +
      `Category: ${category}\n` +
      `Relevant Requirements:\n${JSON.stringify(relevantReqs, null, 2)}\n` +
      (hiringContext ? `Hiring Process Info:\n${hiringContext}\n` : '') +
      `Generate 2 to 4 high-yield interview questions for this category. Assign difficulty 1, 2, or 3. Outline key talking points.`;

    try {
      const res = await callLLM(systemPrompt, userPrompt, questionsCategorySchema);
      let idCounter = startIdNumber;
      return res.data.questions.map((q) => ({
        id: `q${idCounter++}`,
        requirement_ids: (q.requirement_ids || []).filter((id) => ctx.requirements?.some((r) => r.id === id)),
        category,
        prompt: q.prompt,
        answer_outline: q.answer_outline || '',
        difficulty: q.difficulty,
      }));
    } catch (err: any) {
      console.warn(`[Pipeline] LLM question generation failed for ${category}:`, err.message);
    }
  }

  // Fallback questions for offline/test mode
  let idCounter = startIdNumber;
  const sampleReqIds = relevantReqs.slice(0, 2).map((r) => r.id);

  const fallbackPrompts: Record<string, string[]> = {
    technical: [
      `Explain how you would apply your core technical skills in ${ctx.role?.title || 'this role'}.`,
      'Walk me through a difficult technical bug or challenge you diagnosed and resolved.',
    ],
    behavioural: [
      'Tell me about a time you had a technical disagreement with a team member. How was it resolved?',
      'Describe a project with ambiguous requirements and how you drove clarity.',
    ],
    'system-design': [
      'Design an end-to-end scalable data processing or service architecture for high availability.',
      'How would you manage service trade-offs between latency, throughput, and consistency?',
    ],
    'company-fit': [
      `Why are you interested in joining ${ctx.source?.company || 'our company'}?`,
      'What values are most important to you in an engineering team environment?',
    ],
  };

  const prompts = fallbackPrompts[category] || fallbackPrompts.technical;
  return prompts.map((prompt, idx) => ({
    id: `q${idCounter++}`,
    requirement_ids: sampleReqIds.length > 0 ? sampleReqIds : ['req-1'],
    category,
    prompt,
    answer_outline: 'Structured response highlighting experience, trade-offs, and outcomes.',
    difficulty: (Math.min(idx + 1, 3) as 1 | 2 | 3),
  }));
}

export const generateQuestionsTechnicalStage: PipelineStage = {
  name: 'generate_questions_technical',
  description: 'Generating technical interview questions',
  async run(ctx: PipelineContext) {
    console.log('[Pipeline] Stage 6a: generate_questions_technical');
    const systemPrompt =
      'You are a senior technical interviewer. Generate rigorous, realistic technical questions ' +
      'directly mapped to the candidate technical requirements. Provide structured answer outlines and difficulties.';

    if (!ctx.questions) ctx.questions = [];
    const questions = await generateCategoryQuestions(ctx, 'technical', systemPrompt, ctx.questions.length + 1);
    ctx.questions.push(...questions);
  },
  shouldSkipForRegeneration: (section) =>
    section !== 'questions' && section !== 'questions_technical',
};

export const generateQuestionsBehaviouralStage: PipelineStage = {
  name: 'generate_questions_behavioural',
  description: 'Generating behavioural interview questions',
  async run(ctx: PipelineContext) {
    console.log('[Pipeline] Stage 6b: generate_questions_behavioural');
    const systemPrompt =
      'You are a behavioural interviewer evaluating team collaboration, leadership, and problem-solving. ' +
      'Generate STAR-method behavioural questions mapped to behavioural requirements.';

    if (!ctx.questions) ctx.questions = [];
    const questions = await generateCategoryQuestions(ctx, 'behavioural', systemPrompt, ctx.questions.length + 1);
    ctx.questions.push(...questions);
  },
  shouldSkipForRegeneration: (section) =>
    section !== 'questions' && section !== 'questions_behavioural',
};

export const generateQuestionsSystemDesignStage: PipelineStage = {
  name: 'generate_questions_system_design',
  description: 'Generating system design questions',
  async run(ctx: PipelineContext) {
    console.log('[Pipeline] Stage 6c: generate_questions_system_design');
    const systemPrompt =
      'You are a principal systems architect. Generate practical system design scenarios ' +
      'evaluating scalability, fault-tolerance, and trade-offs.';

    if (!ctx.questions) ctx.questions = [];
    const questions = await generateCategoryQuestions(ctx, 'system-design', systemPrompt, ctx.questions.length + 1);
    ctx.questions.push(...questions);
  },
  shouldSkipForRegeneration: (section) =>
    section !== 'questions' && section !== 'questions_system_design',
};

export const generateQuestionsCompanyFitStage: PipelineStage = {
  name: 'generate_questions_company_fit',
  description: 'Generating company-fit questions',
  async run(ctx: PipelineContext) {
    console.log('[Pipeline] Stage 6d: generate_questions_company_fit');
    const systemPrompt =
      'You are evaluating cultural and company alignment. Generate questions evaluating candidate interest ' +
      'in the specific company mission, values, and engineering culture.';

    if (!ctx.questions) ctx.questions = [];
    const questions = await generateCategoryQuestions(ctx, 'company-fit', systemPrompt, ctx.questions.length + 1);
    ctx.questions.push(...questions);
  },
  shouldSkipForRegeneration: (section) =>
    section !== 'questions' && section !== 'questions_company_fit',
};

// ---- Stage 10: Generate Flashcards -----------------------------------------

export const generateFlashcardsStage: PipelineStage = {
  name: 'generate_flashcards',
  description: 'Generating flashcards',
  async run(ctx: PipelineContext) {
    console.log('[Pipeline] Stage 10: generate_flashcards');

    const reqs = ctx.requirements || [];
    const questions = ctx.questions || [];

    if (process.env.GEMINI_API_KEY && reqs.length > 0) {
      const systemPrompt =
        'Generate concise, high-retention interview flashcards. ' +
        'Each card has a front (prompt/concept) and back (concise answer/key points), mapped to requirement IDs.';

      const userPrompt =
        `Requirements:\n${JSON.stringify(reqs, null, 2)}\n` +
        `Questions:\n${JSON.stringify(questions.slice(0, 8), null, 2)}\n` +
        `Generate 4 to 8 flashcards.`;

      try {
        const res = await callLLM(systemPrompt, userPrompt, flashcardsSchema);
        let fIndex = 1;
        ctx.flashcards = res.data.flashcards.map((f) => ({
          id: `f${fIndex++}`,
          front: f.front,
          back: f.back,
          requirement_ids: (f.requirement_ids || []).filter((id) => reqs.some((r) => r.id === id)),
        }));
        return;
      } catch (err: any) {
        console.warn('[Pipeline] LLM flashcard generation error:', err.message);
      }
    }

    // Fallback flashcards
    ctx.flashcards = reqs.slice(0, 5).map((req, idx) => ({
      id: `f${idx + 1}`,
      front: `Key concepts & requirements for: ${req.text.slice(0, 60)}`,
      back: `Demonstrate proficiency, practical experience, and discuss architectural trade-offs regarding ${req.text}.`,
      requirement_ids: [req.id],
    }));
  },
  shouldSkipForRegeneration: (section) => section !== 'flashcards',
};

// ---- Stage 11: Coverage Check & Gap Fill -----------------------------------

export const coverageCheckStage: PipelineStage = {
  name: 'coverage_check',
  description: 'Checking requirement coverage and filling gaps',
  async run(ctx: PipelineContext) {
    console.log('[Pipeline] Stage 11: coverage_check');

    const requirements = ctx.requirements || [];
    let questions = ctx.questions || [];

    let passes = 1;
    let checkResult = checkCoverage({ requirements, questions, passNumber: passes });

    // Loop max 3 times if must-have gaps exist
    while (!checkResult.isFullyCovered && passes < 3) {
      console.log(
        `[Pipeline] Coverage pass ${passes}: ${checkResult.uncoveredMustRequirements.length} uncovered requirements. Generating gap-filling questions...`
      );

      const uncoveredReqs = checkResult.uncoveredMustRequirements;

      if (process.env.GEMINI_API_KEY && uncoveredReqs.length > 0) {
        const systemPrompt =
          'Generate targeted interview questions specifically designed to cover the following uncovered job requirements.';

        const userPrompt = `Uncovered Requirements:\n${JSON.stringify(uncoveredReqs, null, 2)}`;

        try {
          const res = await callLLM(systemPrompt, userPrompt, questionsCategorySchema);
          let nextIdNum = questions.length + 1;
          const gapQuestions: Question[] = res.data.questions.map((q) => ({
            id: `q${nextIdNum++}`,
            requirement_ids: (q.requirement_ids && q.requirement_ids.length > 0) ? q.requirement_ids : [uncoveredReqs[0].id],
            category: 'technical',
            prompt: q.prompt,
            answer_outline: q.answer_outline || '',
            difficulty: q.difficulty,
          }));

          questions = [...questions, ...gapQuestions];
          ctx.questions = questions;
        } catch (err: any) {
          console.warn('[Pipeline] Gap question generation error:', err.message);
          break;
        }
      } else {
        // Deterministic fallback gap-filler
        let nextIdNum = questions.length + 1;
        for (const uReq of uncoveredReqs) {
          questions.push({
            id: `q${nextIdNum++}`,
            requirement_ids: [uReq.id],
            category: uReq.kind === 'behavioural' ? 'behavioural' : 'technical',
            prompt: `Explain your practical experience with ${uReq.text}.`,
            answer_outline: `Discuss real-world scenarios applying ${uReq.text}.`,
            difficulty: 2,
          });
        }
        ctx.questions = questions;
      }

      passes++;
      checkResult = checkCoverage({ requirements, questions, passNumber: passes });
    }

    ctx.coverage = checkResult.coverage;
    ctx.coveragePassCount = passes;
  },
  shouldSkipForRegeneration: () => false, // Always run
};

// ---- Stage 12: Build Schedule ----------------------------------------------

export const buildScheduleStage: PipelineStage = {
  name: 'build_schedule',
  description: 'Building study schedule',
  async run(ctx: PipelineContext) {
    console.log('[Pipeline] Stage 12: build_schedule');

    ctx.schedule = allocateSchedule({
      questions: ctx.questions || [],
      requirements: ctx.requirements || [],
      daysAvailable: ctx.days,
    });
  },
  shouldSkipForRegeneration: () => false, // Always rebuild schedule
};

// ---- Stage 13: Validate Kit ------------------------------------------------

export const validateKitStage: PipelineStage = {
  name: 'validate_kit',
  description: 'Validating and assembling final kit',
  async run(ctx: PipelineContext) {
    console.log('[Pipeline] Stage 13: validate_kit');

    const assembleKit = (): Kit => ({
      source: ctx.source || {
        company: '',
        company_url: ctx.companyUrl,
        role: ctx.role?.title || '',
        location: '',
        jd_chars: ctx.jd.length,
        researched_at: new Date().toISOString(),
        pages_used: ctx.pagesUsed || [],
      },
      company_brief: ctx.companyBrief || {
        summary: 'Company brief',
        what_they_do: 'Software development',
        sources: ctx.pagesUsed || [],
      },
      role: ctx.role || {
        title: 'Software Engineer',
        seniority: 'Mid',
        responsibilities: [],
        requirements: ctx.requirements || [],
      },
      questions: ctx.questions || [],
      flashcards: ctx.flashcards || [],
      schedule: ctx.schedule || {
        days_available: ctx.days,
        days: [],
      },
      coverage: ctx.coverage || {
        uncovered_requirement_ids: [],
        passes: ctx.coveragePassCount || 1,
      },
    });

    let kit = assembleKit();
    let validation = validateKit(kit);
    let retries = 0;

    while (!validation.success && retries < 2) {
      const fail = validation as { success: false; errors: Array<{ message: string }> };
      console.warn(`[Pipeline] Kit validation failed (attempt ${retries + 1}):`, fail.errors);
      retries++;

      // Auto-correct common issues:
      // Ensure schedule.days.length matches days_available
      if (kit.schedule.days.length !== kit.schedule.days_available) {
        ctx.schedule = allocateSchedule({
          questions: ctx.questions || [],
          requirements: ctx.requirements || [],
          daysAvailable: ctx.days,
        });
      }

      kit = assembleKit();
      validation = validateKit(kit);
    }

    if (!validation.success) {
      const fail = validation as { success: false; errors: Array<{ message: string }> };
      console.error('[Pipeline] Final kit validation failed after retries:', fail.errors);
      ctx.errors.push({
        stage: 'validate_kit',
        error: `Kit validation errors: ${fail.errors.map((e) => e.message).join('; ')}`,
        recoverable: true,
      });
    }

    ctx.kit = kit;
  },
  shouldSkipForRegeneration: () => false, // Always validate
};

// ---- All Stages Export -----------------------------------------------------

export const ALL_STAGES: PipelineStage[] = [
  extractRequirementsStage,
  crawlCompanySiteStage,
  findHiringPageStage,
  searchPublicDiscussionStage,
  generateCompanyBriefStage,
  generateQuestionsTechnicalStage,
  generateQuestionsBehaviouralStage,
  generateQuestionsSystemDesignStage,
  generateQuestionsCompanyFitStage,
  generateFlashcardsStage,
  coverageCheckStage,
  buildScheduleStage,
  validateKitStage,
];
