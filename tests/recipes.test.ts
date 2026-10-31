import { describe, expect, it } from 'vitest'
import type { BrollClip, Manifest, TakeClip } from '../shared/utils/manifest'
import type { Recipe } from '../shared/utils/recipes'
import { batchCsv, batchOrder, batchSize, beatMixes, buildRecipes, byChannel, chooseBatch, nextBatchCode, pickCombos, renderFolder } from '../shared/utils/recipes'

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

describe('wordings and standalone VOs', () => {
  const withShoot = (clips: Manifest['clips'], shoot: Record<string, number>) => {
    const m = manifest(clips)
    m.plan = { ...m.plan, shoot: { ...m.plan.shoot, ...shoot } }
    return m
  }
  /** one wording of a VO beat */
  const wording = (code: string, person: string, beat: string, option: number, extra: Partial<TakeClip> = {}) =>
    take('vo', code, person, 'nix', { beat, option, duration: 2, file: `nix/vo/${person}/${beat}/${code}${option > 1 ? `-${option}` : ''}.mp4`, ...extra })

  it('makes extra versions from alternate wordings, up to wording_variations, keeping the first wordings\u2019 id', () => {
    const clips = [
      take('hook', 'H01', 'joe', 'nix'), take('cta', 'C01', 'joe', 'nix'),
      wording('V01', 'joe', 'problem', 1), wording('V01', 'joe', 'problem', 2), wording('V01', 'joe', 'problem', 3),
      ...nixBroll
    ]
    const [base] = buildRecipes(manifest(clips.filter(clip => clip.kind === 'broll' || (clip as TakeClip).option !== 2 && (clip as TakeClip).option !== 3)))
    // no wording mixes asked for: just the first wordings
    expect(buildRecipes(withShoot(clips, { wording_variations: 0 })).map(recipe => recipe.id)).toEqual([base!.id])
    const recipes = buildRecipes(withShoot(clips, { wording_variations: 5 }))
    expect(recipes).toHaveLength(3)
    expect(recipes.map(recipe => recipe.id)).toContain(base!.id)
    expect(recipes.map(recipe => recipe.vo.beats[0]!.option).sort()).toEqual([1, 2, 3])
    expect(recipes.find(recipe => recipe.vo.beats[0]!.option === 2)!.id).toMatch(/^S001_nix_joe_H01_V01\.2_C01_/)
    expect(pickCombos([3, 1], 1, 'seed')).toHaveLength(1)
    expect(pickCombos([1, 1], 4, 'seed')).toEqual([])
  })

  it('makes a standalone VO its own whole video: its hook and CTA beats, never a Library hook or CTA', () => {
    const standalone = { standalone: true, format: 'F13' }
    const recipes = buildRecipes(withShoot([
      take('hook', 'H01', 'joe', 'nix'), take('cta', 'C01', 'joe', 'nix'),
      wording('V02', 'joe', 'hook', 1, { ...standalone, show: 'face', hook_type: 'Confession' }),
      wording('V02', 'joe', 'hook', 2, { ...standalone, show: 'face', hook_type: 'Curiosity' }),
      wording('V02', 'joe', 'problem', 1, { ...standalone, show: 'broll' }),
      wording('V02', 'joe', 'cta', 1, { ...standalone, show: 'face' }),
      ...nixBroll
    ], { wording_variations: 1 }))
    expect(recipes).toHaveLength(2)
    for (const recipe of recipes) {
      expect(recipe.standalone).toBe(true)
      expect(recipe.hook.file).toMatch(/nix\/vo\/joe\/hook\/V02/)
      expect(recipe.cta).toMatchObject({ mode: 'sync', take: 'cta', broll: [] })
      expect(recipe.vo.beats.map(beat => beat.beat)).toEqual(['problem'])
      expect(recipe.id).not.toContain('H01')
    }
    expect(recipes.map(recipe => recipe.hook.hook_type).sort()).toEqual(['Confession', 'Curiosity'])
    // each hook wording is its own hook: both can go in one batch
    expect(chooseBatch(recipes, { size: 2 })).toHaveLength(2)
  })

  it('gives a beat shown face to camera no b-roll', () => {
    const [recipe] = buildRecipes(manifest([
      take('hook', 'H01', 'joe', 'nix'), take('cta', 'C01', 'joe', 'nix'),
      wording('V01', 'joe', 'problem', 1, { show: 'face', duration: 30 }),
      ...nixBroll
    ]))
    // 30 seconds could never be covered by b-roll; on camera it doesn't need to be
    expect(recipe!.vo.beats[0]).toMatchObject({ show: 'face', broll: [] })
  })
})

describe('treatments', () => {
  const treatment = (name: string, kind: string, needs: string[], settings: Record<string, unknown> = {}) =>
    ({ slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, kind, placement: 'video', needs, component: 'x', settings })
  const withTreatments = (clips: Manifest['clips'], treatments: ReturnType<typeof treatment>[], slotValues: Record<string, string> = {}) => {
    const m = manifest(clips)
    m.plan = { ...m.plan, shoot: { ...m.plan.shoot, slot_values: slotValues }, treatments } as Manifest['plan']
    return m
  }
  const clips = [take('hook', 'H01', 'joe', 'nix'), ...vo('V01', 'joe', 'nix', [['problem', 3]]), take('cta', 'C01', 'joe', 'nix'), ...nixBroll]

  it('adds one version per treatment that applies, alongside the untreated one, whose id doesn\u2019t change', () => {
    const [plain] = buildRecipes(manifest(clips))
    const recipes = buildRecipes(withTreatments(clips, [
      treatment('Search bar', 'overlay', ['text']),
      treatment('Greenscreen', 'footage', ['speaker_video']),
      // needs the shoot's offer, which isn't filled in: not applied
      treatment('Offer badge', 'overlay', ['offer']),
      // the footage library isn't built yet: never applied
      treatment('Then & now labels', 'overlay', ['old_footage'])
    ]))
    expect(recipes.map(recipe => recipe.id).sort()).toEqual([plain!.id, `${plain!.id}_greenscreen`, `${plain!.id}_search-bar`].sort())
    expect(recipes.find(recipe => recipe.id === plain!.id)!.treatment).toBeNull()
    expect(recipes.find(recipe => recipe.id.endsWith('_search-bar'))!.treatment!.name).toBe('Search bar')
    // with an offer on the shoot, the offer badge applies too
    expect(buildRecipes(withTreatments(clips, [treatment('Offer badge', 'overlay', ['offer'])], { offer: '20% off' }))).toHaveLength(2)
  })

  it('re-lays the beats for a layout treatment, and skips one that would change nothing', () => {
    const recipes = buildRecipes(withTreatments(clips, [
      treatment('Face to camera', 'layout', ['speaker_video'], { show: 'face' }),
      // the VO is already over b-roll throughout
      treatment('Over b-roll', 'layout', [], { show: 'broll' })
    ]))
    expect(recipes).toHaveLength(2)
    const face = recipes.find(recipe => recipe.treatment?.name === 'Face to camera')!
    expect(face.id).toMatch(/_face-to-camera$/)
    expect(face.vo.beats[0]).toMatchObject({ show: 'face', broll: [] })
  })

  it('applies a curated combination where every part would, with its layout and its overlays together', () => {
    const search = treatment('Search bar', 'overlay', ['text'])
    const face = treatment('Face to camera', 'layout', ['speaker_video'], { show: 'face' })
    const pip = treatment('Picture-in-picture', 'footage', ['speaker_video'])
    const combo = (name: string, parts: ReturnType<typeof treatment>[]) => ({ ...treatment(name, parts.find(part => part.kind !== 'overlay')?.kind ?? 'overlay', [...new Set(parts.flatMap(part => part.needs))]), component: 'combo', parts })
    const recipes = buildRecipes(withTreatments(clips, [
      combo('Search, then face to camera', [search, face]),
      combo('Search, then picture-in-picture', [search, pip]),
      // an offer part that doesn't apply (no offer on the shoot) stops the whole combination
      combo('Search, then offer', [search, treatment('Offer badge', 'overlay', ['offer'])])
    ]))
    expect(recipes.map(recipe => recipe.treatment?.name ?? null).sort()).toEqual([null, 'Search, then face to camera', 'Search, then picture-in-picture'].sort())
    const faced = recipes.find(recipe => recipe.treatment?.name === 'Search, then face to camera')!
    expect(faced.vo.beats[0]).toMatchObject({ show: 'face', broll: [] })
    expect(faced.treatment!.parts!.map(part => part.name)).toEqual(['Search bar', 'Face to camera'])
    expect(faced.id).toMatch(/_search-then-face-to-camera$/)
  })

  it('doesn\u2019t use the speaker\u2019s picture when a take is audio only', () => {
    const audio = clips.map(clip => clip.kind === 'vo' ? { ...clip, file: clip.file.replace('.mp4', '.m4a') } : clip)
    expect(buildRecipes(withTreatments(audio, [treatment('Greenscreen', 'footage', ['speaker_video'])]))).toHaveLength(1)
  })
})

describe('a text thread', () => {
  const screen = (code: string, person: string, beat: string, text: string) =>
    take('vo', code, person, 'nix', { beat, option: 1, show: 'screen', standalone: true, format: 'F21', file: '', script: text, duration: 2 })
  const note = (code: string, person: string, beat: string) =>
    take('vo', code, person, 'nix', { beat, option: 1, show: 'voice_note', standalone: true, format: 'F21', file: `nix/vo/${person}/${beat}/${code}.mp4`, duration: 3 })
  const thread = (person: string) => [screen('V09', person, 'hook', 'ok how is your dog so chill'), note('V09', person, 'voice note'), note('V09', person, 'reply'), screen('V09', person, 'cta', 'link below')]
  const withPlan = (clips: Manifest['clips'], extra: Record<string, unknown> = {}) => {
    const m = manifest(clips)
    m.plan = { ...m.plan, shoot: { ...m.plan.shoot, ...extra } } as Manifest['plan']
    return m
  }

  it('makes the whole video from messages and voice notes: no b-roll, no Library hook or CTA', () => {
    const [recipe, ...rest] = buildRecipes(withPlan([take('hook', 'H01', 'joe', 'nix'), take('cta', 'C01', 'joe', 'nix'), ...thread('joe'), ...nixBroll]))
    expect(rest).toEqual([])
    expect(recipe!.hook).toMatchObject({ show: 'screen', text: 'ok how is your dog so chill', broll: [] })
    expect(recipe!.cta).toMatchObject({ mode: 'screen', text: 'link below', broll: [] })
    expect(recipe!.vo.beats.map(beat => `${beat.beat}/${beat.show}/${beat.broll.length}`)).toEqual(['voice note/voice_note/0', 'reply/voice_note/0'])
  })

  it('leaves it alone for layout treatments, but takes overlays that need nothing', () => {
    const t = (name: string, kind: string, needs: string[], settings = {}) => ({ slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, kind, placement: 'video', needs, component: 'x', settings })
    const m = withPlan([...thread('joe'), ...nixBroll])
    m.plan = { ...m.plan, treatments: [t('Face to camera', 'layout', ['speaker_video'], { show: 'face' }), t('Over b-roll', 'layout', [], { show: 'broll' }), t('Greenscreen', 'footage', ['speaker_video']), t('Retro look', 'overlay', [])] } as Manifest['plan']
    expect(buildRecipes(m).map(recipe => recipe.treatment?.name ?? null).sort()).toEqual([null, 'Retro look'].sort())
  })

  it('mixes only the voice notes across the people cast on it', () => {
    const mixed = buildRecipes(withPlan([...thread('joe'), ...thread('sam'), ...nixBroll], { vo_variations: 9 })).filter(recipe => recipe.mixed)
    // 2 voice notes, 2 people: joe+sam and sam+joe (never two people swapping identical messages)
    expect(mixed).toHaveLength(2)
    expect(mixed.map(recipe => recipe.vo.beats.map(beat => beat.person).join('.')).sort()).toEqual(['joe.sam', 'sam.joe'])
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
