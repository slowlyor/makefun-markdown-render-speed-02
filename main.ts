// main.ts — the program the harness runs: `node /bot/main.ts` on
// Node 22, which strips TypeScript types natively (erasable syntax
// only, no enums or parameter properties).
//
// It reads the cases from /input/cases.json — a JSON array of objects
// {id, markdown} — renders each case on its own with parse() from
// parse.js, and writes /output/html.json, a JSON array of the HTML of
// each case in the cases' order. Outside the sandbox the
// MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR environment variables
// stand in for /input and /output.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// One pass over the whole set, in order: output slot i holds the HTML
// of case i. Nothing is carried between cases beyond what parse()
// itself holds from call to call.
const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as { id: string; markdown: string }[];
const html: string[] = new Array<string>(cases.length);
cases.forEach((c, i) => {
  html[i] = parse(c.markdown);
});

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, 'html.json'), JSON.stringify(html));
