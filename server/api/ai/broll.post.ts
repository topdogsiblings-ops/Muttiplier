import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '#shared/types/database.types'

// Drafts b-roll shots for every section of a shoot's b-roll list: one section per format
// used by its VOs (per beat), plus general product shots. Returns drafts only; the planner
// shows them for review and nothing is saved until the person adds them.

const requestSchema = z.object({ shootCode: z.string().min(1).max(20) })

const outputSchema = z.object({
  shots: z.array(z.object({
    /** a format code from the brief, or "general" */
    section: z.string(),
    beat: z.string(),
    description: z.string(),
    product_visible: z.boolean(),
    min_clips: z.number().int()
  }))
})

export interface DraftBrollShot {
  format_id: string | null
  beat: string
  description: string
  product_visible: boolean
  min_clips: number
}

const SYSTEM = `You plan b-roll for short-form UGC ads for topdogugc, an agency whose creators film ads for dog products with their own dogs. Each video is Hook (on camera) → Body (a voiceover over b-roll, split into beats) → CTA. B-roll is filmed once per shoot and cut under the voiceover beat by beat, on every channel.

Write each shot as a short, concrete instruction a creator can film at home with their own dog in one take: what's in frame, what happens, and the framing when it matters. Plain phone footage, natural light, real homes. No stock-footage ideas, no actors, no text overlays, no props the creator wouldn't have.

Only show the product doing what the brief says it does. Never imply health outcomes, results or claims that aren't in the brief, and respect any forbidden claims.`

/** A format's beat -> suggested shot descriptions, for the brief. */
function suggestionText(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([beat, list]) => [
    beat,
    Array.isArray(list) ? list.map(entry => String((entry as { description?: unknown })?.description ?? '').trim()).filter(Boolean) : []
  ]))
}

function clip(text: string | null | undefined, max: number) {
  const value = (text ?? '').trim()
  return value.length > max ? `${value.slice(0, max)}…` : value
}

export default defineEventHandler(async (event): Promise<{ shots: DraftBrollShot[] }> => {
  const config = useRuntimeConfig(event)
  const db = await serverSupabaseClient<Database>(event)

  // RLS only returns allowlist rows to allowlisted users, so this doubles as the access check.
  const { data: access } = await db.from('allowed_users').select('id').limit(1)
  if (!access?.length) throw createError({ statusCode: 403, statusMessage: 'No access' })
  if (!config.anthropicApiKey) {
    throw createError({ statusCode: 503, statusMessage: 'AI drafting isn\'t configured. Set ANTHROPIC_API_KEY.' })
  }

  const parsed = requestSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid request' })
  const bundle = await loadShootBundle(db, parsed.data.shootCode)
  if (!bundle) throw createError({ statusCode: 404, statusMessage: 'Shoot not found' })

  // Formats used by the shoot's VOs, with the VO scripts written for each one.
  const formats = new Map<string, { id: string, code: string, name: string, description: string | null, beats: string[], beatDescriptions: Record<string, string>, suggestions: Record<string, string[]>, scripts: string[] }>()
  // formats added to the plan by hand, then the ones the VOs use (with their scripts)
  for (const format of bundle.plannedFormats) {
    formats.set(format.id, { ...format, beatDescriptions: format.beat_descriptions ?? {}, suggestions: suggestionText(format.beat_broll), scripts: [] })
  }
  for (const group of groupShotList(bundle.items).filter(group => group.kind === 'body')) {
    const format = group.items[0]!.format
    if (!format?.id) continue
    const entry = formats.get(format.id) ?? {
      id: format.id,
      code: format.code,
      name: format.name ?? format.code,
      description: format.description ?? null,
      beats: format.beats,
      beatDescriptions: format.beat_descriptions ?? {},
      suggestions: suggestionText(format.beat_broll),
      scripts: []
    }
    const beats = resolveItemScript(bundle, { ...group.items[0]!, script_override: null }).beats ?? []
    entry.scripts.push(`${group.code}${group.items[0]!.title ? ` "${group.items[0]!.title}"` : ''}: ${beats.map(beat => `[${beat.beat}] ${beat.script}`).join(' ')}`)
    formats.set(format.id, entry)
  }

  const brandData = (bundle.brand.trybe_data ?? {}) as { about?: string, categories?: string[] }
  const existing = bundle.broll.map(shot => `- ${shot.beat}: ${shot.description}`).join('\n')
  const slots = Object.entries((bundle.shoot.slot_values ?? {}) as Record<string, unknown>)
    .map(([key, value]) => `${key}: ${String(value)}`).join('; ')

  const brief = [
    `Brand: ${bundle.brand.name}${brandData.categories?.length ? ` (${brandData.categories.join(', ')})` : ''}`,
    brandData.about ? `Brand's own summary: ${clip(brandData.about, 400)}` : '',
    bundle.brand.notes ? `Notes on the brand:\n${clip(bundle.brand.notes, 1500)}` : '',
    `Product: ${bundle.product.name}`,
    slots ? `Details filled in for this shoot: ${slots}` : '',
    bundle.product.notes ? `Notes on the product:\n${clip(bundle.product.notes, 1500)}` : '',
    bundle.product.claims_allowed ? `Claims the brand allows:\n${clip(bundle.product.claims_allowed, 800)}` : '',
    bundle.product.claims_forbidden ? `Forbidden claims. Do not show or imply any of these:\n${clip(bundle.product.claims_forbidden, 800)}` : '',
    `Dogs on this shoot: ${bundle.channels.map(channel => `${channel.dog_phrase || channel.name}`).join(', ')}`,
    bundle.shoot.location_notes ? `Location: ${bundle.shoot.location_notes}` : ''
  ].filter(Boolean).join('\n\n')

  const sections = [
    ...[...formats.values()].map(format => [
      `Section "${format.code}": ${format.name}${format.description ? `. ${format.description}` : ''}`,
      `Beats, in order:`,
      ...format.beats.map(beat => `- ${beat}${format.beatDescriptions[beat] ? `: ${format.beatDescriptions[beat]}` : ''}${format.suggestions[beat]?.length ? ` (the team's own suggested shots for this beat: ${format.suggestions[beat]!.join('; ')})` : ''}`),
      ...(format.scripts.length
        ? ['Voiceovers in this format on the shoot:', ...format.scripts.map(script => `- ${script}`)]
        : ['No voiceovers in this format yet: plan shots from the format and beat descriptions.'])
    ].join('\n')),
    'Section "general": general product shots any VO can use (pack shots, label, texture, product in hand). Use beat "product".'
  ].join('\n\n')

  const task = [
    'Plan b-roll for every section and beat below.',
    'For each beat of each format section, write 3 or 4 shots that would sit under that beat of the voiceovers listed. For the "general" section, write 4 or 5 product shots.',
    'For each shot give: section (the section code exactly, or "general"), beat (exactly one of that section\'s beats), description, product_visible (is the product in frame), and min_clips (how many clips to capture, usually 2 to 4).',
    existing ? `These shots are already planned. Don't repeat them:\n${existing}` : ''
  ].filter(Boolean).join('\n')

  const client = new Anthropic({ apiKey: config.anthropicApiKey })
  try {
    const response = await client.messages.parse({
      model: config.anthropicModel,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content: `${brief}\n\n${sections}\n\n${task}` }],
      output_config: { effort: 'medium', format: zodOutputFormat(outputSchema) }
    })
    if (response.stop_reason === 'refusal') {
      throw createError({ statusCode: 422, statusMessage: 'The model declined this request.' })
    }
    const output = response.parsed_output as z.infer<typeof outputSchema> | null
    if (!output) throw createError({ statusCode: 502, statusMessage: 'The model returned an unreadable draft. Try again.' })

    // Keep only shots that land on a real section and beat.
    const byCode = new Map([...formats.values()].map(format => [format.code.toLowerCase(), format]))
    const shots: DraftBrollShot[] = []
    for (const shot of output.shots) {
      const description = shot.description.trim()
      if (!description) continue
      const beat = shot.beat.trim().toLowerCase()
      const format = byCode.get(shot.section.trim().toLowerCase())
      if (format) {
        if (!format.beats.includes(beat)) continue
        shots.push({ format_id: format.id, beat, description, product_visible: shot.product_visible, min_clips: Math.min(10, Math.max(1, shot.min_clips)) })
      } else if (shot.section.trim().toLowerCase() === 'general') {
        shots.push({ format_id: null, beat: 'product', description, product_visible: true, min_clips: Math.min(10, Math.max(1, shot.min_clips)) })
      }
    }
    return { shots }
  } catch (error) {
    if (isError(error)) throw error
    if (error instanceof Anthropic.AuthenticationError) throw createError({ statusCode: 503, statusMessage: 'The Anthropic API key was rejected' })
    if (error instanceof Anthropic.RateLimitError) throw createError({ statusCode: 429, statusMessage: 'AI drafting is rate limited. Try again in a moment.' })
    if (error instanceof Anthropic.APIError) throw createError({ statusCode: 502, statusMessage: `AI drafting failed (${error.status ?? 'network'}): ${error.message}` })
    throw error
  }
})
