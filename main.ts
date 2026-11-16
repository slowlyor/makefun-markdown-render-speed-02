// Driver for the markdown-render-speed-02 entry.
//
// The harness runs `node /bot/main.ts` (Node 22, which strips TypeScript
// types natively). It reads every case from /input/cases.json — a JSON
// array of {id, markdown} — renders each markdown string with parse()
// from parse.js, and writes /output/html.json: a JSON array of the HTML
// strings, one per case, in the cases' order. Outside a container,
// MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input and
// /output so the same driver can be run locally.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const inputDir: string = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir: string = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases: { id: string; markdown: string }[] = JSON.parse(
  readFileSync(join(inputDir, 'cases.json'), 'utf8'),
);

const html: string[] = new Array(cases.length);
for (let i = 0; i < cases.length; i++) {
  html[i] = parse(cases[i].markdown);
}

writeFileSync(join(outputDir, 'html.json'), JSON.stringify(html));
