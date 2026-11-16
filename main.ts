// Driver for the markdown-render-speed-02 entry: the harness runs
// `node /bot/main.ts` on Node 22. Every case in /input/cases.json is
// rendered on its own with parse() from ./parse.js, and the HTML
// strings are written, in the cases' order, to /output/html.json.
// Outside the harness container, MAKEFUN_INPUT_DIR and
// MAKEFUN_OUTPUT_DIR stand in for /input and /output.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const inputDir: string = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir: string = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

interface Case {
  id: string;
  markdown: string;
}

const raw: string = readFileSync(join(inputDir, 'cases.json'), 'utf8');
const cases: Case[] = JSON.parse(raw) as Case[];

// Render in order, one parse() call per case, exactly as the scorer
// expects the output array to line up with the input array.
const html: string[] = new Array<string>(cases.length);
for (let idx = 0; idx < cases.length; idx++) {
  html[idx] = parse(cases[idx].markdown);
}

writeFileSync(join(outputDir, 'html.json'), JSON.stringify(html));
