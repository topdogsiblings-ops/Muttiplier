// Recipes and batches (spec §14), from the shoot's manifest. Pure: the app passes the manifest
// in and writes the files out.
//
// A recipe is exactly Hook → VO → CTA, all filmed for one channel. Solo: one person's hook, VO
// (every beat) and CTA. Mixed: a VO cast on several people on the channel (they record the same
// script, beat for beat) with its beats taken from different people, up to the shoot's
// `vo_variations` mixes per VO per channel; its hook and CTA come from anyone on the channel.
// The VO is the spine: each beat is covered by b-roll from that channel, filed under that beat,
// added clip by clip until their combined length covers the beat (never looped or slowed),
// topped up with general product shots only when the beat's own clips run short. No clip
// repeats within one video. A VO CTA plays over b-roll too: product shots first. The stitcher
// trims. Each hook + VO + CTA gets up to `broll_variations` different b-roll selections, each its
// own recipe.
// B-roll filed for a product feature (b-roll/<beat>/<feature>/) only goes under VOs about that
// feature; generic b-roll goes under any VO. A VO linked to hooks and/or CTAs only goes with those
// (by code); the link is one-way, so they still go with other VOs.
//
// Paths are relative to the shoot's edited/ folder.

import type { BrollClip, Manifest, TakeClip } from './manifest'
import { slugify } from './slots'

export interface RecipeBeat {
  beat: string
  /** who recorded this beat (a mixed VO's beats come from different people) */
  person: string
  /** the VO recording for this beat */
  vo: string
  duration: number
  /** b-roll under it, in order: their combined length covers the beat */
  broll: string[]
}

export interface Recipe {
  /** shoot, channel, people, hook, VO, CTA and a hash of the b-roll picks; also the render's file name */
  id: string
  channel: string
  /** the person throughout; for a mixed VO, everyone in it (joined with +) */
  person: string
  /** a mixed VO: its beats come from more than one person */
  mixed: boolean
  hook: { code: string, person: string, item_id: string, file: string, caption: string | null, duration: number, angle: string | null }
  /** item_id: the VO's item (a mixed VO's items joined with +); item_ids: each one */
  vo: { code: string, item_id: string, item_ids: string[], format: string | null, angle: string | null, beats: RecipeBeat[] }
  cta: { code: string, person: string, item_id: string, mode: string | null, file: string, caption: string | null, duration: number, broll: string[] }
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

/**
 * Fill `duration` seconds from `own` (the beat's clips) then `extra` (product shots), clip by clip
 * in a fixed order for this recipe, skipping clips already used in the video. Null when it can't
 * be covered.
 */
function fill(duration: number, own: BrollClip[], extra: BrollClip[], used: Set<string>, seed: string): string[] | null {
  const order = (clips: BrollClip[]) => [...clips].sort((a, b) => hash(`${seed}|${a.file}`) - hash(`${seed}|${b.file}`))
  const candidates = [...order(own), ...order(extra)].filter(clip => !used.has(clip.file) && (clip.duration ?? 0) > 0)
  const picks: BrollClip[] = []
  let covered = 0
  for (const clip of candidates) {
    if (covered >= duration) break
    picks.push(clip)
    covered += clip.duration!
  }
  if (covered < duration) return null
  for (const clip of picks) used.add(clip.file)
  return picks.map(clip => clip.file)
}

/** The most beat mixes worked out for one VO, before picking the shoot's number of them. */
const MAX_MIX_CANDIDATES = 5000

/**
 * Up to `count` mixes of a VO's beats across its performers: for each beat, whose recording to
 * use. Never all one person (that's a solo recipe). Picked in a fixed order for the VO.
 */
export function beatMixes(performers: string[], beats: number, count: number, seed: string): string[][] {
  if (count <= 0 || performers.length < 2 || beats < 2) return []
  const mixes: string[][] = []
  const total = performers.length ** beats
  for (let n = 0; n < total && mixes.length < MAX_MIX_CANDIDATES; n++) {
    const mix: string[] = []
    let rest = n
    for (let b = 0; b < beats; b++) {
      mix.push(performers[rest % performers.length]!)
      rest = Math.floor(rest / performers.length)
    }
    if (new Set(mix).size > 1) mixes.push(mix)
  }
  return mixes
    .sort((a, b) => hash(`${seed}|${a.join('.')}`) - hash(`${seed}|${b.join('.')}`))
    .slice(0, count)
}

/** Every valid recipe in a manifest (see the rules above). */
export function buildRecipes(manifest: Manifest): Recipe[] {
  const shoot = manifest.plan.shoot.code
  // older manifests have neither: one b-roll selection, no mixing
  const brollVariations = Math.max(1, Number(manifest.plan.shoot.broll_variations) || 1)
  const voVariations = Math.max(0, Number(manifest.plan.shoot.vo_variations) || 0)
  const takes = manifest.clips.filter((clip): clip is TakeClip => clip.kind !== 'broll')
  const broll = manifest.clips.filter((clip): clip is BrollClip => clip.kind === 'broll')
  const recipes: Recipe[] = []

  for (const channel of [...new Set(takes.map(take => take.channel))]) {
    const onChannel = takes.filter(take => take.channel === channel)
    const hooksOn = onChannel.filter(take => take.kind === 'hook' && take.duration)
    const ctasOn = onChannel.filter(take => take.kind === 'cta' && take.duration)
    const channelBrollAll = broll.filter(clip => clip.channel === channel)

    // each person's performance of each VO (by code): its beats, in the format's order, each recorded
    const performances = new Map<string, Map<string, TakeClip[]>>()
    for (const take of onChannel.filter(take => take.kind === 'vo')) {
      const byPerson = performances.get(take.code) ?? new Map<string, TakeClip[]>()
      byPerson.set(take.person, [...(byPerson.get(take.person) ?? []), take])
      performances.set(take.code, byPerson)
    }
    const complete = (beats: TakeClip[]) => {
      // every beat of the VO's format, each with a length (a manifest marked ready anyway can be short of some)
      const formatBeats = manifest.plan.formats?.find(format => format.code === beats[0]!.format)?.beats
      if (formatBeats && formatBeats.some(name => !beats.some(beat => beat.beat === name))) return false
      return beats.every(beat => beat.duration)
    }

    /** Every recipe for one VO performance (solo or mixed) with the hooks and CTAs it can go with. */
    const combine = (beats: TakeClip[], hooks: TakeClip[], ctas: TakeClip[], people: string, mixed: boolean) => {
      const first = beats[0]!
      // generic b-roll, plus b-roll for the feature this VO is about
      const channelBroll = channelBrollAll.filter(clip => !clip.feature || clip.feature === (first.feature ?? null))
      const productShots = channelBroll.filter(clip => clip.section === 'general')
      const itemIds = [...new Set(beats.map(beat => beat.item_id))]
      for (const hook of hooks) {
        if (first.hooks && !first.hooks.includes(hook.code)) continue
        for (const cta of ctas) {
          if (first.ctas && !first.ctas.includes(cta.code)) continue
          const base = mixed
            ? `${shoot}_${channel}_mix_${hook.person}-${hook.code}_${first.code}-${beats.map(beat => beat.person).join('.')}_${cta.person}-${cta.code}`
            : `${shoot}_${channel}_${people}_${hook.code}_${first.code}_${cta.code}`
          const seen = new Set<string>()
          for (let variation = 0; variation < brollVariations; variation++) {
            // the first selection keeps the seed recipes always had, so their IDs don't change
            const seed = variation ? `${base}|v${variation}` : base
            const used = new Set<string>()
            const filled: RecipeBeat[] = []
            let valid = true
            for (const beat of beats) {
              const own = channelBroll.filter(clip => clip.section === slugify(beat.beat ?? ''))
              // general product shots top a beat up only when its own clips run short
              const files = fill(beat.duration!, own, productShots, used, `${seed}|${beat.beat}`)
              if (!files) {
                valid = false
                break
              }
              filled.push({ beat: beat.beat ?? '', person: beat.person, vo: beat.file, duration: beat.duration!, broll: files })
            }
            if (!valid) break
            let ctaBroll: string[] = []
            if (cta.mode === 'vo') {
              const others = channelBroll.filter(clip => clip.section !== 'general')
              const files = fill(cta.duration!, productShots, others, used, `${seed}|cta`)
              if (!files) break
              ctaBroll = files
            }
            const picks = [...filled.flatMap(beat => beat.broll), '|', ...ctaBroll].join(',')
            // too little b-roll for another different selection
            if (seen.has(picks)) continue
            seen.add(picks)
            recipes.push({
              id: `${base}_${shortHash(picks)}`,
              channel,
              person: people,
              mixed,
              hook: { code: hook.code, person: hook.person, item_id: hook.item_id, file: hook.file, caption: hook.caption, duration: hook.duration!, angle: hook.angle },
              vo: { code: first.code, item_id: itemIds.join('+'), item_ids: itemIds, format: first.format, angle: first.angle, beats: filled },
              cta: { code: cta.code, person: cta.person, item_id: cta.item_id, mode: cta.mode, file: cta.file, caption: cta.caption, duration: cta.duration!, broll: ctaBroll },
              vo_captions: beats.map(beat => beat.caption)
            })
          }
        }
      }
    }

    for (const [code, byPerson] of performances) {
      const ready = [...byPerson].filter(([, beats]) => complete(beats)).sort(([a], [b]) => a.localeCompare(b))
      // solo: one person throughout
      for (const [person, beats] of ready) {
        combine(beats, hooksOn.filter(take => take.person === person), ctasOn.filter(take => take.person === person), person, false)
      }
      // mixed: beats from the people cast on it, with anyone's hook and CTA on this channel
      const order = ready[0]?.[1].map(beat => beat.beat) ?? []
      const mixes = beatMixes(ready.map(([person]) => person), order.length, voVariations, `${shoot}|${channel}|${code}`)
      for (const mix of mixes) {
        const beats = order.map((name, index) => byPerson.get(mix[index]!)!.find(beat => beat.beat === name)!)
        combine(beats, hooksOn, ctasOn, [...new Set(mix)].sort().join('+'), true)
      }
    }
  }
  return recipes.sort(byChannel)
}

/** Recipes grouped by channel, then by ID: everything a shoot produces is split by channel first. */
export const byChannel = (a: Recipe, b: Recipe) => a.channel.localeCompare(b.channel) || a.id.localeCompare(b.id)

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
  const voItems = (recipe: Recipe) => recipe.vo.item_ids ?? [recipe.vo.item_id]
  return recipes.filter(recipe => !options.exclude?.has(recipe.id) && !bad(recipe.hook.item_id) && !voItems(recipe).some(bad) && !bad(recipe.cta.item_id))
}

/**
 * Choose a batch, one recipe at a time. No two recipes share a hook + VO pair, so b-roll
 * variations of one go in later batches. Each pick is the recipe whose person (mixed VOs count as
 * one more "person"), then format, then angle has been used least so far (so every person, mixed
 * VOs and every format appear before any repeats), favouring parts rated good; CTAs and b-roll only break
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
    count(`person:${recipe.mixed ? '(mixed)' : recipe.person}`),
    count(`format:${recipe.vo.format}`),
    count(`angle:${recipe.hook.angle ?? recipe.vo.angle}`),
    -(good(recipe.hook.item_id) + Math.max(0, ...(recipe.vo.item_ids ?? [recipe.vo.item_id]).map(good)) + good(recipe.cta.item_id)),
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
    bump(`person:${best.mixed ? '(mixed)' : best.person}`)
    bump(`format:${best.vo.format}`)
    bump(`angle:${best.hook.angle ?? best.vo.angle}`)
    bump(`hook:${best.hook.item_id}`)
    bump(`vo:${best.vo.item_id}`)
    bump(`cta:${best.cta.item_id}`)
    for (const file of best.vo.beats.flatMap(beat => beat.broll)) bump(`broll:${file}`)
  }
  return chosen
}

/**
 * A batch as it's written out: grouped by channel (in channel order), keeping the order the
 * recipes were picked in within each channel. Which recipes are in it doesn't change.
 */
export function batchOrder(chosen: Recipe[]): Recipe[] {
  const channels = [...new Set(chosen.map(recipe => recipe.channel))].sort((a, b) => a.localeCompare(b))
  return channels.flatMap(channel => chosen.filter(recipe => recipe.channel === channel))
}

/** The folder a batch's renders for one channel go in, relative to the shoot folder (each is <recipe id>.mp4). */
export const renderFolder = (batch: string, channel: string) => `renders/${batch}/${channel}`

/** B01, B02…: the next batch code after the existing ones. */
export function nextBatchCode(existing: string[]) {
  const n = Math.max(0, ...existing.map(code => Number(code.replace(/^B/, '')) || 0)) + 1
  return `B${String(n).padStart(2, '0')}`
}

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** One row per recipe in a batch, for people, in the order given (batchOrder). */
export function batchCsv(recipes: Recipe[]) {
  const rows: unknown[][] = [['recipe', 'channel', 'person', 'hook', 'vo', 'cta', 'format', 'angle']]
  for (const recipe of recipes) {
    rows.push([recipe.id, recipe.channel, recipe.person, recipe.hook.code, recipe.vo.code, recipe.cta.code, recipe.vo.format ?? '', recipe.hook.angle ?? recipe.vo.angle ?? ''])
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
