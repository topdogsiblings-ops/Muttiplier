// Shoot codes, folder paths and the export builders (spec §10). Pure: shared by the
// builder, the shot sheet and the Nitro export routes.
import type { Beat, SlotContext } from './slots'
import { buildSlotContext, joinBeats, parseBeats, renderBeats, renderScript, slugify } from './slots'
import type { ItemKind } from './calculator'

/** 2: custom slot values moved from plan.product to plan.shoot */
export const SHOOTSHEET_SCHEMA_VERSION = 2
export const DEFAULT_BEATS = ['problem', 'product', 'result']

export interface BundleChannel {
  id: string
  name: string
  slug: string
  folder_slug: string
  dogs: string[]
  dog_phrase: string
}

export interface BundleItem {
  id: string
  code: string
  kind: ItemKind
  person_id: string
  channel_id: string | null
  script_snapshot: unknown
  script_override: unknown
  cta_mode: string | null
  location: string | null
  status: string
  take_notes?: string | null
  sort_order: number
  template_id: string
  angle: string | null
  /** hooks: how to film it, from the template */
  filming_notes?: string | null
  /** hooks: suggested post caption, copied from the template like the script and frozen when planned */
  caption?: string | null
  title?: string | null
  /** VOs: the person on the cast who wrote it; only they perform it. Null = anyone. */
  writer_id?: string | null
  /** the Library template's source link, if it has one */
  source_url?: string | null
  /** how the filmed clip did, for later shortlists: good ones favoured, bad ones left out */
  rating?: 'good' | 'bad' | null
  format: {
    code: string
    cta_modes: string[]
    beats: string[]
    id?: string
    name?: string
    description?: string | null
    /** beat -> what the beat is for */
    beat_descriptions?: Record<string, string> | null
    /** beat -> suggested b-roll shots */
    beat_broll?: unknown
  } | null
}

export interface BundleBroll {
  id?: string
  channel_id: string | null
  /** null = a general product shot */
  format_id?: string | null
  beat: string
  description: string
  product_visible: boolean
  min_clips: number
  status: string
  sort_order?: number
}

export interface ShootBundle {
  shoot: {
    id?: string
    code: string
    shoot_date: string | null
    status: string
    broll_variations: number
    submission_rate: number
    /** custom slots filled in for this shoot ({{benefit}}…); built-ins fill themselves */
    slot_values?: unknown
  }
  brand: { name: string, slug: string }
  product: { name: string, slug: string }
  people: { id: string, slug: string, name: string }[]
  channels: BundleChannel[]
  items: BundleItem[]
  broll: BundleBroll[]
  /** shoot people linked to each channel; on those channels recipes mix people */
  channelPeople?: Record<string, string[]>
}

// --- codes -----------------------------------------------------------------

/** H = hook, V = body (VO), C = CTA */
export function itemPrefix(kind: ItemKind): 'H' | 'V' | 'C' {
  if (kind === 'hook') return 'H'
  return kind === 'body' ? 'V' : 'C'
}

export function formatItemCode(prefix: string, n: number): string {
  return prefix + String(n).padStart(2, '0')
}

/** The next `count` free codes for a prefix, continuing after the highest one in use. */
export function nextItemCodes(existingCodes: string[], prefix: string, count: number): string[] {
  let highest = 0
  for (const code of existingCodes) {
    const match = code.match(/^([A-Z])(\d+)$/)
    if (match && match[1] === prefix) highest = Math.max(highest, Number(match[2]))
  }
  return Array.from({ length: count }, (_, index) => formatItemCode(prefix, highest + index + 1))
}

/**
 * Every item is filmed per person per channel, but a script that doesn't name the dog reads the
 * same on every channel, so the person records it once and that one take fills each channel's
 * spot. Items with the same key are one recording. A draft's script still says {{dog}}, so it's
 * per channel; a planned shoot's has the dog phrase filled in, so it differs per channel anyway.
 */
export function recordingKey(item: Pick<BundleItem, 'person_id' | 'channel_id' | 'code' | 'script_snapshot' | 'script_override'>): string {
  const script = JSON.stringify(item.script_override ?? item.script_snapshot ?? '')
  const perChannel = script.includes('{{dog}}')
  return `${item.person_id}|${item.code}|${perChannel ? item.channel_id : '*'}|${script}`
}

/** The channels a person films for on a shoot: the shoot's channels they're linked to. */
export function channelsFor(bundle: Pick<ShootBundle, 'channels' | 'channelPeople'>, personId: string) {
  return bundle.channels.filter(channel => bundle.channelPeople?.[channel.id]?.includes(personId))
}

// --- scripts ---------------------------------------------------------------

/**
 * `{{dog}}` comes from the channel. An item used for every channel is filled as long as every
 * channel on the shoot has a dog phrase: it shows each one ("my Doberman / my Vizsla") so the
 * person filming can see the options. It's only unfilled when a channel has no phrase.
 */
export function dogPhraseFor(channelId: string | null, channels: BundleChannel[]): string | null {
  if (channelId) return channels.find(channel => channel.id === channelId)?.dog_phrase?.trim() || null
  const phrases = channels.map(channel => channel.dog_phrase?.trim() ?? '')
  if (!phrases.length || phrases.some(phrase => !phrase)) return null
  return [...new Set(phrases)].join(' / ')
}

export function itemSlotContext(bundle: Pick<ShootBundle, 'shoot' | 'brand' | 'product' | 'channels'>, channelId: string | null): SlotContext {
  return buildSlotContext({
    brand: bundle.brand.name,
    product: bundle.product.name,
    slotValues: bundle.shoot.slot_values,
    dogPhrase: dogPhraseFor(channelId, bundle.channels)
  })
}

/**
 * A slot context for several channels at once: `{{dog}}` reads as every channel's phrase joined
 * with " / " ("my Vizsla / our two dogs"), for showing one line that's filmed for each of them.
 */
export function groupSlotContext(bundle: Pick<ShootBundle, 'shoot' | 'brand' | 'product' | 'channels'>, channelIds: (string | null)[]): SlotContext {
  const phrases = [...new Set(channelIds)].map(id => dogPhraseFor(id, bundle.channels))
  return buildSlotContext({
    brand: bundle.brand.name,
    product: bundle.product.name,
    slotValues: bundle.shoot.slot_values,
    dogPhrase: phrases.length && phrases.every(Boolean) ? [...new Set(phrases)].join(' / ') : null
  })
}

/**
 * One line from several channels' versions of it: where they differ (usually the dog), the
 * variants are joined with " / ", whole words only. "Watch my Vizsla try it" + "Watch our two
 * dogs try it" -> "Watch my Vizsla / our two dogs try it".
 */
export function mergeVariants(texts: string[]): string {
  const unique = [...new Set(texts)]
  if (unique.length <= 1) return unique[0] ?? ''
  const first = unique[0]!
  const shortest = Math.min(...unique.map(text => text.length))
  let prefix = 0
  while (prefix < shortest && unique.every(text => text[prefix] === first[prefix])) prefix++
  // back off to a word boundary
  if (prefix < shortest && first[prefix - 1] !== ' ') prefix = first.lastIndexOf(' ', prefix - 1) + 1
  let suffix = 0
  while (suffix < shortest - prefix && unique.every(text => text[text.length - 1 - suffix] === first[first.length - 1 - suffix])) suffix++
  if (suffix > 0 && first[first.length - suffix] !== ' ') {
    const space = first.indexOf(' ', first.length - suffix)
    suffix = space < 0 ? 0 : first.length - space
  }
  const middles = [...new Set(unique.map(text => text.slice(prefix, text.length - suffix)))]
  return first.slice(0, prefix) + middles.join(' / ') + first.slice(first.length - suffix)
}

export interface ResolvedScript {
  /** hooks and CTAs */
  text: string | null
  /** bodies */
  beats: Beat[] | null
  unfilled: string[]
  overridden: boolean
}

/** The script that will be performed: override over snapshot, slots filled. */
export function resolveItemScript(
  bundle: Pick<ShootBundle, 'shoot' | 'brand' | 'product' | 'channels'>,
  item: Pick<BundleItem, 'kind' | 'channel_id' | 'script_snapshot' | 'script_override'>
): ResolvedScript {
  const overridden = item.script_override !== null && item.script_override !== undefined
  const source = overridden ? item.script_override : item.script_snapshot
  const context = itemSlotContext(bundle, item.channel_id)
  if (item.kind === 'body') {
    const result = renderBeats(parseBeats(source), context)
    return { text: null, beats: result.beats, unfilled: result.unfilled, overridden }
  }
  const result = renderScript(typeof source === 'string' ? source : '', context)
  return { text: result.text, beats: null, unfilled: result.unfilled, overridden }
}

export function scriptAsText(script: ResolvedScript): string {
  return script.beats ? joinBeats(script.beats) : script.text ?? ''
}

/** Items that still have unfilled slots: these block "Mark as planned" and exports. */
export function unfilledItems(bundle: ShootBundle): { code: string, slots: string[] }[] {
  // one entry per code: everyone films the same items, so a code repeats once per person
  const byCode = new Map<string, Set<string>>()
  for (const item of bundle.items) {
    if (item.status === 'skipped') continue
    const slots = resolveItemScript(bundle, item).unfilled
    if (!slots.length) continue
    const set = byCode.get(item.code) ?? new Set<string>()
    for (const slot of slots) set.add(slot)
    byCode.set(item.code, set)
  }
  return [...byCode].map(([code, slots]) => ({ code, slots: [...slots] }))
}

// --- shot list -------------------------------------------------------------

/** Everyone on a shoot films the same list: one entry per template, with one item per person. */
export interface ShotGroup {
  key: string
  kind: ItemKind
  code: string
  template_id: string
  items: BundleItem[]
}

export const templateKey = (item: Pick<BundleItem, 'kind' | 'template_id'>) => `${item.kind}:${item.template_id}`

/** Items grouped by template, in code order (H01, H02, … then U, V, C). */
export function groupShotList(items: BundleItem[]): ShotGroup[] {
  const groups = new Map<string, ShotGroup>()
  for (const item of items) {
    const key = templateKey(item)
    let group = groups.get(key)
    if (!group) {
      group = { key, kind: item.kind, code: item.code, template_id: item.template_id, items: [] }
      groups.set(key, group)
    }
    group.items.push(item)
  }
  return [...groups.values()].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))
}

/**
 * What to write back when a shoot is marked planned: snapshots (and overrides) with slots
 * filled, so later edits to templates or the product never change this shoot.
 */
export function planSnapshots(bundle: ShootBundle): {
  id: string
  script_snapshot: string | Beat[]
  script_override: string | Beat[] | null
  caption: string | null
}[] {
  return bundle.items.map((item) => {
    const snapshot = resolveItemScript(bundle, { ...item, script_override: null })
    const override = item.script_override === null || item.script_override === undefined
      ? null
      : resolveItemScript(bundle, item)
    return {
      id: item.id,
      script_snapshot: snapshot.beats ?? snapshot.text ?? '',
      script_override: override ? override.beats ?? override.text ?? '' : null,
      caption: item.caption ? renderScript(item.caption, itemSlotContext(bundle, item.channel_id)).text : null
    }
  })
}

// --- folders ---------------------------------------------------------------

export const KIND_FOLDER: Record<ItemKind, string> = { hook: 'hooks', body: 'vo', cta: 'ctas' }

/**
 * Everything from a shoot lives in its shoot folder. `raw/` and `edited/` have the same tree:
 * Muttiplier uploads clips into raw/, and editors put each edited clip in the same place under
 * edited/ (same name; the extension can differ). Hooks, VOs and CTAs are files named by code,
 * so their paths here have no extension; captions sit next to their clip under the same name.
 * B-roll is loose footage: clips go straight into their beat folder under their own names.
 * Renders go in the shoot's renders/.
 */
export type ClipStage = 'raw' | 'edited'

/** Paths are relative to the Dropbox `UGC/` root folder. */
export function productFolder(bundle: Pick<ShootBundle, 'brand' | 'product'>): string {
  return `${bundle.brand.slug}/${bundle.product.slug}`
}

/** Named by the shoot code alone (e.g. `S014`), so it never changes if the date moves. */
export function shootFolder(bundle: Pick<ShootBundle, 'brand' | 'product' | 'shoot'>): string {
  return `${productFolder(bundle)}/shoots/${bundle.shoot.code}`
}

/** Everything under raw/ and edited/ is split by channel first: `topdognix/`, `topdogwhiskey/`… */
export function channelFolder(bundle: Pick<ShootBundle, 'channels'>, channelId: string | null): string {
  return bundle.channels.find(c => c.id === channelId)?.slug ?? 'all'
}

/**
 * A hook, VO or CTA within raw/ or edited/, as a file without extension:
 * `<channel>/<kind>/<person>/<code>`. A VO is recorded beat by beat, each beat in its own
 * folder as with b-roll: `<channel>/vo/<person>/problem/V01`.
 */
export function takeSpot(bundle: ShootBundle, item: BundleItem, beat: string | null = null): string {
  const person = bundle.people.find(p => p.id === item.person_id)?.slug ?? 'unknown'
  const folder = `${channelFolder(bundle, item.channel_id)}/${KIND_FOLDER[item.kind]}/${person}`
  return beat ? `${folder}/${slugify(beat) || 'beat'}/${item.code}` : `${folder}/${item.code}`
}

/** A hook, VO or CTA for its channel, relative to the Dropbox `UGC/` root (see takeSpot). */
export function itemPath(bundle: ShootBundle, item: BundleItem, stage: ClipStage = 'raw', beat: string | null = null): string {
  return `${shootFolder(bundle)}/${stage}/${takeSpot(bundle, item, beat)}`
}

/**
 * A b-roll shot's folder for one channel, each channel filming its own:
 * `<channel>/b-roll/<beat>` for a format's shots (beats are filed by name, so the same beat in
 * different formats shares a folder) and `<channel>/b-roll/general` for general product shots.
 */
export function brollFolder(bundle: ShootBundle, shot: Pick<BundleBroll, 'format_id' | 'beat'>, channelId: string | null, stage: ClipStage = 'raw'): string {
  const section = shot.format_id ? slugify(shot.beat) || 'misc' : 'general'
  return `${shootFolder(bundle)}/${stage}/${channelFolder(bundle, channelId)}/b-roll/${section}`
}

// --- recordings ----------------------------------------------------------------

/** Hooks and sync CTAs are filmed (video); VOs and VO CTAs are recorded (audio). */
export const mediaOf = (item: Pick<BundleItem, 'kind' | 'cta_mode'>): 'video' | 'audio' =>
  item.kind === 'body' || (item.kind === 'cta' && item.cta_mode === 'vo') ? 'audio' : 'video'

/** The beats a VO is recorded in, one file each; hooks and CTAs are one take (null). */
export function itemBeats(item: Pick<BundleItem, 'kind' | 'script_snapshot'>): (string | null)[] {
  if (item.kind !== 'body') return [null]
  const beats = parseBeats(item.script_snapshot).map(beat => beat.beat)
  return beats.length ? beats : [null]
}

/**
 * One take to film or record: a hook, a CTA or one VO beat, by one person. A script that
 * doesn't name the dog is one take for all of the person's channels (`items` holds one item per
 * channel it fills); one that does is a take per channel.
 */
export interface Recording {
  key: string
  kind: ItemKind
  code: string
  person_id: string
  beat: string | null
  items: BundleItem[]
}

export function recordingsOf(items: BundleItem[]): Recording[] {
  const byKey = new Map<string, Recording>()
  for (const item of items) {
    for (const beat of itemBeats(item)) {
      const key = `${recordingKey(item)}|${beat ?? ''}`
      let recording = byKey.get(key)
      if (!recording) {
        recording = { key, kind: item.kind, code: item.code, person_id: item.person_id, beat, items: [] }
        byKey.set(key, recording)
      }
      recording.items.push(item)
    }
  }
  return [...byKey.values()]
}



// --- exports ---------------------------------------------------------------

function sortedItems(bundle: ShootBundle): BundleItem[] {
  return [...bundle.items].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))
}

/** A shared shot (no channel) is filmed by every channel, into each channel's folder. */
function brollChannelIds(bundle: ShootBundle, shot: Pick<BundleBroll, 'channel_id'>): (string | null)[] {
  return shot.channel_id || !bundle.channels.length ? [shot.channel_id] : bundle.channels.map(channel => channel.id)
}

function channelSlug(bundle: ShootBundle, channelId: string | null): string | null {
  return bundle.channels.find(channel => channel.id === channelId)?.slug ?? null
}

/** The plan (spec §10c): the shoot, people, channels, formats, items and b-roll shots. Part of the manifest. */
export function buildShootsheet(bundle: ShootBundle) {
  const formats = new Map<string, NonNullable<BundleItem['format']>>()
  for (const item of bundle.items) if (item.format) formats.set(item.format.code, item.format)

  return {
    schema_version: SHOOTSHEET_SCHEMA_VERSION,
    shoot: {
      code: bundle.shoot.code,
      date: bundle.shoot.shoot_date,
      brand: { name: bundle.brand.name, slug: bundle.brand.slug },
      product: { name: bundle.product.name, slug: bundle.product.slug },
      broll_variations: bundle.shoot.broll_variations,
      submission_rate: Number(bundle.shoot.submission_rate),
      slot_values: bundle.shoot.slot_values ?? {}
    },
    people: bundle.people.map(person => ({
      slug: person.slug,
      name: person.name,
      // channels this person is linked to; recipes on a channel can mix its linked people
      channels: bundle.channels.filter(channel => bundle.channelPeople?.[channel.id]?.includes(person.id)).map(channel => channel.slug)
    })),
    channels: bundle.channels.map(channel => ({ slug: channel.slug, folder_slug: channel.folder_slug, dogs: channel.dogs })),
    formats: [...formats.values()]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(format => ({ code: format.code, cta_modes: format.cta_modes, beats: format.beats })),
    items: sortedItems(bundle).filter(item => item.status !== 'skipped').map((item) => {
      const script = resolveItemScript(bundle, item)
      const base = {
        code: item.code,
        kind: item.kind,
        person: bundle.people.find(p => p.id === item.person_id)?.slug ?? null,
        channel: channelSlug(bundle, item.channel_id),
        template_id: item.template_id
      }
      // clips as files without extension: file = the edited clip, which the worker reads;
      // raw_file = where it was uploaded. A VO is recorded beat by beat, a file each.
      const folders = { file: itemPath(bundle, item, 'edited'), raw_file: itemPath(bundle, item, 'raw') }
      if (item.kind === 'hook') {
        const caption = item.caption ? renderScript(item.caption, itemSlotContext(bundle, item.channel_id)).text : null
        return { ...base, angle: item.angle, script: script.text ?? '', caption, ...folders }
      }
      if (item.kind === 'body') {
        const beats = (script.beats ?? []).map(beat => ({
          ...beat,
          file: itemPath(bundle, item, 'edited', beat.beat),
          raw_file: itemPath(bundle, item, 'raw', beat.beat)
        }))
        return { ...base, format: item.format?.code ?? null, angle: item.angle, beats }
      }
      return { ...base, cta_mode: item.cta_mode, script: script.text ?? '', ...folders }
    }),
    // one entry per shot per channel; its clips go loose into the folder, under their own names
    broll: bundle.broll.filter(shot => shot.status !== 'skipped').flatMap(shot =>
      brollChannelIds(bundle, shot).map(channelId => ({
        channel: channelSlug(bundle, channelId),
        general: !shot.format_id,
        beat: shot.beat,
        description: shot.description,
        product_visible: shot.product_visible,
        min_clips: shot.min_clips,
        folder: brollFolder(bundle, shot, channelId, 'edited'),
        raw_folder: brollFolder(bundle, shot, channelId, 'raw')
      })))
  }
}

export type Shootsheet = ReturnType<typeof buildShootsheet>

export const CSV_COLUMNS = ['shoot', 'person', 'kind', 'code', 'channel', 'angle', 'cta_mode', 'location', 'script', 'status', 'raw_path'] as const

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** One row per shoot item and b-roll shot. Bodies are joined as `[problem] … [product] … [result] …`. */
export function buildCsv(bundle: ShootBundle): string {
  const rows: unknown[][] = [[...CSV_COLUMNS]]
  for (const item of sortedItems(bundle)) {
    rows.push([
      bundle.shoot.code,
      bundle.people.find(p => p.id === item.person_id)?.slug ?? '',
      item.kind,
      item.code,
      channelSlug(bundle, item.channel_id) ?? '',
      item.angle ?? '',
      item.cta_mode ?? '',
      item.location ?? '',
      scriptAsText(resolveItemScript(bundle, item)),
      item.status,
      itemBeats(item).map(beat => itemPath(bundle, item, 'raw', beat)).join(' ')
    ])
  }
  for (const shot of bundle.broll) {
    for (const channelId of brollChannelIds(bundle, shot)) {
      rows.push([
        bundle.shoot.code,
        '',
        'broll',
        '',
        channelSlug(bundle, channelId) ?? '',
        '',
        '',
        '',
        `[${shot.format_id ? shot.beat : 'general'}] ${shot.description}`,
        shot.status,
        brollFolder(bundle, shot, channelId, 'raw')
      ])
    }
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

const parentFolder = (path: string) => path.slice(0, path.lastIndexOf('/'))

/**
 * Every folder in the skeleton zip, relative to the Dropbox `UGC/` root folder: the folder of every clip
 * in the plan under both raw/ and edited/, plus the shoot's renders/ (spec §10d).
 */
export function skeletonFolders(bundle: ShootBundle): string[] {
  const sheet = buildShootsheet(bundle)
  const shoot = shootFolder(bundle)
  const folders = new Set<string>([`${shoot}/raw`, `${shoot}/edited`, `${shoot}/renders`])
  for (const item of sheet.items) {
    const files = 'beats' in item ? item.beats.flatMap(beat => [beat.file, beat.raw_file]) : [item.file, item.raw_file]
    for (const file of files) folders.add(parentFolder(file))
  }
  for (const shot of sheet.broll) {
    folders.add(shot.folder)
    folders.add(shot.raw_folder)
  }
  return [...folders].sort()
}

export const MANIFEST_SCHEMA_VERSION = 2

/**
 * The manifest before the edits are in (spec §14): just the plan, version 0, no clips. Written
 * when the shoot is planned; Ready for batching replaces it with the full one.
 */
export function planManifest(bundle: ShootBundle) {
  return { schema_version: MANIFEST_SCHEMA_VERSION, version: 0, generated_at: null, plan: buildShootsheet(bundle), clips: [] }
}

/** Files in the skeleton zip: a `.keep` per folder plus the plan's manifest.json in the shoot folder. */
export function skeletonFiles(bundle: ShootBundle): Record<string, string> {
  const files: Record<string, string> = {}
  for (const folder of skeletonFolders(bundle)) files[`${folder}/.keep`] = ''
  files[`${shootFolder(bundle)}/manifest.json`] = JSON.stringify(planManifest(bundle), null, 2)
  return files
}
