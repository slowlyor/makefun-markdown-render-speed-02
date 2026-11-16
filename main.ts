// main.ts — the driver the harness runs: node /bot/main.ts (Node 22).
//
// It reads every case from /input/cases.json (a JSON array of
// {id, markdown}), renders each case on its own with parse() from
// parse.js, and writes /output/html.json: a JSON array of the HTML
// strings, one per case, in the cases' order. Outside a container,
// MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input and
// /output.
//
// The results go into a preallocated array by index rather than by
// push: the array never grows, and the loop body is only the render.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(
  readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8'),
) as { id: string; markdown: string }[];

const html: string[] = new Array(cases.length);
for (let i = 0; i < cases.length; i++) html[i] = parse(cases[i].markdown);

writeFileSync(join(OUTPUT_DIR, 'html.json'), JSON.stringify(html));
