// Fast drop-in replacement for marked.parse (marked 18.1.3, vendored).
//
// Two ideas:
//  1. marked.parse rebuilds its options object, tokenizer and renderer on
//     every call. Building one shared options object up front and driving
//     Lexer/Parser directly removes that per-call overhead while producing
//     byte-identical output.
//  2. A conservative fast path renders "plain" documents (only simple ATX
//     headings and plain paragraphs) by hand. It returns null the moment
//     anything looks even slightly non-plain, and the caller falls back to
//     the real marked pipeline, so correctness never depends on the fast
//     path being clever.

import { Lexer, Parser, getDefaults } from './vendor/marked/marked.esm.js';

// One options object for the whole process lifetime.
const sharedOptions = getDefaults();

function renderWithMarked(src) {
  const tokens = Lexer.lex(src, sharedOptions);
  return Parser.parse(tokens, sharedOptions);
}

// Fast path A: a document made only of spaces, tabs and line breaks renders
// to the empty string in marked (no block tokens survive).
const WHITESPACE_ONLY = /^[\t\r\n ]*$/;

export function parse(src) {
  if (typeof src !== 'string') {
    return renderWithMarked(src);
  }
  if (WHITESPACE_ONLY.test(src)) {
    return '';
  }
  const fast = tryPlainDocument(src);
  if (fast !== null) {
    return fast;
  }
  return renderWithMarked(src);
}

export default parse;

// ---------------------------------------------------------------------------
// Fast path B: plain documents.
//
// A "plain" line is one that marked can only ever treat as literal paragraph
// or heading text: it cannot open any block construct, cannot contain inline
// markup, and cannot trigger GFM autolinking or HTML escaping differences.
// If every block in the document is a plain ATX heading or a plain
// paragraph, the HTML is mechanical. Anything else -> null -> marked.
// ---------------------------------------------------------------------------

// Characters that give a line inline meaning in markdown (emphasis, code,
// links, images, escapes, strikethrough, raw HTML, entities, tables, smart
// punctuation targets) or that marked autolinks / escapes specially.
const FORBIDDEN_CHARS = /[`*_~\[\]<>&\\|'@"]/;

// Char codes that, as the first character of a line, can open a block
// construct (heading, blockquote, list, setext underline, HTML block, link
// reference definition, code fence, thematic break via ~ or _ runs, ...).
//   # 35   > 62   - 45   + 43   * 42   = 61   < 60   [ 91   ` 96   ~ 126   _ 95
function isForbiddenFirst(code) {
  return (
    code === 35 || code === 62 || code === 45 || code === 43 ||
    code === 42 || code === 61 || code === 60 || code === 91 ||
    code === 96 || code === 126 || code === 95
  );
}

// Ordered-list item start, e.g. "1. " or "12) ".
const ORDERED_LIST_START = /^\d{1,9}[.)] /;

// Shapes marked's GFM autolinker turns into links even without brackets.
const AUTOLINK_SHAPE = /www\.|:\/\/|mailto:|xmpp:/i;

function isPlainLine(line) {
  if (line.length === 0) return false;
  // No leading/trailing whitespace: indentation can mean code blocks and
  // trailing spaces can mean hard breaks.
  if (line !== line.trim()) return false;
  if (isForbiddenFirst(line.charCodeAt(0))) return false;
  if (ORDERED_LIST_START.test(line)) return false;
  if (FORBIDDEN_CHARS.test(line)) return false;
  if (AUTOLINK_SHAPE.test(line)) return false;
  return true;
}

const HEADING_LINE = /^(#{1,6}) (\S(?:.*\S)?)$/;

function tryPlainDocument(src) {
  // Normalise line endings the way marked does before lexing.
  const text = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Tabs can expand into indentation (code blocks) or separate list
  // markers; not worth modelling, so bail out entirely.
  if (text.includes('\t')) return null;

  const lines = text.split('\n');

  // Group lines into blocks split by truly empty lines.
  const blocks = [];
  let current = [];
  for (const line of lines) {
    if (line === '') {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);
  if (blocks.length === 0) return null;

  let html = '';
  for (const block of blocks) {
    if (block.length === 1) {
      const heading = HEADING_LINE.exec(block[0]);
      if (heading) {
        const headingText = heading[2];
        // A trailing '#' run would be stripped by marked as a closing
        // sequence, so such headings are not plain.
        if (headingText.endsWith('#')) return null;
        if (!isPlainLine(headingText)) return null;
        const level = heading[1].length;
        html += `<h${level}>${headingText}</h${level}>\n`;
        continue;
      }
    }
    // Paragraph block: every line must be plain.
    for (const line of block) {
      if (!isPlainLine(line)) return null;
    }
    html += `<p>${block.join('\n')}</p>\n`;
  }
  return html;
}
