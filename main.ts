// Entry point for the markdown-render-speed-02 harness.
//
// The grader runs this program as `node /bot/main.ts` on Node 22. It reads
// every case from /input/cases.json -- a JSON array of {id, markdown} in
// order -- renders each case on its own with parse() from ./parse.js, and
// writes /output/html.json: a JSON array holding the HTML string of each
// case, in the same order. When the program runs outside the grader's
// container, MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input
// and /output.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const raw = readFileSync(join(inputDir, 'cases.json'), 'utf8');
const cases = JSON.parse(raw) as { id: string; markdown: string }[];

// Render the cases one at a time, in order, so each result depends only on
// its own markdown, then write the whole array as a single JSON document.
const html: string[] = new Array<string>(cases.length);
for (let i = 0; i < cases.length; i++) {
  html[i] = parse(cases[i].markdown);
}

writeFileSync(join(outputDir, 'html.json'), JSON.stringify(html));
