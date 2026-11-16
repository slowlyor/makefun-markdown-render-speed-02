// Harness driver for markdown-render-speed-02.
//
// Reads the case list (JSON array of { id, markdown }) from
//   <inputDir>/cases.json     inputDir  = $MAKEFUN_INPUT_DIR  or /input
// renders every case with parse() from ./parse.js, and writes the HTML
// strings, in case order, as a JSON array to
//   <outputDir>/html.json     outputDir = $MAKEFUN_OUTPUT_DIR or /output

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from './parse.js';

const inputDir = process.env.MAKEFUN_INPUT_DIR || '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

function main() {
  const raw = readFileSync(join(inputDir, 'cases.json'), 'utf8');
  const cases = JSON.parse(raw);
  if (!Array.isArray(cases)) {
    throw new Error('cases.json must contain a JSON array of cases');
  }
  const html = new Array(cases.length);
  for (let i = 0; i < cases.length; i++) {
    const entry = cases[i];
    // Cases normally carry the source under .markdown; tolerate bare
    // string entries so a differently-shaped case file still renders.
    html[i] = parse(typeof entry === 'string' ? entry : entry.markdown);
  }
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'html.json'), JSON.stringify(html));
}

main();
