import { describe, expect, it } from 'vitest'
import { checkAudio, checkVideo, clipRulesFrom, describeAudio, describeVideo } from '../shared/utils/clipChecks'

describe('checkVideo', () => {
  it('passes vertical 1080p at 30 fps', () => {
    expect(checkVideo({ width: 1080, height: 1920, fps: 30 })).toEqual([])
  })

  it('passes vertical 4K at 60 fps', () => {
    expect(checkVideo({ width: 2160, height: 3840, fps: 59.94 })).toEqual([])
  })

  it('flags landscape', () => {
    expect(checkVideo({ width: 1920, height: 1080, fps: 30 })[0]).toMatch(/landscape/)
  })

  it('flags the wrong shape', () => {
    expect(checkVideo({ width: 1440, height: 1920, fps: 30 })[0]).toMatch(/0\.75:1/)
  })

  it('flags low resolution', () => {
    expect(checkVideo({ width: 720, height: 1280, fps: 30 })[0]).toMatch(/below 1080×1920/)
  })

  it('flags low and high frame rates', () => {
    expect(checkVideo({ width: 1080, height: 1920, fps: 15 })[0]).toMatch(/15 fps/)
    expect(checkVideo({ width: 1080, height: 1920, fps: 120 })[0]).toMatch(/slow motion/)
  })

  it('skips the frame rate when it could not be measured', () => {
    expect(checkVideo({ width: 1080, height: 1920, fps: null })).toEqual([])
  })

  it('describes what it measured', () => {
    expect(describeVideo({ width: 1080, height: 1920, fps: 29.97 })).toBe('1080×1920 · 9:16 · 30 fps')
  })
})

describe('checkAudio', () => {
  it('passes a recording close to the script length', () => {
    expect(checkAudio({ duration: 40, expectedSeconds: 38 })).toEqual([])
  })

  it('flags a recording much shorter than the script', () => {
    expect(checkAudio({ duration: 15, expectedSeconds: 38 })[0]).toMatch(/missing or cut off/)
  })

  it('flags a recording much longer than the script', () => {
    expect(checkAudio({ duration: 90, expectedSeconds: 38 })[0]).toMatch(/retakes/)
  })

  it('flags an empty recording even without an estimate', () => {
    expect(checkAudio({ duration: 0.4, expectedSeconds: 0 })[0]).toMatch(/empty/)
  })

  it('skips the check when the length is unknown', () => {
    expect(checkAudio({ duration: null, expectedSeconds: 38 })).toEqual([])
  })

  it('describes the length against the script', () => {
    expect(describeAudio({ duration: 42, expectedSeconds: 38 })).toBe('0:42 · script ~0:38')
  })
})

describe('clip rules from settings', () => {
  it('uses the presets from settings, falling back to defaults', () => {
    const rules = clipRulesFrom({ clip_aspect_width: 4, clip_aspect_height: 5, clip_min_width: 1080, clip_min_height: 1350, clip_min_fps: 25, clip_max_fps: 30 })
    expect(checkVideo({ width: 1080, height: 1350, fps: 25 }, rules)).toEqual([])
    expect(checkVideo({ width: 1080, height: 1920, fps: 60 }, rules)).toHaveLength(2)
    expect(rules.voMinShare).toBe(0.6)
  })

  it('applies the VO length range from settings', () => {
    const rules = clipRulesFrom({ vo_min_share: 0.9, vo_max_share: 1.1 })
    expect(checkAudio({ duration: 30, expectedSeconds: 38 }, rules)).toHaveLength(1)
    expect(checkAudio({ duration: 40, expectedSeconds: 38 }, rules)).toEqual([])
  })
})