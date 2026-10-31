// Recipes and batches (spec §14), from the shoot's manifest. Pure: the app passes the manifest
// in and writes the files out.
//
// A recipe is Hook → VO → CTA, all filmed for one channel.
// - Modular VO: one person's Library hook, VO (every beat) and Library CTA.
// - Standalone VO: the VO alone. Its first beat is the hook and its last the CTA, filmed as
//   takes like any beat; it's never paired with Library hooks or CTAs.
// Versions of a VO:
// - its first wordings, by one person (the base);
// - wording mixes: up to `wording_variations` other combinations of the beats' alternate
//   wordings, by one person;
// - cast mixes: up to `vo_variations` mixes of a VO cast on several people on the channel, beats
//   from different people (first wordings), with anyone's Library hook and CTA on the channel.
// Each beat is shown as the speaker on camera (face: no b-roll) or their voice over b-roll. A
// b-roll beat is covered by b-roll from that channel, filed under that beat, added clip by clip
// until their combined length covers the beat (never looped or slowed), topped up with general
// product shots only when the beat's own clips run short. No clip repeats within one video. A VO
// CTA plays over b-roll too: product shots first. The stitcher trims. Each version + hook + CTA
// gets up to `broll_variations` different b-roll selections, each its own recipe.
// B-roll filed for a product feature (b-roll/<beat>/<feature>/) only goes under VOs about that
// feature; generic b-roll goes under any VO. A VO linked to hooks and/or CTAs only goes with those
// (by code); the link is one-way, so they still go with other VOs.
// Treatments (the Library's, the ones that are on): every recipe also gets one version per
// treatment that applies to it, alongside the untreated one (one treatment per version). A layout
// treatment (face to camera, over b-roll) re-lays the VO's beats (and a standalone VO's own hook
// and CTA) and is skipped where it changes nothing or the b-roll can't cover it; Library hooks
// and CTAs keep their own mode. Other treatments apply when the recipe has what they need: text
// (the editor writes it), the speaker's video (every take filmed), the shoot's {{offer}}; old
// footage isn't tracked yet. Muttiplier only says which treatment a version carries: the editor
// makes its text and content, and Showdog draws it.
//
// Paths are relative to the shoot's edited/ folder.

import type { BrollClip, Manifest, TakeClip } from './manifest'
import { slugify } from './slots'

export interface RecipeBeat {
  beat: string
  /** which wording of the beat (1 = the first) */
  option: number
  /** who recorded this beat (a mixed VO's beats come from different people) */
  person: string
  /** the speaker on camera (face) or their voice over b-roll (broll) */
  show: 'face' | 'broll'
  /** the VO recording for this beat */
  vo: string
  duration: number
  /** b-roll under it, in order: their combined length covers the beat (none for a face beat) */
  broll: string[]
}

export interface Recipe {
  /** shoot, channel, people, hook, VO (and wordings), CTA and a hash of the b-roll picks; also the render's file name */
  id: string
  channel: string
  /** the person throughout; for a mixed VO, everyone in it (joined with +) */
  person: string
  /** a mixed VO: its beats come from more than one person */
  mixed: boolean
  /** a standalone VO: its hook and CTA are its own first and last beats */
  standalone: boolean
  /**
   * The opening. A standalone VO's is its hook beat (`take` says which wording), shown face or over
   * b-roll; a Library hook is always on camera.
   */
  hook: { code: string, person: string, item_id: string, take: string | null, file: string, caption: string | null, duration: number, hook_type: string | null, show: 'face' | 'broll', broll: string[] }
  /** item_id: the VO's item (a mixed VO's items joined with +); item_ids: each one. A standalone VO's beats are its middle ones. */
  vo: { code: string, item_id: string, item_ids: string[], format: string | null, beats: RecipeBeat[] }
  /** The close. A standalone VO's is its CTA beat (mode sync when shown face, vo over b-roll). */
  cta: { code: string, person: string, item_id: string, take: string | null, mode: string | null, file: string, caption: string | null, duration: number, broll: string[] }
  /** the VO beats' captions, in order (each beat's SRT, offset by the running length when stitched) */
  vo_captions: (string | null)[]
  /** the treatment this version carries (null = untreated): the editor makes its content, Showdog draws it */
  treatment: RecipeTreatment | null
}

/** A treatment as a recipe carries it: from the plan's `treatments`. */
export interface RecipeTreatment {
  slug: string
  name: string
  kind: string
  placement: string
  needs: string[]
  component: string
  settings: unknown
}

const isVideoFile = (file: string) => /\.(mp4|mov|m4v)$/i.test(file)
/** a layout treatment's layout: every beat face to camera, or every beat over b-roll */
const layoutOf = (treatment: RecipeTreatment): 'face' | 'broll' | null => {
  const show = (treatment.settings as { show?: unknown } | null)?.show
  return treatment.kind === 'layout' && (show === 'face' || show === 'broll') ? show : null
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

/** The most combinations worked out for one VO, before picking the shoot's number of them. */
const MAX_COMBO_CANDIDATES = 5000

/**
 * Up to `count` combinations of a choice per slot (`sizes[i]` choices for slot i), never the
 * all-first one (that's the base version), picked in a fixed order for the seed. Each is a list
 * of choice indexes.
 */
export function pickCombos(sizes: number[], count: number, seed: string): number[][] {
  if (count <= 0 || !sizes.length || sizes.every(size => size <= 1)) return []
  const combos: number[][] = []
  const total = sizes.reduce((product, size) => product * Math.max(1, size), 1)
  for (let n = 1; n < total && combos.length < MAX_COMBO_CANDIDATES; n++) {
    const combo: number[] = []
    let rest = n
    for (const size of sizes) {
      combo.push(rest % Math.max(1, size))
      rest = Math.floor(rest / Math.max(1, size))
    }
    combos.push(combo)
  }
  return combos
    .sort((a, b) => hash(`${seed}|${a.join('.')}`) - hash(`${seed}|${b.join('.')}`))
    .slice(0, count)
}

/**
 * Up to `count` mixes of a VO's beats across its performers: for each beat, whose recording to
 * use. Never all one person (that's a solo recipe). Picked in a fixed order for the VO.
 */
export function beatMixes(performers: string[], beats: number, count: number, seed: string): string[][] {
  if (count <= 0 || performers.length < 2 || beats < 2) return []
  const mixes: string[][] = []
  const total = performers.length ** beats
  for (let n = 0; n < total && mixes.length < MAX_COMBO_CANDIDATES; n++) {
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

const HOOK_BEAT = 'hook'
const CTA_BEAT = 'cta'

/** Every valid recipe in a manifest (see the rules above). */
export function buildRecipes(manifest: Manifest): Recipe[] {
  const shoot = manifest.plan.shoot.code
  // older manifests have none of these: one b-roll selection, no mixing, first wordings only
  const brollVariations = Math.max(1, Number(manifest.plan.shoot.broll_variations) || 1)
  const voVariations = Math.max(0, Number(manifest.plan.shoot.vo_variations) || 0)
  const wordingVariations = Math.max(0, Number(manifest.plan.shoot.wording_variations) || 0)
  const takes = manifest.clips.filter((clip): clip is TakeClip => clip.kind !== 'broll')
  const broll = manifest.clips.filter((clip): clip is BrollClip => clip.kind === 'broll')
  const recipes: Recipe[] = []
  // the treatments that are on (older manifests have none)
  const treatments: RecipeTreatment[] = (manifest.plan.treatments ?? []) as RecipeTreatment[]
  const layouts = treatments.filter(treatment => layoutOf(treatment))
  const others = treatments.filter(treatment => treatment.kind !== 'layout')
  const offer = (manifest.plan.shoot.slot_values as Record<string, unknown> | null | undefined)?.offer
  const hasOffer = typeof offer === 'string' && offer.trim() !== ''

  for (const channel of [...new Set(takes.map(take => take.channel))]) {
    const onChannel = takes.filter(take => take.channel === channel)
    const hooksOn = onChannel.filter(take => take.kind === 'hook' && take.duration)
    const ctasOn = onChannel.filter(take => take.kind === 'cta' && take.duration)
    const channelBrollAll = broll.filter(clip => clip.channel === channel)

    // each person's takes of each VO (by code): beat -> its wordings, in order
    const performances = new Map<string, Map<string, Map<string, TakeClip[]>>>()
    for (const take of onChannel.filter(take => take.kind === 'vo')) {
      const byPerson = performances.get(take.code) ?? new Map<string, Map<string, TakeClip[]>>()
      const byBeat = byPerson.get(take.person) ?? new Map<string, TakeClip[]>()
      byBeat.set(take.beat ?? '', [...(byBeat.get(take.beat ?? '') ?? []), take].sort((a, b) => (a.option ?? 1) - (b.option ?? 1)))
      byPerson.set(take.person, byBeat)
      performances.set(take.code, byPerson)
    }
    /** a person's VO with every beat of its format recorded, with a length, in the format's order */
    const beatOrder = (byBeat: Map<string, TakeClip[]>): string[] | null => {
      const first = [...byBeat.values()][0]?.[0]
      if (!first) return null
      const formatBeats = manifest.plan.formats?.find(format => format.code === first.format)?.beats ?? [...byBeat.keys()]
      if (formatBeats.some(name => !byBeat.get(name)?.some(take => (take.option ?? 1) === 1 && take.duration))) return null
      return formatBeats
    }

    /**
     * Every recipe for one version of a VO: `beats` is the take chosen for each beat, in order.
     * A modular VO goes with the Library hooks and CTAs given; a standalone one with its own.
     */
    const combine = (beats: TakeClip[], hooks: TakeClip[], ctas: TakeClip[], people: string, mixed: boolean, wordingKey: string) => {
      const first = beats[0]!
      const standalone = !!first.standalone
      // generic b-roll, plus b-roll for the feature this VO is about
      const channelBroll = channelBrollAll.filter(clip => !clip.feature || clip.feature === (first.feature ?? null))
      const productShots = channelBroll.filter(clip => clip.section === 'general')
      const itemIds = [...new Set(beats.map(beat => beat.item_id))]
      const takeKeyOf = (take: TakeClip) => (take.option ?? 1) > 1 ? `${take.beat}~${take.option}` : take.beat
      // a standalone VO's own hook and CTA are its first and last beats; the rest is the VO
      const ownHook = standalone ? beats.find(beat => beat.beat === HOOK_BEAT) ?? null : null
      const ownCta = standalone ? beats.find(beat => beat.beat === CTA_BEAT) ?? null : null
      const body = standalone ? beats.filter(beat => beat !== ownHook && beat !== ownCta) : beats
      if (standalone && (!ownHook || !ownCta)) return
      const hookChoices = standalone ? [ownHook!] : hooks.filter(hook => !first.hooks || first.hooks.includes(hook.code))
      const ctaChoices = standalone ? [ownCta!] : ctas.filter(cta => !first.ctas || first.ctas.includes(cta.code))
      // the takes a layout treatment re-lays: the VO's beats, and a standalone VO's own hook and CTA
      const laidOut = standalone ? [ownHook!, ...body, ownCta!] : body
      const speakerVideo = laidOut.every(take => isVideoFile(take.file))
      /** does a treatment (other than a layout) apply to this version? */
      const applies = (treatment: RecipeTreatment) => treatment.needs.every(need =>
        need === 'text' || (need === 'speaker_video' && speakerVideo) || (need === 'offer' && hasOffer))

      // the untreated version, then one per layout treatment that changes something
      for (const layoutTreatment of [null, ...layouts]) {
        const layout = layoutTreatment ? layoutOf(layoutTreatment) : null
        const showOf = (take: TakeClip): 'face' | 'broll' => layout ?? (take.show === 'face' ? 'face' : 'broll')
        if (layoutTreatment) {
          if (laidOut.every(take => (take.show === 'face' ? 'face' : 'broll') === layout)) continue
          if (!layoutTreatment.needs.every(need => need !== 'speaker_video' || speakerVideo)) continue
        }
        for (const hook of hookChoices) {
          for (const cta of ctaChoices) {
            const base = standalone
              ? mixed
                ? `${shoot}_${channel}_mix_${first.code}-${beats.map(beat => beat.person).join('.')}`
                : `${shoot}_${channel}_${people}_${first.code}${wordingKey}`
              : mixed
                ? `${shoot}_${channel}_mix_${hook.person}-${hook.code}_${first.code}-${beats.map(beat => beat.person).join('.')}_${cta.person}-${cta.code}`
                : `${shoot}_${channel}_${people}_${hook.code}_${first.code}${wordingKey}_${cta.code}`
            const seen = new Set<string>()
            for (let variation = 0; variation < brollVariations; variation++) {
              // the first selection keeps the seed recipes always had, so their IDs don't change
              const seed = variation ? `${base}|v${variation}` : base
              const used = new Set<string>()
              const cover = (take: TakeClip, own: BrollClip[], extra: BrollClip[], key: string) => fill(take.duration!, own, extra, used, `${seed}|${key}`)
              const sectionOf = (name: string) => channelBroll.filter(clip => clip.section === slugify(name))

              // a standalone hook shown over b-roll is covered like a beat
              let hookBroll: string[] = []
              if (standalone && showOf(hook) === 'broll') {
                const files = cover(hook, sectionOf(HOOK_BEAT), productShots, HOOK_BEAT)
                if (!files) break
                hookBroll = files
              }
              const filled: RecipeBeat[] = []
              let valid = true
              for (const beat of body) {
                let files: string[] = []
                if (showOf(beat) === 'broll') {
                  // general product shots top a beat up only when its own clips run short
                  const picked = cover(beat, sectionOf(beat.beat ?? ''), productShots, beat.beat ?? '')
                  if (!picked) {
                    valid = false
                    break
                  }
                  files = picked
                }
                filled.push({ beat: beat.beat ?? '', option: beat.option ?? 1, person: beat.person, show: showOf(beat), vo: beat.file, duration: beat.duration!, broll: files })
              }
              if (!valid) break
              // a VO CTA (or a standalone CTA shown over b-roll) plays over b-roll, product shots first
              const ctaMode = standalone ? (showOf(cta) === 'face' ? 'sync' : 'vo') : cta.mode
              let ctaBroll: string[] = []
              if (ctaMode === 'vo') {
                const others = channelBroll.filter(clip => clip.section !== 'general')
                const files = cover(cta, productShots, others, 'cta')
                if (!files) break
                ctaBroll = files
              }
              const picks = [...hookBroll, '|', ...filled.flatMap(beat => beat.broll), '|', ...ctaBroll].join(',')
              // the first selection's picks keep the shape they always had, so its ID doesn't change
              const idPicks = hookBroll.length ? picks : [...filled.flatMap(beat => beat.broll), '|', ...ctaBroll].join(',')
              // too little b-roll for another different selection
              if (seen.has(picks)) continue
              seen.add(picks)
              const recipe: Recipe = {
                // a treated version ends in the treatment's name; untreated IDs are as they always were
                id: `${base}_${shortHash(idPicks)}${layoutTreatment ? `_${layoutTreatment.slug}` : ''}`,
                channel,
                person: people,
                mixed,
                standalone,
                hook: {
                  code: hook.code, person: hook.person, item_id: hook.item_id, take: standalone ? takeKeyOf(hook) : null,
                  file: hook.file, caption: hook.caption, duration: hook.duration!, hook_type: hook.hook_type,
                  show: standalone ? showOf(hook) : 'face', broll: hookBroll
                },
                vo: { code: first.code, item_id: itemIds.join('+'), item_ids: itemIds, format: first.format, beats: filled },
                cta: {
                  code: cta.code, person: cta.person, item_id: cta.item_id, take: standalone ? takeKeyOf(cta) : null,
                  mode: ctaMode, file: cta.file, caption: cta.caption, duration: cta.duration!, broll: ctaBroll
                },
                vo_captions: body.map(beat => beat.caption),
                treatment: layoutTreatment
              }
              recipes.push(recipe)
              // the other treatments: a version of the untreated recipe for each that applies
              if (!layoutTreatment) {
                for (const treatment of others.filter(applies)) {
                  recipes.push({ ...recipe, id: `${recipe.id}_${treatment.slug}`, treatment })
                }
              }
            }
          }
        }
      }
    }

    for (const [code, byPerson] of performances) {
      const ready = [...byPerson]
        .map(([person, byBeat]) => ({ person, byBeat, order: beatOrder(byBeat) }))
        .filter((entry): entry is { person: string, byBeat: Map<string, TakeClip[]>, order: string[] } => !!entry.order)
        .sort((a, b) => a.person.localeCompare(b.person))

      for (const { person, byBeat, order } of ready) {
        // each beat's recorded wordings (with a length), first wording first
        const wordings = order.map(name => byBeat.get(name)!.filter(take => take.duration))
        const hooks = hooksOn.filter(take => take.person === person)
        const ctas = ctasOn.filter(take => take.person === person)
        // the base version: every beat's first wording
        combine(wordings.map(list => list[0]!), hooks, ctas, person, false, '')
        // wording mixes: other combinations of the alternates
        for (const combo of pickCombos(wordings.map(list => list.length), wordingVariations, `${shoot}|${channel}|${code}|${person}`)) {
          const beats = combo.map((choice, index) => wordings[index]![choice]!)
          combine(beats, hooks, ctas, person, false, `.${beats.map(beat => beat.option ?? 1).join('.')}`)
        }
      }

      // cast mixes: first wordings from the people cast on it, with anyone's hook and CTA on this channel
      const order = ready[0]?.order ?? []
      const mixes = beatMixes(ready.map(entry => entry.person), order.length, voVariations, `${shoot}|${channel}|${code}`)
      for (const mix of mixes) {
        const beats = order.map((name, index) => ready.find(entry => entry.person === mix[index])!.byBeat.get(name)![0]!)
        combine(beats, hooksOn, ctasOn, [...new Set(mix)].sort().join('+'), true, '')
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
 * one more "person"), then format, then hook type has been used least so far (so every person, mixed
 * VOs and every format appear before any repeats), favouring parts rated good; CTAs and b-roll only break
 * ties. Ties after that break on a stable hash.
 */
/** A hook + VO pair: a standalone VO's hook wordings count as different hooks. */
const pairKey = (recipe: Recipe) => `${recipe.hook.item_id}|${recipe.hook.take ?? ''}|${recipe.vo.item_id}`

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
    count(`hook_type:${recipe.hook.hook_type}`),
    count(`treatment:${recipe.treatment?.slug ?? ''}`),
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
      if (pairs.has(pairKey(recipe))) continue
      const s = score(recipe)
      if (!best || better(s, bestScore)) {
        best = recipe
        bestScore = s
      }
    }
    if (!best) break
    chosen.push(best)
    pairs.add(pairKey(best))
    bump(`person:${best.mixed ? '(mixed)' : best.person}`)
    bump(`format:${best.vo.format}`)
    bump(`hook_type:${best.hook.hook_type}`)
    bump(`treatment:${best.treatment?.slug ?? ''}`)
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
  const rows: unknown[][] = [['recipe', 'channel', 'person', 'hook', 'vo', 'cta', 'format', 'hook_type', 'treatment']]
  for (const recipe of recipes) {
    rows.push([recipe.id, recipe.channel, recipe.person, recipe.hook.code, recipe.vo.code, recipe.cta.code, recipe.vo.format ?? '', recipe.hook.hook_type ?? '', recipe.treatment?.name ?? ''])
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
