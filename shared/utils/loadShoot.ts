// Loads everything about one shoot. Used by the builder and shot sheet in the browser and by
// the Nitro export route, always with the caller's own Supabase client (so RLS applies).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'
import type { Row } from '../types/models'
import type { BundleItem, ShootBundle } from './shootsheet'
import type { CalcInput, CalcSettings, ItemKind } from './calculator'
import { beatShow, isStandalone, recordingKey } from './shootsheet'
import { beatWordings, parseBeats } from './slots'

export interface LoadedShoot extends ShootBundle {
  shoot: Row<'shoots'>
  brand: Row<'brands'>
  product: Row<'products'>
  people: Row<'people'>[]
  channels: Row<'channels'>[]
  broll: BrollShot[]
  /** formats added to the plan by hand (VO formats are included separately, from the items) */
  plannedFormats: PlannedFormat[]
}

/** A b-roll shot with the product feature it's for (null = generic b-roll). */
export type BrollShot = Row<'broll_shots'> & { feature: { slug: string, name: string } | null }

export interface PlannedFormat {
  id: string
  code: string
  name: string
  description: string | null
  beats: string[]
  beat_descriptions: Record<string, string> | null
  beat_examples: Record<string, string> | null
  /** beat -> suggested b-roll shots */
  beat_broll: unknown
  /** modular or standalone */
  kind: string
  /** beat -> face or broll */
  beat_display: Record<string, string> | null
  source_url: string | null
}

export type ItemRow = Row<'shoot_items'> & {
  hook: { filming_notes: string | null, source_url: string | null, shoot_id: string | null, product_id: string | null, hook_type: { name: string } | null } | null
  cta: { source_url: string | null, shoot_id: string | null, product_id: string | null } | null
  body: {
    cast: { person_id: string }[]
    cast_channel_id: string | null
    hook_links: { hook_template_id: string }[]
    cta_links: { cta_template_id: string }[]
    title: string | null
    feature: { name: string, slug: string } | null
    person_id: string | null
    source_url: string | null
    format: {
      id: string, code: string, name: string, description: string | null, cta_modes: string[], beats: string[]
      beat_descriptions: Record<string, string> | null, beat_examples: Record<string, string> | null, beat_broll: unknown
      kind: string, beat_display: Record<string, string> | null, source_url: string | null
    } | null
  } | null
}

/** A shoot item with what it needs from its template (the shoots list uses it too, for estimates). */
export const ITEM_SELECT = `*,
  hook:hook_templates(filming_notes, source_url, shoot_id, product_id, hook_type:angles(name)),
  cta:cta_templates(source_url, shoot_id, product_id),
  body:body_templates(cast:vo_cast(person_id), cast_channel_id, hook_links:vo_hook_links(hook_template_id), cta_links:vo_cta_links(cta_template_id), title, feature:product_features(name, slug), person_id, source_url, format:formats(id, code, name, description, cta_modes, beats, beat_descriptions, beat_examples, beat_broll, kind, beat_display, source_url))`

function unwrap<T>(result: { data: T | null, error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data as T
}

export function toBundleItem(row: ItemRow): BundleItem {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind as ItemKind,
    person_id: row.person_id,
    channel_id: row.channel_id,
    script_snapshot: row.script_snapshot,
    script_override: row.script_override,
    cta_mode: row.cta_mode,
    location: row.location,
    status: row.status,
    rating: row.rating === 'good' || row.rating === 'bad' ? row.rating : null,
    home: (row.hook?.shoot_id ?? row.cta?.shoot_id) ? 'shoot' : (row.hook?.product_id ?? row.cta?.product_id) ? 'product' : null,
    linked_hooks: row.body?.hook_links.map(link => link.hook_template_id) ?? [],
    linked_ctas: row.body?.cta_links.map(link => link.cta_template_id) ?? [],
    feature_slug: row.body?.feature?.slug ?? null,
    take_notes: row.take_notes,
    sort_order: row.sort_order,
    template_id: (row.hook_template_id ?? row.body_template_id ?? row.cta_template_id)!,
    hook_type: row.hook?.hook_type?.name ?? null,
    filming_notes: row.hook?.filming_notes ?? null,
    caption: row.caption,
    // a VO is known by the product feature it's about (older VOs by their title)
    title: row.body?.feature?.name ?? row.body?.title ?? null,
    writer_id: row.body?.person_id ?? null,
    cast_ids: row.body?.cast.map(member => member.person_id) ?? [],
    cast_channel_id: row.body?.cast_channel_id ?? null,
    source_url: row.hook?.source_url ?? row.body?.source_url ?? row.cta?.source_url ?? null,
    format: row.body?.format ?? null
  }
}

export async function loadShootBundle(db: SupabaseClient<Database>, code: string): Promise<LoadedShoot | null> {
  const found = unwrap(
    await db.from('shoots').select('*, product:products(*, brand:brands(*))').eq('code', code).maybeSingle()
  ) as (Row<'shoots'> & { product: Row<'products'> & { brand: Row<'brands'> } }) | null
  if (!found) return null
  const { product: productWithBrand, ...shoot } = found
  const { brand, ...product } = productWithBrand

  const [people, channels, items, broll, links, planned, treatments] = await Promise.all([
    db.from('shoot_people').select('person:people(*)').eq('shoot_id', shoot.id),
    db.from('shoot_channels').select('channel:channels(*)').eq('shoot_id', shoot.id),
    db.from('shoot_items').select(ITEM_SELECT).eq('shoot_id', shoot.id).order('sort_order').order('created_at'),
    db.from('broll_shots').select('*, feature:product_features(slug, name)').eq('shoot_id', shoot.id).order('sort_order').order('created_at'),
    db.from('person_channels').select('person_id, channel_id'),
    db.from('shoot_formats').select('format:formats(id, code, name, description, beats, beat_descriptions, beat_examples, beat_broll, kind, beat_display, source_url)').eq('shoot_id', shoot.id),
    // the Library's treatments that are on: every recipe gets a version for each that applies
    db.from('treatments').select('name, kind, placement, needs, component, settings').eq('active', true).eq('archived', false).order('sort_order')
  ])

  const peopleRows = unwrap(people).map(row => row.person as Row<'people'>).sort((a, b) => a.name.localeCompare(b.name))
  const channelRows = unwrap(channels).map(row => row.channel as Row<'channels'>).sort((a, b) => a.name.localeCompare(b.name))

  return {
    shoot,
    brand,
    product,
    people: peopleRows,
    channels: channelRows,
    items: (unwrap(items) as unknown as ItemRow[]).map(toBundleItem),
    broll: unwrap(broll) as BrollShot[],
    channelPeople: channelPeopleFor(peopleRows, channelRows, unwrap(links)),
    plannedFormats: unwrap(planned).map(row => row.format as unknown as PlannedFormat).filter(Boolean),
    treatments: unwrap(treatments)
  }
}

/** The shoot's people linked to each of the shoot's channels (Settings → People). */
export function channelPeopleFor(
  people: { id: string }[],
  channels: { id: string }[],
  links: { person_id: string, channel_id: string }[]
): Record<string, string[]> {
  const personIds = new Set(people.map(person => person.id))
  return Object.fromEntries(channels.map(channel => [
    channel.id,
    links.filter(link => link.channel_id === channel.id && personIds.has(link.person_id)).map(link => link.person_id)
  ]))
}

/** Calculator input for a loaded shoot. */
/**
 * Calculator input for a shoot: the shoot page and the shoots list both use this, so their
 * estimates always match (variations, cast and wording mixes, standalone VOs, links, treatments).
 */
export function bundleToCalcInput(
  bundle: Pick<ShootBundle, 'shoot' | 'items' | 'broll' | 'treatments'> & { people: { id: string, name: string }[], channels: { id: string, name: string }[] },
  settings: CalcSettings
): CalcInput {
  return {
    people: bundle.people,
    channels: bundle.channels,
    items: bundle.items.map(item => ({
      templateId: item.template_id,
      linkedHooks: item.linked_hooks,
      linkedCtas: item.linked_ctas,
      // beats (not takes: alternates are extra takes of a beat), and how many ways the wordings combine
      beats: item.kind === 'body' ? parseBeats(item.script_snapshot).length : undefined,
      wordingCombos: item.kind === 'body' ? parseBeats(item.script_snapshot).reduce((product, beat) => product * beatWordings(beat).length, 1) : undefined,
      standalone: isStandalone(item),
      faceBeats: item.kind === 'body' ? parseBeats(item.script_snapshot).filter(beat => beatShow(item.format, beat.beat) === 'face').length : undefined,
      personId: item.person_id,
      kind: item.kind,
      channelId: item.channel_id,
      ctaMode: item.cta_mode,
      label: item.code,
      status: item.status,
      recordingKey: recordingKey(item)
    })),
    brollShots: bundle.broll.map(shot => ({ channelId: shot.channel_id, status: shot.status })),
    submissionRate: Number(bundle.shoot.submission_rate),
    brollVariations: bundle.shoot.broll_variations,
    voVariations: bundle.shoot.vo_variations ?? 0,
    wordingVariations: bundle.shoot.wording_variations ?? 0,
    treatments: (bundle.treatments ?? []).map(treatment => ({
      name: treatment.name,
      kind: treatment.kind,
      needs: treatment.needs,
      layout: ((treatment.settings as { show?: string } | null)?.show ?? null) as 'face' | 'broll' | null
    })),
    offer: typeof (bundle.shoot.slot_values as Record<string, unknown> | null)?.offer === 'string'
      && ((bundle.shoot.slot_values as Record<string, string>).offer ?? '').trim() !== '',
    settings
  }
}

/** Numeric settings columns as plain numbers, falling back to the spec defaults. */
export function toCalcSettings(settings: Row<'settings'> | null, fallback: CalcSettings): CalcSettings {
  if (!settings) return fallback
  return {
    minutes_per_hook: Number(settings.minutes_per_hook),
    minutes_per_cta_sync: Number(settings.minutes_per_cta_sync),
    minutes_per_vo: Number(settings.minutes_per_vo),
    minutes_per_cta_vo: Number(settings.minutes_per_cta_vo),
    productive_hours_per_day: Number(settings.productive_hours_per_day)
  }
}
