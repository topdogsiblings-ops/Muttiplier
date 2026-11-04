import { describe, expect, it } from 'vitest'
import { flaggedWords, parseScriptRules, scriptRulesForAi, splitFlagged } from '../shared/utils/wording'

const owner = { phrases: ['owner', 'ownership', 'dog owner', 'pet owner'], message: 'Too cold.', suggestion: 'dog parent' }

describe('flaggedWords', () => {
  it('flags a rule\'s phrases in any case, with plurals and hyphens, longest first', () => {
    expect(flaggedWords('Every dog owner knows. Owners, listen. Pet-owners too. Ownership is hard.', [owner]).map(word => word.text)).toEqual([
      'dog owner', 'Owners', 'Pet-owners', 'Ownership'
    ])
  })

  it('leaves other words alone', () => {
    expect(flaggedWords('I own a dog, he owns the couch, and that\'s a downer. A happy dog parent.', [owner])).toEqual([])
  })

  it('says which rule each word broke', () => {
    const cheap = { phrases: ['cheap'], message: 'Say affordable.' }
    expect(flaggedWords('Cheap for an owner', [owner, cheap]).map(word => [word.text, word.rule.message])).toEqual([
      ['Cheap', 'Say affordable.'],
      ['owner', 'Too cold.']
    ])
  })

  it('flags nothing without rules', () => {
    expect(flaggedWords('dog owner', [])).toEqual([])
  })
})

describe('splitFlagged', () => {
  it('splits text around the flagged words', () => {
    expect(splitFlagged('Hi dog owners!', [owner])).toEqual([
      { text: 'Hi ', flagged: false },
      { text: 'dog owners', flagged: true },
      { text: '!', flagged: false }
    ])
    expect(splitFlagged('', [owner])).toEqual([{ text: '', flagged: false }])
  })
})

describe('script rules', () => {
  it('reads stored rules defensively', () => {
    expect(parseScriptRules([{ phrases: [' cheap ', ''], message: ' Nope ', suggestion: '' }, { phrases: [] }, null])).toEqual([
      { phrases: ['cheap'], message: 'Nope' }
    ])
  })

  it('tells AI drafting what to avoid', () => {
    expect(scriptRulesForAi([owner])).toContain('Never say "owner", "ownership", "dog owner", "pet owner" (Too cold.). Say "dog parent" instead.')
    expect(scriptRulesForAi([])).toBe('')
  })
})
