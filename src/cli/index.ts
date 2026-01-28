#!/usr/bin/env node
/**
 * noex-rules CLI - vstupní bod.
 */

import { run } from './cli.js';

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
