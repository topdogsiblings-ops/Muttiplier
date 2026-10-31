import { describe, expect, it } from 'vitest'
import {
  alignBeats,
  beatWordings,
  beatsMatchFormat,
  bodyUsesDog,
  buildSlotContext,
  countWords,
  estimateSeconds,
  extractSlots,
  joinBeats,
  parseBeats,
  parseTakeKey,
  renderBeats,
  renderScript,
  renderSegments,
  slugify,
  takeKey
} from '../shared/utils/slots'

const context = buildSlotContext({
  brand: 'PawCo',
  product: 'Calming Chews',
  dogPhrase: 'my Doberman',
  slotValues: { benefit: 'calmer walks', offer: '', brand: 'ignored' }
})

describe('extractSlots', () => {
  it('finds unique slot names, tolerating spacing and case', () => {
    expect(extractSlots('{{brand}} and {{ Product }} then {{brand}} {{benefit}}')).toEqual(['brand', 'product', 'benefit'])
  })

  it('ignores single braces and empty slots', () => {
    expect(extractSlots('{brand} {{}} {{ }}')).toEqual([])
  })
})

describe('renderScript', () => {
  it('fills built-in, dog and custom slots', () => {
    const result = renderScript('{{dog}} loves {{product}} by {{brand}}: {{benefit}}', context)
    expect(result.text).toBe('my Doberman loves Calming Chews by PawCo: calmer walks')
    expect(result.unfilled).toEqual([])
  })

  it('built-ins win over custom slot values of the same name', () => {
    expect(renderScript('{{brand}}', context).text).toBe('PawCo')
  })

  it('flags unfilled slots and leaves them in place', () => {
    const result = renderScript('Get {{offer}} at {{price}} today, {{price}}!', context)
    expect(result.text).toBe('Get {{offer}} at {{price}} today, {{price}}!')
    expect(result.unfilled).toEqual(['offer', 'price'])
  })

  it('treats a missing dog phrase as unfilled', () => {
    expect(renderScript('{{dog}}', buildSlotContext({ brand: 'PawCo', product: 'Chews' })).unfilled).toEqual(['dog'])
  })

  it('is stable once filled', () => {
    const once = renderScript('{{dog}} loves {{product}}', context).text
    expect(renderScript(once, {}).text).toBe(once)
  })
})

describe('renderSegments', () => {
  it('splits text and slots for highlighting', () => {
    expect(renderSegments('Hi {{brand}}!', context)).toEqual([
      { type: 'text', text: 'Hi ' },
      { type: 'slot', name: 'brand', raw: '{{brand}}', value: 'PawCo' },
      { type: 'text', text: '!' }
    ])
  })
})

describe('beats', () => {
  const format = ['problem', 'product', 'result']

  it('aligns beats to the format, keeping existing scripts', () => {
    expect(alignBeats(format, [{ beat: 'result', script: 'R' }, { beat: 'old', script: 'x' }])).toEqual([
      { beat: 'problem', script: '' },
      { beat: 'product', script: '' },
      { beat: 'result', script: 'R' }
    ])
  })

  it('checks beat names against the format', () => {
    expect(beatsMatchFormat(format, alignBeats(format, []))).toBe(true)
    expect(beatsMatchFormat(format, [{ beat: 'problem', script: '' }])).toBe(false)
  })

  it('joins beats for the CSV', () => {
    expect(joinBeats([{ beat: 'problem', script: 'A' }, { beat: 'product', script: 'B' }])).toBe('[problem] A [product] B')
  })

  it('detects {{dog}} in a body', () => {
    expect(bodyUsesDog([{ beat: 'problem', script: '{{dog}} pulls' }])).toBe(true)
    expect(bodyUsesDog([{ beat: 'problem', script: 'my dog pulls' }])).toBe(false)
  })
})

describe('estimateSeconds', () => {
  it('counts words, with a slot as one word', () => {
    expect(countWords('  Try {{product}} today,  seriously ')).toBe(4)
    expect(countWords('')).toBe(0)
  })

  it('divides by the speaking pace and rounds up', () => {
    // 10 words at 2.5 words per second
    expect(estimateSeconds('one two three four five six seven eight nine ten')).toBe(4)
    expect(estimateSeconds('one two three four five six seven eight nine ten eleven')).toBe(5)
    expect(estimateSeconds('one two three four', 2)).toBe(2)
    expect(estimateSeconds('', 2.5)).toBe(0)
  })
})

describe('slugify', () => {
  it('produces lowercase kebab-case', () => {
    expect(slugify('  Calming Chews (XL) é ')).toBe('calming-chews-xl-e')
  })
})

describe('beat wordings', () => {
  const beats = parseBeats([
    { beat: 'hook', script: 'I almost didn\u2019t try {{product}}', hook_type: 'Confession', alternates: [{ script: 'Nobody told me about {{product}}', hook_type: 'Curiosity' }, { script: '' }] },
    { beat: 'cta', script: 'Link below' }
  ])

  it('reads alternate wordings and hook types, and leaves plain beats as they were', () => {
    expect(beatWordings(beats[0]!).map(wording => [wording.option, wording.hook_type])).toEqual([[1, 'Confession'], [2, 'Curiosity'], [3, null]])
    expect(beats[1]).toEqual({ beat: 'cta', script: 'Link below' })
  })

  it('fills slots in every wording, and keeps them when aligning to the format', () => {
    const rendered = renderBeats(beats, { product: 'Calming Chews' }).beats
    expect(rendered[0]!.alternates![0]!.script).toBe('Nobody told me about Calming Chews')
    expect(alignBeats(['hook', 'cta'], beats)[0]!.alternates).toHaveLength(2)
  })

  it('names a take by its beat, and an alternate wording by its number', () => {
    expect(takeKey('problem')).toBe('problem')
    expect(takeKey('problem', 2)).toBe('problem~2')
    expect(parseTakeKey('product reveal~3')).toEqual({ beat: 'product reveal', option: 3 })
    expect(parseTakeKey('problem')).toEqual({ beat: 'problem', option: 1 })
  })

  it('checks every wording for {{dog}}', () => {
    expect(bodyUsesDog([{ beat: 'hook', script: 'my dog', alternates: [{ script: '{{dog}} again' }] }])).toBe(true)
  })
})
