// Script rules: words an org doesn't want in its scripts (Settings → Scripts), each with the
// warning to show and what to say instead. Flagged while writing; a connected AI is told the same.

export interface ScriptRule {
  /** words or phrases to flag; case doesn't matter, and plurals ("owners") are caught too */
  phrases: string[]
  /** the warning shown when one is used */
  message: string
  /** what to say instead (optional) */
  suggestion?: string
}

/** Read `settings.script_rules` defensively. */
export function parseScriptRules(value: unknown): ScriptRule[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map(entry => ({
      phrases: Array.isArray(entry.phrases) ? entry.phrases.map(phrase => String(phrase).trim()).filter(Boolean) : [],
      message: String(entry.message ?? '').trim(),
      ...(typeof entry.suggestion === 'string' && entry.suggestion.trim() ? { suggestion: entry.suggestion.trim() } : {})
    }))
    .filter(rule => rule.phrases.length)
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A phrase as a pattern: whole words, any case, a space or hyphen between words, an optional plural. */
function phrasePattern(phrase: string) {
  return phrase.trim().split(/[\s-]+/).map(escape).join('[\\s-]+') + '(?:e?s)?'
}

export interface FlaggedWord {
  /** the text as written */
  text: string
  index: number
  rule: ScriptRule
}

/** Every use of a rule's phrases in a script, in order. Overlaps go to the longest phrase. */
export function flaggedWords(text: string, rules: ScriptRule[]): FlaggedWord[] {
  const found: FlaggedWord[] = []
  for (const rule of rules) {
    // longest first, so "dog owner" wins over "owner"
    const phrases = [...rule.phrases].sort((a, b) => b.length - a.length)
    if (!phrases.length) continue
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${phrases.map(phrasePattern).join('|')})(?![\\p{L}\\p{N}])`, 'giu')
    for (const match of text.matchAll(pattern)) found.push({ text: match[0], index: match.index!, rule })
  }
  found.sort((a, b) => a.index - b.index || b.text.length - a.text.length)
  const kept: FlaggedWord[] = []
  for (const word of found) {
    const last = kept.at(-1)
    if (!last || word.index >= last.index + last.text.length) kept.push(word)
  }
  return kept
}

/** Split plain text into runs, marking the flagged words, for highlighting. */
export function splitFlagged(text: string, rules: ScriptRule[]): { text: string, flagged: boolean }[] {
  const runs: { text: string, flagged: boolean }[] = []
  let at = 0
  for (const word of flaggedWords(text, rules)) {
    if (word.index > at) runs.push({ text: text.slice(at, word.index), flagged: false })
    runs.push({ text: word.text, flagged: true })
    at = word.index + word.text.length
  }
  if (at < text.length || !runs.length) runs.push({ text: text.slice(at), flagged: false })
  return runs
}

/** The rules as instructions for an AI (given through Kreate's AI connector). */
export function scriptRulesForAi(rules: ScriptRule[]): string {
  if (!rules.length) return ''
  return ['Words to avoid:', ...rules.map(rule =>
    `- Never say ${rule.phrases.map(phrase => `"${phrase}"`).join(', ')}${rule.message ? ` (${rule.message})` : ''}.${rule.suggestion ? ` Say "${rule.suggestion}" instead.` : ''}`)].join('\n')
}
