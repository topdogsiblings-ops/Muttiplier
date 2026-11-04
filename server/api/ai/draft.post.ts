import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { Database } from '#shared/types/database.types'

// AI drafting (spec §11). Returns drafts only: nothing is written to the Library or a
// shoot until a person approves and saves it in the UI.

const beatSchema = z.object({ beat: z.string(), script: z.string() })

const requestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hooks'),
    /** the hook type to write in (Confession, Curiosity…) */
    hookType: z.string().max(80).optional(),
    tags: z.array(z.string().max(40)).max(12).optional(),
    count: z.number().int().min(1).max(12).optional(),
    brief: z.string().max(1000).optional(),
    productId: z.string().uuid().optional()
  }),
  z.object({
    type: z.literal('ctas'),
    mode: z.enum(['sync', 'vo']),
    tags: z.array(z.string().max(40)).max(12).optional(),
    count: z.number().int().min(1).max(12).optional(),
    brief: z.string().max(1000).optional(),
    productId: z.string().uuid().optional()
  }),
  z.object({
    type: z.literal('body'),
    formatId: z.string().uuid(),
    count: z.number().int().min(1).max(4).optional(),
    brief: z.string().max(1000).optional(),
    productId: z.string().uuid().optional()
  }),
  z.object({
    type: z.literal('rendition'),
    kind: z.enum(['hook', 'body', 'cta']),
    script: z.string().max(4000).optional(),
    beats: z.array(beatSchema).max(12).optional(),
    count: z.number().int().min(1).max(5).optional(),
    productId: z.string().uuid().optional()
  })
])

const textDrafts = z.object({ drafts: z.array(z.object({ script: z.string() })) })
const hookDrafts = z.object({ drafts: z.array(z.object({ script: z.string(), caption: z.string() })) })
const bodyDrafts = z.object({ drafts: z.array(z.object({ title: z.string(), beats: z.array(beatSchema) })) })

export interface AiDraft {
  title?: string
  script?: string
  caption?: string
  beats?: { beat: string, script: string }[]
}

/**
 * What the model is told before every request: the org's preamble (Settings → Scripts: its own,
 * or the recommended one from its profile), how scripts work, its channel slots and its script rules.
 */
function systemPrompt(orgName: string, settings: { ai_preamble?: string | null, org_profile?: unknown, channel_slots?: unknown, script_rules?: unknown } | null) {
  const channelSlots = parseChannelSlots(settings?.channel_slots)
  return [
    aiPreamble(orgName, settings),
    'Every video is Hook (on camera) → Body (a voiceover over b-roll, split into beats) → CTA.',
    [
      'Scripts are reusable templates, so they use double-brace slots instead of real names:',
      '- {{brand}} and {{product}} are filled from the product.',
      ...channelSlots.map(slot => `- {{${slot.name}}} is filled per channel${slot.description ? ` (${slot.description})` : ''}${slot.example ? ` with words like "${slot.example}"` : ''}, so it must read naturally in place of those words.`),
      '- Other slots such as {{benefit}}, {{offer}} or {{price}} are filled in on each shoot. Only use custom slots you are told exist.'
    ].join('\n'),
    'Write in the first person, in plain spoken words, with contractions: no hashtags, no emojis, no stage directions. Lines are read aloud, so keep them easy to say in one breath. Never invent facts, statistics, medical or professional claims, or guarantees about results.',
    scriptRulesForAi(parseScriptRules(settings?.script_rules))
  ].filter(Boolean).join('\n\n')
}

export default defineEventHandler(async (event): Promise<{ drafts: AiDraft[] }> => {
  const config = useRuntimeConfig(event)
  // in an org, and the org's subscription (or trial) is live
  const { db, orgId, entitled } = await requireMember(event)
  if (!entitled) throw createError({ statusCode: 402, statusMessage: 'Your organisation\'s subscription isn\'t active' })


  if (!config.anthropicApiKey) {
    throw createError({ statusCode: 503, statusMessage: 'AI drafting isn\'t configured. Set ANTHROPIC_API_KEY.' })
  }

  const parsed = requestSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid drafting request' })
  const input = parsed.data

  const [{ data: settings }, { data: org }] = await Promise.all([
    db.from('settings').select('ai_preamble, org_profile, channel_slots, script_rules').limit(1).maybeSingle(),
    db.from('orgs').select('name').eq('id', orgId).maybeSingle()
  ])
  const channelSlots = parseChannelSlots(settings?.channel_slots).map(slot => `{{${slot.name}}}`)

  // Product context: the claims the brand allows or forbids. Custom slots are filled in per shoot.
  let productNotes = `No product is selected. Keep the script brand-agnostic and use only ${['{{brand}}', '{{product}}', ...channelSlots].join(', ')}.`
  if (input.productId) {
    const { data: product } = await db
      .from('products')
      .select('name, claims_allowed, claims_forbidden, brand:brands(name)')
      .eq('id', input.productId)
      .maybeSingle()
    if (product) {
      productNotes = [
        `Product: ${product.name} by ${(product.brand as { name: string } | null)?.name ?? 'the brand'}. Still write with slots, not these names.`,
        product.claims_allowed ? `Claims the brand allows:\n${product.claims_allowed}` : '',
        product.claims_forbidden
          ? `Forbidden claims. Do not make, imply or paraphrase any of these:\n${product.claims_forbidden}`
          : ''
      ].filter(Boolean).join('\n\n')
    }
  }

  let task: string
  let formatBeats: string[] = []
  if (input.type === 'hooks') {
    task = [
      `Write ${input.count ?? 6} distinct hook templates. A hook is the first 2 to 4 seconds on camera and has to stop the scroll.`,
      input.hookType ? `Hook type: ${input.hookType}. Every hook should be clearly this type of opening.` : '',
      input.tags?.length ? `Themes to lean on: ${input.tags.join(', ')}.` : '',
      input.brief ? `Notes from the team: ${input.brief}` : '',
      'Make each hook different in structure, not just wording.',
      'For each hook, also suggest a short post caption to go with the video: one or two lines, a few relevant hashtags, at most one emoji. The caption may use the same slots.'
    ].filter(Boolean).join('\n')
  } else if (input.type === 'ctas') {
    task = [
      `Write ${input.count ?? 6} distinct call-to-action templates, the last 2 to 4 seconds of the video.`,
      input.mode === 'sync'
        ? 'These are said on camera to the viewer, so they should sound natural face to face.'
        : 'These are voiceover laid over b-roll, so they must make sense without seeing the speaker.',
      'Point the viewer to act: tap the link, try the product, grab the offer. Do not invent prices, discounts or deadlines; use {{offer}} or {{price}} only if those slots exist.',
      input.tags?.length ? `Themes to lean on: ${input.tags.join(', ')}.` : '',
      input.brief ? `Notes from the team: ${input.brief}` : '',
      'Make each CTA different in structure, not just wording.'
    ].filter(Boolean).join('\n')
  } else if (input.type === 'body') {
    const { data: format } = await db.from('formats').select('*').eq('id', input.formatId).maybeSingle()
    if (!format) throw createError({ statusCode: 404, statusMessage: 'Format not found' })
    formatBeats = format.beats
    task = [
      `Write ${input.count ?? 2} voiceover script${(input.count ?? 2) === 1 ? '' : 's'} for the format "${format.name}"${format.description ? ` (${format.description})` : ''}.`,
      `Each script has exactly these beats, in this order: ${format.beats.join(', ')}. Return one entry per beat, using those beat names.`,
      // what to write in each beat, and an example line, from the format
      ...format.beats.map((beat) => {
        const guidance = (format.beat_descriptions as Record<string, string> | null)?.[beat]
        const example = (format.beat_examples as Record<string, string> | null)?.[beat]
        const show = (format.beat_display as Record<string, string> | null)?.[beat]
        const how = show === 'screen' ? ' (a text message on screen: short, like a real text)' : show === 'voice_note' ? ' (a spoken voice note: casual, a few seconds)' : ''
        return guidance || example || how ? `- ${beat}${how}: ${guidance ?? ''}${example ? ` Example: "${example}"` : ''}` : ''
      }),
      format.kind === 'standalone'
        ? 'This format is standalone: the video has no separate hook or CTA. The "hook" beat is the video\'s opening line and must stop the scroll on its own; the "cta" beat closes the video and tells the viewer what to do.'
        : '',
      format.target_seconds ? `Aim for about ${format.target_seconds} seconds read aloud in total.` : '',
      channelSlots.length ? `The same voiceover is used on every channel, so write it to suit them all and do not use ${channelSlots.join(' or ')}.` : '',
      input.brief ? `Notes from the team: ${input.brief}` : '',
      'Give each script a short working title.'
    ].filter(Boolean).join('\n')
  } else {
    const original = input.kind === 'body'
      ? (input.beats ?? []).map(beat => `[${beat.beat}] ${beat.script}`).join('\n')
      : input.script ?? ''
    if (!original.trim()) throw createError({ statusCode: 400, statusMessage: 'Nothing to reword' })
    formatBeats = (input.beats ?? []).map(beat => beat.beat)
    task = [
      `Reword this ${input.kind === 'body' ? 'voiceover' : input.kind} so a different cast member can say it in their own words. Write ${input.count ?? 3} variants.`,
      'Keep the meaning, the claims, the length and every slot exactly as they are. Change phrasing and rhythm only, and do not add claims.',
      input.kind === 'body' ? 'Keep the same beats, in the same order, with the same beat names.' : '',
      `Original:\n${original}`
    ].filter(Boolean).join('\n\n')
  }

  const wantsBeats = input.type === 'body' || (input.type === 'rendition' && input.kind === 'body')
  const client = new Anthropic({ apiKey: config.anthropicApiKey })

  try {
    const response = await client.messages.parse({
      model: config.anthropicModel,
      max_tokens: 16000,
      system: systemPrompt(org?.name ?? '', settings),
      messages: [{ role: 'user', content: `${task}\n\n${productNotes}` }],
      output_config: {
        effort: 'medium',
        format: zodOutputFormat(wantsBeats ? bodyDrafts : input.type === 'hooks' ? hookDrafts : textDrafts)
      }
    })

    // count it against the org, whatever the outcome

    await recordAiUsage(event, orgId, response.usage)

    if (response.stop_reason === 'refusal') {
      throw createError({ statusCode: 422, statusMessage: 'The model declined this request. Try rewording the brief.' })
    }
    const output = response.parsed_output as z.infer<typeof bodyDrafts> | z.infer<typeof hookDrafts> | z.infer<typeof textDrafts> | null
    if (!output) throw createError({ statusCode: 502, statusMessage: 'The model returned an unreadable draft. Try again.' })

    const drafts: AiDraft[] = output.drafts.map(draft => 'beats' in draft
      // keep bodies on the format's beats, in order
      ? { title: draft.title, beats: formatBeats.length ? alignBeats(formatBeats, draft.beats) : draft.beats }
      : { script: draft.script.trim(), ...('caption' in draft ? { caption: draft.caption.trim() } : {}) })

    return { drafts }
  } catch (error) {
    if (isError(error)) throw error
    if (error instanceof Anthropic.AuthenticationError) {
      throw createError({ statusCode: 503, statusMessage: 'The Anthropic API key was rejected' })
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw createError({ statusCode: 429, statusMessage: 'AI drafting is rate limited. Try again in a moment.' })
    }
    if (error instanceof Anthropic.APIError) {
      throw createError({ statusCode: 502, statusMessage: `AI drafting failed (${error.status ?? 'network'}): ${error.message}` })
    }
    throw error
  }
})
