import { describe, expect, it } from 'vitest'
import { flaggedWords, splitFlagged } from '../shared/utils/wording'

describe('flaggedWords', () => {
  it('flags "owner" in all its forms, with a warmer word to use instead', () => {
    expect(flaggedWords('Every dog owner knows. Owners, listen. Pet-owners too. Ownership is hard.').map(word => [word.text, word.suggestion])).toEqual([
      ['dog owner', 'dog parent'],
      ['Owners', 'dog parents'],
      ['Pet-owners', 'dog parents'],
      ['Ownership', 'being a dog parent']
    ])
  })

  it('leaves other words alone', () => {
    expect(flaggedWords('I own a dog, he owns the couch, and that\'s a downer. A happy dog parent.')).toEqual([])
  })
})

describe('splitFlagged', () => {
  it('splits text around the flagged words', () => {
    expect(splitFlagged('Hi dog owners!')).toEqual([
      { text: 'Hi ', flagged: false },
      { text: 'dog owners', flagged: true },
      { text: '!', flagged: false }
    ])
    expect(splitFlagged('')).toEqual([{ text: '', flagged: false }])
  })
})
