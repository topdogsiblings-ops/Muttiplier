import { describe, expect, it } from 'vitest'
import type { BrollClip, Manifest, TakeClip } from '../shared/utils/manifest'
import type { Recipe } from '../shared/utils/recipes'
import { batchCsv, batchOrder, batchSize, beatMixes, buildRecipes, byChannel, chooseBatch, nextBatchCode, renderFolder } from '../shared/utils/recipes'

const take = (kind: TakeClip['kind'], code: string, person: string, channel: string, extra: Partial<TakeClip> = {}): TakeClip => ({
  kind, code, person, channel, item_id: `${channel}-${person}-${code}`, beat: null, format: null, feature: null, mode: kind === 'cta' ? 'sync' : null,
  hook_type: null, script: '', file: `${channel}/${kind}/${person}/${code}.mp4`, raw_file: '', caption: null, duration: 3, ...extra
})
const vo = (code: string, person: string, channel: string, beats: [string, number][], format = 'F01') =>
  beats.map(([beat, duration]) => take('vo', code, person, channel, { beat, duration, format, file: `${channel}/vo/${person}/${beat}/${code}.mp4` }))
const clip = (channel: string, section: string, name: string, duration: number, feature: string | null = null): BrollClip => ({
  kind: 'broll', channel, section, feature, file: `${channel}/b-roll/${section}/${feature ? `${feature}/` : ''}${name}.mp4`, raw_file: '', duration, shot: null
})

function manifest(clips: Manifest['clips']): Manifest {
  return { schema_version: 2, version: 1, generated_at: '', plan: { shoot: { code: 'S001' } } as Manifest['plan'], clips }
}

const nixBroll = [
  clip('nix', 'problem', 'p1', 2), clip('nix', 'problem', 'p2', 2), clip('nix', 'problem', 'p3', 2),
  clip('nix', 'product', 'pr1', 2), clip('nix', 'product', 'pr2', 2),
  clip('nix', 'general', 'g1', 3)
]

describe('buildRecipes', () => {
  it('pairs one person\'s hook, VO and CTA on one channel, never across people or channels', () => {
    const recipes = buildRecipes(manifest([
      take('hook', 'H01', 'joe', 'nix'), take('hook', 'H01', 'sam', 'nix'), take('hook', 'H01', 'joe', 'whiskey'),
      ...vo('V01', 'joe', 'nix', [['problem', 3], ['product', 2]]),
      take('cta', 'C01', 'joe', 'nix'),
      ...nixBroll
    ]))
    // Sam has no VO or CTA, and Joe's Whiskey hook has no Whiskey VO
    expect(recipes).toHaveLength(1)
    expect(recipes[0]!.id).toMatch(/^S001_nix_joe_H01_V01_C01_[0-9a-f]{8}$/)
  })

  it('covers each beat by length from its own clips, and never repeats a clip', () => {
    const [recipe] = buildRecipes(manifest([
      take('hook', 'H01', 'joe', 'nix'),
      ...vo('V01', 'joe', 'nix', [['problem', 5], ['product', 3]]),
      take('cta', 'C01', 'joe', 'nix'),
      ...nixBroll
    ]))
    const [problem, product] = recipe!.vo.beats
    // 5s of problem: three 2s clips from problem/
    expect(problem!.broll).toHaveLength(3)
    expect(problem!.broll.every(file => file.includes('/problem/'))).toBe(true)
    // 3s of product: both 2s clips from product/
    expect([...product!.broll].sort()).toEqual(['nix/b-roll/product/pr1.mp4', 'nix/b-roll/product/pr2.mp4'])
    const all = recipe!.vo.beats.flatMap(beat => beat.broll)
    expect(new Set(all).size).toBe(all.length)
  })

  it('tops a beat up with general product shots only when its own clips run short', () => {
    const [recipe] = buildRecipes(manifest([
      take('hook', 'H01', 'joe', 'nix'),
      ...vo('V01', 'joe', 'nix', [['problem', 7]]),
      take('cta', 'C01', 'joe', 'nix'),
      ...nixBroll
    ]))
    expect(recipe!.vo.beats[0]!.broll.at(-1)).toBe('nix/b-roll/general/g1.mp4')
  })

  it('drops a recipe whose b-roll can\'t cover a beat', () => {
    expect(buildRecipes(manifest([
      take('hook', 'H01', 'joe', 'nix'), ...vo('V01', 'joe', 'nix', [['problem', 30]]), take('cta', 'C01', 'joe', 'nix'), ...nixBroll
    ]))).toEqual([])
  })

  it('uses feature b-roll only under VOs about that feature, and generic b-roll under any', () => {
    const feature = (name: string, slug: string) => clip('nix', 'problem', name, 2, slug)
    const recipes = buildRecipes(manifest([
      take('hook', 'H01', 'joe', 'nix'),
      ...vo('V01', 'joe', 'nix', [['problem', 6]]).map(t => ({ ...t, feature: 'joints' })),
      ...vo('V02', 'joe', 'nix', [['problem', 6]]).map(t => ({ ...t, feature: 'coat' })),
      take('cta', 'C01', 'joe', 'nix'),
      clip('nix', 'problem', 'any1', 2), clip('nix', 'problem', 'any2', 2),
      feature('j1', 'joints'), feature('c1', 'coat')
    ]))
    const brollOf = (code: string) => recipes.find(recipe => recipe.vo.code === code)!.vo.beats[0]!.broll
    expect(brollOf('V01')).not.toContain('nix/b-roll/problem/coat/c1.mp4')
    expect(brollOf('V02')).not.toContain('nix/b-roll/problem/joints/j1.mp4')
    expect(brollOf('V01')).toContain('nix/b-roll/problem/joints/j1.mp4')
    expect(brollOf('V02')).toContain('nix/b-roll/problem/coat/c1.mp4')
  })

  it('pairs a VO linked to hooks / CTAs only with those, while they still go with other VOs', () => {
    const recipes = buildRecipes(manifest([
      take('hook', 'H01', 'joe', 'nix'), take('hook', 'H02', 'joe', 'nix'),
      ...vo('V01', 'joe', 'nix', [['problem', 2]]).map(t => ({ ...t, hooks: ['H02'], ctas: ['C01'] })),
      ...vo('V02', 'joe', 'nix', [['problem', 2]]),
      take('cta', 'C01', 'joe', 'nix'), take('cta', 'C02', 'joe', 'nix'),
      ...nixBroll
    ]))
    const pairs = (code: string) => recipes.filter(recipe => recipe.vo.code === code).map(recipe => `${recipe.hook.code} ${recipe.cta.code}`).sort()
    expect(pairs('V01')).toEqual(['H02 C01'])
    expect(pairs('V02')).toEqual(['H01 C01', 'H01 C02', 'H02 C01', 'H02 C02'])
    // linked to a hook that isn't on the shoot: no recipes
    expect(buildRecipes(manifest([
      take('hook', 'H01', 'joe', 'nix'), ...vo('V01', 'joe', 'nix', [['problem', 2]]).map(t => ({ ...t, hooks: [] })), take('cta', 'C01', 'joe', 'nix'), ...nixBroll
    ]))).toEqual([])
  })

  it('lays product shots under a VO CTA', () => {
    const [recipe] = buildRecipes(manifest([
      take('hook', 'H01', 'joe', 'nix'), ...vo('V01', 'joe', 'nix', [['problem', 2]]),
      take('cta', 'C01', 'joe', 'nix', { mode: 'vo', duration: 2 }), ...nixBroll
    ]))
    expect(recipe!.cta.broll).toEqual(['nix/b-roll/general/g1.mp4'])
  })

  it('leaves out a VO missing one of its format\'s beats (a manifest marked ready anyway)', () => {
    const m = manifest([
      take('hook', 'H01', 'joe', 'nix'), ...vo('V01', 'joe', 'nix', [['problem', 2]]), take('cta', 'C01', 'joe', 'nix'), ...nixBroll
    ])
    m.plan = { ...m.plan, formats: [{ code: 'F01', cta_modes: [], beats: ['problem', 'product'] }] }
    expect(buildRecipes(m)).toEqual([])
  })

  it('gives the same recipe the same id every time', () => {
    const clips = [take('hook', 'H01', 'joe', 'nix'), ...vo('V01', 'joe', 'nix', [['problem', 3]]), take('cta', 'C01', 'joe', 'nix'), ...nixBroll]
    expect(buildRecipes(manifest(clips))[0]!.id).toBe(buildRecipes(manifest([...clips].reverse()))[0]!.id)
  })

  it('lists recipes grouped by channel, then by id', () => {
    const recipes = buildRecipes(manifest([
      ...['whiskey', 'nix'].flatMap(channel => [
        take('hook', 'H02', 'joe', channel), take('hook', 'H01', 'joe', channel),
        ...vo('V01', 'joe', channel, [['problem', 2]]), take('cta', 'C01', 'joe', channel),
        ...nixBroll.map(c => ({ ...c, channel, file: c.file.replace('nix/', `${channel}/`) }))
      ])
    ]))
    expect(recipes.map(recipe => `${recipe.channel} ${recipe.hook.code}`)).toEqual(['nix H01', 'nix H02', 'whiskey H01', 'whiskey H02'])
    // by the channel field itself, not the id prefix
    const fake = (id: string, channel: string) => ({ id, channel }) as Recipe
    expect([fake('a', 'whiskey'), fake('z', 'nix'), fake('b', 'nix')].sort(byChannel).map(recipe => recipe.id)).toEqual(['b', 'z', 'a'])
  })
})

describe('variations', () => {
  const withVariations = (clips: Manifest['clips'], broll_variations: number, vo_variations = 0) => {
    const m = manifest(clips)
    m.plan = { ...m.plan, shoot: { ...m.plan.shoot, broll_variations, vo_variations } }
    return m
  }

  it('gives each hook + VO + CTA up to broll_variations different b-roll selections, keeping the first one\u2019s id', () => {
    const clips = [take('hook', 'H01', 'joe', 'nix'), ...vo('V01', 'joe', 'nix', [['problem', 3]]), take('cta', 'C01', 'joe', 'nix'), ...nixBroll]
    const [single] = buildRecipes(manifest(clips))
    const recipes = buildRecipes(withVariations(clips, 2))
    expect(recipes).toHaveLength(2)
    expect(recipes.map(recipe => recipe.id)).toContain(single!.id)
    expect(recipes[0]!.vo.beats[0]!.broll).not.toEqual(recipes[1]!.vo.beats[0]!.broll)
    // never two of them in one batch: they share the hook + VO pair
    expect(chooseBatch(recipes, { size: 2 })).toHaveLength(1)
  })

  it('stops at as many different selections as the b-roll allows', () => {
    const clips = [take('hook', 'H01', 'joe', 'nix'), ...vo('V01', 'joe', 'nix', [['problem', 1]]), take('cta', 'C01', 'joe', 'nix'), clip('nix', 'problem', 'only', 2)]
    expect(buildRecipes(withVariations(clips, 5))).toHaveLength(1)
  })

  it('mixes the beats of a VO cast on several people, with anyone\u2019s hook and CTA on the channel', () => {
    const clips = [
      take('hook', 'H01', 'joe', 'nix'), take('cta', 'C01', 'sam', 'nix'),
      ...vo('V01', 'joe', 'nix', [['problem', 2], ['product', 2]]),
      ...vo('V01', 'sam', 'nix', [['problem', 2], ['product', 2]]),
      ...nixBroll
    ]
    // without mixing: Joe has no CTA and Sam no hook, so nothing
    expect(buildRecipes(withVariations(clips, 1, 0))).toEqual([])
    const recipes = buildRecipes(withVariations(clips, 1, 2))
    expect(recipes).toHaveLength(2)
    for (const recipe of recipes) {
      expect(recipe.mixed).toBe(true)
      expect(recipe.person).toBe('joe+sam')
      expect(recipe.id).toMatch(/^S001_nix_mix_joe-H01_V01-(joe\.sam|sam\.joe)_sam-C01_[0-9a-f]{8}$/)
      expect(new Set(recipe.vo.beats.map(beat => beat.person)).size).toBe(2)
      expect(recipe.vo.item_ids).toHaveLength(2)
    }
  })

  it('picks mixes that never come from one person, up to the number asked for', () => {
    const mixes = beatMixes(['joe', 'sam'], 3, 10, 'seed')
    expect(mixes).toHaveLength(6)
    expect(mixes.every(mix => new Set(mix).size > 1)).toBe(true)
    expect(beatMixes(['joe', 'sam'], 3, 2, 'seed')).toEqual(mixes.slice(0, 2))
    expect(beatMixes(['joe'], 3, 2, 'seed')).toEqual([])
  })
})

describe('batches', () => {
  // Joe and Sam on Nix, two hooks each, one VO each in different formats, two CTAs each
  const recipes = buildRecipes(manifest([
    ...['joe', 'sam'].flatMap(person => [
      take('hook', 'H01', person, 'nix', { hook_type: 'POV' }), take('hook', 'H02', person, 'nix', { hook_type: 'Problem' }),
      ...vo('V01', person, 'nix', [['problem', 2]], person === 'joe' ? 'F01' : 'F02'),
      take('cta', 'C01', person, 'nix'), take('cta', 'C02', person, 'nix')
    ]),
    ...nixBroll
  ]))

  it('takes the shoot\'s share of the valid recipes', () => {
    expect(recipes).toHaveLength(8)
    expect(batchSize(recipes.length, 0.05)).toBe(1)
    expect(batchSize(200, 0.05)).toBe(10)
    expect(batchSize(0, 0.05)).toBe(0)
  })

  it('never repeats a hook + VO pair in a batch, and spreads across people first', () => {
    const batch = chooseBatch(recipes, { size: 8 })
    const pairs = batch.map(recipe => `${recipe.hook.item_id}|${recipe.vo.item_id}`)
    expect(new Set(pairs).size).toBe(pairs.length)
    // 2 people × 2 hooks × 1 VO = 4 distinct pairs
    expect(batch).toHaveLength(4)
    expect(batch.slice(0, 2).map(recipe => recipe.person).sort()).toEqual(['joe', 'sam'])
  })

  it('never batches a recipe twice, and leaves out anything rated bad', () => {
    const first = chooseBatch(recipes, { size: 2 })
    const exclude = new Set(first.map(recipe => recipe.id))
    const second = chooseBatch(recipes, { size: 8, exclude, ratings: new Map([['nix-sam-H02', 'bad']]) })
    expect(second.some(recipe => exclude.has(recipe.id))).toBe(false)
    expect(second.some(recipe => recipe.hook.item_id === 'nix-sam-H02')).toBe(false)
  })

  it('favours parts rated good', () => {
    const [pick] = chooseBatch(recipes, { size: 1, ratings: new Map([['nix-sam-C02', 'good']]) })
    expect(pick!.cta.item_id).toBe('nix-sam-C02')
  })

  it('writes a batch grouped by channel, keeping the pick order within each channel', () => {
    const pick = (id: string, channel: string) => ({ id, channel, person: 'joe', hook: { code: 'H01' }, vo: { code: 'V01', format: 'F01' }, cta: { code: 'C01' } }) as Recipe
    const chosen = [pick('w2', 'whiskey'), pick('n3', 'nix'), pick('w1', 'whiskey'), pick('n1', 'nix'), pick('s1', 'siblings')]
    const ordered = batchOrder(chosen)
    expect(ordered.map(recipe => recipe.id)).toEqual(['n3', 'n1', 's1', 'w2', 'w1'])
    // the same recipes, only reordered; the CSV follows
    expect([...ordered].sort(byChannel)).toEqual([...chosen].sort(byChannel))
    expect(batchCsv(ordered).split('\r\n').slice(1, -1).map(row => row.split(',')[0])).toEqual(['n3', 'n1', 's1', 'w2', 'w1'])
    expect(renderFolder('B01', 'topdognix')).toBe('renders/B01/topdognix')
  })

  it('numbers batches B01, B02…', () => {
    expect(nextBatchCode([])).toBe('B01')
    expect(nextBatchCode(['B01', 'B03'])).toBe('B04')
  })
})
