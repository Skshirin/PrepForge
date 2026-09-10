// ============================================================================
// Batch Evaluator Service (Appendix B)
// ============================================================================
//
// In-process batch processor that runs all 13 pipeline stages sequentially
// for each case without requiring MongoDB or an HTTP server.

import fs from 'fs';
import path from 'path';
import { generateKit } from '../pipeline/orchestrator';

export interface BatchInputCase {
  id: string;
  jd: string;
  company_url?: string;
  companyUrl?: string;
  days?: number;
}

export interface BatchOutputItem {
  id: string;
  status: 'ok' | 'failed';
  kit: any;
  error: { code: string; message: string } | null;
}

export interface BatchOutputEnvelope {
  version: '1.0';
  generated_at: string;
  kits: BatchOutputItem[];
}

export async function runBatchEvaluation(
  inputPath: string,
  outputPath: string
): Promise<BatchOutputEnvelope> {
  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) {
    throw new Error(`Input file not found at: ${resolvedInput}`);
  }

  const rawInput = fs.readFileSync(resolvedInput, 'utf8');
  let cases: BatchInputCase[];

  try {
    cases = JSON.parse(rawInput);
    if (!Array.isArray(cases)) {
      throw new Error('Input JSON must be an array of test cases.');
    }
  } catch (err: any) {
    throw new Error(`Failed to parse input JSON: ${err.message}`);
  }

  console.log(`[Batch] Starting evaluation of ${cases.length} case(s)...`);
  const results: BatchOutputItem[] = [];

  // Process sequentially to respect API rate limits
  for (let i = 0; i < cases.length; i++) {
    const item = cases[i];
    const caseId = item.id || `case-${i + 1}`;
    console.log(`[Batch] [${i + 1}/${cases.length}] Running case "${caseId}"...`);

    try {
      if (!item.jd || typeof item.jd !== 'string' || item.jd.trim().length === 0) {
        throw Object.assign(new Error('Job description (jd) is required and cannot be empty'), {
          code: 'INVALID_INPUT',
        });
      }

      const kit = await generateKit({
        jd: item.jd,
        companyUrl: item.company_url || item.companyUrl || '',
        days: item.days && item.days > 0 ? item.days : 5,
      });

      results.push({
        id: caseId,
        status: 'ok',
        kit,
        error: null,
      });
      console.log(`[Batch] [${i + 1}/${cases.length}] Case "${caseId}" succeeded (status: ok).`);
    } catch (err: any) {
      console.error(`[Batch] [${i + 1}/${cases.length}] Case "${caseId}" failed:`, err.message);
      results.push({
        id: caseId,
        status: 'failed',
        kit: null,
        error: {
          code: err.code || 'GENERATION_FAILED',
          message: err.message || String(err),
        },
      });
    }
  }

  const outputEnvelope: BatchOutputEnvelope = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    kits: results,
  };

  const resolvedOutput = path.resolve(outputPath);
  const outputDir = path.dirname(resolvedOutput);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(resolvedOutput, JSON.stringify(outputEnvelope, null, 2), 'utf8');
  console.log(`[Batch] Evaluation complete. Results written to: ${resolvedOutput}`);

  return outputEnvelope;
}
