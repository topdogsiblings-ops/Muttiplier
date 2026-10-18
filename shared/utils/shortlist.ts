// Shortlists (spec §14): checking the editors' work, every possible recipe, and choosing which
// recipes to render. Pure: the server routes list Dropbox and pass the files in.
//
// Paths here are relative to the shoot's raw/ or edited/ folder, e.g. "hooks/joe/H01.mov" or
// "b-roll/nix/problem/IMG_4821.mov". The local stitching app gets the edited/ folder, the
// recipes file and a shortlist, so every file is relative to edited/.
//
// A recipe is a channel's hook + VO + CTA (recipes.json lists them all). A shortlist is just a
// list of entries, each a recipe reference plus a b-roll order: which clips go under each beat,
// in order. The same recipe can be rendered again later with a different b-roll order
// (another variation), so later shortlists skip recipe + variation pairs already used.

import type { ItemKind } from './calculator'
import type { BundleItem, ShootBundle } from './shootsheet'
import { KIND_FOLDER, brollFolder, shootFolder } from './shootsheet'
import { slugify } from './slots'

const VIDEO = new Set(['mov', 'mp4', 'm4v', 'hevc', 'avi', 'mkv', 'webm'])
const AUDIO = new Set(['m4a', 'mp3', 'wav', 'aac', 'caf', 'aif', 'aiff', 'flac', 'ogg', 'opus'])
/** captions and other sidecars sit next to their clip and aren't clips themselves */
const SIDECAR = new Set(['srt', 'vtt', 'txt', 'json', 'xml', 'ass'])
/** b-roll clips laid under each beat (the stitcher trims them to the VO) */
export const BROLL_CLIPS_PER_BEAT = 2

const extension = (path: string) => path.includes('.') ? path.slice(path.lastIndexOf('.') + 1).toLowerCase() : ''
const withoutExtension = (path: string) => path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : path
const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1)
const baseName = (path: string) => withoutExtension(path.slice(path.lastIndexOf('/') + 1))
const isClip = (path: string) => !SIDECAR.has(extension(path)) && !baseName(path).startsWith('.')

/** What a deliverable has to be: hooks and sync CTAs are filmed, VOs and VO CTAs recorded. */
export const mediaFor = (item: Pick<BundleItem, 'kind' | 'cta_mode'>): 'video' | 'audio' =>
  item.kind === 'body' || (item.kind === 'cta' && item.cta_mode === 'vo') ? 'audio' : 'video'

const kindOfFile = (path: string): 'video' | 'audio' | 'other' =>
  VIDEO.has(extension(path)) ? 'video' : AUDIO.has(extension(path)) ? 'audio' : 'other'

/** A hook, VO or CTA's folder relative to raw/ or edited/: "hooks/joe/". */
function itemFolderRelative(bundle: ShootBundle, item: BundleItem) {
  const person = bundle.people.find(p => p.id === item.person_id)?.slug ?? 'unknown'
  return `${KIND_FOLDER[item.kind]}/${person}/`
}

/** The clip file for an item in a listing: the one named by its code (any extension). */
export function itemFile(bundle: ShootBundle, item: BundleItem, files: string[]) {
  const folder = itemFolderRelative(bundle, item)
  return files.filter(file => folderOf(file) === folder && isClip(file) && baseName(file).toLowerCase() === item.code.toLowerCase())
}

/** Items that were filmed (skipped and unfilmed ones have no footage to check or use). */
const filmed = (bundle: ShootBundle) => bundle.items.filter(item => item.status === 'filmed')

// --- the editors' work ---------------------------------------------------------

export interface EditsCheck {
  ok: boolean
  problems: string[]
  rawClips: number
  editedClips: number
}

/**
 * Before a shoot is ready for shortlist: every filmed hook, VO and CTA has its clip in raw/ and
 * edited/, named by its code and of the right kind (video or audio); and edited/ mirrors raw/
 * clip for clip, same folders and same names (extensions can differ, editors re-export).
 * `onPhones` is clips still saved on phones, not uploaded yet.
 */
export function checkEdits(bundle: ShootBundle, raw: string[], edited: string[], onPhones = 0): EditsCheck {
  const problems: string[] = []
  const personName = (id: string) => bundle.people.find(p => p.id === id)?.name ?? 'someone'
  if (onPhones > 0) problems.push(`${onPhones} clip${onPhones === 1 ? ' is' : 's are'} still on phones: upload them first`)

  for (const item of filmed(bundle)) {
    const label = `${item.code} (${personName(item.person_id)})`
    const expected = mediaFor(item)
    for (const [stage, files] of [['raw', raw], ['edited', edited]] as const) {
      const found = itemFile(bundle, item, files)
      if (!found.length) problems.push(`${label}: no ${expected} file named ${item.code} in ${stage}/${itemFolderRelative(bundle, item)}`)
      else if (found.length > 1) problems.push(`${label}: ${found.length} files named ${item.code} in ${stage}/${itemFolderRelative(bundle, item)}`)
      else if (kindOfFile(found[0]!) !== expected) problems.push(`${label}: ${stage}/${found[0]} should be ${expected === 'video' ? 'a video' : 'an audio file'}`)
    }
  }

  // edited/ mirrors raw/: same clips, same places, same names
  const key = (file: string) => withoutExtension(file).toLowerCase()
  const rawKeys = new Map(raw.filter(isClip).map(file => [key(file), file]))
  const editedKeys = new Map(edited.filter(isClip).map(file => [key(file), file]))
  const missing = [...rawKeys].filter(([k]) => !editedKeys.has(k)).map(([, file]) => file)
  const extra = [...editedKeys].filter(([k]) => !rawKeys.has(k)).map(([, file]) => file)
  const list = (files: string[]) => files.slice(0, 6).join(', ') + (files.length > 6 ? `… (${files.length - 6} more)` : '')
  if (missing.length) problems.push(`Not in edited/ yet: ${list(missing)}`)
  if (extra.length) problems.push(`In edited/ but not raw/ (renamed or misplaced?): ${list(extra)}`)

  return { ok: !problems.length, problems, rawClips: rawKeys.size, editedClips: editedKeys.size }
}

// --- recipes ---------------------------------------------------------------------

export interface RecipePart {
  code: string
  person: string
  /** the shoot item, for ratings */
  item_id: string
  /** relative to edited/ */
  file: string
}

export interface Recipe {
  /** e.g. "nix_H01-joe_V02-mak_C01-bren": stable, so shortlists can reference it */
  id: string
  channel: string | null
  /** hook + VO: the same concept can end with different CTAs and b-roll */
  concept: string
  hook: RecipePart
  vo: RecipePart & { format: string | null, beats: string[] }
  cta: RecipePart & { mode: string | null }
}

/** One render: a recipe, and the b-roll order under it. */
export interface ShortlistEntry {
  /** recipe + variation, e.g. "nix_H01-joe_V02-mak_C01-bren_v2": never shortlisted twice */
  id: string
  recipe: string
  variation: number
  /** clips under each VO beat (and under a VO CTA), in order, relative to edited/ */
  broll: { beat: string, files: string[] }[]
}

/** Deterministic string hash, so b-roll picks and tie-breaks are stable between runs. */
function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * Every possible recipe (spec §9): per channel, a hook × VO × CTA. On a channel with linked
 * people, parts mix across them; otherwise each person's own hook, VO and CTA go together.
 * Only filmed parts with their edited clip are used.
 */
export function buildRecipes(bundle: ShootBundle, edited: string[]): Recipe[] {
  const items = filmed(bundle)
  const person = (id: string) => bundle.people.find(p => p.id === id)?.slug ?? 'unknown'
  const fileOf = (item: BundleItem) => itemFile(bundle, item, edited)[0]
  const channels: ({ id: string, slug: string } | null)[] = bundle.channels.length ? bundle.channels.map(c => ({ id: c.id, slug: c.slug })) : [null]
  const recipes: Recipe[] = []

  for (const channel of channels) {
    // the same person's hook, VO and CTA, all filmed for this channel
    const of = (kind: ItemKind, people: string[]) => items.filter(item =>
      item.kind === kind && people.includes(item.person_id) && (!channel || item.channel_id === channel.id))
    const groups = bundle.people.map(p => [p.id])

    for (const people of groups) {
      for (const hook of of('hook', people)) {
        for (const vo of of('body', people)) {
          for (const cta of of('cta', people)) {
            const [hookFile, voFile, ctaFile] = [fileOf(hook), fileOf(vo), fileOf(cta)]
            if (!hookFile || !voFile || !ctaFile) continue
            const part = (item: BundleItem, file: string): RecipePart => ({ code: item.code, person: person(item.person_id), item_id: item.id, file })
            recipes.push({
              id: `${channel?.slug ?? 'all'}_${hook.code}-${person(hook.person_id)}_${vo.code}-${person(vo.person_id)}_${cta.code}-${person(cta.person_id)}`,
              channel: channel?.slug ?? null,
              concept: `${hook.code}-${person(hook.person_id)}+${vo.code}-${person(vo.person_id)}`,
              hook: part(hook, hookFile),
              vo: { ...part(vo, voFile), format: vo.format?.code ?? null, beats: vo.format?.beats ?? [] },
              cta: { ...part(cta, ctaFile), mode: cta.cta_mode }
            })
          }
        }
      }
    }
  }
  return recipes
}

/**
 * The renders a shortlist can choose from: each recipe in `broll_variations` b-roll orders.
 * Variation n puts `BROLL_CLIPS_PER_BEAT` clips under each beat from the channel's beat folder
 * (falling back to its general product shots), starting at a different place each time, so
 * variations of a recipe don't repeat clips while the folder has enough.
 */
export function buildRenders(bundle: ShootBundle, edited: string[], recipes: Recipe[]): { entry: ShortlistEntry, recipe: Recipe }[] {
  const shoot = shootFolder(bundle)
  const relative = (full: string) => full.slice(`${shoot}/edited/`.length)
  const clips = edited.filter(file => isClip(file) && kindOfFile(file) === 'video')
  const channelId = (slug: string | null) => bundle.channels.find(c => c.slug === slug)?.id ?? null
  const pool = (channel: string | null, beat: string | null) => {
    const folder = `${relative(brollFolder(bundle, { format_id: beat ? 'format' : null, beat: beat ?? '' }, channelId(channel), 'edited'))}/`
    return clips.filter(file => folderOf(file) === folder).sort()
  }
  const pick = (files: string[], seed: string, variation: number) => {
    if (!files.length) return []
    const take = Math.min(BROLL_CLIPS_PER_BEAT, files.length)
    const start = hash(seed) + (variation - 1) * take
    return Array.from({ length: take }, (_, i) => files[(start + i) % files.length]!)
  }
  const variations = Math.max(1, bundle.shoot.broll_variations)

  return recipes.flatMap(recipe => Array.from({ length: variations }, (_, index) => {
    const variation = index + 1
    const general = pool(recipe.channel, null)
    const broll = recipe.vo.beats.map((beat) => {
      const own = pool(recipe.channel, slugify(beat) || 'misc')
      return { beat, files: pick(own.length ? own : general, `${recipe.concept}|${beat}`, variation) }
    })
    // a VO CTA plays over b-roll too: general product shots
    if (recipe.cta.mode === 'vo') broll.push({ beat: 'cta', files: pick(general, `${recipe.concept}|cta`, variation) })
    return { entry: { id: `${recipe.id}_v${variation}`, recipe: recipe.id, variation, broll }, recipe }
  }))
}

// --- choosing a shortlist -------------------------------------------------------

type Render = { entry: ShortlistEntry, recipe: Recipe }

export interface ShortlistOptions {
  size: number
  /** entry ids (recipe + variation) already shortlisted: never picked again */
  exclude?: Set<string>
  /** item id -> rating: recipes with a bad part are left out, good parts are favoured */
  ratings?: Map<string, 'good' | 'bad'>
}

/** The renders a new shortlist can choose from: not shortlisted before, nothing rated bad. */
export function availableRenders(renders: Render[], options: Omit<ShortlistOptions, 'size'>) {
  const bad = (part: RecipePart) => options.ratings?.get(part.item_id) === 'bad'
  return renders.filter(({ entry, recipe }) => !options.exclude?.has(entry.id) && !bad(recipe.hook) && !bad(recipe.vo) && !bad(recipe.cta))
}

/**
 * Choose `size` renders, one at a time: each pick is the one whose hook, VO, CTA, concept and
 * channel have been used least so far (so the shortlist spreads across everything), with a
 * boost for every part rated good. Ties break on a stable hash, not alphabetically.
 */
export function chooseShortlist(renders: Render[], options: ShortlistOptions): ShortlistEntry[] {
  const candidates = availableRenders(renders, options)
  const good = (part: RecipePart) => options.ratings?.get(part.item_id) === 'good' ? 1 : 0
  const used = new Map<string, number>()
  const count = (key: string) => used.get(key) ?? 0
  const bump = (key: string) => used.set(key, count(key) + 1)
  // channels share the shortlist in proportion to how many recipes each has
  const channelShare = new Map<string, number>()
  for (const { recipe } of candidates) channelShare.set(String(recipe.channel), (channelShare.get(String(recipe.channel)) ?? 0) + 1)

  const chosen: Render[] = []
  const taken = new Set<string>()
  const target = Math.min(options.size, candidates.length)
  while (chosen.length < target) {
    let best: Render | null = null
    let bestScore = -Infinity
    for (const render of candidates) {
      const { entry, recipe } = render
      if (taken.has(entry.id)) continue
      const channel = String(recipe.channel)
      const score
        = 3 * (good(recipe.hook) + good(recipe.vo) + good(recipe.cta))
          - count(`hook:${recipe.hook.item_id}`)
          - count(`vo:${recipe.vo.item_id}`)
          - 0.7 * count(`cta:${recipe.cta.item_id}`)
          - 2 * count(`concept:${recipe.channel}:${recipe.concept}`)
          - count(`channel:${channel}`) / (channelShare.get(channel)! / candidates.length) / Math.max(1, target)
          - (hash(entry.id) % 1000) / 1e6
      if (score > bestScore) {
        bestScore = score
        best = render
      }
    }
    if (!best) break
    const { recipe } = best
    chosen.push(best)
    taken.add(best.entry.id)
    bump(`hook:${recipe.hook.item_id}`)
    bump(`vo:${recipe.vo.item_id}`)
    bump(`cta:${recipe.cta.item_id}`)
    bump(`concept:${recipe.channel}:${recipe.concept}`)
    bump(`channel:${String(recipe.channel)}`)
  }
  return chosen.map(render => render.entry)
}

/** SL01, SL02…: the next shortlist code after the existing ones. */
export function nextShortlistCode(existing: string[]) {
  const n = Math.max(0, ...existing.map(code => Number(code.replace(/^SL/, '')) || 0)) + 1
  return `SL${String(n).padStart(2, '0')}`
}

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** One row per render, for people: the recipe's parts and the b-roll order. */
export function shortlistCsv(entries: ShortlistEntry[], recipes: Recipe[]) {
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]))
  const rows: unknown[][] = [['entry', 'recipe', 'channel', 'hook', 'vo', 'cta', 'variation', 'hook_file', 'vo_file', 'cta_file', 'broll']]
  for (const entry of entries) {
    const recipe = byId.get(entry.recipe)
    if (!recipe) continue
    rows.push([
      entry.id,
      recipe.id,
      recipe.channel ?? '',
      `${recipe.hook.code} ${recipe.hook.person}`,
      `${recipe.vo.code} ${recipe.vo.person}`,
      `${recipe.cta.code} ${recipe.cta.person}`,
      entry.variation,
      recipe.hook.file,
      recipe.vo.file,
      recipe.cta.file,
      entry.broll.map(beat => `[${beat.beat}] ${beat.files.join(' ')}`).join(' ')
    ])
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
