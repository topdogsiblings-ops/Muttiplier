import { describe, expect, it } from 'vitest'
import { buildSrt, captionLines } from '../shared/utils/captions'

describe('captionLines', () => {
  it('breaks at sentences and keeps lines short', () => {
    expect(captionLines('Watch my Doberman try Calming Chews for the very first time. Okay, wow.')).toEqual([
      'Watch my Doberman try Calming',
      'Chews for the very first time.',
      'Okay, wow.'
    ])
  })

  it('handles empty scripts', () => {
    expect(captionLines('   ')).toEqual([])
  })
})

describe('buildSrt', () => {
  it('spreads the lines across the clip by how much each says', () => {
    const srt = buildSrt('Grab it now. Your dog will thank you later.', 4)
    expect(srt).toBe([
      '1\n00:00:00,000 --> 00:00:01,091\nGrab it now.\n',
      '2\n00:00:01,091 --> 00:00:04,000\nYour dog will thank you later.\n'
    ].join('\n'))
  })

  it('writes nothing without a script or a length', () => {
    expect(buildSrt('', 3)).toBe('')
    expect(buildSrt('Hello there', null)).toBe('')
  })
})
