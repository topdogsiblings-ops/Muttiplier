// Captions for a clip (spec §10a), made when it's uploaded: the script that was read, split into
// short lines and spread across the clip's length in proportion to how much each line says.
// Every clip is short (a hook, a CTA or one VO beat), so this lands close; editors polish the
// result in edited/.

/** Most characters on one caption line, and most words. */
const MAX_CHARS = 32
const MAX_WORDS = 6

/** Split a script into caption lines: at sentence breaks, then by length. */
export function captionLines(script: string): string[] {
  const words = script.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines: string[] = []
  let line: string[] = []
  for (const word of words) {
    const next = [...line, word].join(' ')
    if (line.length && (next.length > MAX_CHARS || line.length >= MAX_WORDS)) {
      lines.push(line.join(' '))
      line = []
    }
    line.push(word)
    // end a line at the end of a sentence or clause
    if (/[.!?]$/.test(word) || (/[,;:]$/.test(word) && line.length >= 3)) {
      lines.push(line.join(' '))
      line = []
    }
  }
  if (line.length) lines.push(line.join(' '))
  return lines
}

const timestamp = (seconds: number) => {
  const ms = Math.max(0, Math.round(seconds * 1000))
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`
}

/**
 * An SRT file for a clip: its script's lines, timed across `duration` seconds by their length.
 * Empty when there's nothing to say or no length.
 */
export function buildSrt(script: string | null | undefined, duration: number | null | undefined): string {
  const lines = captionLines(script ?? '')
  if (!lines.length || !duration || duration <= 0) return ''
  const weights = lines.map(line => line.replace(/[^\p{L}\p{N}]/gu, '').length || 1)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let start = 0
  return lines.map((line, index) => {
    const end = index === lines.length - 1 ? duration : start + duration * weights[index]! / total
    const cue = `${index + 1}\n${timestamp(start)} --> ${timestamp(end)}\n${line}\n`
    start = end
    return cue
  }).join('\n')
}
