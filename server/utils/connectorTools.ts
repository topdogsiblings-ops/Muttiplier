import type { H3Event } from 'h3'
import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

// The AI connector's tools (spec §11). Each request gets a fresh server, acting as the person whose
// token it is: reads are scoped to their current organisation by the database, and writes land in
// the Library tagged `ai-draft` for a person to review. Nothing here deletes, plans or bills.

const DRAFT_TAG = 'ai-draft'

const INSTRUCTIONS = `Kreate plans short-form UGC (user-generated content) ad shoots. You help write scripts for the person's organisation.

Start with get_workspace: it gives the organisation's voice (who they are and how scripts should sound), its channel slots and script rules. Follow them in everything you write.

Every video is Hook (on camera) → VO (a voiceover, split into beats) → CTA. Scripts are reusable templates written with double-brace slots instead of real names: {{brand}} and {{product}} are filled from the product, channel slots from each channel, and any other {{name}} is filled in per shoot. Only use the slots get_workspace lists, plus custom ones you're asked for.

Write lines the way a real creator talks to camera: first person, plain spoken words, easy to say in one breath, no hashtags or stage directions in scripts. Never invent facts, statistics, medical or professional claims, or guarantees, and never make or imply a brand's forbidden claims (list_brands).

What you add (add_hooks, add_ctas) goes into the Library tagged "${DRAFT_TAG}" for a person to review in Kreate.`

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] })
const failure = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true })

export function buildConnectorServer(event: H3Event, token: string) {
  const db = connectorDb(event, token)
  const server = new McpServer({ name: 'kreate', version: '1.0.0' }, { instructions: INSTRUCTIONS })

  /** The person's current organisation, if its subscription is live. */
  async function workspace() {
    const { data } = await db.rpc('my_orgs')
    const org = data?.find(row => row.is_current) ?? null
    if (!org) return { error: 'You\'re not in an organisation on Kreate yet.' }
    if (!org.entitled) return { error: `${org.name}'s Kreate subscription isn't active, so the AI connector is off. An admin can restart it in Settings → Profile.` }
    return { org }
  }

  /** Run a tool for a live organisation, turning failures into a message the AI can relay. */
  const guarded = <A>(run: (args: A, org: { id: string, name: string, role: string }) => Promise<ReturnType<typeof text>>) =>
    async (args: A) => {
      try {
        const { org, error } = await workspace()
        if (!org) return failure(error!)
        return await run(args, org)
      } catch (caught) {
        return failure(caught instanceof Error ? caught.message : 'Something went wrong in Kreate.')
      }
    }

  /** A query's data, or its error thrown (relayed to the AI as the tool's message). */
  const must = <T>(result: { data: T, error: { message: string } | null }): T => {
    if (result.error) throw new Error(result.error.message)
    return result.data
  }

  server.registerTool('get_workspace', {
    title: 'Get workspace',
    description: 'Start here. The organisation\'s voice (who it is and how its scripts should sound), its channel slots and script rules, its hook types and formats. Follow all of it when writing.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true }
  }, guarded(async (_args: Record<string, unknown>, org) => {
    const [settings, hookTypes, formats] = await Promise.all([
      db.from('settings').select('ai_preamble, org_profile, channel_slots, script_rules, words_per_second').limit(1).maybeSingle(),
      db.from('angles').select('name, description').eq('archived', false).order('name'),
      db.from('formats').select('code, name, kind, description').eq('archived', false).order('code')
    ])
    const row = must(settings)
    const rules = parseScriptRules(row?.script_rules)
    return text({
      organisation: org.name,
      your_role: org.role,
      voice: aiPreamble(org.name, row),
      profile: parseOrgProfile(row?.org_profile),
      slots: {
        built_in: { brand: 'the brand\'s name', product: 'the product\'s name' },
        channel_slots: parseChannelSlots(row?.channel_slots),
        note: 'A line that uses a channel slot is filmed once per channel; any other line once per person. Any other {{name}} is a custom slot filled in per shoot.'
      },
      script_rules: rules,
      words_to_avoid: scriptRulesForAi(rules) || null,
      speech_pace_words_per_second: Number(row?.words_per_second) || DEFAULT_WORDS_PER_SECOND,
      hook_types: must(hookTypes),
      formats: must(formats)
    })
  }))

  server.registerTool('list_brands', {
    title: 'List brands',
    description: 'The organisation\'s brands and their products, with each product\'s allowed and forbidden claims and its core features. Never make or imply a forbidden claim.',
    inputSchema: z.object({
      status: z.enum(['prospect', 'auditioning', 'piloting', 'active', 'paused']).optional().describe('Only brands at this stage')
    }),
    annotations: { readOnlyHint: true }
  }, guarded(async ({ status }: { status?: string }) => {
    let query = db.from('brands').select('id, name, status, notes, products(id, name, claims_allowed, claims_forbidden, product_features(name, description))').order('name')
    if (status) query = query.eq('status', status)
    return text(must(await query))
  }))

  server.registerTool('get_library', {
    title: 'Get library',
    description: 'The Library: hooks (opening lines, with hook type and caption), CTAs (closing calls to action, said on camera "sync" or as voiceover "vo") and formats (VO structures, with what to write in each beat and an example line). Use it for style and to avoid repeating what exists.',
    inputSchema: z.object({
      kind: z.enum(['hooks', 'ctas', 'formats']).describe('Which part of the Library'),
      product_id: z.string().uuid().optional().describe('Hooks or CTAs for this product, plus the general ones'),
      limit: z.number().int().min(1).max(200).optional().describe('At most this many (default 100)')
    }),
    annotations: { readOnlyHint: true }
  }, guarded(async ({ kind, product_id, limit }: { kind: 'hooks' | 'ctas' | 'formats', product_id?: string, limit?: number }) => {
    const max = limit ?? 100
    if (kind === 'formats') {
      return text(must(await db.from('formats')
        .select('code, name, kind, description, beats, beat_descriptions, beat_examples, beat_display, cta_modes, target_seconds')
        .eq('archived', false).order('code').limit(max)))
    }
    // a product's own, plus the general ones; or everything when no product is given
    const forProduct = product_id ? `product_id.is.null,product_id.eq.${product_id}` : null
    if (kind === 'hooks') {
      let hooks = db.from('hook_templates')
        .select('id, script, caption, tags, product_id, hook_type:angles(name)')
        .is('shoot_id', null).eq('archived', false)
      if (forProduct) hooks = hooks.or(forProduct)
      return text(must(await hooks.order('created_at', { ascending: false }).limit(max)))
    }
    let ctas = db.from('cta_templates')
      .select('id, script, mode, tags, product_id')
      .is('shoot_id', null).eq('archived', false)
    if (forProduct) ctas = ctas.or(forProduct)
    return text(must(await ctas.order('created_at', { ascending: false }).limit(max)))
  }))

  server.registerTool('list_shoots', {
    title: 'List shoots',
    description: 'Recent shoots: code (e.g. S008), status, date, and the product and brand.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).optional() }),
    annotations: { readOnlyHint: true }
  }, guarded(async ({ limit }: { limit?: number }) => text(must(await db.from('shoots')
    .select('code, status, shoot_date, product:products(name, brand:brands(name))')
    .order('code', { ascending: false }).limit(limit ?? 30)))))

  server.registerTool('get_shoot', {
    title: 'Get shoot',
    description: 'One shoot\'s plan: its product, channels, formats and every hook, VO and CTA on its shot list, with scripts as they\'ll be filmed.',
    inputSchema: z.object({ code: z.string().min(2).max(10).describe('The shoot code, e.g. S008') }),
    annotations: { readOnlyHint: true }
  }, guarded(async ({ code }: { code: string }) => {
    const bundle = await loadShootBundle(db, code.toUpperCase())
    if (!bundle) return failure(`There's no shoot ${code}.`)
    const personName = (id: string) => bundle.people.find(person => person.id === id)?.name ?? null
    return text({
      code: bundle.shoot.code,
      status: bundle.shoot.status,
      date: bundle.shoot.shoot_date,
      brand: bundle.brand.name,
      product: bundle.product.name,
      claims_allowed: bundle.product.claims_allowed,
      claims_forbidden: bundle.product.claims_forbidden,
      custom_slots: bundle.shoot.slot_values,
      channels: bundle.channels.map(channel => ({ name: channel.name, slot_values: parseSlotValues(channel.slot_values) })),
      formats: bundle.plannedFormats.map(format => ({ code: format.code, name: format.name, kind: format.kind })),
      shot_list: groupShotList(bundle.items).map((group) => {
        const first = group.items[0]!
        const script = resolveItemScript(bundle, { ...first, script_override: null })
        return {
          code: group.code,
          kind: group.kind === 'body' ? 'vo' : group.kind,
          about: first.title ?? null,
          hook_type: first.hook_type,
          format: first.format?.code ?? null,
          script: script.beats ? script.beats.map(beat => ({ beat: beat.beat, script: beat.script })) : script.text,
          people: [...new Set(group.items.map(item => personName(item.person_id)).filter(Boolean))]
        }
      })
    })
  }))

  /** The product, when one's named: it has to be one the person can see. */
  async function productOrError(productId: string | undefined) {
    if (!productId) return null
    const product = must(await db.from('products').select('id, name').eq('id', productId).maybeSingle())
    if (!product) throw new Error('That product isn\'t in this organisation. Use an id from list_brands.')
    return product
  }
  const draftTags = (tags: string[] | undefined) => [...new Set([...(tags ?? []).map(slugify).filter(Boolean), DRAFT_TAG])]
  async function pace() {
    const row = must(await db.from('settings').select('words_per_second').limit(1).maybeSingle())
    return Number(row?.words_per_second) || DEFAULT_WORDS_PER_SECOND
  }

  server.registerTool('add_hooks', {
    title: 'Add hooks',
    description: `Add hooks (opening lines said on camera, the first 2 to 4 seconds) to the Library, tagged "${DRAFT_TAG}" for review. Use slots, follow the voice and script rules from get_workspace, and give each a hook type from get_workspace when one fits.`,
    inputSchema: z.object({
      hooks: z.array(z.object({
        script: z.string().min(1).max(500).describe('The line, with slots'),
        caption: z.string().max(500).optional().describe('A suggested post caption to go with the video'),
        hook_type: z.string().max(80).optional().describe('A hook type name from get_workspace'),
        tags: z.array(z.string().max(40)).max(8).optional()
      })).min(1).max(20),
      product_id: z.string().uuid().optional().describe('Only for this product (from list_brands); leave out for any product')
    }),
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, guarded(async ({ hooks, product_id }: { hooks: { script: string, caption?: string, hook_type?: string, tags?: string[] }[], product_id?: string }) => {
    const product = await productOrError(product_id)
    const types = must(await db.from('angles').select('id, name').eq('archived', false)) ?? []
    const typeId = (name: string | undefined) => name ? types.find(type => type.name.toLowerCase() === name.trim().toLowerCase())?.id ?? null : null
    const wps = await pace()
    const added = must(await db.from('hook_templates').insert(hooks.map(hook => ({
      script: hook.script.trim(),
      caption: hook.caption?.trim() || null,
      angle_id: typeId(hook.hook_type),
      tags: draftTags(hook.tags),
      product_id: product?.id ?? null,
      est_seconds: estimateSeconds(hook.script, wps)
    }))).select('id, script')) ?? []
    const unknown = hooks.filter(hook => hook.hook_type && !typeId(hook.hook_type)).map(hook => hook.hook_type)
    return text({
      added: added.length,
      for_product: product?.name ?? 'any product',
      review: `They're in Kreate's Library under Hooks, tagged "${DRAFT_TAG}".`,
      ...(unknown.length ? { note: `These hook types aren't in Kreate, so those hooks have none: ${[...new Set(unknown)].join(', ')}` } : {})
    })
  }))

  server.registerTool('add_ctas', {
    title: 'Add CTAs',
    description: `Add CTAs (the closing call to action, the last 2 to 4 seconds) to the Library, tagged "${DRAFT_TAG}" for review. "sync" is said on camera to the viewer; "vo" is voiceover over footage, so it must make sense without seeing the speaker. Don't invent prices, discounts or deadlines.`,
    inputSchema: z.object({
      ctas: z.array(z.object({
        script: z.string().min(1).max(500),
        mode: z.enum(['sync', 'vo']),
        tags: z.array(z.string().max(40)).max(8).optional()
      })).min(1).max(20),
      product_id: z.string().uuid().optional().describe('Only for this product (from list_brands); leave out for any product')
    }),
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, guarded(async ({ ctas, product_id }: { ctas: { script: string, mode: 'sync' | 'vo', tags?: string[] }[], product_id?: string }) => {
    const product = await productOrError(product_id)
    const wps = await pace()
    const added = must(await db.from('cta_templates').insert(ctas.map(cta => ({
      script: cta.script.trim(),
      mode: cta.mode,
      tags: draftTags(cta.tags),
      product_id: product?.id ?? null,
      est_seconds: estimateSeconds(cta.script, wps)
    }))).select('id')) ?? []
    return text({ added: added.length, for_product: product?.name ?? 'any product', review: `They're in Kreate's Library under CTAs, tagged "${DRAFT_TAG}".` })
  }))

  return server
}
