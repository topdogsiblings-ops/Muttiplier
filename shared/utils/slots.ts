// Slot templating (spec §5). Pure: shared by the editor previews, the shoot builder and the exports.

export const BUILT_IN_SLOTS = ['brand', 'product', 'dog'] as const

const SLOT_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export type SlotContext = Record<string, string | null | undefined>

export type Segment
  = | { type: 'text', text: string }
    | { type: 'slot', name: string, raw: string, value: string | null }

export interface Beat {
  beat: string
  script: string
}

/** Slot names used in a script: lowercased, unique, in order of first appearance. */
export function extractSlots(text: string): string[] {
  const names: string[] = []
  for (const match of text.matchAll(SLOT_PATTERN)) {
    const name = match[1]!.toLowerCase()
    if (!names.includes(name)) names.push(name)
  }
  return names
}

/**
 * Values available to a script. `brand` and `product` come from the product, `dog` from the
 * channel, everything else from the product's slot_values. Built-ins win over custom slots.
 */
export function buildSlotContext(source: {
  brand?: string | null
  product?: string | null
  dogPhrase?: string | null
  slotValues?: unknown
}): SlotContext {
  const context: SlotContext = {}
  if (source.slotValues && typeof source.slotValues === 'object' && !Array.isArray(source.slotValues)) {
    for (const [key, value] of Object.entries(source.slotValues)) {
      if (typeof value === 'string' || typeof value === 'number') context[key.toLowerCase()] = String(value)
    }
  }
  context.brand = source.brand
  context.product = source.product
  context.dog = source.dogPhrase
  return context
}

function lookup(context: SlotContext, name: string): string | null {
  const value = context[name]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** Split a script into plain text and slots, with each slot's value (null when unfilled). */
export function renderSegments(text: string, context: SlotContext = {}): Segment[] {
  const segments: Segment[] = []
  let cursor = 0
  for (const match of text.matchAll(SLOT_PATTERN)) {
    if (match.index > cursor) segments.push({ type: 'text', text: text.slice(cursor, match.index) })
    const name = match[1]!.toLowerCase()
    segments.push({ type: 'slot', name, raw: match[0], value: lookup(context, name) })
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) segments.push({ type: 'text', text: text.slice(cursor) })
  return segments
}

/** Fill a script. Unfilled slots are left in place as `{{name}}` and reported. */
export function renderScript(text: string, context: SlotContext = {}): { text: string, unfilled: string[] } {
  const unfilled: string[] = []
  const rendered = renderSegments(text, context).map((segment) => {
    if (segment.type === 'text') return segment.text
    if (segment.value !== null) return segment.value
    if (!unfilled.includes(segment.name)) unfilled.push(segment.name)
    return `{{${segment.name}}}`
  })
  return { text: rendered.join(''), unfilled }
}

export function renderBeats(beats: Beat[], context: SlotContext = {}): { beats: Beat[], unfilled: string[] } {
  const unfilled: string[] = []
  const rendered = beats.map((beat) => {
    const result = renderScript(beat.script, context)
    for (const name of result.unfilled) if (!unfilled.includes(name)) unfilled.push(name)
    return { beat: beat.beat, script: result.text }
  })
  return { beats: rendered, unfilled }
}

/** Universal hooks may only use `{{dog}}`. Returns the slots that break the rule. */
export function universalHookViolations(script: string): string[] {
  return extractSlots(script).filter(name => name !== 'dog')
}

/** Read a `beats` jsonb value defensively. */
export function parseBeats(value: unknown): Beat[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map(entry => ({ beat: String(entry.beat ?? ''), script: String(entry.script ?? '') }))
}

/** One beat per format beat, in the format's order, keeping any script already written for it. */
export function alignBeats(formatBeats: string[], beats: Beat[]): Beat[] {
  return formatBeats.map(name => ({ beat: name, script: beats.find(b => b.beat === name)?.script ?? '' }))
}

/** Beat names must match the format's beats exactly, in order. */
export function beatsMatchFormat(formatBeats: string[], beats: Beat[]): boolean {
  return beats.length === formatBeats.length && beats.every((beat, index) => beat.beat === formatBeats[index])
}

/** `[problem] … [product] … [result] …` */
export function joinBeats(beats: Beat[]): string {
  return beats.map(beat => `[${beat.beat}] ${beat.script}`).join(' ')
}

export function bodyUsesDog(beats: Beat[]): boolean {
  return beats.some(beat => extractSlots(beat.script).includes('dog'))
}

/** Typical speaking pace: about 150 words a minute. Configurable in Settings → Defaults. */
export const DEFAULT_WORDS_PER_SECOND = 2.5

/** Words in a script. A `{{slot}}` counts as one word. */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Seconds to read a script aloud at a pace, rounded up. */
export function estimateSeconds(text: string, wordsPerSecond = DEFAULT_WORDS_PER_SECOND): number {
  const words = countWords(text)
  return words && wordsPerSecond > 0 ? Math.ceil(words / wordsPerSecond) : 0
}

/** lowercase kebab-case, safe for folder names */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
