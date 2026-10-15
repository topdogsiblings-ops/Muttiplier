// Shoot codes, folder paths and the export builders (spec §10). Pure: shared by the
// builder, the shot sheet and the Nitro export routes.
import type { Beat, SlotContext } from './slots'
import { buildSlotContext, joinBeats, parseBeats, renderBeats, renderScript, slugify } from './slots'
import type { ItemKind } from './calculator'

export const SHOOTSHEET_SCHEMA_VERSION = 1
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
  universal: boolean
  /** hooks: how to film it, from the template */
  filming_notes?: string | null
  /** hooks: suggested post caption, copied from the template like the script and frozen when planned */
  caption?: string | null
  title?: string | null
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
    hook_allocation: string
    broll_variations: number
    submission_rate: number
  }
  brand: { name: string, slug: string }
  product: { name: string, slug: string, slot_values: unknown }
  people: { id: string, slug: string, name: string }[]
  channels: BundleChannel[]
  items: BundleItem[]
  broll: BundleBroll[]
  /** shoot people linked to each channel; on those channels recipes mix people */
  channelPeople?: Record<string, string[]>
}

// --- codes -----------------------------------------------------------------

/** H = hook, V = body (VO), C = CTA, U = universal hook */
export function itemPrefix(kind: ItemKind, universal = false): 'H' | 'V' | 'C' | 'U' {
  if (kind === 'hook') return universal ? 'U' : 'H'
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
 * Split-mode allocation: hand out `count` hooks to the least-loaded channel first, so a
 * person's hooks end up round-robin across the shoot's channels.
 */
export function allocateChannels(channelIds: string[], existing: Record<string, number>, count: number): string[] {
  if (channelIds.length === 0) return []
  const load = new Map(channelIds.map(id => [id, existing[id] ?? 0]))
  const result: string[] = []
  for (let i = 0; i < count; i++) {
    let pick = channelIds[0]!
    for (const id of channelIds) if (load.get(id)! < load.get(pick)!) pick = id
    load.set(pick, load.get(pick)! + 1)
    result.push(pick)
  }
  return result
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

export function itemSlotContext(bundle: Pick<ShootBundle, 'brand' | 'product' | 'channels'>, channelId: string | null): SlotContext {
  return buildSlotContext({
    brand: bundle.brand.name,
    product: bundle.product.name,
    slotValues: bundle.product.slot_values,
    dogPhrase: dogPhraseFor(channelId, bundle.channels)
  })
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
  bundle: Pick<ShootBundle, 'brand' | 'product' | 'channels'>,
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

const KIND_FOLDER: Record<ItemKind, string> = { hook: 'hooks', body: 'vo', cta: 'ctas' }

/** Paths are relative to the Dropbox `topdogugc/` root. */
export function productFolder(bundle: Pick<ShootBundle, 'brand' | 'product'>): string {
  return `${bundle.brand.slug}/${bundle.product.slug}`
}

export function shootFolder(bundle: Pick<ShootBundle, 'brand' | 'product' | 'shoot'>): string {
  return `${productFolder(bundle)}/shoots/${bundle.shoot.code}_${bundle.shoot.shoot_date ?? 'undated'}`
}

/** Universal clips are identified by template across products, not by shoot. */
export function universalFolderName(templateId: string): string {
  return `U${templateId.replace(/-/g, '').slice(0, 8)}`
}

export function itemFolder(bundle: ShootBundle, item: BundleItem): string {
  const person = bundle.people.find(p => p.id === item.person_id)?.slug ?? 'unknown'
  if (item.kind === 'hook' && item.universal) return `universal/hooks/${person}/${universalFolderName(item.template_id)}`
  return `${shootFolder(bundle)}/edited/${KIND_FOLDER[item.kind]}/${person}/${item.code}`
}

/** B-roll is shared by every channel (b-roll/shared/<beat>); older channel-specific shots keep their channel folder. */
export function brollFolder(bundle: ShootBundle, shot: Pick<BundleBroll, 'channel_id' | 'beat'>): string {
  const beat = slugify(shot.beat) || 'misc'
  const channel = bundle.channels.find(c => c.id === shot.channel_id)
  if (!channel) return `${productFolder(bundle)}/b-roll/shared/${beat}`
  return `${productFolder(bundle)}/b-roll/${channel.folder_slug}/${beat}`
}

// --- exports ---------------------------------------------------------------

function sortedItems(bundle: ShootBundle): BundleItem[] {
  return [...bundle.items].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }))
}

function channelSlug(bundle: ShootBundle, channelId: string | null): string | null {
  return bundle.channels.find(channel => channel.id === channelId)?.slug ?? null
}

/** `shootsheet.json`: the contract with the future worker. */
export function buildShootsheet(bundle: ShootBundle) {
  const formats = new Map<string, NonNullable<BundleItem['format']>>()
  for (const item of bundle.items) if (item.format) formats.set(item.format.code, item.format)

  return {
    schema_version: SHOOTSHEET_SCHEMA_VERSION,
    shoot: {
      code: bundle.shoot.code,
      date: bundle.shoot.shoot_date,
      brand: { name: bundle.brand.name, slug: bundle.brand.slug },
      product: { name: bundle.product.name, slug: bundle.product.slug, slot_values: bundle.product.slot_values ?? {} },
      hook_allocation: bundle.shoot.hook_allocation,
      broll_variations: bundle.shoot.broll_variations,
      submission_rate: Number(bundle.shoot.submission_rate)
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
      const folder = itemFolder(bundle, item)
      if (item.kind === 'hook') {
        const caption = item.caption ? renderScript(item.caption, itemSlotContext(bundle, item.channel_id)).text : null
        return { ...base, angle: item.angle, universal: item.universal, script: script.text ?? '', caption, folder }
      }
      if (item.kind === 'body') return { ...base, format: item.format?.code ?? null, angle: item.angle, beats: script.beats ?? [], folder }
      return { ...base, cta_mode: item.cta_mode, script: script.text ?? '', folder }
    }),
    broll: bundle.broll.filter(shot => shot.status !== 'skipped').map(shot => ({
      channel: channelSlug(bundle, shot.channel_id),
      beat: shot.beat,
      description: shot.description,
      product_visible: shot.product_visible,
      min_clips: shot.min_clips,
      folder: brollFolder(bundle, shot)
    }))
  }
}

export type Shootsheet = ReturnType<typeof buildShootsheet>

export const CSV_COLUMNS = ['shoot', 'person', 'kind', 'code', 'channel', 'angle', 'cta_mode', 'location', 'script', 'status', 'folder_path'] as const

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
      itemFolder(bundle, item)
    ])
  }
  for (const shot of bundle.broll) {
    rows.push([
      bundle.shoot.code,
      '',
      'broll',
      '',
      channelSlug(bundle, shot.channel_id) ?? '',
      '',
      '',
      '',
      `[${shot.beat}] ${shot.description}`,
      shot.status,
      brollFolder(bundle, shot)
    ])
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/**
 * Every folder in the skeleton zip, relative to the `topdogugc/` root. A superset of the
 * folders named in shootsheet.json, plus the fixed structure from spec §10d.
 */
export function skeletonFolders(bundle: ShootBundle): string[] {
  const sheet = buildShootsheet(bundle)
  const product = productFolder(bundle)
  const shoot = shootFolder(bundle)
  const beats = new Set(DEFAULT_BEATS)
  for (const item of bundle.items) for (const beat of item.format?.beats ?? []) beats.add(slugify(beat))

  const folders = new Set<string>([
    `${product}/b-roll/shared/product`,
    `${shoot}/raw`,
    `${shoot}/edited`,
    `${shoot}/captions`,
    `${product}/renders`
  ])
  for (const channel of bundle.channels) {
    for (const beat of beats) if (beat) folders.add(`${product}/b-roll/${channel.folder_slug}/${beat}`)
  }
  for (const item of sheet.items) folders.add(item.folder)
  for (const shot of sheet.broll) folders.add(shot.folder)
  return [...folders].sort()
}

/** Files in the skeleton zip: a `.keep` per folder plus shootsheet.json in the shoot folder. */
export function skeletonFiles(bundle: ShootBundle): Record<string, string> {
  const files: Record<string, string> = {}
  for (const folder of skeletonFolders(bundle)) files[`${folder}/.keep`] = ''
  files[`${shootFolder(bundle)}/shootsheet.json`] = JSON.stringify(buildShootsheet(bundle), null, 2)
  return files
}
