// A faster drop-in for marked 18.1.3 (defaults: gfm on, breaks off,
// pedantic off, async off). Two ideas do the work:
//
//  1. Slow path, shared state: marked.parse() rebuilds an options object
//     and a Marked instance on every call. Here one options object, built
//     once from getDefaults(), is handed straight to the vendored Lexer
//     and Parser for every document, so per-call setup is a pair of
//     constructor calls and nothing more. Hooks, walkTokens and
//     extensions are all null in the defaults, so lexing then parsing
//     reproduces marked.parse() exactly.
//
//  2. Fast path, plain documents: a document that is provably nothing
//     but whitespace, plain paragraphs and plain ATX headings never
//     reaches the lexer at all. Its HTML is written directly, escaping
//     text exactly the way marked's renderer escapes a text token.
//
// The vendored file is marked's npm build, byte for byte (MIT,
// vendor/marked/LICENSE and vendor/marked/NOTICE).

import { Lexer, Parser, getDefaults } from './vendor/marked/marked.esm.js';

// The single shared options object for every slow-path render.
const sharedOptions = getDefaults();

// --- text escaping, matching marked's renderer -------------------------
// Marked escapes &, <, > and " in text, and an apostrophe becomes
// the numeric reference &#39;.
function escapeText(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- the plain-document fast path --------------------------------------
// A line of plain running text: letters, digits, spaces and the few
// punctuation marks that can never open an inline or block construct
// in this position. Anything else (emphasis, code, links, entities,
// escapes, raw HTML, list or quote markers, setext underlines, hard
// breaks, indented code) sends the whole document to the slow path.
const PLAIN_LINE = /^[A-Za-z0-9 ,.;:'()\-]+$/;
const BLANK_LINE = /^[ \t]*$/;
const ATX_HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*$/;
// GFM extended autolinks never appear in a plain document: a bare
// www. host, a scheme, an e-mail address or a mailto:/xmpp: link
// would be linked by marked, not left as text.
const AUTOLINK_HINT = /www\.|:\/\/|@|mailto:|xmpp:/i;

function isPlainLine(line) {
  if (!PLAIN_LINE.test(line)) return false;
  // A trailing space or a hyphen-only line is not plain: one is a
  // hard-break candidate, the other a setext underline or a break.
  if (line.endsWith(' ') || line.endsWith('-')) return false;
  if (/^-+$/.test(line) || /^=+$/.test(line)) return false;
  // A leading digit run followed by '.' or ')' opens an ordered list,
  // and a leading '- ' opens a bullet list.
  if (/^\d+[.)]\s/.test(line) || /^-\s/.test(line)) return false;
  return true;
}

// Render a provably plain document, or return null when any part of
// it is not provably plain and the slow path must decide.
function renderPlain(src) {
  if (AUTOLINK_HINT.test(src)) return null;
  if (src.indexOf('\r') !== -1 || src.indexOf('\t') !== -1) return null;
  const lines = src.split('\n');
  let out = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (BLANK_LINE.test(line)) {
      i++;
      continue;
    }
    if (line.startsWith(' ') || line.startsWith('#')) {
      // An indented line is never provably plain; a '#' line is only
      // plain when it is a clean ATX heading with plain text.
      const heading = ATX_HEADING.exec(line);
      if (!heading || heading[2].includes('#') || !isPlainLine(heading[2])) {
        return null;
      }
      const level = heading[1].length;
      out += `<h${level}>${escapeText(heading[2])}</h${level}>\n`;
      i++;
      continue;
    }
    // A paragraph: consecutive plain lines, stopped by a blank line
    // or by a heading line (an ATX heading interrupts a paragraph).
    const parts = [];
    while (i < lines.length && !BLANK_LINE.test(lines[i])) {
      const current = lines[i];
      if (current.startsWith('#')) break;
      if (current.startsWith(' ') || !isPlainLine(current)) return null;
      parts.push(escapeText(current));
      i++;
    }
    if (parts.length === 0) return null;
    out += `<p>${parts.join('\n')}</p>\n`;
  }
  return out;
}

/** The HTML marked 18.1.3 renders for `markdown`, with its defaults. */
export function parse(markdown) {
  if (typeof markdown !== 'string') {
    // Keep marked's own failure for non-string input on the slow path.
    return Parser.parse(Lexer.lex(markdown, sharedOptions), sharedOptions);
  }
  // Whitespace-only input renders as the empty string.
  if (markdown.trim() === '') return '';
  const plain = renderPlain(markdown);
  if (plain !== null) return plain;
  const tokens = Lexer.lex(markdown, sharedOptions);
  return Parser.parse(tokens, sharedOptions);
}
