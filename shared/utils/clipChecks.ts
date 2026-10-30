// Sanity checks on clips submitted from the checklist. Pure: the browser measures the file,
// these decide what looks wrong. Issues are warnings; a person can still upload anyway.
// The presets live in Settings -> Defaults.

export interface ClipRules {
  aspectWidth: number
  aspectHeight: number
  /** the short and long side, in pixels */
  minWidth: number
  minHeight: number
  minFps: number
  maxFps: number
  /** a VO shorter than this share of the script's estimated reading time is flagged */
  voMinShare: number
  /** a VO longer than this share of the estimate is flagged */
  voMaxShare: number
}

/** Vertical, Full HD or better, at a normal frame rate; VOs within 60%–175% of the estimate. */
export const DEFAULT_CLIP_RULES: ClipRules = {
  aspectWidth: 9,
  aspectHeight: 16,
  minWidth: 1080,
  minHeight: 1920,
  minFps: 24,
  maxFps: 60,
  voMinShare: 0.6,
  voMaxShare: 1.75
}

type ClipSettings = {
  clip_aspect_width: number, clip_aspect_height: number, clip_min_width: number, clip_min_height: number,
  clip_min_fps: number, clip_max_fps: number, vo_min_share: number, vo_max_share: number
}

export function clipRulesFrom(settings: Partial<ClipSettings> | null | undefined): ClipRules {
  const pick = (value: number | string | undefined, fallback: number) => {
    const number = Number(value)
    return value !== undefined && value !== null && number > 0 ? number : fallback
  }
  const d = DEFAULT_CLIP_RULES
  return {
    aspectWidth: pick(settings?.clip_aspect_width, d.aspectWidth),
    aspectHeight: pick(settings?.clip_aspect_height, d.aspectHeight),
    minWidth: pick(settings?.clip_min_width, d.minWidth),
    minHeight: pick(settings?.clip_min_height, d.minHeight),
    minFps: pick(settings?.clip_min_fps, d.minFps),
    maxFps: pick(settings?.clip_max_fps, d.maxFps),
    voMinShare: pick(settings?.vo_min_share, d.voMinShare),
    voMaxShare: pick(settings?.vo_max_share, d.voMaxShare)
  }
}

/** How far off the aspect ratio may be (fraction), and slack for 23.976 / 59.94 fps. */
const ASPECT_TOLERANCE = 0.02
const FPS_SLACK = 0.5
/** a voiceover under this many seconds is treated as empty */
const MIN_SECONDS = 1
export interface VideoMeasure {
  width: number
  height: number
  /** null when the browser couldn't measure it */
  fps: number | null
}

/** A voiceover's length against its script's reading time. */
export interface LengthMeasure {
  /** seconds; null when the browser couldn't measure it */
  duration: number | null
  /** estimated reading time of the script, in seconds; 0 if unknown */
  expectedSeconds: number
}

const round = (value: number, places = 0) => Math.round(value * 10 ** places) / 10 ** places

export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

const aspectOf = (rules: ClipRules) => rules.aspectWidth / rules.aspectHeight
const aspectLabel = (rules: ClipRules) => `${rules.aspectWidth}:${rules.aspectHeight}`

/** "1080×1920 · 9:16 · 30 fps" */
export function describeVideo(measure: VideoMeasure, rules: ClipRules = DEFAULT_CLIP_RULES): string {
  const parts = [`${measure.width}×${measure.height}`]
  if (measure.width && measure.height) {
    const ratio = measure.width / measure.height
    parts.push(Math.abs(ratio / aspectOf(rules) - 1) <= ASPECT_TOLERANCE ? aspectLabel(rules) : `${round(ratio, 2)}:1`)
  }
  if (measure.fps) parts.push(`${round(measure.fps)} fps`)
  return parts.join(' · ')
}

export function checkVideo(measure: VideoMeasure, rules: ClipRules = DEFAULT_CLIP_RULES): string[] {
  const issues: string[] = []
  const { width, height, fps } = measure
  if (!width || !height) return ['Couldn\'t read the video\'s size. Is it a video file?']

  const portrait = rules.aspectWidth <= rules.aspectHeight
  if (portrait !== width <= height) {
    issues.push(`It's ${width > height ? 'landscape' : 'portrait'} (${width}×${height}). Clips should be ${aspectLabel(rules)}.`)
  } else if (Math.abs(width / height / aspectOf(rules) - 1) > ASPECT_TOLERANCE) {
    issues.push(`The shape is ${round(width / height, 2)}:1, not ${aspectLabel(rules)}. It will be cropped.`)
  }
  if (Math.min(width, height) < Math.min(rules.minWidth, rules.minHeight) || Math.max(width, height) < Math.max(rules.minWidth, rules.minHeight)) {
    issues.push(`It's ${width}×${height}, below ${rules.minWidth}×${rules.minHeight}. Check the camera's resolution setting.`)
  }
  const fpsRange = `${round(rules.minFps, 2)}–${round(rules.maxFps, 2)} fps`
  if (fps !== null) {
    if (fps < rules.minFps - FPS_SLACK) issues.push(`It's ${round(fps)} fps; aim for ${fpsRange}. Low frame rates look choppy.`)
    else if (fps > rules.maxFps + FPS_SLACK) issues.push(`It's ${round(fps)} fps (slow motion?); aim for ${fpsRange}.`)
  }
  return issues
}

/** "0:42 · script ~0:38" */
export function describeLength(measure: LengthMeasure): string {
  const parts: string[] = []
  if (measure.duration !== null) parts.push(formatDuration(measure.duration))
  if (measure.expectedSeconds > 0) parts.push(`script ~${formatDuration(measure.expectedSeconds)}`)
  return parts.join(' · ')
}

export function checkLength(measure: LengthMeasure, rules: ClipRules = DEFAULT_CLIP_RULES): string[] {
  const { duration, expectedSeconds } = measure
  if (duration === null) return []
  if (duration < MIN_SECONDS) return ['The recording is empty or under a second long.']
  if (expectedSeconds <= 0) return []
  if (duration < expectedSeconds * rules.voMinShare) {
    return [`It's ${formatDuration(duration)}, but the script takes about ${formatDuration(expectedSeconds)} to read. Lines may be missing or cut off.`]
  }
  if (duration > expectedSeconds * rules.voMaxShare) {
    return [`It's ${formatDuration(duration)}, but the script takes about ${formatDuration(expectedSeconds)} to read. Trim retakes or long pauses.`]
  }
  return []
}
