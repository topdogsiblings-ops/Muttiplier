import { describe, expect, it } from 'vitest'
import type { CalcInput, CalcItem } from '../shared/utils/calculator'
import { DEFAULT_CALC_SETTINGS, calculate, monthsOfSupply } from '../shared/utils/calculator'
import { allocateChannels } from '../shared/utils/shootsheet'

const people = ['joe', 'sam', 'alex'].map(id => ({ id, name: id }))
const channels = ['nix', 'whiskey', 'both'].map(id => ({ id, name: id }))
const channelIds = channels.map(channel => channel.id)

/** Spec §9 example: 3 people, 3 channels, each person with 30 hooks, 10 bodies, 5 CTAs all compatible, V = 3. */
function specExample(hookAllocation: 'split' | 'shared'): CalcInput {
  const items: CalcItem[] = []
  for (const person of people) {
    const allocation = allocateChannels(channelIds, {}, 30)
    for (let i = 0; i < 30; i++) {
      items.push({ personId: person.id, kind: 'hook', channelId: hookAllocation === 'split' ? allocation[i] : null })
    }
    for (let i = 0; i < 10; i++) items.push({ personId: person.id, kind: 'body' })
    for (let i = 0; i < 5; i++) items.push({ personId: person.id, kind: 'cta', ctaMode: i % 2 ? 'vo' : 'sync' })
  }
  return { people, channels, items, hookAllocation, brollVariations: 3, submissionRate: 0.15, settings: DEFAULT_CALC_SETTINGS }
}

describe('calculate: spec §9 example', () => {
  it('split mode gives 4,500 recipes per channel, 13,500 total, 2,025 submissions', () => {
    const result = calculate(specExample('split'))
    expect(result.perChannel.map(channel => channel.recipes)).toEqual([4500, 4500, 4500])
    expect(result.perChannel.map(channel => channel.submissions)).toEqual([675, 675, 675])
    expect(result.totals.recipes).toBe(13500)
    expect(result.totals.submissions).toBe(2025)
    expect(result.warnings).toEqual([])
  })

  it('shared mode gives 40,500 recipes and 6,075 submissions', () => {
    const result = calculate(specExample('shared'))
    expect(result.perChannel.map(channel => channel.recipes)).toEqual([13500, 13500, 13500])
    expect(result.totals.recipes).toBe(40500)
    expect(result.totals.submissions).toBe(6075)
  })

  it('counts concepts as distinct hook x VO pairs', () => {
    const result = calculate(specExample('split'))
    expect(result.perPerson[0]!.concepts).toBe(30 * 10)
    expect(result.perChannel[0]!.concepts).toBe(3 * 10 * 10)
  })

  it('estimates time from the per-item settings', () => {
    const result = calculate(specExample('split'))
    const joe = result.perPerson[0]!
    // 30 hooks x 4.5 + 3 sync CTAs x 3
    expect(joe.onCameraMin).toBe(144)
    // 10 VOs x 9 + 2 VO CTAs x 3
    expect(joe.voMin).toBe(96)
    expect(result.totals.clips).toBe(135)
    expect(result.totals.onCameraHours).toBeCloseTo(7.2)
    expect(result.totals.voHours).toBeCloseTo(4.8)
    // everyone films on their own phone at once: the longest person (2.4h) / 6h per day = 0.4 days,
    // rounded up to the half day
    expect(result.totals.shootDays).toBe(0.5)
  })

  it('sizes the shoot day by the person with the most on-camera time', () => {
    const result = calculate({
      ...specExample('split'),
      items: [
        ...Array.from({ length: 80 }, () => ({ personId: 'joe', kind: 'hook' as const, channelId: 'nix' })),
        ...Array.from({ length: 10 }, () => ({ personId: 'sam', kind: 'hook' as const, channelId: 'nix' }))
      ]
    })
    // Joe: 80 hooks x 4.5 min = 6h -> 1 day; Sam's 45 min happens alongside
    expect(result.totals.shootDays).toBe(1)
  })
})

describe('calculate: CTA mode compatibility', () => {
  const base = { people: [people[0]!], channels: [channels[0]!], hookAllocation: 'shared' as const, brollVariations: 2, submissionRate: 0.5, settings: DEFAULT_CALC_SETTINGS }

  it('pairs every VO with every CTA', () => {
    const result = calculate({
      ...base,
      items: [
        { personId: 'joe', kind: 'hook' },
        { personId: 'joe', kind: 'hook' },
        { personId: 'joe', kind: 'body' },
        { personId: 'joe', kind: 'body' },
        { personId: 'joe', kind: 'cta', ctaMode: 'sync' },
        { personId: 'joe', kind: 'cta', ctaMode: 'vo' },
        { personId: 'joe', kind: 'cta', ctaMode: 'vo' }
      ]
    })
    // 2 hooks x 2 VOs x 3 CTAs x 2 variations
    expect(result.totals.recipes).toBe(24)
    expect(result.totals.submissions).toBe(12)
  })

  it('warns when someone has VOs but no CTAs', () => {
    const result = calculate({
      ...base,
      items: [
        { personId: 'joe', kind: 'hook' },
        { personId: 'joe', kind: 'body', label: 'V01' }
      ]
    })
    expect(result.totals.recipes).toBe(0)
    expect(result.warnings).toContain('joe: no CTAs, so their VOs can\'t make recipes')
  })

  it('ignores skipped items', () => {
    const result = calculate({
      ...base,
      items: [
        { personId: 'joe', kind: 'hook' },
        { personId: 'joe', kind: 'hook', status: 'skipped' },
        { personId: 'joe', kind: 'body' },
        { personId: 'joe', kind: 'cta', ctaMode: 'sync' }
      ]
    })
    expect(result.totals.recipes).toBe(2)
    expect(result.totals.clips).toBe(3)
  })
})

describe('calculate: split-mode warnings and b-roll', () => {
  it('warns when a channel has no hooks or a hook has no channel', () => {
    const result = calculate({
      people: [people[0]!],
      channels,
      hookAllocation: 'split',
      brollVariations: 3,
      submissionRate: 0.15,
      settings: DEFAULT_CALC_SETTINGS,
      items: [
        { personId: 'joe', kind: 'hook', channelId: 'nix' },
        { personId: 'joe', kind: 'hook', channelId: null }
      ],
      brollShots: [
        { channelId: 'nix', minClips: 3 },
        { channelId: 'nix', minClips: 2 },
        { channelId: null, minClips: 4 },
        { channelId: 'both', minClips: 9, status: 'skipped' }
      ]
    })
    expect(result.warnings).toEqual(['joe: 1 hook not assigned to a channel', 'whiskey has no hooks', 'both has no hooks'])
    // the shared shot is filmed 4 times for each of the 3 channels
    expect(result.perChannel.map(channel => channel.brollClips)).toEqual([9, 4, 4])
    expect(result.totals.sharedBrollClips).toBe(4)
    expect(result.totals.brollClips).toBe(17)
  })
})

describe('calculate: people linked to channels', () => {
  const two = [people[0]!, people[1]!]
  const base = { people: two, hookAllocation: 'shared' as const, brollVariations: 1, submissionRate: 0.5, settings: DEFAULT_CALC_SETTINGS }
  // Joe has the hooks and a VO but no CTAs; Sam has a VO and the CTAs but no hooks.
  const items: CalcItem[] = [
    { personId: 'joe', kind: 'hook' },
    { personId: 'joe', kind: 'hook' },
    { personId: 'joe', kind: 'body', label: 'V01' },
    { personId: 'sam', kind: 'body', label: 'V02' },
    { personId: 'sam', kind: 'cta', ctaMode: 'sync' },
    { personId: 'sam', kind: 'cta', ctaMode: 'sync' }
  ]

  it('mixes hooks, VOs and CTAs across the people linked to a channel', () => {
    const result = calculate({ ...base, items, channels: [channels[0]!], channelPeople: { nix: ['joe', 'sam'] } })
    // 2 hooks x (2 CTAs for V01 + 2 CTAs for V02) x 1 variation
    expect(result.perChannel[0]!.recipes).toBe(8)
    expect(result.perChannel[0]!.concepts).toBe(2 * 2)
    // credited to the person whose hook opens the recipe
    expect(result.perPerson.map(person => person.recipes)).toEqual([8, 0])
    expect(result.warnings).toEqual([])
  })

  it('keeps the same-person rule on channels with no linked people', () => {
    const result = calculate({ ...base, items, channels: [channels[0]!], channelPeople: {} })
    // Joe has no CTAs and Sam has no hooks, so nothing combines
    expect(result.perChannel[0]!.recipes).toBe(0)
    expect(result.warnings).toContain('joe: no CTAs, so their VOs can\'t make recipes')
  })

  it('only counts linked people on a mixed channel', () => {
    const result = calculate({ ...base, items, channels: [channels[0]!], channelPeople: { nix: ['joe'] } })
    expect(result.perChannel[0]!.recipes).toBe(0)
    expect(result.warnings).toEqual(['nix: no CTAs, so its VOs can\'t make recipes'])
  })
})

describe('monthsOfSupply', () => {
  it('divides submissions by the monthly target', () => {
    expect(monthsOfSupply(675, 150)).toBe(4.5)
    expect(monthsOfSupply(675, 0)).toBeNull()
  })
})
