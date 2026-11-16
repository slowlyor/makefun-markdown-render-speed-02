// parse.js — a faster drop-in for marked 18.1.3's marked.parse(markdown)
// with marked's default options (gfm true, breaks false, pedantic false,
// async false). parse(markdown) returns exactly the HTML marked returns.
//
// Where the speed comes from:
//
// 1. One shared options object. marked.parse() rebuilds its options on
//    every call, and the Lexer and Parser constructors then wire a fresh
//    tokenizer and renderer into that throwaway object. The defaults never
//    change here, so this module builds the options once and drives the
//    vendored Lexer and Parser directly: the tokenizer and renderer are
//    wired into the shared object a single time and every call after the
//    first goes straight to lexing.
//
// 2. Provably trivial documents never reach the lexer at all (see
//    plainDocument below). Everything the fast path cannot prove is
//    rendered by marked itself, so the output there is marked's by
//    construction.

import { Lexer, Parser, getDefaults } from './vendor/marked/marked.esm.js';

// marked's defaults, built once: { async: false, breaks: false,
// extensions: null, gfm: true, hooks: null, pedantic: false,
// renderer: null, silent: false, tokenizer: null, walkTokens: null }.
const options = getDefaults();

/** Render with marked itself, on the shared options. */
function render(markdown) {
  return Parser.parse(Lexer.lex(markdown, options), options);
}

// A document of nothing but spaces, tabs and line breaks lexes to space
// tokens only, and space tokens render as the empty string.
const whitespaceOnly = /^[\t\r\n ]*$/;

/**
 * The HTML marked renders for `markdown`, with marked's defaults.
 * @param {string} markdown
 * @returns {string}
 */
export function parse(markdown) {
  if (whitespaceOnly.test(markdown)) return '';
  const fast = plainDocument(markdown);
  return fast !== null ? fast : render(markdown);
}

// ---------------------------------------------------------------------
// The plain-document fast path.
//
// plainDocument(src) returns the HTML for src, or null when it cannot
// prove the HTML. It fires only when every block of the document is one
// of:
//
//   - an ATX heading whose text is plain (headingText below), or
//   - a paragraph whose every line is plain (plainLine below),
//
// blocks being separated by truly empty lines. "Plain" text contains no
// character that could start or alter any inline construct — no
// backtick, asterisk, underscore, tilde, bracket, angle bracket,
// ampersand, backslash or pipe — so marked's inline lexer would produce
// a single text token for it, and marked's text escaping is the identity
// on it: its text escaper rewrites only ampersands and numeric character
// references, and the renderer escapes apostrophes, so both quote
// characters are excluded too. GFM's extended autolinks are the other
// trap in plain-looking text: a bare "www." host, a "://" URL or an
// e-mail address would become a link, so any line that could autolink
// is excluded by the substring guard in couldAutolink. A plain
// paragraph line also cannot open or interrupt any block construct:
// its first character is never a block marker (hash, angle,
// list bullet, quote, fence, equals), it never starts with whitespace
// or a tab, never ends with whitespace (no hard break, no setext
// trick), and an ordered-list start is excluded by the digit rule.
// ---------------------------------------------------------------------

const inlineSpecials = /[`*_~[\]<>&\\|'@"]/;

// Substrings that GFM's extended autolinks turn into links even inside
// otherwise plain text: a "www." host, a scheme URL, a mail or XMPP
// address (an "@" is already excluded above; these are the rest).
const autolinkShapes = /www\.|:\/\/|mailto:|xmpp:/i;

/** Whether a line could grow a link the fast path would not render. */
function couldAutolink(line) {
  return autolinkShapes.test(line);
}

/** A line of paragraph text marked can only render as literal text. */
function plainLine(line) {
  if (line === '' || line.trim() !== line) return false;
  const first = line.charCodeAt(0);
  // Block openers and interrupters: # > - + * = < [ ` ~ _
  if (
    first === 35 || first === 62 || first === 45 || first === 43 ||
    first === 42 || first === 61 || first === 60 || first === 91 ||
    first === 96 || first === 126 || first === 95
  ) return false;
  // An ordered list item ("1. ", "2) ", ...) can open a list.
  if (first >= 48 && first <= 57 && /^\d{1,9}[.)] /.test(line)) return false;
  return !inlineSpecials.test(line) && !couldAutolink(line);
}

/** The text of an ATX heading, plain in the same sense as plainLine. */
function headingText(line) {
  const match = /^(#{1,6}) (\S(?:.*\S)?)$/.exec(line);
  if (match === null) return null;
  const text = match[2];
  // A trailing hash would be a closing sequence, which marked strips.
  if (text.endsWith('#') || inlineSpecials.test(text) || couldAutolink(text)) return null;
  return { level: match[1].length, text };
}

/**
 * The HTML of a document made only of plain paragraphs and ATX
 * headings, or null when any part of it is not provably plain.
 */
function plainDocument(src) {
  // marked normalises line endings before it lexes; do the same.
  if (src.includes('\r')) src = src.replace(/\r\n|\r/g, '\n');
  // A tab can indent a code block or a list item; never guess at one.
  if (src.includes('\t')) return null;
  const lines = src.split('\n');
  let html = '';
  let block = [];
  const flush = () => {
    if (block.length === 0) return true;
    if (block.length === 1) {
      const heading = headingText(block[0]);
      if (heading !== null) {
        html += `<h${heading.level}>${heading.text}</h${heading.level}>\n`;
        block = [];
        return true;
      }
    }
    for (const line of block) if (!plainLine(line)) return false;
    html += `<p>${block.join('\n')}</p>\n`;
    block = [];
    return true;
  };
  for (const line of lines) {
    if (line === '') {
      if (!flush()) return null;
    } else {
      block.push(line);
    }
  }
  return flush() ? html : null;
}
