// Recipe / submission / time calculator (spec §9). Pure: shared by the builder panel and the shoots list.

export type ItemKind = 'hook' | 'body' | 'cta'

export interface CalcItem {
  personId: string
  kind: ItemKind
  /** every item is filmed for one channel (a person films it once per channel they're linked to) */
  channelId?: string | null
  /** CTAs only: sync (on camera) or vo; decides filming vs recording time */
  ctaMode?: string | null
  label?: string
  status?: string
  /**
   * Items with the same key are one recording: a script that doesn't name the dog is filmed once
   * and used on each of the person's channels (see recordingKey). Defaults to one per item.
   */
  recordingKey?: string
}

export interface CalcSettings {
  minutes_per_hook: number
  minutes_per_cta_sync: number
  minutes_per_vo: number
  minutes_per_cta_vo: number
  productive_hours_per_day: number
}

export interface CalcInput {
  people: { id: string, name: string }[]
  channels: { id: string, name: string }[]
  items: CalcItem[]
  brollShots?: { channelId: string | null, minClips: number, status?: string }[]
  /** the share of valid recipes batched for submission */
  submissionRate: number
  settings: CalcSettings
}

export interface PersonResult {
  id: string
  name: string
  hooks: number
  bodies: number
  ctas: number
  syncCtas: number
  voCtas: number
  clips: number
  onCameraMin: number
  voMin: number
  recipes: number
  concepts: number
}

export interface ChannelResult {
  id: string
  name: string
  hooks: number
  recipes: number
  concepts: number
  submissions: number
  /** Σ min_clips of this channel's own b-roll shots plus every shared shot: each channel films its own */
  brollClips: number
}

export interface CalcResult {
  perPerson: PersonResult[]
  perChannel: ChannelResult[]
  totals: {
    hooks: number
    bodies: number
    ctas: number
    clips: number
    recipes: number
    concepts: number
    submissions: number
    onCameraHours: number
    voHours: number
    shootDays: number
    brollClips: number
    /** Σ min_clips of the shared shots, which every channel films (once if the shoot has no channels) */
    sharedBrollClips: number
  }
  warnings: string[]
}

export const DEFAULT_CALC_SETTINGS: CalcSettings = {
  minutes_per_hook: 4.5,
  minutes_per_cta_sync: 3,
  minutes_per_vo: 9,
  minutes_per_cta_vo: 3,
  productive_hours_per_day: 6
}

/**
 * Recipes follow the batching rules (spec §14): one hook, one VO and one CTA, all from the same
 * person and the same channel (a person only films for channels they're linked to). So for each
 * person on each channel: recipes = hooks × VOs × CTAs. Time counts each recording once: a
 * script that doesn't name the dog is filmed once and used on every channel.
 */
export function calculate(input: CalcInput): CalcResult {
  const { people, channels, settings } = input
  const items = input.items.filter(item => item.status !== 'skipped')
  const broll = (input.brollShots ?? []).filter(shot => shot.status !== 'skipped')
  const warnings: string[] = []
  const warn = (message: string) => {
    if (!warnings.includes(message)) warnings.push(message)
  }

  // Shared shots (no channel) are filmed min_clips times for every channel.
  const sharedBroll = broll.filter(shot => shot.channelId === null).reduce((sum, shot) => sum + shot.minClips, 0)
  const perChannel: ChannelResult[] = channels.map(channel => ({
    id: channel.id,
    name: channel.name,
    hooks: 0,
    recipes: 0,
    concepts: 0,
    submissions: 0,
    brollClips: broll.filter(shot => shot.channelId === channel.id).reduce((sum, shot) => sum + shot.minClips, 0) + sharedBroll
  }))

  /** one entry per recording: items sharing a recording key were filmed once */
  const recordings = (rows: CalcItem[]) => {
    const seen = new Set<string>()
    return rows.filter((row, index) => {
      const key = row.recordingKey ?? `#${index}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const perPerson: PersonResult[] = people.map((person) => {
    const mine = items.filter(item => item.personId === person.id)
    const unplaced = mine.filter(item => !channels.some(channel => channel.id === item.channelId)).length
    if (unplaced) warn(`${person.name}: ${unplaced} item${unplaced === 1 ? '' : 's'} not on one of this shoot's channels`)
    const filmed = recordings(mine)
    const hooks = filmed.filter(item => item.kind === 'hook').length
    const bodies = filmed.filter(item => item.kind === 'body').length
    const ctas = filmed.filter(item => item.kind === 'cta')
    const syncCtas = ctas.filter(item => item.ctaMode === 'sync').length
    const voCtas = ctas.length - syncCtas
    return {
      id: person.id,
      name: person.name,
      hooks,
      bodies,
      ctas: ctas.length,
      syncCtas,
      voCtas,
      // every channel's spot gets its own upload, even when one recording fills several
      clips: mine.length,
      onCameraMin: hooks * settings.minutes_per_hook + syncCtas * settings.minutes_per_cta_sync,
      voMin: bodies * settings.minutes_per_vo + voCtas * settings.minutes_per_cta_vo,
      recipes: 0,
      concepts: 0
    }
  })
  const personResult = (id: string) => perPerson.find(person => person.id === id)!

  channels.forEach((channel, index) => {
    const result = perChannel[index]!
    for (const person of people) {
      const of = (kind: ItemKind) => items.filter(item => item.personId === person.id && item.channelId === channel.id && item.kind === kind).length
      const [hooks, bodies, ctas] = [of('hook'), of('body'), of('cta')]
      if (!hooks && !bodies && !ctas) continue
      if (bodies && !ctas) warn(`${person.name} on ${channel.name}: no CTAs, so their VOs can't make recipes`)
      const recipes = hooks * bodies * ctas
      const concepts = hooks * bodies
      result.hooks += hooks
      result.recipes += recipes
      result.concepts += concepts
      personResult(person.id).recipes += recipes
      personResult(person.id).concepts += concepts
    }
  })

  for (const channel of perChannel) {
    channel.submissions = Math.round(channel.recipes * input.submissionRate)
    if (channel.hooks === 0 && items.length) warn(`${channel.name} has no hooks`)
  }
  const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0)
  const recipes = sum(perChannel, c => c.recipes)
  const onCameraMin = sum(perPerson, p => p.onCameraMin)
  // Everyone films on their own phone at the same time, so the day is as long as the
  // person with the most on-camera time, not everyone's time added up.
  const longestOnCameraMin = Math.max(0, ...perPerson.map(p => p.onCameraMin))
  const days = longestOnCameraMin / 60 / settings.productive_hours_per_day

  return {
    perPerson,
    perChannel,
    totals: {
      hooks: sum(perPerson, p => p.hooks),
      bodies: sum(perPerson, p => p.bodies),
      ctas: sum(perPerson, p => p.ctas),
      clips: sum(perPerson, p => p.clips),
      recipes,
      concepts: sum(perChannel, c => c.concepts),
      submissions: Math.round(recipes * input.submissionRate),
      onCameraHours: onCameraMin / 60,
      voHours: sum(perPerson, p => p.voMin) / 60,
      // rounded up to the nearest half day
      shootDays: Math.ceil(days * 2 - 1e-9) / 2,
      brollClips: channels.length ? sum(perChannel, c => c.brollClips) : sharedBroll,
      sharedBrollClips: sharedBroll
    },
    warnings
  }
}

/** Runway: months of supply for a channel at a target submissions-per-month pace. */
export function monthsOfSupply(submissions: number, targetPerMonth: number): number | null {
  return targetPerMonth > 0 ? submissions / targetPerMonth : null
}
