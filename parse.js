// A faster drop-in for marked 18.1.3 (default options, GFM on).
//
// Two ideas, neither of which changes a single output byte:
//
// 1. Drive the vendored Lexer and Parser directly on ONE shared options
//    object. marked.parse() rebuilds its options on every call (two object
//    spreads, a Marked-instance dispatch, hook plumbing that is all null
//    under the defaults). With the defaults frozen, Lexer.lex(src, OPTS)
//    followed by Parser.parse(tokens, OPTS) is exactly the same pipeline,
//    minus the per-call rebuild. The vendored file does the rendering, so
//    every edge case where marked departs from the spec still matches.
//
// 2. A fast path for documents that are provably plain: nothing in them
//    can start a block or inline construct, so their HTML is known without
//    lexing. Plain means: whitespace only, or a sequence of plain ATX
//    headings and plain paragraphs separated by blank lines. The guards
//    below reject anything that could render differently, including the
//    GFM extended-autolink triggers (a "www." start, a "://" protocol, an
//    "@" that could be an e-mail autolink, mailto:/xmpp: prefixes), every
//    character that opens inline markup or an entity, list / setext /
//    thematic-break / blockquote line shapes, indented code, hard breaks
//    from trailing double spaces, and tabs. Text that survives the guards
//    still goes through marked's own escaping, so an apostrophe comes out
//    as &#39; and a double quote as &quot;, exactly as marked renders it.
//    Anything rejected falls through to the full marked pipeline.
//
// vendor/marked is marked 18.1.3, MIT (see vendor/marked/LICENSE).

import { Lexer, Parser, getDefaults } from './vendor/marked/marked.esm.js';

// The one shared options object: marked's defaults, taken once.
const OPTS = getDefaults();

// Characters and substrings that disqualify the fast path wherever they
// appear: inline-markup openers, the entity opener, the autolink triggers,
// a tab, and C0/DEL control characters other than the line feed.
const NOT_PLAIN = /[\\`*_[\]<>&~|@\t\x00-\x08\x0b-\x1f\x7f]|\/\/|www\.|mailto:|xmpp:/i;

// Block-level shapes a plain paragraph line may not have.
const RE_BLANK = /^[ \t]*$/;
const RE_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/;
const RE_INDENTED = /^ {4}/;
const RE_HARD_BREAK = / {2,}$/;
const RE_LIST_ITEM = /^ {0,3}(?:[-+]|\d{1,9}[.)])(?:[ \t]|$)/;
const RE_DASH_ONLY = /^ {0,3}-+[ \t]*$/;
const RE_DASH_BREAK = /^ {0,3}(?:-[ \t]*){3,}$/;
const RE_PLUS_ONLY = /^ {0,3}\++[ \t]*$/;
const RE_EQUALS_ONLY = /^ {0,3}=+[ \t]*$/;
const RE_BLOCKQUOTE = /^ {0,3}>/;
const RE_TRAILING_PAD = /[ \t]+$/;

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapePlain(text) {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

// The HTML of a provably plain document, or null when the document is not
// provably plain and must go through marked.
function plainHtml(src) {
  if (src.indexOf('\r') !== -1) src = src.replace(/\r\n?/g, '\n');
  if (NOT_PLAIN.test(src)) return null;

  const lines = src.split('\n');
  let out = '';
  let para = [];

  const flushPara = () => {
    if (para.length > 0) {
      out += '<p>' + escapePlain(para.join('\n')) + '</p>\n';
      para = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (RE_BLANK.test(line)) {
      flushPara();
      continue;
    }

    const heading = RE_HEADING.exec(line);
    if (heading !== null) {
      const text = (heading[2] ?? '').replace(RE_TRAILING_PAD, '');
      // A '#' in the text could be a closing sequence; let marked decide.
      if (text.indexOf('#') !== -1) return null;
      flushPara();
      const level = heading[1].length;
      out += '<h' + level + '>' + escapePlain(text) + '</h' + level + '>\n';
      continue;
    }

    // A paragraph line. Reject every shape that could start (or, as a
    // continuation line, become) another construct.
    if (RE_INDENTED.test(line)) return null;
    if (RE_HARD_BREAK.test(line)) return null;
    if (RE_LIST_ITEM.test(line)) return null;
    if (RE_BLOCKQUOTE.test(line)) return null;
    if (RE_DASH_ONLY.test(line)) return null;
    if (RE_DASH_BREAK.test(line)) return null;
    if (RE_PLUS_ONLY.test(line)) return null;
    // A line of '=' is setext underline only under paragraph text; as the
    // first line of a block it is ordinary paragraph text.
    if (para.length > 0 && RE_EQUALS_ONLY.test(line)) return null;

    para.push(line);
  }
  flushPara();
  return out;
}

/** The HTML marked renders for `markdown`, with marked's defaults. */
export function parse(markdown) {
  if (typeof markdown === 'string') {
    const fast = plainHtml(markdown);
    if (fast !== null) return fast;
  }
  return Parser.parse(Lexer.lex(markdown, OPTS), OPTS);
}
