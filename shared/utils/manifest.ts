// The shoot's manifest (spec §14): one index of every clip in edited/, built when the shoot is
// marked ready for batching, so batching and later tools read it instead of Dropbox. Pure: the
// app lists Dropbox, reads the clips' lengths and passes them in.
//
// Paths here are relative to the shoot's raw/ or edited/ folder, e.g.
// "topdognix/hooks/joe/H01.mov" or "topdognix/b-roll/problem/IMG_4821.mov".

import type { BundleItem, ShootBundle } from './shootsheet'
import { MANIFEST_SCHEMA_VERSION, brollFolder, buildShootsheet, channelFolder, itemBeats, linkedCodes, mediaOf, resolveItemScript, shootFolder, takeSpot } from './shootsheet'

const VIDEO = new Set(['mov', 'mp4', 'm4v', 'hevc'])
const AUDIO = new Set(['m4a', 'mp3', 'wav', 'aac', 'caf', 'aif', 'aiff'])
/** captions and other sidecars sit next to their clip and aren't clips themselves */
const SIDECAR = new Set(['srt', 'vtt', 'txt', 'json', 'xml', 'ass'])

const extension = (path: string) => path.includes('.') ? path.slice(path.lastIndexOf('.') + 1).toLowerCase() : ''
const withoutExtension = (path: string) => path.lastIndexOf('.') > path.lastIndexOf('/') ? path.slice(0, path.lastIndexOf('.')) : path
const folderOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1)
export const isClip = (path: string) => !SIDECAR.has(extension(path)) && !path.slice(path.lastIndexOf('/') + 1).startsWith('.')
const kindOfFile = (path: string): 'video' | 'audio' | 'other' =>
  VIDEO.has(extension(path)) ? 'video' : AUDIO.has(extension(path)) ? 'audio' : 'other'

/** A take's file relative to raw/ or edited/, without extension: "topdognix/vo/joe/problem/V01". */
export const spotPath = (bundle: ShootBundle, item: BundleItem, beat: string | null): string => takeSpot(bundle, item, beat)

/** The clip files at a spot in a listing (any extension). */
const filesAt = (spot: string, files: string[]) =>
  files.filter(file => isClip(file) && withoutExtension(file).toLowerCase() === spot.toLowerCase())

/** Every take the shoot's filmed items need: one per item per beat (hooks and CTAs one). */
export function expectedSpots(bundle: ShootBundle) {
  return bundle.items
    .filter(item => item.status === 'filmed')
    .flatMap(item => itemBeats(item).map(beat => ({ item, beat, spot: spotPath(bundle, item, beat) })))
}

// --- checking the editors' work ----------------------------------------------------

export interface EditsCheck {
  ok: boolean
  problems: string[]
  rawClips: number
  editedClips: number
}

/**
 * Before a shoot is ready for batching: every filmed take is in raw/ and edited/, named by its
 * code (a VO beat by beat) and of the right kind; edited/ mirrors raw/ clip for clip, same
 * folders and names (extensions can differ, editors re-export); every edited clip's length can
 * be read; and nothing is still waiting on a phone. `durations` (edited path -> seconds) is
 * checked when given.
 */
export function checkEdits(
  bundle: ShootBundle,
  raw: string[],
  edited: string[],
  options: { onPhones?: number, durations?: Map<string, number | null> } = {}
): EditsCheck {
  const problems: string[] = []
  const person = (id: string) => bundle.people.find(p => p.id === id)?.name ?? 'someone'
  const channel = (id: string | null) => bundle.channels.find(c => c.id === id)?.name ?? 'no channel'
  if (options.onPhones) problems.push(`${options.onPhones} clip${options.onPhones === 1 ? ' is' : 's are'} still on phones: upload them first`)

  for (const { item, beat, spot } of expectedSpots(bundle)) {
    const label = `${item.code}${beat ? ` ${beat}` : ''} (${person(item.person_id)}, ${channel(item.channel_id)})`
    const expected = mediaOf(item)
    for (const [stage, files] of [['raw', raw], ['edited', edited]] as const) {
      const found = filesAt(spot, files)
      if (!found.length) problems.push(`${label}: no ${expected} file at ${stage}/${spot}`)
      else if (found.length > 1) problems.push(`${label}: ${found.length} files at ${stage}/${spot}`)
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

  if (options.durations) {
    const unreadable = edited.filter(isClip).filter(file => !options.durations!.get(file))
    if (unreadable.length) problems.push(`Couldn't read the length of ${list(unreadable)} (use .mov, .mp4, .m4a or .wav)`)
  }

  return { ok: !problems.length, problems, rawClips: rawKeys.size, editedClips: editedKeys.size }
}

// --- the manifest -----------------------------------------------------------------------

interface ClipBase {
  channel: string
  /**
   * relative to edited/ (what the stitcher reads) and raw/ (where it was uploaded); each keeps
   * its own extension, and raw_file is null when there's no clip at that place in raw/
   */
  file: string
  raw_file: string | null
  /** seconds, read from the edited file */
  duration: number | null
}

export interface TakeClip extends ClipBase {
  kind: 'hook' | 'vo' | 'cta'
  /** the shoot item (one per channel; a take that fills several channels appears once per channel) */
  item_id: string
  person: string
  code: string
  /** VOs: the beat this file is */
  beat: string | null
  /** VOs: the format */
  format: string | null
  /** VOs: the slug of the product feature it's about; feature b-roll only goes under VOs about its feature */
  feature: string | null
  /** VOs: the hook / CTA codes it's linked to, the only ones it goes with; null = any */
  hooks?: string[] | null
  ctas?: string[] | null
  /** CTAs: sync (on camera) or vo (over b-roll) */
  mode: string | null
  angle: string | null
  script: string
  /** the captions next to it in edited/, if they're there */
  caption: string | null
}

export interface BrollClip extends ClipBase {
  kind: 'broll'
  /** the beat folder it's filed in ("problem", "product"…), or "general" for product shots */
  section: string
  /** the feature folder inside it (b-roll/<beat>/<feature>/), a feature slug; null = generic, for any VO */
  feature: string | null
  /** the b-roll shot it was filmed for, when it was added in the checklist */
  shot: { id: string, description: string, beat: string, general: boolean } | null
}

export type ManifestClip = TakeClip | BrollClip

export interface Manifest {
  schema_version: number
  version: number
  generated_at: string
  /** the plan: shoot, people, channels, formats, items and b-roll shots (shootsheet) */
  plan: ReturnType<typeof buildShootsheet>
  clips: ManifestClip[]
  /**
   * What the edit check found, when someone marked it ready anyway. Missing takes aren't in
   * `clips` and clips without a length can't go in recipes, so recipes needing them aren't made.
   */
  overridden?: string[]
}

/**
 * The manifest for a shoot whose edits check out, from the edited/ and raw/ listings. `brollShots`
 * maps a b-roll clip's raw path to the shot it was added for (from the checklist's clip records).
 */
export function buildManifest(
  bundle: ShootBundle,
  edited: string[],
  raw: string[],
  durations: Map<string, number | null>,
  options: { version: number, generatedAt: string, brollShots?: Map<string, string>, overridden?: string[] }
): Manifest {
  const clips: ManifestClip[] = []
  const personSlug = (id: string) => bundle.people.find(p => p.id === id)?.slug ?? 'unknown'
  const editedClips = edited.filter(isClip)
  // the raw clip at the same place, under its own extension (editors re-export, so it can differ)
  const rawByPlace = new Map(raw.filter(isClip).map(file => [withoutExtension(file).toLowerCase(), file]))
  const rawOf = (file: string) => rawByPlace.get(withoutExtension(file).toLowerCase()) ?? null

  for (const { item, beat, spot } of expectedSpots(bundle)) {
    const file = filesAt(spot, editedClips)[0]
    if (!file) continue
    const script = resolveItemScript(bundle, item)
    const caption = edited.find(other => other.toLowerCase() === `${withoutExtension(file)}.srt`.toLowerCase()) ?? null
    clips.push({
      kind: item.kind === 'body' ? 'vo' : item.kind,
      channel: channelFolder(bundle, item.channel_id),
      item_id: item.id,
      person: personSlug(item.person_id),
      code: item.code,
      beat,
      format: item.format?.code ?? null,
      feature: item.kind === 'body' ? item.feature_slug ?? null : null,
      hooks: item.kind === 'body' ? linkedCodes(bundle, item, 'hook') : null,
      ctas: item.kind === 'body' ? linkedCodes(bundle, item, 'cta') : null,
      mode: item.cta_mode,
      angle: item.angle,
      script: beat ? script.beats?.find(b => b.beat === beat)?.script ?? '' : script.text ?? '',
      file,
      raw_file: rawOf(file),
      caption,
      duration: durations.get(file) ?? null
    })
  }

  // b-roll: every clip in each channel's b-roll folders, matched to its shot by name (editors
  // keep the name, the extension can change). A clip in a feature folder (b-roll/<beat>/<feature>/)
  // is for that feature; one directly in the beat folder is generic.
  const shots = new Map(bundle.broll.filter(shot => shot.id).map(shot => [shot.id!, shot]))
  const shotByName = new Map([...(options.brollShots ?? [])].map(([path, id]) => [withoutExtension(path).toLowerCase(), id]))
  for (const file of editedClips) {
    const match = file.match(/^([^/]+)\/b-roll\/([^/]+)\/(?:([^/]+)\/)?[^/]+$/)
    if (!match) continue
    const [, channel, section, feature] = match as unknown as [string, string, string, string | undefined]
    const shotId = shotByName.get(withoutExtension(file).toLowerCase())
    const shot = shotId ? shots.get(shotId) ?? null : null
    clips.push({
      kind: 'broll',
      channel,
      section,
      feature: feature ?? null,
      file,
      raw_file: rawOf(file),
      duration: durations.get(file) ?? null,
      shot: shot ? { id: shot.id!, description: shot.description, beat: shot.beat, general: !shot.format_id } : null
    })
  }

  return {
    schema_version: MANIFEST_SCHEMA_VERSION,
    version: options.version,
    generated_at: options.generatedAt,
    plan: buildShootsheet(bundle),
    clips,
    ...(options.overridden?.length ? { overridden: options.overridden } : {})
  }
}

/** A b-roll clip's raw path (relative to raw/), from where the checklist uploaded it. */
export function relativeToStage(bundle: ShootBundle, fullPath: string, root: string, stage: 'raw' | 'edited') {
  const prefix = `${root}/${shootFolder(bundle)}/${stage}/`.toLowerCase()
  return fullPath.toLowerCase().startsWith(prefix) ? fullPath.slice(prefix.length) : null
}

/** Where a b-roll clip for a shot goes, relative to raw/: its channel's beat (or general) folder. */
export const brollFolderRelative = (bundle: ShootBundle, shot: Parameters<typeof brollFolder>[1], channelId: string | null) =>
  brollFolder(bundle, shot, channelId, 'raw').slice(`${shootFolder(bundle)}/raw/`.length)
