// Recipe / submission / time calculator (spec §9). Pure: shared by the builder panel and the shoots list.

export type ItemKind = 'hook' | 'body' | 'cta'

export interface CalcItem {
  personId: string
  kind: ItemKind
  /** every item is filmed for one channel (a person films it once per channel they're linked to) */
  channelId?: string | null
  /** the template it's from: VOs link to hook / CTA templates */
  templateId?: string
  /** VOs: the hook / CTA templates it only goes with; empty = any */
  linkedHooks?: string[]
  linkedCtas?: string[]
  /** VOs: how many filmed beats it has (for working out how many ways it can be mixed; messages on screen aren't filmed) */
  beats?: number
  /** VOs: how many of its beats are face to camera or over b-roll (the ones a layout treatment can switch) */
  layoutBeats?: number
  /** VOs: how many combinations its beats' wordings make (1 when no beat has alternates) */
  wordingCombos?: number
  /** VOs: a standalone format's, with its own hook and CTA: never paired with Library ones */
  standalone?: boolean
  /** VOs: how many of its layout beats (a standalone VO's hook and CTA included) are shown face to camera by default */
  faceBeats?: number
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
  brollShots?: { channelId: string | null, status?: string }[]
  /** the share of valid recipes batched for submission */
  submissionRate: number
  /** b-roll selections per hook + VO + CTA, each its own recipe (default 1) */
  brollVariations?: number
  /** mixed versions per VO per channel, beats swapped between the people cast on it (default 0) */
  voVariations?: number
  /** extra versions per VO from combining alternate beat wordings, per person (default 0) */
  wordingVariations?: number
  /** the Library's treatments that are on: each adds a version of every recipe it applies to */
  treatments?: CalcTreatment[]
  /** the shoot has {{offer}} filled in (for treatments that need it) */
  offer?: boolean
  settings: CalcSettings
}

export interface CalcTreatment {
  name: string
  kind: string
  needs: string[]
  /** layout treatments: the layout they give every beat */
  layout?: 'face' | 'broll' | null
  /** a curated combination: it applies where every part does */
  parts?: CalcTreatment[]
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
  /** b-roll shots this channel films: its own plus every shared shot (each channel films its own clips) */
  brollShots: number
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
    brollShots: number
    /** shared shots, which every channel films (once if the shoot has no channels) */
    sharedBrollShots: number
  }
  /** each treatment that's on: how many recipes its versions add (0 = it applies to none) */
  treatments: { name: string, recipes: number, why: string | null }[]
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
 * person on each channel: recipes = hooks × VOs × CTAs, except that a VO linked to hooks and/or
 * CTAs only counts the ones it's linked to. A VO cast on several people on a channel also makes
 * up to `voVariations` mixes there (beats from different people), each with anyone's hooks and
 * CTAs on the channel. Every hook + VO + CTA makes up to `brollVariations` recipes (different
 * b-roll): an upper bound, as the footage may not stretch to that many different selections. Time counts each recording once: a
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

  // Shared shots (no channel) are filmed for every channel.
  const sharedBroll = broll.filter(shot => shot.channelId === null).length
  const perChannel: ChannelResult[] = channels.map(channel => ({
    id: channel.id,
    name: channel.name,
    hooks: 0,
    recipes: 0,
    concepts: 0,
    submissions: 0,
    brollShots: broll.filter(shot => shot.channelId === channel.id).length + sharedBroll
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

  const brollVariations = Math.max(1, input.brollVariations ?? 1)
  const voVariations = Math.max(0, input.voVariations ?? 0)
  const wordingVariations = Math.max(0, input.wordingVariations ?? 0)
  /** a VO's versions by one person: its first wordings, plus wording mixes */
  const versionsOf = (body: CalcItem) => 1 + Math.min(wordingVariations, Math.max(1, body.wordingCombos ?? 1) - 1)

  // treatments: each that applies to a VO adds a version of every recipe made with it. A layout
  // applies where it changes something; the others need what they need (every take is filmed,
  // the editor writes any text, old footage isn't tracked yet).
  const treatments = input.treatments ?? []
  const added = new Map(treatments.map(treatment => [treatment.name, 0]))
  const appliesTo = (treatment: CalcTreatment, body: CalcItem): boolean => {
    if (treatment.parts?.length) return treatment.parts.every(part => appliesTo(part, body))
    if (treatment.kind === 'layout') {
      const face = body.faceBeats ?? 0
      return treatment.layout === 'face' ? face < (body.layoutBeats ?? body.beats ?? 0) : treatment.layout === 'broll' ? face > 0 : false
    }
    return treatment.needs.every(need => need === 'text' || need === 'speaker_video' || (need === 'offer' && !!input.offer))
  }
  /** why a treatment adds nothing to this shoot (a combination: because of which part) */
  const whyNot = (treatment: CalcTreatment): string => {
    const bodies = items.filter(item => item.kind === 'body')
    if (!bodies.length) return 'no VOs yet'
    if (treatment.parts?.length) {
      const blocker = treatment.parts.find(part => !bodies.some(body => appliesTo(part, body)))
      return blocker ? `${blocker.name} doesn't apply: ${whyNot(blocker)}` : 'no VO has every part'
    }
    if (treatment.needs.includes('old_footage')) return 'needs old footage (the footage library isn’t built yet)'
    if (treatment.needs.includes('offer') && !input.offer) return 'needs the shoot’s {{offer}} filled in'
    if (treatment.kind === 'layout') {
      return treatment.layout === 'broll'
        ? 'every VO here already plays over b-roll throughout, so this version would be the same'
        : 'every VO here already plays face to camera throughout, so this version would be the same'
    }
    return 'no VO has what it needs'
  }
  /** a VO's recipes, with every treatment version that applies to it */
  const withTreatments = (body: CalcItem, recipes: number) => {
    let total = recipes
    for (const treatment of treatments) {
      if (!appliesTo(treatment, body)) continue
      added.set(treatment.name, (added.get(treatment.name) ?? 0) + recipes)
      total += recipes
    }
    return total
  }
  // a VO linked to hooks / CTAs only goes with those
  const allowed = (pool: CalcItem[], links: string[] | undefined) =>
    links?.length ? pool.filter(item => item.templateId && links.includes(item.templateId)).length : pool.length

  channels.forEach((channel, index) => {
    const result = perChannel[index]!
    for (const person of people) {
      const of = (kind: ItemKind) => items.filter(item => item.personId === person.id && item.channelId === channel.id && item.kind === kind)
      const [hookItems, bodyItems, ctaItems] = [of('hook'), of('body'), of('cta')]
      const [hooks, bodies, ctas] = [hookItems.length, bodyItems.length, ctaItems.length]
      if (!hooks && !bodies && !ctas) continue
      if (bodyItems.some(body => !body.standalone) && !ctas) warn(`${person.name} on ${channel.name}: no CTAs, so their VOs can't make recipes`)
      let recipes = 0
      let concepts = 0
      for (const body of bodyItems) {
        // a standalone VO is the whole video: its own hook and CTA
        if (body.standalone) {
          recipes += withTreatments(body, versionsOf(body) * brollVariations)
          concepts += versionsOf(body)
          continue
        }
        const [withHooks, withCtas] = [allowed(hookItems, body.linkedHooks), allowed(ctaItems, body.linkedCtas)]
        if ((body.linkedHooks?.length && !withHooks) || (body.linkedCtas?.length && !withCtas)) {
          warn(`${body.label ?? 'A VO'}: none of its linked ${!withHooks && body.linkedHooks?.length ? 'hooks' : 'CTAs'} are on this shoot for ${person.name} on ${channel.name}`)
        }
        recipes += withTreatments(body, versionsOf(body) * withHooks * withCtas * brollVariations)
        concepts += versionsOf(body) * withHooks
      }
      result.hooks += hooks
      result.recipes += recipes
      result.concepts += concepts
      personResult(person.id).recipes += recipes
      personResult(person.id).concepts += concepts
    }

    // mixed VOs: a VO cast on more than one person here, its beats swapped between them
    if (!voVariations) return
    const onChannel = items.filter(item => item.channelId === channel.id)
    const vos = new Map<string, CalcItem[]>()
    for (const body of onChannel.filter(item => item.kind === 'body' && item.templateId)) vos.set(body.templateId!, [...(vos.get(body.templateId!) ?? []), body])
    for (const performances of vos.values()) {
      const performers = new Set(performances.map(body => body.personId)).size
      const beats = performances[0]!.beats ?? 0
      if (performers < 2 || beats < 2) continue
      const mixes = Math.min(voVariations, performers ** beats - performers)
      // a standalone VO's mixes are whole videos; a modular one's go with anyone's hooks and CTAs here
      const withHooks = performances[0]!.standalone ? 1 : allowed(onChannel.filter(item => item.kind === 'hook'), performances[0]!.linkedHooks)
      const withCtas = performances[0]!.standalone ? 1 : allowed(onChannel.filter(item => item.kind === 'cta'), performances[0]!.linkedCtas)
      result.recipes += withTreatments(performances[0]!, mixes * withHooks * withCtas * brollVariations)
      result.concepts += mixes * withHooks
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
      brollShots: channels.length ? sum(perChannel, c => c.brollShots) : sharedBroll,
      sharedBrollShots: sharedBroll
    },
    treatments: treatments.map(treatment => ({
      name: treatment.name,
      recipes: added.get(treatment.name) ?? 0,
      why: added.get(treatment.name) ? null : whyNot(treatment)
    })),
    warnings
  }
}

/** Runway: months of supply for a channel at a target submissions-per-month pace. */
export function monthsOfSupply(submissions: number, targetPerMonth: number): number | null {
  return targetPerMonth > 0 ? submissions / targetPerMonth : null
}
