import { describe, expect, it } from 'vitest'
import type { BundleItem, ShootBundle } from '../shared/utils/shootsheet'
import { buildManifest, checkEdits } from '../shared/utils/manifest'

const format = { code: 'F01', cta_modes: ['sync', 'vo'], beats: ['problem', 'product'] }

function item(id: string, code: string, kind: BundleItem['kind'], channel: string, extra: Partial<BundleItem> = {}): BundleItem {
  return {
    id, code, kind, person_id: 'p1', channel_id: channel,
    script_snapshot: kind === 'body' ? [{ beat: 'problem', script: 'My dog pulled' }, { beat: 'product', script: 'Then {{product}}' }] : 'Watch {{dog}} go',
    script_override: null, cta_mode: kind === 'cta' ? 'sync' : null, location: null, status: 'filmed', sort_order: 0,
    template_id: `t-${id}`, hook_type: null, format: kind === 'body' ? format : null, ...extra
  }
}

/** Joe on Nix: a hook, a VO (two beats) and a CTA, plus a b-roll shot. */
function bundle(): ShootBundle {
  return {
    shoot: { code: 'S001', shoot_date: '2026-10-20', status: 'filmed', broll_variations: 1, submission_rate: 0.05 },
    brand: { name: 'PawCo', slug: 'pawco' },
    product: { name: 'Calming Chews', slug: 'calming-chews' },
    people: [{ id: 'p1', slug: 'joe', name: 'Joe' }],
    channels: [{ id: 'c1', name: 'topdognix', slug: 'topdognix', folder_slug: 'nix', dogs: ['nix'], dog_phrase: 'my Doberman' }],
    items: [item('h', 'H01', 'hook', 'c1'), item('v', 'V01', 'body', 'c1'), item('c', 'C01', 'cta', 'c1'), item('s', 'H02', 'hook', 'c1', { status: 'skipped' })],
    broll: [{ id: 'b1', channel_id: null, format_id: 'f1', beat: 'problem', description: 'pacing', status: 'filmed' }],
    channelPeople: { c1: ['p1'] }
  }
}

const raw = [
  'topdognix/hooks/joe/H01.mov', 'topdognix/hooks/joe/H01.srt',
  'topdognix/vo/joe/problem/V01.mov', 'topdognix/vo/joe/product/V01.mov',
  'topdognix/ctas/joe/C01.mov',
  'topdognix/b-roll/problem/IMG_1.MOV', 'topdognix/b-roll/general/IMG_9.MOV',
  'topdognix/b-roll/problem/calming/IMG_5.MOV'
]
const edited = [...raw.map(file => file.replace(/\.(mov|MOV)$/, '.mp4')), 'topdognix/vo/joe/problem/V01.srt']
const durations = new Map(edited.map(file => [file, 2.5]))

describe('checkEdits', () => {
  it('passes when every take is in raw/ and edited/ and edited/ mirrors raw/', () => {
    expect(checkEdits(bundle(), raw, edited, { durations }).problems).toEqual([])
  })

  it('wants a VO beat by beat, filmed like every take, and a length for every edited clip', () => {
    // an audio-only VO (how they used to be recorded) is flagged: VOs are filmed on camera now
    const check = checkEdits(bundle(), raw, [
      ...edited.filter(file => !file.includes('product/V01')),
      'topdognix/vo/joe/product/V01.m4a'
    ], { durations: new Map([...durations].filter(([file]) => !file.includes('IMG_9'))), onPhones: 1 })
    expect(check.problems).toEqual(expect.arrayContaining([
      '1 clip is still on phones: upload them first',
      'V01 product (Joe, topdognix): edited/topdognix/vo/joe/product/V01.m4a should be a video',
      expect.stringContaining('Couldn\'t read the length of topdognix/b-roll/general/IMG_9.mp4')
    ]))
  })

  it('flags edits that went missing or were renamed', () => {
    const check = checkEdits(bundle(), raw, [...edited.filter(file => !file.startsWith('topdognix/hooks')), 'topdognix/hooks/joe/H1.mp4'])
    expect(check.problems).toEqual(expect.arrayContaining([
      'H01 (Joe, topdognix): no video file at edited/topdognix/hooks/joe/H01',
      expect.stringContaining('In edited/ but not raw/ (renamed or misplaced?): topdognix/hooks/joe/H1.mp4')
    ]))
  })
})

describe('buildManifest', () => {
  it('indexes every take with its script, files, captions and length, and the b-roll with its shot', () => {
    const manifest = buildManifest(bundle(), edited, raw, durations, {
      version: 1,
      generatedAt: '2026-10-21T10:00:00Z',
      brollShots: new Map([['topdognix/b-roll/problem/img_1.mov', 'b1']])
    })
    expect(manifest.version).toBe(1)
    // the edited clip and the raw one it came from, each under its own extension
    expect(manifest.clips[0]).toMatchObject({ file: 'topdognix/hooks/joe/H01.mp4', raw_file: 'topdognix/hooks/joe/H01.mov' })
    expect(manifest.clips[4]).toMatchObject({ file: 'topdognix/b-roll/problem/IMG_1.mp4', raw_file: 'topdognix/b-roll/problem/IMG_1.MOV' })
    expect(manifest.clips.map(clip => clip.kind === 'broll' ? `broll ${clip.file}` : `${clip.code} ${clip.beat ?? ''}`.trim())).toEqual([
      'H01', 'V01 problem', 'V01 product', 'C01',
      'broll topdognix/b-roll/problem/IMG_1.mp4', 'broll topdognix/b-roll/general/IMG_9.mp4',
      'broll topdognix/b-roll/problem/calming/IMG_5.mp4'
    ])
    // a clip in a feature folder is for that feature; the rest are generic
    expect(manifest.clips[6]).toMatchObject({ section: 'problem', feature: 'calming' })
    expect(manifest.clips[4]).toMatchObject({ feature: null })
    expect(manifest.clips[0]).toMatchObject({ kind: 'hook', channel: 'topdognix', person: 'joe', script: 'Watch my Doberman go', duration: 2.5 })
    expect(manifest.clips[1]).toMatchObject({ kind: 'vo', beat: 'problem', script: 'My dog pulled', caption: 'topdognix/vo/joe/problem/V01.srt' })
    // the clip added for shot b1 knows its shot; one added some other way doesn't
    expect(manifest.clips[4]).toMatchObject({ section: 'problem', shot: { id: 'b1' } })
    expect(manifest.clips[5]).toMatchObject({ section: 'general', shot: null })
    expect(manifest.clips[4]).not.toHaveProperty('product_visible')
  })

  it('records the problems it was marked ready with, and leaves out what\'s missing', () => {
    const manifest = buildManifest(bundle(), edited.filter(file => !file.includes('C01')), raw, durations, {
      version: 2, generatedAt: '', overridden: ['C01 (Joe, topdognix): no video file at edited/topdognix/ctas/joe/C01']
    })
    expect(manifest.overridden).toHaveLength(1)
    expect(manifest.clips.some(clip => clip.kind === 'cta')).toBe(false)
  })
})

describe('a text thread', () => {
  const thread = { code: 'F21', cta_modes: [], beats: ['hook', 'voice note', 'cta'], kind: 'standalone', beat_display: { 'hook': 'screen', 'voice note': 'voice_note', 'cta': 'screen' } }
  const b = () => {
    const shoot = bundle()
    shoot.items = [item('t', 'V02', 'body', 'c1', {
      format: thread,
      script_snapshot: [{ beat: 'hook', script: 'ok how is {{product}} so good' }, { beat: 'voice note', script: 'tell me everything' }, { beat: 'cta', script: 'link below' }]
    })]
    return shoot
  }
  const files = ['topdognix/vo/joe/voice-note/V02.mov']

  it('only wants the voice notes filmed', () => {
    expect(checkEdits(b(), files, files.map(file => file.replace('.mov', '.mp4')), { durations: new Map([['topdognix/vo/joe/voice-note/V02.mp4', 3]]) }).problems).toEqual([])
  })

  it('carries the messages on screen as clips with no file, timed by how long they take to read', () => {
    const manifest = buildManifest(b(), files.map(file => file.replace('.mov', '.mp4')), files, new Map([['topdognix/vo/joe/voice-note/V02.mp4', 3]]), { version: 1, generatedAt: '', wordsPerSecond: 2.5 })
    const vo = manifest.clips.filter(clip => clip.kind === 'vo') as { beat: string, show: string, file: string, script: string, duration: number }[]
    expect(vo.map(clip => `${clip.beat}/${clip.show}`).sort()).toEqual(['cta/screen', 'hook/screen', 'voice note/voice_note'])
    const hook = vo.find(clip => clip.beat === 'hook')!
    expect(hook).toMatchObject({ file: '', script: 'ok how is Calming Chews so good' })
    // 6 words at 2.5 a second, plus a moment for the typing dots
    expect(hook.duration).toBe(4)
  })
})
