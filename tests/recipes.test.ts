import { describe, expect, it } from 'vitest'
import type { BrollClip, Manifest, TakeClip } from '../shared/utils/manifest'
import { batchSize, buildRecipes, chooseBatch, nextBatchCode } from '../shared/utils/recipes'

const take = (kind: TakeClip['kind'], code: string, person: string, channel: string, extra: Partial<TakeClip> = {}): TakeClip => ({
  kind, code, person, channel, item_id: `${channel}-${person}-${code}`, beat: null, format: null, mode: kind === 'cta' ? 'sync' : null,
  angle: null, script: '', file: `${channel}/${kind}/${person}/${code}.mp4`, raw_file: '', caption: null, duration: 3, ...extra
})
const vo = (code: string, person: string, channel: string, beats: [string, number][], format = 'F01') =>
  beats.map(([beat, duration]) => take('vo', code, person, channel, { beat, duration, format, file: `${channel}/vo/${person}/${code}_${beat}.m4a` }))
const clip = (channel: string, section: string, name: string, duration: number, productVisible = section === 'general'): BrollClip => ({
  kind: 'broll', channel, section, file: `${channel}/b-roll/${section}/${name}.mp4`, raw_file: '', duration, shot: null, product_visible: productVisible
})

function manifest(clips: Manifest['clips']): Manifest {
  return { schema_version: 2, version: 1, generated_at: '', plan: { shoot: { code: 'S001' } } as Manifest['plan'], clips }
}

const nixBroll = [
  clip('nix', 'problem', 'p1', 2), clip('nix', 'problem', 'p2', 2), clip('nix', 'problem', 'p3', 2),
  clip('nix', 'product', 'pr1', 2, true), clip('nix', 'product', 'pr2', 2),
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

  it('covers each beat by length from its own clips, with a product shot in the product beat, and never repeats a clip', () => {
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
    // the product beat starts with the product-visible clip, then tops up to 3s
    expect(product!.broll[0]).toBe('nix/b-roll/product/pr1.mp4')
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

  it('drops a recipe whose b-roll can\'t cover a beat, or whose product beat has no product shot', () => {
    expect(buildRecipes(manifest([
      take('hook', 'H01', 'joe', 'nix'), ...vo('V01', 'joe', 'nix', [['problem', 30]]), take('cta', 'C01', 'joe', 'nix'), ...nixBroll
    ]))).toEqual([])
    expect(buildRecipes(manifest([
      take('hook', 'H01', 'joe', 'nix'), ...vo('V01', 'joe', 'nix', [['product', 1]]), take('cta', 'C01', 'joe', 'nix'),
      clip('nix', 'product', 'pr2', 2)
    ]))).toEqual([])
  })

  it('lays product shots under a VO CTA', () => {
    const [recipe] = buildRecipes(manifest([
      take('hook', 'H01', 'joe', 'nix'), ...vo('V01', 'joe', 'nix', [['problem', 2]]),
      take('cta', 'C01', 'joe', 'nix', { mode: 'vo', duration: 2 }), ...nixBroll
    ]))
    expect(recipe!.cta.broll).toEqual(['nix/b-roll/general/g1.mp4'])
  })

  it('gives the same recipe the same id every time', () => {
    const clips = [take('hook', 'H01', 'joe', 'nix'), ...vo('V01', 'joe', 'nix', [['problem', 3]]), take('cta', 'C01', 'joe', 'nix'), ...nixBroll]
    expect(buildRecipes(manifest(clips))[0]!.id).toBe(buildRecipes(manifest([...clips].reverse()))[0]!.id)
  })
})

describe('batches', () => {
  // Joe and Sam on Nix, two hooks each, one VO each in different formats, two CTAs each
  const recipes = buildRecipes(manifest([
    ...['joe', 'sam'].flatMap(person => [
      take('hook', 'H01', person, 'nix', { angle: 'POV' }), take('hook', 'H02', person, 'nix', { angle: 'Problem' }),
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

  it('numbers batches B01, B02…', () => {
    expect(nextBatchCode([])).toBe('B01')
    expect(nextBatchCode(['B01', 'B03'])).toBe('B04')
  })
})
