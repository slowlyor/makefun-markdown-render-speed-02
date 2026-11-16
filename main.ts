// main.ts — the driver the harness runs: `node /bot/main.ts` on
// Node 22, which strips these types natively.
//
// It reads every case from /input/cases.json (a JSON array of
// {id, markdown}), renders each case on its own with parse() from
// parse.js, and writes /output/html.json: a JSON array holding the
// HTML of each case, in the cases' order. Outside the sandbox,
// MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input and
// /output.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Render the whole set in one pass, keeping the cases' order: slot i
// of the output array is the HTML of case i, nothing carried between
// cases beyond what parse() itself holds.
const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as { id: string; markdown: string }[];
const html: string[] = new Array<string>(cases.length);
for (let i = 0; i < cases.length; i++) {
  html[i] = parse(cases[i].markdown);
}

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, 'html.json'), JSON.stringify(html));
