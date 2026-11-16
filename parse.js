// A faster drop-in for marked 18.1.3: parse(markdown) returns, for every
// string, exactly the HTML that marked.parse(markdown) returns with the
// default options (gfm true, breaks false, pedantic false, async false).
//
// Two ideas make it faster than calling marked.parse directly:
//
// 1. marked.parse rebuilds its options object on every call (it spreads the
//    defaults into a fresh object, then the Lexer and Parser constructors
//    hang a new tokenizer and renderer off it). Here the Lexer and Parser
//    classes vendored from marked are driven directly with ONE options
//    object shared by every call, so the defaults are read once and the
//    tokenizer and renderer singletons the constructors store on that
//    object are created on the first call and reused ever after.
//
// 2. A document that is provably plain -- nothing in it can start a block
//    construct or an inline construct -- is rendered by a small direct
//    renderer below and never reaches the lexer at all. The check is
//    deliberately conservative: anything even slightly unusual falls back
//    to the vendored lexer/parser, which is always correct.

import { Lexer, Parser, getDefaults } from './vendor/marked/marked.esm.js';

// The single shared options object: marked's defaults, read once.
const sharedOptions = getDefaults();

// Characters that can change how marked tokenizes a document when they
// appear anywhere in it: code spans and fences (backtick, tilde), escapes
// (backslash), links and images (brackets), raw HTML and autolinks
// (angle brackets), entities (ampersand), emphasis (asterisk, underscore),
// tables (pipe), tabs, and any control character other than the newline
// that survives line-ending normalization.
const FORBIDDEN_ANYWHERE = /[`\\\[\]<>&*_~|\t\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

// An ATX heading line: up to three leading spaces, one to six hashes, then
// either the end of the line or whitespace and the heading text.
const ATX_LINE = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/;

// A line of nothing but spaces is a blank separator between blocks.
const BLANK_LINE = /^ *$/;

// An ordered-list marker at the start of a line: 1-9 digits, '.' or ')',
// then a space or the end of the line.
const ORDERED_MARKER = /^\d{1,9}[.)](?: |$)/;

// The only two escapes a plain text node can still need: marked's renderer
// turns an apostrophe into &#39; and a double quote into &quot;. Every
// other escapable character is on the forbidden list above, so a document
// that reaches the plain renderer contains none of them.
const PLAIN_ESCAPES = { "'": '&#39;', '"': '&quot;' };

function escapePlainText(text) {
  return text.replace(/['"]/g, (ch) => PLAIN_ESCAPES[ch]);
}

// Render one ATX heading line the way marked's heading tokenizer and
// renderer do: the text is trimmed, and a closing run of hashes is removed
// when it is the whole text or follows a space or tab (so "C#" keeps its
// hash but "Title #" and "##" do not). Returns null when the line is not
// an ATX heading.
function renderHeadingLine(line) {
  const match = ATX_LINE.exec(line);
  if (match === null) return null;
  let text = (match[2] ?? '').trim();
  if (text.endsWith('#')) {
    const stripped = text.replace(/#+$/, '');
    if (stripped === '' || /[ \t]$/.test(stripped)) text = stripped.trim();
  }
  const depth = match[1].length;
  return '<h' + depth + '>' + escapePlainText(text) + '</h' + depth + '>\n';
}

// Could this line serve as one line of a plain paragraph? A line that
// starts a list, quote, setext underline or thematic break, or that is
// indented like a code block, is refused, as is a line made only of the
// characters a table delimiter or thematic break is built from.
function isPlainParagraphLine(line) {
  let start = 0;
  while (start < line.length && line[start] === ' ') start++;
  if (start >= 4) return false; // indented code territory
  const rest = line.slice(start);
  const first = rest[0];
  if (first === '>' || first === '-' || first === '+' || first === '=') return false;
  if (ORDERED_MARKER.test(rest)) return false;
  if (line.includes('-') && /^[ \-:]+$/.test(line)) return false;
  return true;
}

// Render a normalized document (line endings already folded to '\n') with
// the plain renderer, or return null when the document is not provably
// plain and the vendored parser must handle it.
function renderPlainDocument(text) {
  // GFM's extended autolinks must never take this path: a bare www.
  // address, any scheme URL, an email-shaped token, and the mailto: and
  // xmpp: protocol forms all become links in marked, not plain text.
  const lower = text.toLowerCase();
  if (
    text.includes('@') ||
    text.includes('://') ||
    lower.includes('www.') ||
    lower.includes('mailto:') ||
    lower.includes('xmpp:')
  ) {
    return null;
  }
  if (FORBIDDEN_ANYWHERE.test(text)) return null;

  const lines = text.split('\n');
  const out = [];
  let paragraph = [];

  // Close the paragraph being accumulated. A line inside a paragraph that
  // ends in two or more spaces is a hard break in marked, which a plain
  // paragraph cannot express, so such a paragraph refuses the fast path.
  const flushParagraph = () => {
    for (let i = 0; i < paragraph.length - 1; i++) {
      if (paragraph[i].endsWith('  ')) return false;
    }
    if (paragraph.length > 0) {
      out.push('<p>' + escapePlainText(paragraph.join('\n')) + '</p>\n');
      paragraph = [];
    }
    return true;
  };

  for (const line of lines) {
    if (BLANK_LINE.test(line)) {
      if (!flushParagraph()) return null;
      continue;
    }
    const heading = renderHeadingLine(line);
    if (heading !== null) {
      if (!flushParagraph()) return null;
      out.push(heading);
      continue;
    }
    if (!isPlainParagraphLine(line)) return null;
    paragraph.push(line);
  }
  if (!flushParagraph()) return null;
  return out.join('');
}

/** The HTML marked renders for `markdown`, with marked's defaults. */
export function parse(markdown) {
  if (markdown === undefined || markdown === null) {
    throw new Error(
      'marked(): input parameter is undefined or null\n' +
        'Please report this to https://github.com/markedjs/marked.',
    );
  }
  if (typeof markdown !== 'string') {
    throw new Error(
      'marked(): input parameter is of type ' +
        Object.prototype.toString.call(markdown) +
        ', string expected\n' +
        'Please report this to https://github.com/markedjs/marked.',
    );
  }

  // Fold line endings once, exactly as the lexer does, and let the plain
  // renderer try the normalized text. Whitespace alone renders as the
  // empty string. Anything the plain renderer refuses goes to the lexer.
  const normalized = markdown.replace(/\r\n|\r/g, '\n');
  if (/^[ \t\n]*$/.test(normalized)) return '';
  const plain = renderPlainDocument(normalized);
  if (plain !== null) return plain;

  const tokens = Lexer.lex(markdown, sharedOptions);
  return Parser.parse(tokens, sharedOptions);
}
