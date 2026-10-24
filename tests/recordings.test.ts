import { describe, expect, it } from 'vitest'
import type { BundleItem } from '../shared/utils/shootsheet'
import { itemBeats, mergeVariants, recordingKey, recordingsOf } from '../shared/utils/shootsheet'

function item(id: string, channel: string, script: unknown, extra: Partial<BundleItem> = {}): BundleItem {
  return {
    id, code: 'H01', kind: 'hook', person_id: 'joe', channel_id: channel, script_snapshot: script, script_override: null, cta_mode: null,
    location: null, status: 'planned', sort_order: 0, template_id: 't', angle: null, format: null, ...extra
  }
}

describe('takes', () => {
  it('records a line that doesn\'t name the dog once for all of a person\'s channels', () => {
    const takes = recordingsOf([item('a', 'nix', 'Grab {{product}} today'), item('b', 'whiskey', 'Grab {{product}} today')])
    expect(takes).toHaveLength(1)
    expect(takes[0]!.items.map(i => i.channel_id)).toEqual(['nix', 'whiskey'])
  })

  it('records a line that says {{dog}} once per channel', () => {
    const takes = recordingsOf([item('a', 'nix', 'Watch {{dog}} go'), item('b', 'whiskey', 'Watch {{dog}} go')])
    expect(takes.map(take => take.items.map(i => i.channel_id))).toEqual([['nix'], ['whiskey']])
  })

  it('splits a planned line by channel once the dog phrase is filled in', () => {
    expect(recordingKey(item('a', 'nix', 'Watch my Doberman go'))).not.toBe(recordingKey(item('b', 'whiskey', 'Watch my Vizsla go')))
  })

  it('keeps a person\'s own wording as its own take', () => {
    const takes = recordingsOf([item('a', 'nix', 'Grab it'), item('b', 'whiskey', 'Grab it', { script_override: 'Grab it now' })])
    expect(takes).toHaveLength(2)
  })

  it('records a VO beat by beat', () => {
    const beats = [{ beat: 'problem', script: 'My dog pulled' }, { beat: 'product', script: '{{product}}' }]
    const vo = item('v', 'nix', beats, { kind: 'body', code: 'V01' })
    expect(itemBeats(vo)).toEqual(['problem', 'product'])
    const takes = recordingsOf([vo, { ...vo, id: 'w', channel_id: 'whiskey' }])
    // no {{dog}}: each beat is one take for both channels
    expect(takes.map(take => [take.beat, take.items.length])).toEqual([['problem', 2], ['product', 2]])
  })

  it('treats hooks and CTAs as one take', () => {
    expect(itemBeats(item('a', 'nix', 'Hi'))).toEqual([null])
  })
})

describe('mergeVariants', () => {
  it('joins where the channels\' versions differ, on whole words', () => {
    expect(mergeVariants(['Watch my Vizsla try Puppii.', 'Watch our two dogs try Puppii.'])).toBe('Watch my Vizsla / our two dogs try Puppii.')
    expect(mergeVariants(['My Vizsla loves it', 'Our two dogs love it'])).toBe('My Vizsla loves / Our two dogs love it')
  })

  it('leaves a line that reads the same everywhere alone', () => {
    expect(mergeVariants(['Grab it now.', 'Grab it now.'])).toBe('Grab it now.')
    expect(mergeVariants([])).toBe('')
  })
})
