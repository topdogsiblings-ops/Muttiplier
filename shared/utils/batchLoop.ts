// The batch loop (spec §14b), once a shoot is Live. Each batch goes batched -> rendering ->
// submitted -> measured. Measuring scores every element the batch used (its hooks, VOs, CTAs,
// formats, hook types, treatments and people; b-roll isn't scored) as a winner, mid or loser, and
// opens the next batch. The next batch learns from every score so far:
// - Drop: leave out any recipe with a dropped element (2+ losers and no wins, or dropped by hand);
// - Exploit: the shoot's share (70% by default) goes to recipes made of elements that have won;
// - Explore: the rest goes to recipes with elements not tried yet.
// Nothing is ever batched twice. Pure: the app loads the scores and passes them in.

import type { Recipe } from './recipes'
import { chooseBatch } from './recipes'

/** The elements that make a recipe, most important first: picks favour winning (or untried) treatments, then hooks, then formats… */
export const ELEMENT_KINDS = ['treatment', 'hook', 'format', 'hook_type', 'vo', 'cta', 'person'] as const
export type ElementKind = typeof ELEMENT_KINDS[number]
export const ELEMENT_LABELS: Record<ElementKind, string> = {
  treatment: 'Treatments', hook: 'Hooks', format: 'Formats', hook_type: 'Hook types', vo: 'VOs', cta: 'CTAs', person: 'People'
}
/** how much an element counts when ranking recipes: treatments, hooks and formats count double */
const WEIGHT: Record<ElementKind, number> = { treatment: 2, hook: 2, format: 2, hook_type: 1, vo: 1, cta: 1, person: 1 }

export const SCORES = ['winner', 'mid', 'loser'] as const
export type Score = typeof SCORES[number]

/**
 * What each score means, judged on the ads that used the element once they've had time to spend
 * (Motion's 2025-26 benchmark definitions).
 */
export const SCORE_GUIDE: Record<Score, { label: string, rule: string }> = {
  winner: { label: 'Winner', rule: 'At least one ad with it spent 10× the account’s median ad, and at least $500.' },
  mid: { label: 'Mid', rule: 'Its ads kept spending for 28+ days, but none became a winner.' },
  loser: { label: 'Loser', rule: 'Its ads got little or no spend: the platform stopped serving them.' }
}

/** Losers it takes to drop an element automatically, as long as it has never won. */
export const DROP_AFTER_LOSSES = 2
export const DEFAULT_EXPLOIT_SHARE = 0.7

export interface Element { kind: ElementKind, key: string }
export const elementId = (element: Element) => `${element.kind}:${element.key}`

/**
 * The elements a recipe is made of. A standalone VO's hook and CTA are its own beats, so they're
 * scored with the VO; an untreated recipe has no treatment to score.
 */
export function recipeElements(recipe: Recipe): Element[] {
  const elements: Element[] = []
  if (recipe.treatment) elements.push({ kind: 'treatment', key: recipe.treatment.slug })
  if (!recipe.standalone) elements.push({ kind: 'hook', key: recipe.hook.code })
  if (recipe.vo.format) elements.push({ kind: 'format', key: recipe.vo.format })
  if (recipe.hook.hook_type) elements.push({ kind: 'hook_type', key: recipe.hook.hook_type })
  elements.push({ kind: 'vo', key: recipe.vo.code })
  if (!recipe.standalone) elements.push({ kind: 'cta', key: recipe.cta.code })
  const people = new Set([recipe.hook.person, ...recipe.vo.beats.map(beat => beat.person), recipe.cta.person].filter(Boolean))
  for (const person of people) elements.push({ kind: 'person', key: person })
  return elements
}

/** Every element a set of recipes uses, in kind order then key. */
export function batchElements(recipes: Recipe[]): Element[] {
  const seen = new Map<string, Element>()
  for (const recipe of recipes) for (const element of recipeElements(recipe)) seen.set(elementId(element), element)
  return [...seen.values()].sort((a, b) =>
    ELEMENT_KINDS.indexOf(a.kind) - ELEMENT_KINDS.indexOf(b.kind) || a.key.localeCompare(b.key, 'en', { numeric: true }))
}

export interface ScoreRow { element_kind: string, element_key: string, score: string }
export interface OverrideRow { element_kind: string, element_key: string, dropped: boolean }

export interface ElementRecord {
  winners: number
  mids: number
  losers: number
  /** dropped: by hand, or automatically (2+ losers, no wins) */
  dropped: boolean
  /** dropped or kept by hand, overriding the automatic rule */
  manual: boolean
}

/** Each scored (or overridden) element's tally across the measured batches, by elementId. */
export function elementRecords(scores: ScoreRow[], overrides: OverrideRow[] = []): Map<string, ElementRecord> {
  const records = new Map<string, ElementRecord>()
  const record = (kind: string, key: string) => {
    const id = `${kind}:${key}`
    const existing = records.get(id) ?? { winners: 0, mids: 0, losers: 0, dropped: false, manual: false }
    records.set(id, existing)
    return existing
  }
  for (const row of scores) {
    const r = record(row.element_kind, row.element_key)
    if (row.score === 'winner') r.winners++
    else if (row.score === 'mid') r.mids++
    else if (row.score === 'loser') r.losers++
  }
  for (const r of records.values()) r.dropped = r.losers >= DROP_AFTER_LOSSES && r.winners === 0
  for (const row of overrides) {
    const r = record(row.element_kind, row.element_key)
    r.dropped = row.dropped
    r.manual = true
  }
  return records
}

/** Where an element stands: won, dropped, tried (scored, no win yet) or untried. */
export function elementState(record: ElementRecord | undefined): 'winner' | 'dropped' | 'tried' | 'untried' {
  if (record?.dropped) return 'dropped'
  if (!record || record.winners + record.mids + record.losers === 0) return 'untried'
  return record.winners ? 'winner' : 'tried'
}

export interface PickOptions {
  size: number
  /** recipe ids already in a batch: never batched again */
  exclude?: Set<string>
  /** the share of the batch to exploit what's won (0-1); the rest explores */
  exploitShare?: number
  records?: Map<string, ElementRecord>
}

export interface Pick {
  recipes: Recipe[]
  /** how many were picked to exploit winners, and to explore untried elements */
  exploit: number
  explore: number
  /** recipes left out because an element is dropped */
  dropped: number
}

/**
 * Pick the next batch. Before anything has won, it's all exploring (the usual Best in Show spread).
 * After that, the exploit share goes to recipes with the most (weighted) winning elements, and the
 * rest to recipes with the most untried elements, topped up from whatever's left if either runs
 * short. Within each, Best in Show still spreads people, formats, hook types and treatments, and no
 * two recipes share a hook + VO pair.
 */
export function pickBatch(recipes: Recipe[], options: PickOptions): Pick {
  const records = options.records ?? new Map<string, ElementRecord>()
  const exclude = options.exclude ?? new Set<string>()
  const stateOf = (element: Element) => elementState(records.get(elementId(element)))
  const open = recipes.filter(recipe => !exclude.has(recipe.id))
  const available = open.filter(recipe => !recipeElements(recipe).some(element => stateOf(element) === 'dropped'))
  const dropped = open.length - available.length
  const weigh = (recipe: Recipe, state: ReturnType<typeof elementState>) =>
    recipeElements(recipe).filter(element => stateOf(element) === state).reduce((sum, element) => sum + WEIGHT[element.kind], 0)

  const anyWinner = [...records.values()].some(record => record.winners > 0 && !record.dropped)
  if (!anyWinner) {
    const chosen = chooseBatch(available, { size: options.size })
    return { recipes: chosen, exploit: 0, explore: chosen.length, dropped }
  }

  const share = Math.min(1, Math.max(0, options.exploitShare ?? DEFAULT_EXPLOIT_SHARE))
  const exploitPool = available.filter(recipe => weigh(recipe, 'winner') > 0)
  const exploit = chooseBatch(exploitPool, { size: Math.round(options.size * share), prefer: recipe => -weigh(recipe, 'winner') })
  const taken = new Set(exploit.map(recipe => recipe.id))
  const explorePool = available.filter(recipe => !taken.has(recipe.id) && weigh(recipe, 'untried') > 0)
  const explore = chooseBatch(explorePool, { size: options.size - exploit.length, prefer: recipe => -weigh(recipe, 'untried'), after: exploit })
  const chosen = [...exploit, ...explore]
  // either side ran short: top up from the rest
  if (chosen.length < options.size) {
    const used = new Set(chosen.map(recipe => recipe.id))
    chosen.push(...chooseBatch(available.filter(recipe => !used.has(recipe.id)), { size: options.size - chosen.length, after: chosen }))
  }
  return { recipes: chosen, exploit: exploit.length, explore: chosen.length - exploit.length, dropped }
}
