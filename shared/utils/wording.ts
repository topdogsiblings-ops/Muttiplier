// Words to avoid in scripts. We talk about dog parents, never "owners": it's too cold for how
// people feel about their dogs. Flagged as a warning while writing; AI drafting is told the same.

/** "owner", "owners", "ownership", including "dog owner" and "pet-owner". */
const OWNER = /\b(?:(?:dog|pet|puppy)[\s-]?)?owner(?:s|ship)?\b/gi

export interface FlaggedWord {
  /** the text as written */
  text: string
  index: number
  suggestion: string
}

/** Every "owner" in a script, with what to say instead. */
export function flaggedWords(text: string): FlaggedWord[] {
  return [...text.matchAll(OWNER)].map(match => ({
    text: match[0],
    index: match.index!,
    suggestion: /ship$/i.test(match[0]) ? 'being a dog parent' : /s$/i.test(match[0]) ? 'dog parents' : 'dog parent'
  }))
}

/** Split plain text into runs, marking the flagged words, for highlighting. */
export function splitFlagged(text: string): { text: string, flagged: boolean }[] {
  const runs: { text: string, flagged: boolean }[] = []
  let at = 0
  for (const word of flaggedWords(text)) {
    if (word.index > at) runs.push({ text: text.slice(at, word.index), flagged: false })
    runs.push({ text: word.text, flagged: true })
    at = word.index + word.text.length
  }
  if (at < text.length || !runs.length) runs.push({ text: text.slice(at), flagged: false })
  return runs
}
