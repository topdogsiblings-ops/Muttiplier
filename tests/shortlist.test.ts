import { describe, expect, it } from 'vitest'
import type { BundleItem, ShootBundle } from '../shared/utils/shootsheet'
import {
  BROLL_CLIPS_PER_BEAT,
  buildRecipes,
  buildRenders,
  checkEdits,
  chooseShortlist,
  nextShortlistCode,
  shortlistCsv
} from '../shared/utils/shortlist'

const format = { code: 'F01', cta_modes: ['sync', 'vo'], beats: ['problem', 'product'] }

function item(id: string, code: string, kind: BundleItem['kind'], person: string, extra: Partial<BundleItem> = {}): BundleItem {
  return {
    id, code, kind, person_id: person, channel_id: 'c1', script_snapshot: '', script_override: null, cta_mode: kind === 'cta' ? 'sync' : null,
    location: null, status: 'filmed', sort_order: 0, template_id: `t-${id}`, angle: null, format: kind === 'body' ? format : null, ...extra
  }
}

/** Joe filmed a hook, a VO and a CTA; Sam only a hook. One channel, Nix; both linked to it. */
function bundle(): ShootBundle {
  return {
    shoot: { code: 'S014', shoot_date: '2026-10-20', status: 'filmed', broll_variations: 2, submission_rate: 0.15 },
    brand: { name: 'PawCo', slug: 'pawco' },
    product: { name: 'Calming Chews', slug: 'calming-chews', slot_values: {} },
    people: [{ id: 'p1', slug: 'joe', name: 'Joe' }, { id: 'p2', slug: 'sam', name: 'Sam' }],
    channels: [{ id: 'c1', name: 'topdognix', slug: 'topdognix', folder_slug: 'nix', dogs: ['nix'], dog_phrase: 'my Doberman' }],
    items: [
      item('i1', 'H01', 'hook', 'p1'),
      item('i2', 'H01', 'hook', 'p2'),
      item('i3', 'V01', 'body', 'p1'),
      item('i4', 'C01', 'cta', 'p1'),
      item('i5', 'H02', 'hook', 'p1', { status: 'skipped' })
    ],
    broll: [],
    channelPeople: { c1: ['p1', 'p2'] }
  }
}

const raw = [
  'hooks/joe/H01.mov', 'hooks/sam/H01.mov', 'vo/joe/V01.m4a', 'vo/joe/V01.srt', 'ctas/joe/C01.mov',
  'b-roll/nix/problem/IMG_1.MOV', 'b-roll/nix/problem/IMG_2.MOV', 'b-roll/nix/problem/IMG_3.MOV', 'b-roll/nix/problem/IMG_4.MOV',
  'b-roll/nix/general/IMG_9.MOV'
]
// editors re-export: same names, extensions can change
const edited = raw.map(file => file.replace(/\.(mov|MOV)$/, '.mp4'))

describe('checkEdits', () => {
  it('passes when edited/ mirrors raw/ and every filmed item has its clip', () => {
    const check = checkEdits(bundle(), raw, edited)
    expect(check.problems).toEqual([])
    expect(check.ok).toBe(true)
    expect(check.rawClips).toBe(9)
  })

  it('blocks a missing edit, a misnamed file and the wrong kind of file', () => {
    const check = checkEdits(bundle(), raw, [
      ...edited.filter(file => !file.startsWith('vo/') && file !== 'hooks/sam/H01.mp4'),
      'hooks/sam/H1.mp4',
      'vo/joe/V01.mp4'
    ])
    expect(check.ok).toBe(false)
    expect(check.problems).toEqual(expect.arrayContaining([
      'H01 (Sam): no video file named H01 in edited/hooks/sam/',
      'V01 (Joe): edited/vo/joe/V01.mp4 should be an audio file',
      expect.stringContaining('In edited/ but not raw/ (renamed or misplaced?): hooks/sam/H1.mp4')
    ]))
  })

  it('blocks while clips are still on phones', () => {
    expect(checkEdits(bundle(), raw, edited, 2).problems[0]).toBe('2 clips are still on phones: upload them first')
  })
})

describe('recipes and renders', () => {
  it('pairs each person\'s own hook, VO and CTA, and leaves out what wasn\'t filmed', () => {
    const recipes = buildRecipes(bundle(), edited)
    // Sam has no VO or CTA, and H02 was skipped
    expect(recipes.map(recipe => recipe.id)).toEqual(['topdognix_H01-joe_V01-joe_C01-joe'])
    expect(recipes[0]).toMatchObject({
      hook: { file: 'hooks/joe/H01.mp4' },
      vo: { file: 'vo/joe/V01.m4a', format: 'F01', beats: ['problem', 'product'] },
      cta: { file: 'ctas/joe/C01.mp4', mode: 'sync' }
    })
  })


  it('gives each variation its own b-roll order, falling back to general shots', () => {
    const renders = buildRenders(bundle(), edited, buildRecipes(bundle(), edited))
    expect(renders.map(render => render.entry.id)).toEqual(['topdognix_H01-joe_V01-joe_C01-joe_v1', 'topdognix_H01-joe_V01-joe_C01-joe_v2'])
    const [one, two] = renders.map(render => render.entry.broll)
    expect(one![0]!.files).toHaveLength(BROLL_CLIPS_PER_BEAT)
    expect(one![0]!.files.every(file => file.startsWith('b-roll/nix/problem/'))).toBe(true)
    // four problem clips, two per variation: no overlap
    expect(one![0]!.files.some(file => two![0]!.files.includes(file))).toBe(false)
    // no product folder: general product shots instead
    expect(one![1]).toEqual({ beat: 'product', files: ['b-roll/nix/general/IMG_9.mp4'] })
  })
})

describe('chooseShortlist', () => {
  const samToo = [...edited, 'vo/sam/V01.m4a', 'ctas/sam/C01.mp4']
  const renders = () => {
    const b = bundle()
    b.items.push(item('i6', 'V01', 'body', 'p2'), item('i7', 'C01', 'cta', 'p2'))
    return buildRenders(b, samToo, buildRecipes(b, samToo))
  }

  it('spreads across hooks and never repeats an entry', () => {
    const entries = chooseShortlist(renders(), { size: 2 })
    expect(entries).toHaveLength(2)
    expect(new Set(entries.map(entry => entry.recipe)).size).toBe(2)
  })

  it('skips what was shortlisted before and anything rated bad', () => {
    const all = renders()
    const first = chooseShortlist(all, { size: 1 })
    const exclude = new Set(first.map(entry => entry.id))
    const second = chooseShortlist(all, { size: 10, exclude, ratings: new Map([['i2', 'bad']]) })
    expect(second.some(entry => exclude.has(entry.id))).toBe(false)
    expect(second.some(entry => entry.recipe.includes('H01-sam'))).toBe(false)
  })

  it('favours parts rated good', () => {
    const entries = chooseShortlist(renders(), { size: 1, ratings: new Map([['i2', 'good']]) })
    expect(entries[0]!.recipe).toContain('H01-sam')
  })

  it('writes a CSV row per entry', () => {
    const b = bundle()
    const recipes = buildRecipes(b, edited)
    const lines = shortlistCsv(chooseShortlist(buildRenders(b, edited, recipes), { size: 1 }), recipes).trimEnd().split('\r\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('topdognix_H01-joe_V01-joe_C01-joe')
  })

  it('numbers shortlists SL01, SL02…', () => {
    expect(nextShortlistCode([])).toBe('SL01')
    expect(nextShortlistCode(['SL01', 'SL03'])).toBe('SL04')
  })
})
