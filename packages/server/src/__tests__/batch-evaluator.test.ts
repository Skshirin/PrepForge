// ============================================================================
// Tests: Batch Evaluator Script & Appendix B Envelope
// ============================================================================

import fs from 'fs';
import path from 'path';
import os from 'os';
import { runBatchEvaluation } from '../services/batch-evaluator';
import * as llmService from '../services/llm';
import * as scraperService from '../services/scraper';
import { kitSchema } from '@trao/shared';

jest.mock('../services/llm');
jest.mock('../services/scraper');

describe('Batch Evaluator (Appendix B)', () => {
  const tempDir = path.join(os.tmpdir(), `trao-eval-test-${Date.now()}`);
  const inputPath = path.join(tempDir, 'cases.json');
  const outputPath = path.join(tempDir, 'kits.json');

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors on Windows
    }
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('evaluates 3 mock cases sequentially: normal, unreachable URL, and failing case', async () => {
    // 3 Test Cases:
    //   1. Normal case (success with full research)
    //   2. Unreachable company URL (success with partial research fallback)
    //   3. Two-line JD where LLM fails fatally (recorded as status: 'failed')
    const testCases = [
      {
        id: 'case-01',
        jd: 'Senior Full Stack Engineer at Acme Corp with React, TypeScript, and Node.js expertise.',
        company_url: 'https://acme.example.com',
        days: 5,
      },
      {
        id: 'case-02',
        jd: 'Backend Engineer specializing in Distributed Systems and Go at Offline Corp.',
        company_url: 'http://unreachable-corp-offline.invalid',
        days: 3,
      },
      {
        id: 'case-03',
        jd: 'Role: Engineer\nExperience: 5 years',
        company_url: '',
        days: 5,
      },
    ];

    fs.writeFileSync(inputPath, JSON.stringify(testCases, null, 2), 'utf8');

    // Setup Mocks:
    // Scraper mock
    (scraperService.crawlSite as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('unreachable')) {
        throw new Error('Network unreachable: connection timed out');
      }
      return [
        {
          url: 'https://acme.example.com',
          title: 'Acme Corp Homepage',
          text: 'Acme builds world-class engineering tools.',
          links: [],
        },
      ];
    });

    (scraperService.fetchPage as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes('unreachable')) {
        return null;
      }
      return {
        url,
        title: 'Acme Careers',
        text: 'Our engineering culture values transparency and ownership.',
        links: [],
      };
    });

    // LLM mock
    (llmService.callLLM as jest.Mock).mockImplementation(
      async (systemPrompt: string, userPrompt: string) => {
        // Force fatal failure on case-03
        if (userPrompt.includes('Experience: 5 years')) {
          throw new Error('LLM model quota exceeded or fatal inference failure');
        }

        // Return appropriate mock data based on stage prompt
        if (systemPrompt.includes('extract requirements') || systemPrompt.includes('requirements explicitly')) {
          return {
            data: {
              company: 'Acme Corp',
              role: { title: 'Senior Engineer', seniority: 'Senior' },
              requirements: [
                { text: 'React & TypeScript proficiency', kind: 'technical', priority: 'must' },
                { text: 'Node.js backend design', kind: 'technical', priority: 'must' },
                { text: 'Collaborative leadership', kind: 'behavioural', priority: 'nice' },
              ],
            },
            rawText: '{}',
            metadata: { model: 'gemini-1.5-flash', latencyMs: 10, promptTokens: 10, completionTokens: 10, totalTokens: 20, retryCount: 0 },
          };
        }

        if (systemPrompt.includes('company brief')) {
          return {
            data: {
              summary: 'Acme Corp is a leader in software development tools.',
              what_they_do: 'Cloud developer tools and infrastructure platforms.',
              business_model: 'Enterprise B2B subscriptions.',
              engineering_culture: 'Autonomous cross-functional teams.',
              recent_news: ['Announced Series B funding round.'],
              interview_process: ['Recruiter screen', 'Technical deep-dive', 'System design'],
            },
            rawText: '{}',
            metadata: { model: 'gemini-1.5-flash', latencyMs: 10, promptTokens: 10, completionTokens: 10, totalTokens: 20, retryCount: 0 },
          };
        }

        if (systemPrompt.includes('technical') || systemPrompt.includes('behavioural') || systemPrompt.includes('system design') || systemPrompt.includes('company-fit')) {
          return {
            data: {
              questions: [
                {
                  prompt: 'How do you handle state synchronization across distributed microservices?',
                  answer_outline: 'Use transactional outbox pattern, event-driven architecture, and idempotent consumers.',
                  difficulty: 'hard',
                  criteria: ['Explains eventual consistency', 'Addresses idempotency'],
                  why_asked: 'Tests understanding of distributed systems.',
                },
                {
                  prompt: 'Describe a situation where you resolved a technical dispute among senior team members.',
                  answer_outline: 'Framed around objective benchmarks, customer impact, and consensus-building.',
                  difficulty: 'medium',
                  criteria: ['Demonstrates empathy', 'Shows clear decision framework'],
                  why_asked: 'Evaluates leadership maturity.',
                },
              ],
            },
            rawText: '{}',
            metadata: { model: 'gemini-1.5-flash', latencyMs: 10, promptTokens: 10, completionTokens: 10, totalTokens: 20, retryCount: 0 },
          };
        }

        if (systemPrompt.includes('flashcard')) {
          return {
            data: {
              flashcards: [
                {
                  front: 'Transactional Outbox Pattern',
                  back: 'Ensures database mutations and outgoing message events happen atomically.',
                },
                {
                  front: 'Idempotency Keys',
                  back: 'Unique request identifiers preventing duplicate transaction execution.',
                },
              ],
            },
            rawText: '{}',
            metadata: { model: 'gemini-1.5-flash', latencyMs: 10, promptTokens: 10, completionTokens: 10, totalTokens: 20, retryCount: 0 },
          };
        }

        return {
          data: {},
          rawText: '{}',
          metadata: { model: 'gemini-1.5-flash', latencyMs: 10, promptTokens: 10, completionTokens: 10, totalTokens: 20, retryCount: 0 },
        };
      }
    );

    // Run batch evaluation
    const output = await runBatchEvaluation(inputPath, outputPath);

    // Assert: output envelope
    expect(output).toBeDefined();
    expect(output.version).toBe('1.0');
    expect(typeof output.generated_at).toBe('string');
    expect(isNaN(Date.parse(output.generated_at))).toBe(false);

    // Assert: exactly 3 entries matching input IDs
    expect(output.kits).toHaveLength(3);
    expect(output.kits.map((k) => k.id)).toEqual(['case-01', 'case-02', 'case-03']);

    // Assert: Case 1 succeeded with valid Appendix A structure
    const case1 = output.kits[0];
    expect(case1.status).toBe('ok');
    expect(case1.error).toBeNull();
    expect(case1.kit).toBeDefined();
    const case1Validation = kitSchema.safeParse(case1.kit);
    expect(case1Validation.success).toBe(true);

    // Assert: Case 2 (unreachable company URL) succeeded with partial fallback and valid Appendix A structure
    const case2 = output.kits[1];
    expect(case2.status).toBe('ok');
    expect(case2.error).toBeNull();
    expect(case2.kit).toBeDefined();
    const case2Validation = kitSchema.safeParse(case2.kit);
    expect(case2Validation.success).toBe(true);

    // Assert: Case 3 (fatal error / invalid) recorded as failed with non-null error
    const case3 = output.kits[2];
    expect(case3.status).toBe('failed');
    expect(case3.kit).toBeNull();
    expect(case3.error).toBeDefined();
    expect(case3.error?.message).toBeTruthy();
    expect(case3.error?.code).toBeTruthy();

    // Assert: output file written to disk matches
    const writtenFile = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(writtenFile.version).toBe('1.0');
    expect(writtenFile.kits).toHaveLength(3);
  });

  it('rejects with descriptive error when input file does not exist', async () => {
    const nonExistentPath = path.join(tempDir, 'missing-file.json');
    await expect(runBatchEvaluation(nonExistentPath, outputPath)).rejects.toThrow(
      'Input file not found'
    );
  });

  it('rejects when input file contains invalid non-JSON content', async () => {
    const invalidJsonPath = path.join(tempDir, 'invalid.json');
    fs.writeFileSync(invalidJsonPath, 'NOT_JSON_DATA', 'utf8');
    await expect(runBatchEvaluation(invalidJsonPath, outputPath)).rejects.toThrow(
      'Failed to parse input JSON'
    );
  });

  it('rejects when input JSON is not an array', async () => {
    const objectJsonPath = path.join(tempDir, 'object.json');
    fs.writeFileSync(objectJsonPath, JSON.stringify({ not: 'an array' }), 'utf8');
    await expect(runBatchEvaluation(objectJsonPath, outputPath)).rejects.toThrow(
      'Input JSON must be an array'
    );
  });

  it('handles empty cases array gracefully producing valid empty envelope', async () => {
    const emptyJsonPath = path.join(tempDir, 'empty.json');
    const emptyOutPath = path.join(tempDir, 'empty-out.json');
    fs.writeFileSync(emptyJsonPath, '[]', 'utf8');

    const output = await runBatchEvaluation(emptyJsonPath, emptyOutPath);
    expect(output.version).toBe('1.0');
    expect(output.kits).toHaveLength(0);
    expect(fs.existsSync(emptyOutPath)).toBe(true);
  });
});
