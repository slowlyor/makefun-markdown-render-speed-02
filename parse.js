// parse.js — a faster drop-in for marked 18.1.3.
//
// parse(markdown) returns exactly the HTML that marked.parse(markdown)
// returns with marked's default options (gfm true, breaks false,
// pedantic false, async false), for every string input. The marked
// implementation itself is vendored under vendor/marked (MIT; see
// vendor/marked/LICENSE and vendor/marked/NOTICE).
//
// Why this is faster than marked.parse:
//  1. marked.parse builds a fresh options object on every call, and the
//     Lexer and Parser each rebuild their tokenizer and renderer from
//     it. Here one options object is created once at module load and
//     shared by every render, so the rule tables, tokenizer and
//     renderer are built once and reused.
//  2. A document that can be shown to be plain — blank lines, plain
//     paragraphs and plain ATX headings only, with no inline markup
//     and nothing that could autolink — is rendered by a short direct
//     path that never lexes. Anything that is not provably plain goes
//     through the full marked pipeline below, so the output is marked's
//     output by construction.

import { Lexer, Parser, getDefaults } from './vendor/marked/marked.esm.js';

// One options object for every render. getDefaults() is marked's own
// defaults (gfm true, breaks false, pedantic false, async false, no
// extensions, hooks, renderer, tokenizer or walkTokens); the Lexer and
// Parser attach their reusable tokenizer and renderer to it on first
// use, and with these defaults there are no hooks to run and no tokens
// to walk, so lexing and parsing are the whole of marked.parse.
const options = getDefaults();

// In plain text marked escapes & < > " and '. The plain path never
// admits an ampersand (it could start an entity — see NO_INLINE), and
// '<' never appears either (it could start inline HTML), so the three
// characters below are all escapeText has to handle. An apostrophe
// becomes &#39;, exactly as marked renders it.
const ESCAPES = { '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeText(text) {
  return text.replace(/[>"']/g, (ch) => ESCAPES[ch]);
}

// Characters that can open or take part in an inline construct — a code
// span, emphasis, a link or image, inline HTML, an entity, a backslash
// escape — plus the control characters other than the line feed that
// separates lines. A run of plain text holds none of them.
const NO_INLINE = /[`*_[\]()<&\\\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

function plainText(text) {
  return !NO_INLINE.test(text);
}

// Whether one line can sit inside a plain paragraph: plain text that
// also cannot start, or turn into, some other block. Lines that could
// interrupt a paragraph as an ATX heading are classified by the caller
// before this is consulted.
function plainParagraphLine(line) {
  const first = line[0];
  // A leading space could be an indented code block; > is a block
  // quote; - is a list item, a setext underline or a thematic break.
  if (first === ' ' || first === '>' || first === '-') return false;
  // A + followed by a space starts a bullet list item.
  if (first === '+' && line[1] === ' ') return false;
  // 1. or 1) followed by a space or the end of the line is a list item.
  if (/^\d{1,9}[.)](?: |$)/.test(line)) return false;
  // A line of nothing but = signs is a setext heading underline.
  if (/^=+$/.test(line.replace(/ +$/, ''))) return false;
  // A line of only pipes, colons, dashes and spaces that holds a dash
  // is a table delimiter row.
  if (line.includes('-') && /^[|:\- ]+$/.test(line)) return false;
  // Two or more trailing spaces are a hard line break.
  if (/ {2}$/.test(line)) return false;
  return plainText(line);
}

// Whether the whole document is provably plain. Tabs and carriage
// returns change how marked lexes (indented code blocks, line-ending
// normalisation), so any document holding one is not plain. GFM
// autolinks and extended autolinks never take this path either: a
// document holding www., a scheme's ://, an @ that could sit in an
// email address, or a mailto: or xmpp: scheme is never plain, however
// innocent the rest of it looks. ~~ opens a strikethrough.
function provablyPlain(src) {
  if (src.includes('\t') || src.includes('\r')) return false;
  if (src.includes('@') || src.includes('://') || src.includes('~~')) return false;
  const lowered = src.toLowerCase();
  return !lowered.includes('www.') && !lowered.includes('mailto:') && !lowered.includes('xmpp:');
}

// Render a provably plain document directly, or return null when the
// document is not provably plain and marked itself must render it.
function renderPlain(src) {
  if (!provablyPlain(src)) return null;

  let out = '';
  let paragraph = null;
  const flush = () => {
    if (paragraph !== null) {
      out += '<p>' + paragraph.map(escapeText).join('\n') + '</p>\n';
      paragraph = null;
    }
  };

  for (const line of src.split('\n')) {
    if (line === '' || /^ +$/.test(line)) {
      flush();
      continue;
    }
    const heading = /^(#{1,6})(?: +(.*))?$/.exec(line);
    if (heading !== null) {
      // Drop trailing spaces, then a closing run of # signs — one that
      // is the whole text, or one set off by a space — as marked does.
      let text = (heading[2] ?? '').replace(/ +$/, '');
      if (/^#+$/.test(text)) text = '';
      else text = text.replace(/ +#+$/, '');
      if (!plainText(text)) return null;
      flush();
      const depth = heading[1].length;
      out += '<h' + depth + '>' + escapeText(text) + '</h' + depth + '>\n';
      continue;
    }
    // A line opening with # that is no ATX heading is not plain.
    if (line[0] === '#') return null;
    if (!plainParagraphLine(line)) return null;
    if (paragraph === null) paragraph = [];
    paragraph.push(line);
  }
  flush();
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
  const plain = renderPlain(markdown);
  if (plain !== null) return plain;
  // The full pipeline, on the one shared options object.
  return Parser.parse(Lexer.lex(markdown, options), options);
}
