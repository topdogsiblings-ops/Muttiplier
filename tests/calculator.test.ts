import { describe, expect, it } from 'vitest'
import type { CalcInput, CalcItem } from '../shared/utils/calculator'
import { DEFAULT_CALC_SETTINGS, calculate, monthsOfSupply } from '../shared/utils/calculator'

const people = ['joe', 'sam', 'alex'].map(id => ({ id, name: id }))
const channels = ['nix', 'whiskey', 'both'].map(id => ({ id, name: id }))

/** One person's items for one channel: hooks, VOs and CTAs, each filmed for that channel. */
function itemsFor(personId: string, channelId: string, counts: { hooks: number, bodies: number, ctas: number }, shared = false): CalcItem[] {
  // a shared recording (the script doesn't name the dog) has the same key on every channel
  const key = (kind: string, n: number) => shared ? `${personId}|${kind}${n}` : `${personId}|${channelId}|${kind}${n}`
  return [
    ...Array.from({ length: counts.hooks }, (_, n) => ({ personId, channelId, kind: 'hook' as const, recordingKey: key('H', n) })),
    ...Array.from({ length: counts.bodies }, (_, n) => ({ personId, channelId, kind: 'body' as const, recordingKey: key('V', n) })),
    ...Array.from({ length: counts.ctas }, (_, n) => ({ personId, channelId, kind: 'cta' as const, ctaMode: n % 2 ? 'vo' : 'sync', recordingKey: key('C', n) }))
  ]
}

const base = (items: CalcItem[], overrides: Partial<CalcInput> = {}): CalcInput => ({
  people, channels, items, submissionRate: 0.05, settings: DEFAULT_CALC_SETTINGS, ...overrides
})

describe('calculate: recipes under the batching rules', () => {
  // Joe is on Nix and Whiskey, Sam on Nix, Alex on Both: 10 hooks, 4 VOs, 3 CTAs each per channel
  const counts = { hooks: 10, bodies: 4, ctas: 3 }
  const items = [
    ...itemsFor('joe', 'nix', counts),
    ...itemsFor('joe', 'whiskey', counts),
    ...itemsFor('sam', 'nix', counts),
    ...itemsFor('alex', 'both', counts)
  ]

  it('counts hook × VO × CTA per person per channel, the same person throughout', () => {
    const result = calculate(base(items))
    // Nix: Joe 120 + Sam 120; Whiskey: Joe 120; Both: Alex 120
    expect(result.perChannel.map(channel => channel.recipes)).toEqual([240, 120, 120])
    expect(result.totals.recipes).toBe(480)
    expect(result.perPerson.map(person => person.recipes)).toEqual([240, 120, 120])
    expect(result.warnings).toEqual([])
  })

  it('batches the shoot\'s percentage of the valid recipes', () => {
    const result = calculate(base(items))
    expect(result.totals.submissions).toBe(24)
    expect(calculate(base(items, { submissionRate: 0.15 })).totals.submissions).toBe(72)
  })

  it('counts concepts as hook × VO pairs per person per channel', () => {
    expect(calculate(base(items)).perChannel[0]!.concepts).toBe(2 * 10 * 4)
  })

  it('never mixes people: a channel needs one person with hooks, VOs and CTAs', () => {
    const result = calculate(base([
      ...itemsFor('joe', 'nix', { hooks: 2, bodies: 1, ctas: 0 }),
      ...itemsFor('sam', 'nix', { hooks: 0, bodies: 1, ctas: 2 })
    ]))
    expect(result.totals.recipes).toBe(0)
    expect(result.warnings).toContain('joe on nix: no CTAs, so their VOs can\'t make recipes')
  })

  it('ignores skipped items', () => {
    const result = calculate(base([
      ...itemsFor('joe', 'nix', { hooks: 2, bodies: 1, ctas: 1 }),
      { personId: 'joe', channelId: 'nix', kind: 'hook', status: 'skipped' }
    ]))
    expect(result.totals.recipes).toBe(2)
    expect(result.totals.clips).toBe(4)
  })
})

describe('calculate: time and recordings', () => {
  it('films a dog-naming script once per channel, a dog-free one once for every channel', () => {
    const perChannel = calculate(base([
      ...itemsFor('joe', 'nix', { hooks: 10, bodies: 0, ctas: 0 }),
      ...itemsFor('joe', 'whiskey', { hooks: 10, bodies: 0, ctas: 0 })
    ]))
    const shared = calculate(base([
      ...itemsFor('joe', 'nix', { hooks: 10, bodies: 0, ctas: 0 }, true),
      ...itemsFor('joe', 'whiskey', { hooks: 10, bodies: 0, ctas: 0 }, true)
    ]))
    // 20 takes vs 10 takes at 4.5 min; both still need a clip in each channel's spot
    expect(perChannel.perPerson[0]!.onCameraMin).toBe(90)
    expect(shared.perPerson[0]!.onCameraMin).toBe(45)
    expect(shared.perPerson[0]!.clips).toBe(20)
  })

  it('estimates time from the per-item settings and sizes the day by the busiest person', () => {
    const result = calculate(base([
      ...itemsFor('joe', 'nix', { hooks: 80, bodies: 10, ctas: 2 }),
      ...itemsFor('sam', 'nix', { hooks: 10, bodies: 0, ctas: 0 })
    ]))
    const joe = result.perPerson[0]!
    // 80 hooks x 4.5 + 1 sync CTA x 3
    expect(joe.onCameraMin).toBe(363)
    // 10 VOs x 9 + 1 VO CTA x 3
    expect(joe.voMin).toBe(93)
    // Joe's 6.05h on camera / 6h a day, rounded up to the half day
    expect(result.totals.shootDays).toBe(1.5)
  })
})

describe('calculate: warnings and b-roll', () => {
  it('warns about items off the shoot\'s channels and channels with no hooks', () => {
    const result = calculate(base([
      { personId: 'joe', channelId: 'nix', kind: 'hook' },
      { personId: 'joe', channelId: null, kind: 'hook' }
    ], {
      people: [people[0]!],
      brollShots: [
        { channelId: 'nix', minClips: 3 },
        { channelId: 'nix', minClips: 2 },
        { channelId: null, minClips: 4 },
        { channelId: 'both', minClips: 9, status: 'skipped' }
      ]
    }))
    expect(result.warnings).toEqual(['joe: 1 item not on one of this shoot\'s channels', 'whiskey has no hooks', 'both has no hooks'])
    // the shared shot is filmed 4 times for each of the 3 channels
    expect(result.perChannel.map(channel => channel.brollClips)).toEqual([9, 4, 4])
    expect(result.totals.sharedBrollClips).toBe(4)
    expect(result.totals.brollClips).toBe(17)
  })
})

describe('monthsOfSupply', () => {
  it('divides submissions by the monthly target', () => {
    expect(monthsOfSupply(675, 150)).toBe(4.5)
    expect(monthsOfSupply(675, 0)).toBeNull()
  })
})
