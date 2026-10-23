/*
 * Rules for a Comment's text, shared by the server (convex/comments.ts) and
 * the composer, so both refuse the same bodies.
 */

/** The longest Comment, in characters as a person sees them (`countCharacters`). */
export const COMMENT_MAX = 2000;
/** The most Comments one Item (with its Entries) holds, resolved ones included. */
export const MAX_COMMENTS_PER_ITEM = 500;

/**
 * Characters that take no space: zero-width space, the zero-width non-joiner
 * and joiner, word joiner, invisible operators, soft hyphen and the byte order
 * mark. `String.prototype.trim` keeps them.
 */
const INVISIBLE = /[­​-‍⁠-⁤﻿]/g;

/**
 * A body with nothing to read: only whitespace and invisible characters.
 * Joiners inside real text, which Hindi needs ("क्‍ष"), don't make it blank.
 */
export function isBlankComment(body: string): boolean {
  return body.replace(INVISIBLE, "").trim() === "";
}
