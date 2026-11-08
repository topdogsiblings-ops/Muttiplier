// The shoot's manifest (spec §14): one index of every clip in edited/, built when the shoot goes
// Live, so batching and later tools read it instead of Dropbox. Pure: the app lists Dropbox, reads
// the clips' lengths and passes them in.
//
// Klip edits raw/ into edited/ and, for each treatment that needs one, puts a treated copy
// beside each clip it applies to: <clip>.<treatment sidecar>.<ext>, e.g. "…/hooks/joe/H01.retro-look.mp4".
//
// Paths here are relative to the shoot's raw/ or edited/ folder, e.g.
// "topdognix/hooks/joe/H01.mov" or "topdognix/b-roll/problem/IMG_4821.mov".

import type { BundleItem, ShootBundle } from './shootsheet'
import type { BeatShow, SidecarClip } from './shootsheet'
import { MANIFEST_SCHEMA_VERSION, STANDALONE_CTA_BEAT, STANDALONE_HOOK_BEAT, beatShow, sidecarClips, brollFolder, buildShootsheet, channelFolder, isStandalone, itemBeats, linkedCodes, resolveItemScript, shootFolder, takeLabel, takeSpot } from './shootsheet'
import { DEFAULT_WORDS_PER_SECOND, beatWordings, estimateSeconds, parseBeats, parseTakeKey, slugify } from './slots'

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

/** The treatments Klip makes sidecars for: each one's sidecar name and the takes that get one. */
export const shootSidecars = (bundle: ShootBundle) => (bundle.treatments ?? [])
  .map(treatment => ({ name: treatment.name, slug: slugify(treatment.name), clips: sidecarClips(treatment) }))
  .filter(treatment => treatment.clips.length)

/** Which kind of take a spot is, for sidecars: a standalone VO's hook and CTA beats count as a hook and a CTA. */
export function sidecarClipOf(item: BundleItem, beat: string | null): SidecarClip {
  if (item.kind !== 'body') return item.kind
  const name = beat ? parseTakeKey(beat).beat : ''
  if (isStandalone(item) && name === STANDALONE_HOOK_BEAT) return 'hook'
  if (isStandalone(item) && name === STANDALONE_CTA_BEAT) return 'cta'
  return 'vo'
}

/** Is this file a treatment's sidecar (<clip>.<sidecar>.<ext>) rather than a clip of its own? */
export function sidecarTest(bundle: ShootBundle) {
  const slugs = new Set(shootSidecars(bundle).map(sidecar => sidecar.slug))
  return (file: string) => {
    const name = withoutExtension(file.slice(file.lastIndexOf('/') + 1))
    return name.includes('.') && slugs.has(name.slice(name.lastIndexOf('.') + 1).toLowerCase())
  }
}

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
 * Before a shoot goes Live: every filmed take is in raw/ and edited/, named by its
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
  const sidecars = shootSidecars(bundle)
  const isSidecar = sidecarTest(bundle)
  const missingSidecars = new Map(sidecars.map(sidecar => [sidecar.name, [] as string[]]))
  const person = (id: string) => bundle.people.find(p => p.id === id)?.name ?? 'someone'
  const channel = (id: string | null) => bundle.channels.find(c => c.id === id)?.name ?? 'no channel'
  if (options.onPhones) problems.push(`${options.onPhones} clip${options.onPhones === 1 ? ' is' : 's are'} still on phones: upload them first`)

  for (const { item, beat, spot } of expectedSpots(bundle)) {
    const label = `${item.code}${beat ? ` ${takeLabel(beat)}` : ''} (${person(item.person_id)}, ${channel(item.channel_id)})`
    // every take is filmed, VOs included (their sound plays over b-roll)
    for (const [stage, files] of [['raw', raw], ['edited', edited]] as const) {
      const found = filesAt(spot, files)
      if (!found.length) problems.push(`${label}: no video file at ${stage}/${spot}`)
      else if (found.length > 1) problems.push(`${label}: ${found.length} files at ${stage}/${spot}`)
      else if (kindOfFile(found[0]!) !== 'video') problems.push(`${label}: ${stage}/${found[0]} should be a video`)
    }
    // each treatment's treated copy, beside the edited take
    const clip = sidecarClipOf(item, beat)
    for (const sidecar of sidecars.filter(sidecar => sidecar.clips.includes(clip))) {
      if (!filesAt(`${spot}.${sidecar.slug}`, edited).length) missingSidecars.get(sidecar.name)!.push(`${spot}.${sidecar.slug}`)
    }
  }

  // edited/ mirrors raw/: same clips, same places, same names
  const key = (file: string) => withoutExtension(file).toLowerCase()
  const rawKeys = new Map(raw.filter(isClip).map(file => [key(file), file]))
  const editedKeys = new Map(edited.filter(file => isClip(file) && !isSidecar(file)).map(file => [key(file), file]))
  const missing = [...rawKeys].filter(([k]) => !editedKeys.has(k)).map(([, file]) => file)
  const extra = [...editedKeys].filter(([k]) => !rawKeys.has(k)).map(([, file]) => file)
  const list = (files: string[]) => files.slice(0, 6).join(', ') + (files.length > 6 ? `… (${files.length - 6} more)` : '')
  if (missing.length) problems.push(`Not in edited/ yet: ${list(missing)}`)
  if (extra.length) problems.push(`In edited/ but not raw/ (renamed or misplaced?): ${list(extra)}`)
  for (const [name, spots] of missingSidecars) {
    if (spots.length) problems.push(`${name}: no treated copy of ${spots.length} clip${spots.length === 1 ? '' : 's'} (${list(spots)})`)
  }

  if (options.durations) {
    // a sidecar plays for its clip's length, so only the clips themselves are read
    const unreadable = edited.filter(file => isClip(file) && !isSidecar(file)).filter(file => !options.durations!.get(file))
    if (unreadable.length) problems.push(`Couldn't read the length of ${list(unreadable)} (use .mov or .mp4)`)
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
  /** VOs: which wording of the beat (1 = the first; alternates 2, 3…) */
  option?: number | null
  /**
   * VOs: how the beat is shown: the speaker on camera (face), their voice over b-roll (broll), a
   * voice-note bubble (voice_note), or text on screen (screen: not filmed, so no file; `script` is
   * the message and `duration` its reading time)
   */
  show?: BeatShow | null
  /** VOs: a standalone format's VO, which opens and closes itself (its hook and cta beats) */
  standalone?: boolean
  /** VOs: the format */
  format: string | null
  /** VOs: the slug of the product feature it's about; feature b-roll only goes under VOs about its feature */
  feature: string | null
  /** VOs: the hook / CTA codes it's linked to, the only ones it goes with; null = any */
  hooks?: string[] | null
  ctas?: string[] | null
  /** CTAs: sync (on camera) or vo (over b-roll) */
  mode: string | null
  /** hooks, and a standalone VO's hook-beat wordings: the hook type */
  hook_type: string | null
  script: string
  /** the captions next to it in edited/, if they're there */
  caption: string | null
  /** each treatment's treated copy beside it in edited/ (sidecar -> file), for the treatments that apply to it */
  sidecars?: Record<string, string>
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
  options: { version: number, generatedAt: string, brollShots?: Map<string, string>, overridden?: string[], wordsPerSecond?: number }
): Manifest {
  const clips: ManifestClip[] = []
  const personSlug = (id: string) => bundle.people.find(p => p.id === id)?.slug ?? 'unknown'
  const isSidecar = sidecarTest(bundle)
  const sidecars = shootSidecars(bundle)
  const editedClips = edited.filter(file => isClip(file) && !isSidecar(file))
  // the raw clip at the same place, under its own extension (editors re-export, so it can differ)
  const rawByPlace = new Map(raw.filter(isClip).map(file => [withoutExtension(file).toLowerCase(), file]))
  const rawOf = (file: string) => rawByPlace.get(withoutExtension(file).toLowerCase()) ?? null

  for (const { item, beat, spot } of expectedSpots(bundle)) {
    const file = filesAt(spot, editedClips)[0]
    if (!file) continue
    const script = resolveItemScript(bundle, item)
    const caption = edited.find(other => other.toLowerCase() === `${withoutExtension(file)}.srt`.toLowerCase()) ?? null
    // a VO take: one wording of one beat
    const take = beat ? parseTakeKey(beat) : null
    const wording = take ? beatWordings(script.beats?.find(b => b.beat === take.beat) ?? { beat: take.beat, script: '' }).find(w => w.option === take.option) : null
    const clip = sidecarClipOf(item, beat)
    const treated = Object.fromEntries(sidecars
      .filter(sidecar => sidecar.clips.includes(clip))
      .flatMap((sidecar) => {
        const found = filesAt(`${spot}.${sidecar.slug}`, edited)[0]
        return found ? [[sidecar.slug, found]] : []
      }))
    clips.push({
      kind: item.kind === 'body' ? 'vo' : item.kind,
      channel: channelFolder(bundle, item.channel_id),
      item_id: item.id,
      person: personSlug(item.person_id),
      code: item.code,
      beat: take?.beat ?? null,
      option: take?.option ?? null,
      show: take ? beatShow(item.format, take.beat) : null,
      ...(item.kind === 'body' ? { standalone: isStandalone(item) } : {}),
      format: item.format?.code ?? null,
      feature: item.kind === 'body' ? item.feature_slug ?? null : null,
      hooks: item.kind === 'body' ? linkedCodes(bundle, item, 'hook') : null,
      ctas: item.kind === 'body' ? linkedCodes(bundle, item, 'cta') : null,
      mode: item.cta_mode,
      hook_type: item.kind === 'hook' ? item.hook_type : wording?.hook_type ?? null,
      script: take ? wording?.script ?? '' : script.text ?? '',
      file,
      raw_file: rawOf(file),
      caption,
      duration: durations.get(file) ?? null,
      ...(sidecars.length ? { sidecars: treated } : {})
    })
  }

  // beats shown on screen: text, not filmed. Each wording is a clip with no file, its length the
  // time to read it (plus a moment for the typing dots), for every filmed VO that has them.
  const pace = options.wordsPerSecond || DEFAULT_WORDS_PER_SECOND
  const filmedVos = new Set(clips.filter(clip => clip.kind === 'vo').map(clip => (clip as TakeClip).item_id))
  for (const item of bundle.items.filter(item => item.kind === 'body' && filmedVos.has(item.id))) {
    const script = resolveItemScript(bundle, item)
    for (const beat of parseBeats(item.script_snapshot)) {
      if (beatShow(item.format, beat.beat) !== 'screen') continue
      const resolved = script.beats?.find(b => b.beat === beat.beat) ?? beat
      for (const wording of beatWordings(resolved)) {
        clips.push({
          kind: 'vo',
          channel: channelFolder(bundle, item.channel_id),
          item_id: item.id,
          person: personSlug(item.person_id),
          code: item.code,
          beat: beat.beat,
          option: wording.option,
          show: 'screen',
          standalone: isStandalone(item),
          format: item.format?.code ?? null,
          feature: item.feature_slug ?? null,
          hooks: linkedCodes(bundle, item, 'hook'),
          ctas: linkedCodes(bundle, item, 'cta'),
          mode: null,
          hook_type: wording.hook_type,
          script: wording.script,
          file: '',
          raw_file: null,
          caption: null,
          duration: estimateSeconds(wording.script, pace) + 1
        })
      }
    }
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
