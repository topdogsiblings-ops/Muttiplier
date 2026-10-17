// Loads everything about one shoot. Used by the builder and shot sheet in the browser and by
// the Nitro export route, always with the caller's own Supabase client (so RLS applies).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'
import type { Row } from '../types/models'
import type { BundleItem, ShootBundle } from './shootsheet'
import type { CalcInput, CalcSettings, ItemKind } from './calculator'

export interface LoadedShoot extends ShootBundle {
  shoot: Row<'shoots'>
  brand: Row<'brands'>
  product: Row<'products'>
  people: Row<'people'>[]
  channels: Row<'channels'>[]
  broll: Row<'broll_shots'>[]
  /** formats added to the plan by hand (VO formats are included separately, from the items) */
  plannedFormats: PlannedFormat[]
}

export interface PlannedFormat {
  id: string
  code: string
  name: string
  description: string | null
  beats: string[]
  beat_descriptions: Record<string, string> | null
  /** beat -> suggested b-roll shots */
  beat_broll: unknown
}

type ItemRow = Row<'shoot_items'> & {
  hook: { is_universal: boolean, filming_notes: string | null, source_url: string | null, angle: { name: string } | null } | null
  cta: { source_url: string | null } | null
  body: {
    title: string
    person_id: string | null
    source_url: string | null
    angle: { name: string } | null
    format: { id: string, code: string, name: string, description: string | null, cta_modes: string[], beats: string[], beat_descriptions: Record<string, string> | null, beat_broll: unknown } | null
  } | null
}

const ITEM_SELECT = `*,
  hook:hook_templates(is_universal, filming_notes, source_url, angle:angles(name)),
  cta:cta_templates(source_url),
  body:body_templates(title, person_id, source_url, angle:angles(name), format:formats(id, code, name, description, cta_modes, beats, beat_descriptions, beat_broll))`

function unwrap<T>(result: { data: T | null, error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data as T
}

function toBundleItem(row: ItemRow): BundleItem {
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
    take_notes: row.take_notes,
    sort_order: row.sort_order,
    template_id: (row.hook_template_id ?? row.body_template_id ?? row.cta_template_id)!,
    angle: row.hook?.angle?.name ?? row.body?.angle?.name ?? null,
    universal: row.hook?.is_universal ?? false,
    filming_notes: row.hook?.filming_notes ?? null,
    caption: row.caption,
    title: row.body?.title ?? null,
    writer_id: row.body?.person_id ?? null,
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

  const [people, channels, items, broll, links, planned] = await Promise.all([
    db.from('shoot_people').select('person:people(*)').eq('shoot_id', shoot.id),
    db.from('shoot_channels').select('channel:channels(*)').eq('shoot_id', shoot.id),
    db.from('shoot_items').select(ITEM_SELECT).eq('shoot_id', shoot.id).order('sort_order').order('created_at'),
    db.from('broll_shots').select('*').eq('shoot_id', shoot.id).order('sort_order').order('created_at'),
    db.from('person_channels').select('person_id, channel_id'),
    db.from('shoot_formats').select('format:formats(id, code, name, description, beats, beat_descriptions, beat_broll)').eq('shoot_id', shoot.id)
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
    broll: unwrap(broll),
    channelPeople: channelPeopleFor(peopleRows, channelRows, unwrap(links)),
    plannedFormats: unwrap(planned).map(row => row.format as unknown as PlannedFormat).filter(Boolean)
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
export function bundleToCalcInput(bundle: ShootBundle, settings: CalcSettings): CalcInput {
  return {
    people: bundle.people,
    channels: bundle.channels,
    items: bundle.items.map(item => ({
      personId: item.person_id,
      kind: item.kind,
      channelId: item.channel_id,
      ctaMode: item.cta_mode,
      label: item.code,
      status: item.status
    })),
    brollShots: bundle.broll.map(shot => ({ channelId: shot.channel_id, minClips: shot.min_clips, status: shot.status })),
    hookAllocation: bundle.shoot.hook_allocation === 'shared' ? 'shared' : 'split',
    channelPeople: bundle.channelPeople,
    brollVariations: bundle.shoot.broll_variations,
    submissionRate: Number(bundle.shoot.submission_rate),
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
