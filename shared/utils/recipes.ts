// Recipes and batches (spec §14), from the shoot's manifest. Pure: the app passes the manifest
// in and writes the files out.
//
// A recipe is exactly Hook → VO → CTA: one person's hook, VO (every beat) and CTA, all filmed for
// one channel. The VO is the spine: each beat is covered by b-roll from that channel, filed under
// that beat, added clip by clip until their combined length covers the beat (never looped or
// slowed), topped up with general product shots only when the beat's own clips run short. The
// product beat must include a clip with the product visible, and no clip repeats within one
// video. A VO CTA plays over b-roll too: product shots first. The stitcher trims.
//
// Paths are relative to the shoot's edited/ folder.

import type { BrollClip, Manifest, TakeClip } from './manifest'
import { slugify } from './slots'

export interface RecipeBeat {
  beat: string
  /** the VO recording for this beat */
  vo: string
  duration: number
  /** b-roll under it, in order: their combined length covers the beat */
  broll: string[]
}

export interface Recipe {
  /** shoot, channel, person, hook, VO, CTA and a hash of the b-roll picks; also the render's file name */
  id: string
  channel: string
  person: string
  hook: { code: string, item_id: string, file: string, caption: string | null, duration: number, angle: string | null }
  vo: { code: string, item_id: string, format: string | null, angle: string | null, beats: RecipeBeat[] }
  cta: { code: string, item_id: string, mode: string | null, file: string, caption: string | null, duration: number, broll: string[] }
  /** the VO beats' captions, in order (each beat's SRT, offset by the running length when stitched) */
  vo_captions: (string | null)[]
}

/** Deterministic string hash, so picks and IDs are the same every time for the same inputs. */
export function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}
const shortHash = (text: string) => hash(text).toString(16).padStart(8, '0')

const isProductBeat = (beat: string) => slugify(beat).includes('product')

/**
 * Fill `duration` seconds from `own` (the beat's clips) then `extra` (product shots), clip by clip
 * in a fixed order for this recipe, skipping clips already used in the video. A product beat
 * starts with a product-visible clip. Null when it can't be covered.
 */
function fill(duration: number, own: BrollClip[], extra: BrollClip[], used: Set<string>, seed: string, needsProduct: boolean): string[] | null {
  const order = (clips: BrollClip[]) => [...clips].sort((a, b) => hash(`${seed}|${a.file}`) - hash(`${seed}|${b.file}`))
  const candidates = [...order(own), ...order(extra)].filter(clip => !used.has(clip.file) && (clip.duration ?? 0) > 0)
  const picks: BrollClip[] = []
  if (needsProduct) {
    const product = candidates.find(clip => clip.product_visible)
    if (!product) return null
    picks.push(product)
  }
  let covered = picks.reduce((sum, clip) => sum + clip.duration!, 0)
  for (const clip of candidates) {
    if (covered >= duration) break
    if (picks.includes(clip)) continue
    picks.push(clip)
    covered += clip.duration!
  }
  if (covered < duration) return null
  for (const clip of picks) used.add(clip.file)
  return picks.map(clip => clip.file)
}

/** Every valid recipe in a manifest (see the rules above). */
export function buildRecipes(manifest: Manifest): Recipe[] {
  const shoot = manifest.plan.shoot.code
  const takes = manifest.clips.filter((clip): clip is TakeClip => clip.kind !== 'broll')
  const broll = manifest.clips.filter((clip): clip is BrollClip => clip.kind === 'broll')
  const recipes: Recipe[] = []

  // one person on one channel at a time
  const groups = new Map<string, TakeClip[]>()
  for (const take of takes) {
    const key = `${take.channel}|${take.person}`
    groups.set(key, [...(groups.get(key) ?? []), take])
  }

  for (const [key, group] of groups) {
    const [channel, person] = key.split('|') as [string, string]
    const hooks = group.filter(take => take.kind === 'hook' && take.duration)
    const ctas = group.filter(take => take.kind === 'cta' && take.duration)
    // a VO is its beats, in the format's order; every beat needs its recording
    const vos = new Map<string, TakeClip[]>()
    for (const take of group.filter(take => take.kind === 'vo')) vos.set(take.item_id, [...(vos.get(take.item_id) ?? []), take])
    const channelBroll = broll.filter(clip => clip.channel === channel)
    const productShots = channelBroll.filter(clip => clip.section === 'general')

    for (const hook of hooks) {
      for (const beats of vos.values()) {
        if (beats.some(beat => !beat.duration)) continue
        for (const cta of ctas) {
          const base = `${shoot}_${channel}_${person}_${hook.code}_${beats[0]!.code}_${cta.code}`
          const used = new Set<string>()
          const filled: RecipeBeat[] = []
          let valid = true
          for (const beat of beats) {
            const own = channelBroll.filter(clip => clip.section === slugify(beat.beat ?? ''))
            // general product shots top a beat up only when its own clips run short
            const files = fill(beat.duration!, own, productShots, used, `${base}|${beat.beat}`, isProductBeat(beat.beat ?? ''))
            if (!files) {
              valid = false
              break
            }
            filled.push({ beat: beat.beat ?? '', vo: beat.file, duration: beat.duration!, broll: files })
          }
          if (!valid) continue
          let ctaBroll: string[] = []
          if (cta.mode === 'vo') {
            const others = channelBroll.filter(clip => clip.section !== 'general')
            const files = fill(cta.duration!, productShots, others, used, `${base}|cta`, false)
            if (!files) continue
            ctaBroll = files
          }
          const picks = [...filled.flatMap(beat => beat.broll), '|', ...ctaBroll].join(',')
          recipes.push({
            id: `${base}_${shortHash(picks)}`,
            channel,
            person,
            hook: { code: hook.code, item_id: hook.item_id, file: hook.file, caption: hook.caption, duration: hook.duration!, angle: hook.angle },
            vo: { code: beats[0]!.code, item_id: beats[0]!.item_id, format: beats[0]!.format, angle: beats[0]!.angle, beats: filled },
            cta: { code: cta.code, item_id: cta.item_id, mode: cta.mode, file: cta.file, caption: cta.caption, duration: cta.duration!, broll: ctaBroll },
            vo_captions: beats.map(beat => beat.caption)
          })
        }
      }
    }
  }
  return recipes.sort((a, b) => a.id.localeCompare(b.id))
}

// --- batches (Best in Show) ---------------------------------------------------------------

export interface BatchOptions {
  size: number
  /** recipe ids already batched: never batched again */
  exclude?: Set<string>
  /** item id -> rating: recipes with a part rated bad are left out, good parts are favoured */
  ratings?: Map<string, 'good' | 'bad'>
}

/** How many recipes a batch takes: the shoot's share of the valid ones (at least one if there are any). */
export const batchSize = (valid: number, rate: number) => valid ? Math.max(1, Math.round(valid * rate)) : 0

/** The recipes a batch can choose from: never batched, nothing rated bad. */
export function availableRecipes(recipes: Recipe[], options: Omit<BatchOptions, 'size'>) {
  const bad = (id: string) => options.ratings?.get(id) === 'bad'
  return recipes.filter(recipe => !options.exclude?.has(recipe.id) && !bad(recipe.hook.item_id) && !bad(recipe.vo.item_id) && !bad(recipe.cta.item_id))
}

/**
 * Choose a batch, one recipe at a time. No two recipes share a hook + VO pair. Each pick is the
 * recipe whose person, then format, then angle has been used least so far (so every person and
 * format appears before any repeats), favouring parts rated good; CTAs and b-roll only break
 * ties. Ties after that break on a stable hash.
 */
export function chooseBatch(recipes: Recipe[], options: BatchOptions): Recipe[] {
  const candidates = availableRecipes(recipes, options)
  const good = (id: string) => options.ratings?.get(id) === 'good' ? 1 : 0
  const used = new Map<string, number>()
  const count = (key: string) => used.get(key) ?? 0
  const bump = (key: string) => used.set(key, count(key) + 1)
  const pairs = new Set<string>()
  const chosen: Recipe[] = []

  const score = (recipe: Recipe): number[] => [
    count(`person:${recipe.person}`),
    count(`format:${recipe.vo.format}`),
    count(`angle:${recipe.hook.angle ?? recipe.vo.angle}`),
    -(good(recipe.hook.item_id) + good(recipe.vo.item_id) + good(recipe.cta.item_id)),
    count(`hook:${recipe.hook.item_id}`) + count(`vo:${recipe.vo.item_id}`),
    count(`cta:${recipe.cta.item_id}`),
    recipe.vo.beats.flatMap(beat => beat.broll).reduce((sum, file) => sum + count(`broll:${file}`), 0),
    hash(recipe.id)
  ]
  const better = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]!
    return false
  }

  while (chosen.length < options.size) {
    let best: Recipe | null = null
    let bestScore: number[] = []
    for (const recipe of candidates) {
      if (pairs.has(`${recipe.hook.item_id}|${recipe.vo.item_id}`)) continue
      const s = score(recipe)
      if (!best || better(s, bestScore)) {
        best = recipe
        bestScore = s
      }
    }
    if (!best) break
    chosen.push(best)
    pairs.add(`${best.hook.item_id}|${best.vo.item_id}`)
    bump(`person:${best.person}`)
    bump(`format:${best.vo.format}`)
    bump(`angle:${best.hook.angle ?? best.vo.angle}`)
    bump(`hook:${best.hook.item_id}`)
    bump(`vo:${best.vo.item_id}`)
    bump(`cta:${best.cta.item_id}`)
    for (const file of best.vo.beats.flatMap(beat => beat.broll)) bump(`broll:${file}`)
  }
  return chosen
}

/** B01, B02…: the next batch code after the existing ones. */
export function nextBatchCode(existing: string[]) {
  const n = Math.max(0, ...existing.map(code => Number(code.replace(/^B/, '')) || 0)) + 1
  return `B${String(n).padStart(2, '0')}`
}

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** One row per recipe in a batch, for people. */
export function batchCsv(recipes: Recipe[]) {
  const rows: unknown[][] = [['recipe', 'channel', 'person', 'hook', 'vo', 'cta', 'format', 'angle']]
  for (const recipe of recipes) {
    rows.push([recipe.id, recipe.channel, recipe.person, recipe.hook.code, recipe.vo.code, recipe.cta.code, recipe.vo.format ?? '', recipe.hook.angle ?? recipe.vo.angle ?? ''])
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
