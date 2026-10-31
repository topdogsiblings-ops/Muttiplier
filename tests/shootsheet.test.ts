import { describe, expect, it } from 'vitest'
import type { ShootBundle } from '../shared/utils/shootsheet'
import {
  brollFolder,
  buildCsv,
  buildShootsheet,
  beatShow,
  groupShotList,
  itemBeats,
  performs,
  linkedCodes,
  nextItemCodes,
  planSnapshots,
  resolveItemScript,
  skeletonFiles,
  takeSpot,
  unfilledItems
} from '../shared/utils/shootsheet'

const format = { code: 'F02', cta_modes: ['sync', 'vo'], beats: ['problem', 'product', 'result'] }

function bundle(): ShootBundle {
  return {
    shoot: { code: 'S014', shoot_date: '2026-10-20', status: 'planned', broll_variations: 3, submission_rate: 0.15, slot_values: { benefit: 'calmer walks' } },
    brand: { name: 'PawCo', slug: 'pawco' },
    product: { name: 'Calming Chews', slug: 'calming-chews' },
    people: [{ id: 'p1', slug: 'joe', name: 'Joe' }],
    channels: [
      { id: 'c1', name: 'topdognix', slug: 'topdognix', folder_slug: 'nix', dogs: ['nix'], dog_phrase: 'my Doberman' },
      { id: 'c2', name: 'topdogwhiskey', slug: 'topdogwhiskey', folder_slug: 'whiskey', dogs: ['whiskey'], dog_phrase: 'my Vizsla' }
    ],
    items: [
      {
        id: 'i1', code: 'H01', kind: 'hook', person_id: 'p1', channel_id: 'c1', script_snapshot: 'Nobody told me {{product}} could do this for {{dog}}',
        script_override: null, cta_mode: null, location: 'kitchen', status: 'planned', sort_order: 0, template_id: 'aaaaaaaa-0000-0000-0000-000000000001',
        hook_type: 'curiosity', format: null, caption: '{{dog}} and {{product}}: {{benefit}}'
      },
      {
        id: 'i2', code: 'U01', kind: 'hook', person_id: 'p1', channel_id: 'c2', script_snapshot: 'POV: {{dog}} finally settles',
        script_override: null, cta_mode: null, location: null, status: 'planned', sort_order: 1, template_id: '1a2b3c4d-0000-0000-0000-000000000002',
        hook_type: 'pov', format: null
      },
      {
        id: 'i3', code: 'V01', kind: 'body', person_id: 'p1', channel_id: 'c1',
        script_snapshot: [{ beat: 'problem', script: 'My dog pulled' }, { beat: 'product', script: '{{brand}} {{product}}' }, { beat: 'result', script: '{{benefit}}' }],
        script_override: null, cta_mode: null, location: null, status: 'planned', sort_order: 2, template_id: 'bbbbbbbb-0000-0000-0000-000000000003',
        hook_type: null, format
      },
      {
        id: 'i4', code: 'C01', kind: 'cta', person_id: 'p1', channel_id: 'c1', script_snapshot: 'Template CTA',
        script_override: 'Grab {{product}}, "today"', cta_mode: 'sync', location: null, status: 'planned', sort_order: 3,
        template_id: 'cccccccc-0000-0000-0000-000000000004', hook_type: null, format: null
      }
    ],
    broll: [
      { channel_id: 'c1', format_id: 'f2', beat: 'problem', description: 'anxious pacing', status: 'planned' },
      { channel_id: null, beat: 'product', description: 'pack shot', status: 'planned' }
    ]
  }
}

describe('codes and allocation', () => {
  it('continues numbering after the highest code for a prefix', () => {
    expect(nextItemCodes(['H01', 'H03', 'V09', 'U02'], 'H', 2)).toEqual(['H04', 'H05'])
    expect(nextItemCodes([], 'U', 1)).toEqual(['U01'])
    expect(nextItemCodes(['C99'], 'C', 1)).toEqual(['C100'])
  })

})

describe('shared shot list', () => {
  /** The same hook filmed by two people: same code, one item each. */
  function twoPeople(): ShootBundle {
    const b = bundle()
    b.people.push({ id: 'p2', slug: 'sam', name: 'Sam' })
    b.items.push({ ...b.items[0]!, id: 'i1b', person_id: 'p2' })
    return b
  }

  it('groups items by template, one entry per hook / VO / CTA, in code order', () => {
    const groups = groupShotList(twoPeople().items)
    expect(groups.map(group => [group.code, group.items.length])).toEqual([['C01', 1], ['H01', 2], ['U01', 1], ['V01', 1]])
  })

  it('reports an unfilled code once, not once per person', () => {
    const b = twoPeople()
    b.channels[0]!.dog_phrase = ''
    expect(unfilledItems(b)).toEqual([{ code: 'H01', slots: ['dog'] }])
  })

  it('files each person\'s clip under the shared code, as a file named by the code', () => {
    const b = twoPeople()
    expect(buildShootsheet(b).items.filter(item => item.code === 'H01').map(item => item.file)).toEqual([
      'pawco/calming-chews/shoots/S014/edited/topdognix/hooks/joe/H01',
      'pawco/calming-chews/shoots/S014/edited/topdognix/hooks/sam/H01'
    ])
  })

  it('files a shared b-roll shot under every channel, by beat for a format\'s shots', () => {
    const b = bundle()
    b.broll.push({ channel_id: null, format_id: 'f2', beat: 'result', description: 'happy dog', status: 'planned' })
    expect(buildShootsheet(b).broll.map(shot => shot.raw_folder)).toEqual(expect.arrayContaining([
      'pawco/calming-chews/shoots/S014/raw/topdognix/b-roll/result',
      'pawco/calming-chews/shoots/S014/raw/topdogwhiskey/b-roll/result'
    ]))
  })

  it('uses all/ for the channel only when the shoot has none', () => {
    const b = bundle()
    b.channels = []
    expect(buildShootsheet(b).broll.map(shot => shot.raw_folder)).toContain('pawco/calming-chews/shoots/S014/raw/all/b-roll/general')
  })
})

describe('resolveItemScript', () => {
  it('fills {{dog}} from the hook channel and prefers overrides', () => {
    const b = bundle()
    expect(resolveItemScript(b, b.items[0]!).text).toBe('Nobody told me Calming Chews could do this for my Doberman')
    expect(resolveItemScript(b, b.items[1]!).text).toBe('POV: my Vizsla finally settles')
    expect(resolveItemScript(b, b.items[3]!)).toMatchObject({ text: 'Grab Calming Chews, "today"', overridden: true })
  })

  it('fills {{dog}} on an item used for every channel when every channel has a dog phrase', () => {
    const b = bundle()
    b.items[0]!.channel_id = null
    expect(unfilledItems(b)).toEqual([])
    expect(resolveItemScript(b, b.items[0]!).text).toBe('Nobody told me Calming Chews could do this for my Doberman / my Vizsla')
  })

  it('flags {{dog}} only when a channel on the shoot has no dog phrase', () => {
    const b = bundle()
    b.items[0]!.channel_id = null
    b.channels[0]!.dog_phrase = ''
    expect(unfilledItems(b)).toEqual([{ code: 'H01', slots: ['dog'] }])
  })
})

describe('planSnapshots', () => {
  it('freezes filled scripts so later template or product edits cannot change the shoot', () => {
    const b = bundle()
    const frozen = planSnapshots(b)
    expect(frozen[0]).toEqual({
      id: 'i1',
      script_snapshot: 'Nobody told me Calming Chews could do this for my Doberman',
      script_override: null,
      caption: 'my Doberman and Calming Chews: calmer walks'
    })
    expect(frozen[2]!.script_snapshot).toEqual([
      { beat: 'problem', script: 'My dog pulled' },
      { beat: 'product', script: 'PawCo Calming Chews' },
      { beat: 'result', script: 'calmer walks' }
    ])
    expect(frozen[3]).toEqual({ id: 'i4', script_snapshot: 'Template CTA', script_override: 'Grab Calming Chews, "today"', caption: null })

    // apply, then change the product: the planned shoot renders exactly as before
    b.items.forEach((item, index) => Object.assign(item, frozen[index]))
    const before = JSON.stringify(buildShootsheet(b).items)
    b.product = { name: 'Renamed', slug: 'calming-chews' }
    b.brand.name = 'NewCo'
    expect(JSON.stringify(buildShootsheet(b).items)).toBe(before)
  })
})

describe('buildShootsheet', () => {
  it('matches the worker contract', () => {
    const sheet = buildShootsheet(bundle())
    expect(sheet.schema_version).toBe(8)
    // custom slots are the shoot's own
    expect(sheet.shoot.slot_values).toEqual({ benefit: 'calmer walks' })
    expect(sheet.shoot).toMatchObject({ code: 'S014', date: '2026-10-20', broll_variations: 3, submission_rate: 0.15 })
    expect(sheet.channels[0]).toEqual({ slug: 'topdognix', folder_slug: 'nix', dogs: ['nix'] })
    // a modular format: every beat over b-roll
    expect(sheet.formats).toEqual([{ ...format, kind: 'modular', beat_display: { problem: 'broll', product: 'broll', result: 'broll' } }])
    // channel first; a VO is recorded beat by beat, a file each in its beat's folder
    expect(sheet.items.map(item => [item.code, 'beats' in item ? item.beats.map(beat => beat.file) : item.file])).toEqual([
      ['C01', 'pawco/calming-chews/shoots/S014/edited/topdognix/ctas/joe/C01'],
      ['H01', 'pawco/calming-chews/shoots/S014/edited/topdognix/hooks/joe/H01'],
      // universal hooks are filed like any other hook, by their code
      ['U01', 'pawco/calming-chews/shoots/S014/edited/topdogwhiskey/hooks/joe/U01'],
      ['V01', ['pawco/calming-chews/shoots/S014/edited/topdognix/vo/joe/problem/V01', 'pawco/calming-chews/shoots/S014/edited/topdognix/vo/joe/product/V01', 'pawco/calming-chews/shoots/S014/edited/topdognix/vo/joe/result/V01']]
    ])
    expect(sheet.items[1]).toEqual({
      code: 'H01', kind: 'hook', person: 'joe', channel: 'topdognix', template_id: 'aaaaaaaa-0000-0000-0000-000000000001',
      hook_type: 'curiosity', script: 'Nobody told me Calming Chews could do this for my Doberman',
      caption: 'my Doberman and Calming Chews: calmer walks',
      file: 'pawco/calming-chews/shoots/S014/edited/topdognix/hooks/joe/H01',
      raw_file: 'pawco/calming-chews/shoots/S014/raw/topdognix/hooks/joe/H01'
    })
    expect(sheet.items[3]).toMatchObject({ kind: 'body', channel: 'topdognix', format: 'F02' })
    expect(sheet.items[0]).toMatchObject({ kind: 'cta', cta_mode: 'sync', channel: 'topdognix' })
    // the shared pack shot (a general product shot) is listed once per channel
    expect(sheet.broll.map(shot => shot.folder)).toEqual([
      'pawco/calming-chews/shoots/S014/edited/topdognix/b-roll/problem',
      'pawco/calming-chews/shoots/S014/edited/topdognix/b-roll/general',
      'pawco/calming-chews/shoots/S014/edited/topdogwhiskey/b-roll/general'
    ])
  })

  it('leaves out skipped items', () => {
    const b = bundle()
    b.items[0]!.status = 'skipped'
    expect(buildShootsheet(b).items.map(item => item.code)).toEqual(['C01', 'U01', 'V01'])
  })
})

describe('skeleton zip', () => {
  it('mirrors every clip folder under raw/ and edited/, with renders/ in the shoot', () => {
    const b = bundle()
    const files = skeletonFiles(b)
    const folders = Object.keys(files).filter(path => path.endsWith('/.keep')).map(path => path.slice(0, -'/.keep'.length))
    const sheet = buildShootsheet(b)
    const parent = (path: string) => path.slice(0, path.lastIndexOf('/'))
    for (const item of sheet.items) {
      for (const clip of 'beats' in item ? item.beats : [item]) {
        expect(folders).toContain(parent(clip.file))
        expect(folders).toContain(parent(clip.raw_file))
        expect(clip.raw_file.replace('/raw/', '/edited/')).toBe(clip.file)
      }
    }
    for (const shot of sheet.broll) {
      expect(folders).toContain(shot.folder)
      expect(folders).toContain(shot.raw_folder)
      expect(shot.raw_folder.replace('/raw/', '/edited/')).toBe(shot.folder)
    }

    const shoot = 'pawco/calming-chews/shoots/S014'
    expect(folders).toEqual(expect.arrayContaining([`${shoot}/raw`, `${shoot}/edited`, `${shoot}/renders`]))
    // everything lives in the shoot folder
    expect(folders.every(folder => folder.startsWith(shoot))).toBe(true)
    expect(JSON.parse(files[`${shoot}/manifest.json`]!)).toEqual({ schema_version: 9, version: 0, generated_at: null, plan: sheet, clips: [] })
  })

  it('files b-roll for a product feature a level down in its beat folder', () => {
    const b = bundle()
    const shot = { ...b.broll.find(s => s.format_id)!, feature: { slug: 'joint-support', name: 'Joint support' } }
    const generic = brollFolder(b, { ...shot, feature: null }, b.channels[0]!.id)
    expect(brollFolder(b, shot, b.channels[0]!.id)).toBe(`${generic}/joint-support`)
    b.broll = [...b.broll, shot]
    const folders = Object.keys(skeletonFiles(b)).map(path => path.slice(0, path.lastIndexOf('/')))
    expect(folders).toContain(`${generic.replace('/raw/', '/edited/')}/joint-support`)
  })
})

describe('buildCsv', () => {
  it('writes one row per item and b-roll shot, with bodies joined by beat', () => {
    const lines = buildCsv(bundle()).trimEnd().split('\r\n')
    expect(lines[0]).toBe('shoot,person,kind,code,channel,hook_type,cta_mode,location,script,status,raw_path')
    // the shared pack shot gets a row per channel
    expect(lines).toHaveLength(1 + 4 + 3)
    expect(lines[1]).toBe('S014,joe,cta,C01,topdognix,,sync,,"Grab Calming Chews, ""today""",planned,pawco/calming-chews/shoots/S014/raw/topdognix/ctas/joe/C01')
    expect(lines[4]).toContain('[problem] My dog pulled [product] PawCo Calming Chews [result] calmer walks')
    expect(lines[5]).toBe('S014,,broll,,topdognix,,,,[problem] anxious pacing,planned,pawco/calming-chews/shoots/S014/raw/topdognix/b-roll/problem')
    expect(lines[6]).toBe('S014,,broll,,topdognix,,,,[general] pack shot,planned,pawco/calming-chews/shoots/S014/raw/topdognix/b-roll/general')
  })
})

describe('linkedCodes', () => {
  it('gives the codes of the hooks / CTAs a VO is linked to, null when it isn\u2019t linked', () => {
    const b = bundle()
    const vo = b.items.find(item => item.kind === 'body')!
    expect(linkedCodes(b, vo, 'hook')).toBeNull()
    vo.linked_hooks = ['1a2b3c4d-0000-0000-0000-000000000002', 'not-on-the-shoot']
    vo.linked_ctas = ['not-on-the-shoot']
    expect(linkedCodes(b, vo, 'hook')).toEqual(['U01'])
    // linked, but none of them on the shoot: it goes with none
    expect(linkedCodes(b, vo, 'cta')).toEqual([])
    const sheetVo = buildShootsheet(b).items.find(item => item.kind === 'body')
    expect(sheetVo).toMatchObject({ hooks: ['U01'], ctas: [] })
  })
})

describe('VO takes', () => {
  it('records every wording of a beat as its own take, filed beside the first', () => {
    const b = bundle()
    const vo = b.items.find(item => item.kind === 'body')!
    vo.script_snapshot = [{ beat: 'problem', script: 'A', alternates: [{ script: 'A2' }] }, { beat: 'product', script: 'B' }, { beat: 'result', script: 'C' }]
    expect(itemBeats(vo)).toEqual(['problem', 'problem~2', 'product', 'result'])
    expect(takeSpot(b, vo, 'problem')).toBe('topdognix/vo/joe/problem/V01')
    expect(takeSpot(b, vo, 'problem~2')).toBe('topdognix/vo/joe/problem/V01-2')
    const sheetVo = buildShootsheet(b).items.find(item => item.kind === 'body') as { standalone: boolean, beats: { beat: string, option: number, show: string, file: string }[] }
    expect(sheetVo.standalone).toBe(false)
    expect(sheetVo.beats.map(beat => `${beat.beat}/${beat.option}/${beat.show}`)).toEqual(['problem/1/broll', 'problem/2/broll', 'product/1/broll', 'result/1/broll'])
    expect(sheetVo.beats[1]!.file).toMatch(/\/problem\/V01-2$/)
  })

  it('shows a standalone format\u2019s hook and CTA beats face to camera unless the format says otherwise', () => {
    const standalone = { kind: 'standalone', beat_display: { cta: 'broll' } }
    expect(beatShow(standalone, 'hook')).toBe('face')
    expect(beatShow(standalone, 'cta')).toBe('broll')
    expect(beatShow(standalone, 'story')).toBe('broll')
    expect(beatShow({ kind: 'modular', beat_display: { problem: 'face' } }, 'problem')).toBe('face')
    expect(beatShow(null, 'hook')).toBe('broll')
  })
})

describe('performs', () => {
  it('has a VO’s writer perform it on every channel, and its cast on the cast channel only', () => {
    const vo = { kind: 'body' as const, writer_id: 'makayla', cast_ids: ['joe'], cast_channel_id: 'whiskey' }
    expect(performs(vo, 'makayla', 'siblings')).toBe(true)
    expect(performs(vo, 'joe', 'whiskey')).toBe(true)
    expect(performs(vo, 'joe', 'siblings')).toBe(false)
    expect(performs(vo, 'brennen', 'siblings')).toBe(false)
    // hooks and CTAs: everyone
    expect(performs({ kind: 'hook', writer_id: null }, 'brennen', 'nix')).toBe(true)
  })
})

describe('beats shown on screen', () => {
  it('aren\u2019t filmed: no take, no file in the plan', () => {
    const b = bundle()
    const vo = b.items.find(item => item.kind === 'body')!
    vo.format = { ...vo.format!, kind: 'standalone', beats: ['hook', 'problem', 'cta'], beat_display: { hook: 'screen', problem: 'voice_note', cta: 'screen' } }
    vo.script_snapshot = [{ beat: 'hook', script: 'hey' }, { beat: 'problem', script: 'listen', alternates: [{ script: 'listen up' }] }, { beat: 'cta', script: 'link' }]
    expect(itemBeats(vo)).toEqual(['problem', 'problem~2'])
    const sheetVo = buildShootsheet(b).items.find(item => item.kind === 'body') as { beats: { beat: string, show: string, file: string | null }[] }
    expect(sheetVo.beats.map(beat => `${beat.beat}/${beat.show}/${beat.file ? 'file' : 'none'}`)).toEqual(['hook/screen/none', 'problem/voice_note/file', 'problem/voice_note/file', 'cta/screen/none'])
  })
})
