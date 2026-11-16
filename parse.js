// parse.js — a faster drop-in for marked 18.1.3 (vendored in
// vendor/marked, MIT — see vendor/marked/LICENSE and vendor/marked/NOTICE).
//
// parse(markdown) returns exactly the HTML that marked.parse(markdown)
// returns with marked's default options (gfm true, breaks false,
// pedantic false, async false), for every input.
//
// Two ideas make it faster than calling marked.parse:
//  1. marked.parse rebuilds its options object on every call. Here the
//     vendored Lexer and Parser are driven directly on ONE shared options
//     object created once at module load, so the tokenizer, the renderer
//     and the rule tables are built once and reused for every document.
//  2. A document that is provably plain — nothing but blank lines, plain
//     paragraphs and plain ATX headings, with no inline markup and no
//     autolink material — is rendered by a small direct path that never
//     lexes at all. Anything not provably plain falls through to the
//     full marked pipeline below.

import { Lexer, Parser, getDefaults } from './vendor/marked/marked.esm.js';

// The single options object every render shares. getDefaults() returns
// marked's defaults (gfm true, breaks false, pedantic false, async
// false, and no extensions, hooks, renderer, tokenizer or walkTokens),
// and the Lexer and Parser attach their reusable tokenizer and renderer
// to it the first time they run.
const sharedOptions = getDefaults();

// marked escapes exactly these characters in plain text, on top of the
// ampersand its escape helper also handles. The plain path never lets
// an ampersand through (it could begin an entity — see INLINE_DENY), so
// these three are the whole of what escapePlainText has to do, and an
// apostrophe becomes &#39; exactly as marked renders it.
const ESCAPE_MAP = { '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapePlainText(text) {
  return text.replace(/[>"']/g, (ch) => ESCAPE_MAP[ch]);
}

// Characters that can open an inline construct (a code span, emphasis,
// strong emphasis, a link, an image, inline HTML, an entity or a
// backslash escape) or take part in one, plus the control characters
// other than the line feed that separates lines. A plain run of text
// contains none of them.
const INLINE_DENY = /[`*_[\]()<&\\\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

function isPlainText(text) {
  return !INLINE_DENY.test(text);
}

// A line of a plain paragraph: plain text that also cannot start or
// become some other block. Lines that could interrupt a paragraph as
// an ATX heading are classified by the caller before this is consulted.
function isPlainParagraphLine(line) {
  const first = line[0];
  // A leading space could be an indented code block; a > is a block
  // quote; a - is a list item, a setext underline or a thematic break.
  if (first === ' ' || first === '>' || first === '-') return false;
  // A + followed by a space starts a bullet list item.
  if (first === '+' && line[1] === ' ') return false;
  // 1. or 1) followed by a space or the end of the line is a list item.
  if (/^\d{1,9}[.)](?: |$)/.test(line)) return false;
  // A line of nothing but = signs is a setext heading underline.
  if (/^=+$/.test(line.replace(/ +$/, ''))) return false;
  // A line of nothing but pipes, colons, dashes and spaces that holds
  // a dash is a table delimiter row.
  if (line.includes('-') && /^[|:\- ]+$/.test(line)) return false;
  // Two or more trailing spaces are a hard line break.
  if (/ {2}$/.test(line)) return false;
  return isPlainText(line);
}

// Render a provably plain document directly, or return null when the
// document is not provably plain and marked itself must render it.
function renderPlainDocument(src) {
  // Tabs and carriage returns change how marked lexes (indented code
  // blocks, line-ending normalisation), so any document holding one
  // belongs to the full pipeline.
  if (src.includes('\t') || src.includes('\r')) return null;
  // GFM autolinks and extended autolinks never take this path: a
  // document holding www., a scheme's ://, an @ that could sit in an
  // email address, or a mailto: or xmpp: scheme is never plain,
  // however innocent the rest of it looks. ~~ opens a strikethrough.
  if (src.includes('@') || src.includes('://') || src.includes('~~')) return null;
  const lowered = src.toLowerCase();
  if (lowered.includes('www.') || lowered.includes('mailto:') || lowered.includes('xmpp:')) return null;

  let out = '';
  let paragraph = null;
  const flushParagraph = () => {
    if (paragraph !== null) {
      out += '<p>' + paragraph.map(escapePlainText).join('\n') + '</p>\n';
      paragraph = null;
    }
  };

  for (const line of src.split('\n')) {
    if (line === '' || /^ +$/.test(line)) {
      flushParagraph();
      continue;
    }
    const heading = /^(#{1,6})(?: +(.*))?$/.exec(line);
    if (heading !== null) {
      // Drop trailing spaces, then a closing run of # signs (one that
      // is the whole text, or one set off by a space) as marked does.
      let text = (heading[2] ?? '').replace(/ +$/, '');
      if (/^#+$/.test(text)) text = '';
      else text = text.replace(/ +#+$/, '');
      if (!isPlainText(text)) return null;
      flushParagraph();
      const depth = heading[1].length;
      out += '<h' + depth + '>' + escapePlainText(text) + '</h' + depth + '>\n';
      continue;
    }
    // A line opening with # that is no ATX heading is not plain.
    if (line[0] === '#') return null;
    if (!isPlainParagraphLine(line)) return null;
    if (paragraph === null) paragraph = [];
    paragraph.push(line);
  }
  flushParagraph();
  return out;
}

/** The HTML marked renders for `markdown`, with marked's defaults. */
export function parse(markdown) {
  if (typeof markdown !== 'string') {
    const what = markdown === undefined || markdown === null
      ? 'input parameter is undefined or null'
      : 'input parameter is of type ' + Object.prototype.toString.call(markdown) + ', string expected';
    throw new Error('marked(): ' + what + '\nPlease report this to https://github.com/markedjs/marked.');
  }
  // Whitespace alone renders as the empty string, tabs and all.
  if (/^[ \t\r\n]*$/.test(markdown)) return '';
  const plain = renderPlainDocument(markdown);
  if (plain !== null) return plain;
  // The full pipeline, on the one shared options object: with marked's
  // defaults there are no hooks to run and no tokens to walk, so lexing
  // and parsing are the whole of what marked.parse would do.
  return Parser.parse(Lexer.lex(markdown, sharedOptions), sharedOptions);
}
