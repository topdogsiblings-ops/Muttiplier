// Recipe / submission / time calculator (spec §9). Pure: shared by the builder panel and the shoots list.

export type ItemKind = 'hook' | 'body' | 'cta'

export interface CalcItem {
  personId: string
  kind: ItemKind
  /** hooks only: the channel a hook is allocated to in split mode */
  channelId?: string | null
  /** CTAs only: sync (on camera) or vo; decides filming vs recording time */
  ctaMode?: string | null
  label?: string
  status?: string
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
  hookAllocation: 'split' | 'shared'
  brollVariations: number
  submissionRate: number
  settings: CalcSettings
  /**
   * People linked to each channel (Settings → People). On a channel with linked people on the
   * shoot, recipes mix hooks, VOs and CTAs across all of them. Channels with none use the
   * spec's same-person rule over everyone on the shoot.
   */
  channelPeople?: Record<string, string[]>
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
  /** Σ min_clips of this channel's b-roll shots (product-only shots are counted in totals.sharedBrollClips) */
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

export function calculate(input: CalcInput): CalcResult {
  const { people, channels, settings, hookAllocation } = input
  const variations = Math.max(0, input.brollVariations)
  const items = input.items.filter(item => item.status !== 'skipped')
  const broll = (input.brollShots ?? []).filter(shot => shot.status !== 'skipped')
  const warnings: string[] = []

  const perChannel: ChannelResult[] = channels.map(channel => ({
    id: channel.id,
    name: channel.name,
    hooks: 0,
    recipes: 0,
    concepts: 0,
    submissions: 0,
    brollClips: broll.filter(shot => shot.channelId === channel.id).reduce((sum, shot) => sum + shot.minClips, 0)
  }))

  const hooksOf = (personId: string, channelId: string) => items.filter(item =>
    item.personId === personId && item.kind === 'hook' && (hookAllocation === 'shared' || item.channelId === channelId))
  const of = (personId: string, kind: ItemKind) => items.filter(item => item.personId === personId && item.kind === kind)

  const warn = (message: string) => {
    if (!warnings.includes(message)) warnings.push(message)
  }

  const perPerson: PersonResult[] = people.map((person) => {
    const mine = items.filter(item => item.personId === person.id)
    const hooks = mine.filter(item => item.kind === 'hook')
    const bodies = mine.filter(item => item.kind === 'body')
    const ctas = mine.filter(item => item.kind === 'cta')
    const syncCtas = ctas.filter(item => item.ctaMode === 'sync').length
    const voCtas = ctas.length - syncCtas

    if (hookAllocation === 'split') {
      const unassigned = hooks.filter(hook => !channels.some(channel => channel.id === hook.channelId)).length
      if (unassigned > 0) warn(`${person.name}: ${unassigned} hook${unassigned === 1 ? '' : 's'} not assigned to a channel`)
    }

    return {
      id: person.id,
      name: person.name,
      hooks: hooks.length,
      bodies: bodies.length,
      ctas: ctas.length,
      syncCtas,
      voCtas,
      clips: mine.length,
      onCameraMin: hooks.length * settings.minutes_per_hook + syncCtas * settings.minutes_per_cta_sync,
      voMin: bodies.length * settings.minutes_per_vo + voCtas * settings.minutes_per_cta_vo,
      recipes: 0,
      concepts: 0
    }
  })
  const personResult = (id: string) => perPerson.find(person => person.id === id)!

  channels.forEach((channel, index) => {
    const result = perChannel[index]!
    const linked = (input.channelPeople?.[channel.id] ?? []).filter(id => people.some(person => person.id === id))

    if (linked.length) {
      // Mixed: any linked person's hook + any linked person's VO + any linked person's CTA.
      const bodies = linked.flatMap(id => of(id, 'body'))
      const ctas = linked.flatMap(id => of(id, 'cta'))
      // every CTA can follow every VO
      const pairs = bodies.length * ctas.length
      if (bodies.length && !ctas.length) warn(`${channel.name}: no CTAs, so its VOs can't make recipes`)
      for (const id of linked) {
        // recipes are credited to the person whose hook opens them
        const hookCount = hooksOf(id, channel.id).length
        const recipes = hookCount * pairs * variations
        const concepts = hookCount * bodies.length
        result.hooks += hookCount
        result.recipes += recipes
        result.concepts += concepts
        personResult(id).recipes += recipes
        personResult(id).concepts += concepts
      }
    } else {
      // Same person: recipes(p,c) = H(p,c) × p's VOs × p's CTAs × V
      for (const person of people) {
        const bodies = of(person.id, 'body')
        const ctas = of(person.id, 'cta')
        if (bodies.length && !ctas.length) warn(`${person.name}: no CTAs, so their VOs can't make recipes`)
        const hookCount = hooksOf(person.id, channel.id).length
        const recipes = hookCount * bodies.length * ctas.length * variations
        const concepts = hookCount * bodies.length
        result.hooks += hookCount
        result.recipes += recipes
        result.concepts += concepts
        personResult(person.id).recipes += recipes
        personResult(person.id).concepts += concepts
      }
    }
  })

  for (const channel of perChannel) {
    channel.submissions = Math.round(channel.recipes * input.submissionRate)
    if (hookAllocation === 'split' && channel.hooks === 0 && items.some(item => item.kind === 'hook')) {
      warn(`${channel.name} has no hooks`)
    }
  }
  const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0)
  const recipes = sum(perChannel, c => c.recipes)
  const onCameraMin = sum(perPerson, p => p.onCameraMin)
  // Everyone films on their own phone at the same time, so the day is as long as the
  // person with the most on-camera time, not everyone's time added up.
  const longestOnCameraMin = Math.max(0, ...perPerson.map(p => p.onCameraMin))
  const days = longestOnCameraMin / 60 / settings.productive_hours_per_day
  const sharedBrollClips = sum(broll.filter(shot => shot.channelId === null), shot => shot.minClips)

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
      brollClips: sum(perChannel, c => c.brollClips) + sharedBrollClips,
      sharedBrollClips
    },
    warnings
  }
}

/** Runway: months of supply for a channel at a target submissions-per-month pace. */
export function monthsOfSupply(submissions: number, targetPerMonth: number): number | null {
  return targetPerMonth > 0 ? submissions / targetPerMonth : null
}
