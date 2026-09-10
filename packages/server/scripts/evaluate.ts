#!/usr/bin/env ts-node

// ============================================================================
// Batch Evaluation Entry Point (Appendix B)
// ============================================================================
//
// Usage:
//   npm run evaluate -- --input <cases.json> --output <kits.json>
//
// In-process batch processor that runs all 13 pipeline stages sequentially
// for each case without requiring MongoDB or an HTTP server.

import dotenv from 'dotenv';
import { runBatchEvaluation, BatchInputCase, BatchOutputItem, BatchOutputEnvelope } from '../src/services/batch-evaluator';

// Load environment variables (.env from repo root or current directory)
dotenv.config();

export { runBatchEvaluation, BatchInputCase, BatchOutputItem, BatchOutputEnvelope };

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  let inputArg = '';
  let outputArg = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && i + 1 < args.length) {
      inputArg = args[i + 1];
      i++;
    } else if (args[i].startsWith('--input=')) {
      inputArg = args[i].substring('--input='.length);
    } else if (args[i] === '--output' && i + 1 < args.length) {
      outputArg = args[i + 1];
      i++;
    } else if (args[i].startsWith('--output=')) {
      outputArg = args[i].substring('--output='.length);
    }
  }

  // Fallback if flags were absorbed by shell/npm runner
  if ((!inputArg || !outputArg) && args.length >= 2) {
    const nonFlags = args.filter((a) => !a.startsWith('--'));
    if (nonFlags.length >= 2) {
      inputArg = inputArg || nonFlags[0];
      outputArg = outputArg || nonFlags[1];
    }
  }

  if (!inputArg || !outputArg) {
    console.error('Usage: npm run evaluate -- --input <cases.json> --output <kits.json>');
    process.exit(1);
  }

  runBatchEvaluation(inputArg, outputArg)
    .then(() => {
      process.exit(0); // Exit code 0 even if individual cases failed
    })
    .catch((err) => {
      console.error('[Batch Fatal Error]:', err.message);
      process.exit(1);
    });
}
