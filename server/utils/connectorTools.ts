import type { H3Event } from 'h3'
import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'

// The AI connector's tools (spec §11). Each request gets a fresh server, acting as the person whose
// token it is. Every tool works in one organisation: the one it names (`organisation`), from those
// the person allowed this AI app when connecting it; the database keeps each query inside it.
// Writes land in the Library tagged `ai-draft` for a person to review. Nothing here deletes, plans or bills.

const DRAFT_TAG = 'ai-draft'

const INSTRUCTIONS = `Kreate plans short-form UGC (user-generated content) ad shoots. You help write scripts for the person's organisation.

The person may have several organisations (separate businesses or clients). Call list_organisations first; if there's more than one, ask which they mean unless it's clear, and pass its name as \`organisation\` to every other tool. With only one, you can leave \`organisation\` out.

Start with get_workspace: it gives the organisation's voice (who they are and how scripts should sound), its channel slots and script rules. Follow them in everything you write.

Every video is Hook (on camera) → VO (a voiceover, split into beats) → CTA. Scripts are reusable templates written with double-brace slots instead of real names: {{brand}} and {{product}} are filled from the product, channel slots from each channel, and any other {{name}} is filled in per shoot. Only use the slots get_workspace lists, plus custom ones you're asked for.

Write lines the way a real creator talks to camera: first person, plain spoken words, easy to say in one breath, no hashtags or stage directions in scripts. Never invent facts, statistics, medical or professional claims, or guarantees, and never make or imply a brand's forbidden claims (list_brands).

What you add (add_hooks, add_ctas) goes into the Library tagged "${DRAFT_TAG}" for a person to review in Kreate, and the organisation's chat gets a note that you added it.

You can also write VOs on a shoot (add_vo), search the Library (search_library), draft a shoot (draft_shoot) and add brands, products and product features (add_brand, add_product, add_features). VOs and shoots you make are drafts a person reviews in Kreate.

Everything has its own link (the \`link\` field): give it to the person whenever you mention or make something, and use share_to_chat to post an item to the chat as a card.

Each organisation has a chat everyone in it sees (read_chat, post_to_chat). Read it for context when asked; only post when the person asks you to, write as their assistant (your posts are labelled with your app's name), and keep it short.`

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] })
const failure = (message: string) => ({ content: [{ type: 'text' as const, text: message }], isError: true })

type Org = { id: string, name: string, slug: string, role: string, entitled: boolean, is_current: boolean }
type Db = ReturnType<typeof connectorDb>

/** Every tool can name the organisation it's for. */
const organisationArg = z.string().max(120).optional()
  .describe('Which organisation: its name or slug from list_organisations. Leave out if the person has only one.')

export function buildConnectorServer(event: H3Event, token: string, clientId: string) {
  const base = connectorDb(event, token)
  const server = new McpServer({ name: 'kreate', version: '1.0.0' }, { instructions: INSTRUCTIONS })

  /** The organisations this AI app may use: the ones the person picked, else (connected before picking existed) their current one. */
  let allowedCache: Org[] | null = null
  async function allowed(): Promise<Org[]> {
    if (allowedCache) return allowedCache
    const [{ data: orgs, error }, { data: access }] = await Promise.all([
      base.rpc('my_orgs'),
      base.from('connector_org_access').select('org_id').eq('client_id', clientId)
    ])
    if (error) throw new Error(error.message)
    const all = (orgs ?? []) as Org[]
    const picked = new Set((access ?? []).map(row => row.org_id))
    allowedCache = picked.size ? all.filter(org => picked.has(org.id)) : all.filter(org => org.is_current)
    return allowedCache
  }

  /** The organisation a tool call is for, by name, slug or id; with one allowed, that one. */
  async function pick(named: string | undefined): Promise<Org> {
    const orgs = await allowed()
    if (!orgs.length) throw new Error('This AI app can\'t use any of your organisations. Change that in Kreate: Your account → Connect your AI.')
    const names = orgs.map(org => org.name).join(', ')
    let org: Org | undefined
    if (named?.trim()) {
      const wanted = named.trim().toLowerCase()
      org = orgs.find(entry => [entry.name.toLowerCase(), entry.slug, entry.id].includes(wanted))
        ?? orgs.find(entry => entry.name.toLowerCase().includes(wanted))
      if (!org) throw new Error(`"${named}" isn't one of the organisations this AI app can use: ${names}.`)
    } else if (orgs.length === 1) {
      org = orgs[0]
    } else {
      throw new Error(`Which organisation? This AI app can use ${names}. Pass one as \`organisation\`.`)
    }
    if (!org!.entitled) throw new Error(`${org!.name}'s Kreate subscription isn't active, so the AI connector is off there. An admin can restart it in Settings → Profile.`)
    return org!
  }

  /** Run a tool in its organisation, turning failures into a message the AI can relay. */
  const guarded = <A extends { organisation?: string }>(run: (args: A, org: Org, db: Db) => Promise<ReturnType<typeof text>>) =>
    async (args: A) => {
      try {
        const org = await pick(args.organisation)
        return await run(args, org, connectorDb(event, token, org.id))
      } catch (caught) {
        return failure(caught instanceof Error ? caught.message : 'Something went wrong in Kreate.')
      }
    }

  // --- links: every item has its own address in Kreate --------------------------------------
  const origin = connectorUrl(event).origin
  const paths = {
    hook: (id: string) => `/library?tab=hooks&open=${id}`,
    cta: (id: string) => `/library?tab=ctas&open=${id}`,
    format: (id: string) => `/library?tab=formats&open=${id}`,
    brand: (id: string) => `/brands/${id}`,
    product: (brandId: string, id: string) => `/brands/${brandId}?product=${id}`,
    shoot: (code: string) => `/shoots/${code}`,
    vo: (code: string, id: string) => `/shoots/${code}?tab=vos&vo=${id}`
  }
  const link = (path: string) => `${origin}${path}`

  server.registerTool('list_organisations', {
    title: 'List organisations',
    description: 'The person\'s organisations this AI app may use (each a separate business or client with its own brands, Library and voice). Pass one\'s name as `organisation` to the other tools.',
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true }
  }, async () => {
    try {
      const orgs = await allowed()
      return text({
        organisations: orgs.map(org => ({ name: org.name, slug: org.slug, your_role: org.role, connector_on: org.entitled, current_in_kreate: org.is_current })),
        note: orgs.length > 1 ? 'Pass one as `organisation` to every other tool.' : 'Only one: you can leave `organisation` out.'
      })
    } catch (caught) {
      return failure(caught instanceof Error ? caught.message : 'Something went wrong in Kreate.')
    }
  })

  /** A query's data, or its error thrown (relayed to the AI as the tool's message). */
  const must = <T>(result: { data: T, error: { message: string } | null }): T => {
    if (result.error) throw new Error(result.error.message)
    return result.data
  }

  server.registerTool('get_workspace', {
    title: 'Get workspace',
    description: 'Start here. The organisation\'s voice (who it is and how its scripts should sound), its channel slots and script rules, its hook types and formats. Follow all of it when writing.',
    inputSchema: z.object({ organisation: organisationArg }),
    annotations: { readOnlyHint: true }
  }, guarded(async (_args: { organisation?: string }, org, db) => {
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
      status: z.enum(['prospect', 'auditioning', 'piloting', 'active', 'paused']).optional().describe('Only brands at this stage'),
      organisation: organisationArg
    }),
    annotations: { readOnlyHint: true }
  }, guarded(async ({ status }: { status?: string, organisation?: string }, _org, db) => {
    let query = db.from('brands').select('id, name, status, notes, products(id, name, claims_allowed, claims_forbidden, product_features(id, name, description))').order('name')
    if (status) query = query.eq('status', status)
    return text((must(await query) ?? []).map(brand => ({
      ...brand,
      link: link(paths.brand(brand.id)),
      products: brand.products.map(product => ({ ...product, link: link(paths.product(brand.id, product.id)) }))
    })))
  }))

  server.registerTool('get_library', {
    title: 'Get library',
    description: 'The Library: hooks (opening lines, with hook type and caption), CTAs (closing calls to action, said on camera "sync" or as voiceover "vo") and formats (VO structures, with what to write in each beat and an example line). Use it for style and to avoid repeating what exists.',
    inputSchema: z.object({
      kind: z.enum(['hooks', 'ctas', 'formats']).describe('Which part of the Library'),
      product_id: z.string().uuid().optional().describe('Hooks or CTAs for this product, plus the general ones'),
      limit: z.number().int().min(1).max(200).optional().describe('At most this many (default 100)'),
      organisation: organisationArg
    }),
    annotations: { readOnlyHint: true }
  }, guarded(async ({ kind, product_id, limit }: { kind: 'hooks' | 'ctas' | 'formats', product_id?: string, limit?: number, organisation?: string }, _org, db) => {
    const max = limit ?? 100
    if (kind === 'formats') {
      return text((must(await db.from('formats')
        .select('id, code, name, kind, description, beats, beat_descriptions, beat_examples, beat_display, cta_modes, target_seconds')
        .eq('archived', false).order('code').limit(max)) ?? []).map(row => ({ ...row, link: link(paths.format(row.id)) })))
    }
    // a product's own, plus the general ones; or everything when no product is given
    const forProduct = product_id ? `product_id.is.null,product_id.eq.${product_id}` : null
    if (kind === 'hooks') {
      let hooks = db.from('hook_templates')
        .select('id, script, caption, tags, product_id, hook_type:angles(name)')
        .is('shoot_id', null).eq('archived', false)
      if (forProduct) hooks = hooks.or(forProduct)
      return text((must(await hooks.order('created_at', { ascending: false }).limit(max)) ?? []).map(row => ({ ...row, link: link(paths.hook(row.id)) })))
    }
    let ctas = db.from('cta_templates')
      .select('id, script, mode, tags, product_id')
      .is('shoot_id', null).eq('archived', false)
    if (forProduct) ctas = ctas.or(forProduct)
    return text((must(await ctas.order('created_at', { ascending: false }).limit(max)) ?? []).map(row => ({ ...row, link: link(paths.cta(row.id)) })))
  }))

  server.registerTool('list_shoots', {
    title: 'List shoots',
    description: 'Recent shoots: code (e.g. S008), status, date, and the product and brand.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).optional(), organisation: organisationArg }),
    annotations: { readOnlyHint: true }
  }, guarded(async ({ limit }: { limit?: number, organisation?: string }, _org, db) => text((must(await db.from('shoots')
    .select('code, status, shoot_date, product:products(name, brand:brands(name))')
    .order('code', { ascending: false }).limit(limit ?? 30)) ?? []).map(row => ({ ...row, link: link(paths.shoot(row.code)) })))))

  server.registerTool('get_shoot', {
    title: 'Get shoot',
    description: 'One shoot\'s plan: its product, channels, formats and every hook, VO and CTA on its shot list, with scripts as they\'ll be filmed.',
    inputSchema: z.object({ code: z.string().min(2).max(10).describe('The shoot code, e.g. S008'), organisation: organisationArg }),
    annotations: { readOnlyHint: true }
  }, guarded(async ({ code }: { code: string, organisation?: string }, _org, db) => {
    const bundle = await loadShootBundle(db, code.toUpperCase())
    if (!bundle) return failure(`There's no shoot ${code}.`)
    const personName = (id: string) => bundle.people.find(person => person.id === id)?.name ?? null
    return text({
      code: bundle.shoot.code,
      link: link(paths.shoot(bundle.shoot.code)),
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
  async function productOrError(db: Db, productId: string | undefined) {
    if (!productId) return null
    const product = must(await db.from('products').select('id, name').eq('id', productId).maybeSingle())
    if (!product) throw new Error('That product isn\'t in this organisation. Use an id from list_brands.')
    return product
  }
  const draftTags = (tags: string[] | undefined) => [...new Set([...(tags ?? []).map(slugify).filter(Boolean), DRAFT_TAG])]
  async function pace(db: Db) {
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
      product_id: z.string().uuid().optional().describe('Only for this product (from list_brands); leave out for any product'),
      organisation: organisationArg
    }),
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, guarded(async ({ hooks, product_id }: { hooks: { script: string, caption?: string, hook_type?: string, tags?: string[] }[], product_id?: string, organisation?: string }, org, db) => {
    const product = await productOrError(db, product_id)
    const types = must(await db.from('angles').select('id, name').eq('archived', false)) ?? []
    const typeId = (name: string | undefined) => name ? types.find(type => type.name.toLowerCase() === name.trim().toLowerCase())?.id ?? null : null
    const wps = await pace(db)
    const added = must(await db.from('hook_templates').insert(hooks.map(hook => ({
      script: hook.script.trim(),
      caption: hook.caption?.trim() || null,
      angle_id: typeId(hook.hook_type),
      tags: draftTags(hook.tags),
      product_id: product?.id ?? null,
      est_seconds: estimateSeconds(hook.script, wps)
    }))).select('id, script')) ?? []
    if (added.length) await db.rpc('post_ai_drafts_event', { p_kind: 'hooks', p_count: added.length })
    const links = added.map(row => ({ id: row.id, script: row.script, link: link(paths.hook(row.id)) }))
    const unknown = hooks.filter(hook => hook.hook_type && !typeId(hook.hook_type)).map(hook => hook.hook_type)
    return text({
      added: added.length,
      hooks: links,
      organisation: org.name,
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
      product_id: z.string().uuid().optional().describe('Only for this product (from list_brands); leave out for any product'),
      organisation: organisationArg
    }),
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, guarded(async ({ ctas, product_id }: { ctas: { script: string, mode: 'sync' | 'vo', tags?: string[] }[], product_id?: string, organisation?: string }, org, db) => {
    const product = await productOrError(db, product_id)
    const wps = await pace(db)
    const added = must(await db.from('cta_templates').insert(ctas.map(cta => ({
      script: cta.script.trim(),
      mode: cta.mode,
      tags: draftTags(cta.tags),
      product_id: product?.id ?? null,
      est_seconds: estimateSeconds(cta.script, wps)
    }))).select('id, script')) ?? []
    if (added.length) await db.rpc('post_ai_drafts_event', { p_kind: 'CTAs', p_count: added.length })
    return text({ added: added.length, ctas: added.map(row => ({ id: row.id, script: row.script, link: link(paths.cta(row.id)) })), organisation: org.name, for_product: product?.name ?? 'any product', review: `They're in Kreate's Library under CTAs, tagged "${DRAFT_TAG}".` })
  }))

  // --- search ---------------------------------------------------------------------------------
  server.registerTool('search_library', {
    title: 'Search library',
    description: 'Find hooks, CTAs, VOs and formats whose wording matches, with links. Use it to avoid writing near-duplicates and to find what already exists.',
    inputSchema: z.object({
      query: z.string().min(2).max(120).describe('Words to look for'),
      kind: z.enum(['hooks', 'ctas', 'vos', 'formats']).optional().describe('Only this kind (default all)'),
      limit: z.number().int().min(1).max(50).optional().describe('At most this many of each kind (default 15)'),
      organisation: organisationArg
    }),
    annotations: { readOnlyHint: true }
  }, guarded(async ({ query, kind, limit }: { query: string, kind?: 'hooks' | 'ctas' | 'vos' | 'formats', limit?: number, organisation?: string }, org, db) => {
    const max = limit ?? 15
    // ilike with % and _ taken literally
    const like = `%${query.trim().replace(/[\\%_]/g, match => `\\${match}`)}%`
    const want = (name: string) => !kind || kind === name
    const [hooks, ctas, vos, formats] = await Promise.all([
      want('hooks') ? db.from('hook_templates').select('id, script, caption, tags').eq('archived', false).is('shoot_id', null).ilike('script', like).limit(max) : null,
      want('ctas') ? db.from('cta_templates').select('id, script, mode, tags').eq('archived', false).is('shoot_id', null).ilike('script', like).limit(max) : null,
      want('vos') ? db.from('body_templates').select('id, title, beats, tags, shoot:shoots(code), format:formats(code)').eq('archived', false).order('created_at', { ascending: false }).limit(500) : null,
      want('formats') ? db.from('formats').select('id, code, name, description').eq('archived', false) : null
    ])
    // VOs (their words are in beats) and formats are matched here
    const words = query.trim().toLowerCase()
    const voRows = vos ? (must(vos) ?? []).filter(row => `${row.title ?? ''} ${parseBeats(row.beats).map(beat => beat.script).join(' ')}`.toLowerCase().includes(words)).slice(0, max) : null
    const formatRows = formats ? (must(formats) ?? []).filter(row => `${row.code} ${row.name} ${row.description ?? ''}`.toLowerCase().includes(words)).slice(0, max) : null
    return text({
      organisation: org.name,
      hooks: hooks ? (must(hooks) ?? []).map(row => ({ ...row, link: link(paths.hook(row.id)) })) : undefined,
      ctas: ctas ? (must(ctas) ?? []).map(row => ({ ...row, link: link(paths.cta(row.id)) })) : undefined,
      vos: voRows
        ? voRows.map((row) => {
            const code = (row.shoot as { code: string } | null)?.code
            return { id: row.id, title: row.title, format: (row.format as { code: string } | null)?.code, shoot: code, beats: parseBeats(row.beats).map(beat => ({ beat: beat.beat, script: beat.script })), link: code ? link(paths.vo(code, row.id)) : null }
          })
        : undefined,
      formats: formatRows ? formatRows.map(row => ({ ...row, link: link(paths.format(row.id)) })) : undefined
    })
  }))

  // --- VOs --------------------------------------------------------------------------------------
  server.registerTool('add_vo', {
    title: 'Add VO',
    description: `Write a VO (voiceover) on a shoot, beat by beat in one of its formats (get_shoot shows its formats; get_library kind formats gives each format's beats, with what to write in each and an example line). It's saved as a draft tagged "${DRAFT_TAG}": a person opens its link, reviews it and saves it onto the shoot's plan. Follow the voice and script rules from get_workspace and the product's claims.`,
    inputSchema: z.object({
      shoot: z.string().min(2).max(10).describe('The shoot code, e.g. S008'),
      format: z.string().min(1).max(20).describe('The format code, e.g. F03'),
      beats: z.array(z.object({
        beat: z.string().min(1).max(60).describe('The beat\'s name, exactly as the format lists it'),
        script: z.string().min(1).max(1000).describe('What\'s said in this beat, with slots')
      })).min(1).max(20).describe('Every beat of the format, in order'),
      title: z.string().max(120).optional().describe('A short name for it'),
      feature: z.string().max(120).optional().describe('The product feature it\'s about (name), if just one'),
      writer: z.string().max(120).optional().describe('Who performs it (a person on the shoot). Leave out for the person you\'re working for'),
      organisation: organisationArg
    }),
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, guarded(async ({ shoot: code, format: formatCode, beats, title, feature, writer }: { shoot: string, format: string, beats: { beat: string, script: string }[], title?: string, feature?: string, writer?: string, organisation?: string }, org, db) => {
    const shoot = must(await db.from('shoots').select('id, code, status, product_id').eq('code', code.trim().toUpperCase()).maybeSingle())
    if (!shoot) return failure(`There's no shoot ${code}. Use a code from list_shoots.`)
    const format = must(await db.from('formats').select('id, code, beats').eq('code', formatCode.trim().toUpperCase()).eq('archived', false).maybeSingle())
    if (!format) return failure(`There's no format ${formatCode}. Use a code from get_library (kind formats).`)
    // every beat of the format, by name
    const expected = (format.beats as string[]) ?? []
    const given = new Map(beats.map(entry => [entry.beat.trim().toLowerCase(), entry.script.trim()]))
    const missing = expected.filter(name => !given.get(name.toLowerCase()))
    if (missing.length) return failure(`${format.code} needs these beats too: ${missing.join(', ')}. Its beats are, in order: ${expected.join(', ')}.`)
    // on the shoot's formats (a draft shoot gets it added)
    const onShoot = must(await db.from('shoot_formats').select('format_id').eq('shoot_id', shoot.id).eq('format_id', format.id).maybeSingle())
    if (!onShoot) {
      if (shoot.status !== 'draft') return failure(`${format.code} isn't on ${shoot.code}, and it's past planning. Use one of its formats (get_shoot).`)
      must(await db.from('shoot_formats').insert({ shoot_id: shoot.id, format_id: format.id }))
    }
    // the writer: a person on the shoot; by default the one this AI app works for
    const { data: claims } = await db.auth.getClaims()
    const people = must(await db.from('shoot_people').select('person:people(id, name, user_id)').eq('shoot_id', shoot.id)) ?? []
    const onShootPeople = people.map(row => row.person as { id: string, name: string, user_id: string | null } | null).filter(person => !!person) as { id: string, name: string, user_id: string | null }[]
    const person = writer?.trim()
      ? onShootPeople.find(entry => entry.name.toLowerCase() === writer.trim().toLowerCase())
      : onShootPeople.find(entry => entry.user_id === claims?.claims.sub)
    if (writer?.trim() && !person) return failure(`${writer} isn't on ${shoot.code}. People on it: ${onShootPeople.map(entry => entry.name).join(', ') || 'none yet'}.`)
    // a VO is written by its writer: only an admin drafts one for someone else (or with no writer yet)
    if (org.role !== 'admin' && person?.user_id !== claims?.claims.sub) {
      return failure(person
        ? `Only an admin can write a VO for ${person.name}. Write it as the person you work for, or ask an admin.`
        : `The person you work for isn't on ${shoot.code}'s cast, so they can't write a VO on it. An admin can add them to the shoot (or write it).`)
    }
    const featureRow = feature?.trim()
      ? must(await db.from('product_features').select('id').eq('product_id', shoot.product_id).ilike('name', feature.trim()).maybeSingle())
      : null
    if (feature?.trim() && !featureRow) return failure(`The product has no feature called "${feature}" (list_brands shows its features).`)
    const wps = await pace(db)
    const ordered = expected.map(name => ({ beat: name, script: given.get(name.toLowerCase())! }))
    const vo = must(await db.from('body_templates').insert({
      shoot_id: shoot.id,
      product_id: shoot.product_id,
      format_id: format.id,
      feature_id: featureRow?.id ?? null,
      person_id: person?.id ?? null,
      title: title?.trim() || null,
      beats: ordered,
      tags: [DRAFT_TAG],
      est_seconds: estimateSeconds(ordered.map(entry => entry.script).join(' '), wps)
    }).select('id').single())
    return text({
      added: 'VO',
      organisation: org.name,
      shoot: shoot.code,
      format: format.code,
      writer: person?.name ?? 'nobody yet: pick one when reviewing',
      link: link(paths.vo(shoot.code, vo!.id)),
      review: 'It\'s a draft: open the link to review it and save it onto the shoot\'s plan.'
    })
  }))

  // --- shoots -----------------------------------------------------------------------------------
  server.registerTool('draft_shoot', {
    title: 'Draft shoot',
    description: 'Start a draft shoot for a product (from list_brands), with the formats to film and an optional date and notes. Its channels are the brand\'s. A person plans it in Kreate: picking hooks, VOs and CTAs, and who films.',
    inputSchema: z.object({
      product_id: z.string().uuid().describe('The product (from list_brands)'),
      formats: z.array(z.string().max(20)).max(10).optional().describe('Format codes to film, e.g. ["F01", "F03"]'),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Shoot date, YYYY-MM-DD'),
      notes: z.string().max(2000).optional(),
      organisation: organisationArg
    }),
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, guarded(async ({ product_id, formats, date, notes }: { product_id: string, formats?: string[], date?: string, notes?: string, organisation?: string }, org, db) => {
    const product = must(await db.from('products').select('id, name, brand_id, brand:brands(name)').eq('id', product_id).maybeSingle())
    if (!product) return failure('That product isn\'t in this organisation. Use an id from list_brands.')
    const codes = [...new Set((formats ?? []).map(code => code.trim().toUpperCase()).filter(Boolean))]
    const formatRows = codes.length ? must(await db.from('formats').select('id, code').eq('archived', false).in('code', codes)) ?? [] : []
    const unknown = codes.filter(code => !formatRows.some(row => row.code === code))
    if (unknown.length) return failure(`These aren't formats here: ${unknown.join(', ')}.`)
    const settings = must(await db.from('settings').select('default_submission_rate').limit(1).maybeSingle())
    const shoot = must(await db.from('shoots').insert({
      product_id: product.id,
      shoot_date: date ?? null,
      kit: 'custom',
      notes: notes?.trim() || null,
      submission_rate: Number(settings?.default_submission_rate ?? 0.05)
    }).select('id, code').single())!
    const channels = must(await db.from('brand_channels').select('channel_id').eq('brand_id', product.brand_id)) ?? []
    if (channels.length) must(await db.from('shoot_channels').insert(channels.map(row => ({ shoot_id: shoot.id, channel_id: row.channel_id }))))
    if (formatRows.length) must(await db.from('shoot_formats').insert(formatRows.map(row => ({ shoot_id: shoot.id, format_id: row.id }))))
    return text({
      drafted: shoot.code,
      organisation: org.name,
      product: product.name,
      brand: (product.brand as { name: string } | null)?.name,
      formats: formatRows.map(row => row.code),
      channels: channels.length,
      link: link(paths.shoot(shoot.code)),
      next: 'It\'s a draft: a person plans it in Kreate. You can add VOs to it with add_vo.'
    })
  }))

  // --- brands, products, features ------------------------------------------------------------------
  /** a slug that isn't taken yet in this table (name, name-2, name-3…) */
  async function freeSlug(db: Db, table: 'brands' | 'products', name: string, brandId?: string) {
    const base = slugify(name) || 'item'
    const rows = table === 'brands'
      ? must(await db.from('brands').select('slug').like('slug', `${base}%`))
      : must(await db.from('products').select('slug').eq('brand_id', brandId!).like('slug', `${base}%`))
    const taken = new Set((rows ?? []).map(row => row.slug))
    if (!taken.has(base)) return base
    let n = 2
    while (taken.has(`${base}-${n}`)) n++
    return `${base}-${n}`
  }

  server.registerTool('add_brand', {
    title: 'Add brand',
    description: 'Add a brand (a prospect unless told otherwise), with notes. Check list_brands first so it isn\'t a duplicate. Add its products with add_product.',
    inputSchema: z.object({
      name: z.string().min(1).max(120),
      status: z.enum(['prospect', 'auditioning', 'piloting', 'active', 'paused']).optional().describe('Default prospect'),
      notes: z.string().max(4000).optional().describe('What the brand is, who it\'s for, anything worth knowing'),
      trybe_url: z.string().url().max(500).optional().describe('Its Trybe page, if known'),
      organisation: organisationArg
    }),
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, guarded(async ({ name, status, notes, trybe_url }: { name: string, status?: string, notes?: string, trybe_url?: string, organisation?: string }, org, db) => {
    const existing = must(await db.from('brands').select('id, name').ilike('name', name.trim()).maybeSingle())
    if (existing) return failure(`${existing.name} is already here: ${link(paths.brand(existing.id))}`)
    const brand = must(await db.from('brands').insert({
      name: name.trim(),
      slug: await freeSlug(db, 'brands', name),
      status: status ?? 'prospect',
      notes: notes?.trim() || null,
      trybe_url: trybe_url ?? null
    }).select('id, name, status').single())!
    return text({ added: 'brand', organisation: org.name, ...brand, link: link(paths.brand(brand.id)) })
  }))

  server.registerTool('add_product', {
    title: 'Add product',
    description: 'Add a product to a brand, with its allowed and forbidden claims (be conservative: only what the brand says it may claim) and, optionally, its features.',
    inputSchema: z.object({
      brand_id: z.string().uuid().describe('The brand (from list_brands or add_brand)'),
      name: z.string().min(1).max(120),
      claims_allowed: z.string().max(4000).optional(),
      claims_forbidden: z.string().max(4000).optional(),
      notes: z.string().max(4000).optional(),
      features: z.array(z.object({ name: z.string().min(1).max(120), description: z.string().max(1000).optional() })).max(20).optional(),
      organisation: organisationArg
    }),
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, guarded(async ({ brand_id, name, claims_allowed, claims_forbidden, notes, features }: { brand_id: string, name: string, claims_allowed?: string, claims_forbidden?: string, notes?: string, features?: { name: string, description?: string }[], organisation?: string }, org, db) => {
    const brand = must(await db.from('brands').select('id, name').eq('id', brand_id).maybeSingle())
    if (!brand) return failure('That brand isn\'t in this organisation. Use an id from list_brands.')
    const existing = must(await db.from('products').select('id, name').eq('brand_id', brand.id).ilike('name', name.trim()).maybeSingle())
    if (existing) return failure(`${brand.name} already has ${existing.name}: ${link(paths.product(brand.id, existing.id))}`)
    const product = must(await db.from('products').insert({
      brand_id: brand.id,
      name: name.trim(),
      slug: await freeSlug(db, 'products', name, brand.id),
      claims_allowed: claims_allowed?.trim() || null,
      claims_forbidden: claims_forbidden?.trim() || null,
      notes: notes?.trim() || null
    }).select('id, name').single())!
    if (features?.length) {
      must(await db.from('product_features').insert(features.map((feature, index) => ({
        product_id: product.id, name: feature.name.trim(), description: feature.description?.trim() || null, sort_order: index
      }))))
    }
    return text({ added: 'product', organisation: org.name, brand: brand.name, ...product, features: features?.length ?? 0, link: link(paths.product(brand.id, product.id)) })
  }))

  server.registerTool('add_features', {
    title: 'Add features',
    description: 'Add features to a product (what it does or has, each a short name and a description). VOs and b-roll can be about one feature.',
    inputSchema: z.object({
      product_id: z.string().uuid().describe('The product (from list_brands)'),
      features: z.array(z.object({ name: z.string().min(1).max(120), description: z.string().max(1000).optional() })).min(1).max(20),
      organisation: organisationArg
    }),
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, guarded(async ({ product_id, features }: { product_id: string, features: { name: string, description?: string }[], organisation?: string }, org, db) => {
    const product = must(await db.from('products').select('id, name, brand_id, product_features(name, sort_order)').eq('id', product_id).maybeSingle())
    if (!product) return failure('That product isn\'t in this organisation. Use an id from list_brands.')
    const have = new Set(product.product_features.map(feature => feature.name.toLowerCase()))
    const fresh = features.filter(feature => !have.has(feature.name.trim().toLowerCase()))
    const start = Math.max(-1, ...product.product_features.map(feature => feature.sort_order)) + 1
    if (fresh.length) {
      must(await db.from('product_features').insert(fresh.map((feature, index) => ({
        product_id: product.id, name: feature.name.trim(), description: feature.description?.trim() || null, sort_order: start + index
      }))))
    }
    return text({
      added: fresh.length,
      skipped_already_there: features.length - fresh.length,
      organisation: org.name,
      product: product.name,
      link: link(paths.product(product.brand_id, product.id))
    })
  }))

  // --- sharing to chat ---------------------------------------------------------------------------
  server.registerTool('share_to_chat', {
    title: 'Share to chat',
    description: 'Post something to the organisation\'s chat as a card people can click: a hook, CTA, VO, format, brand, product or shoot, with an optional note. Only when the person asks.',
    inputSchema: z.object({
      type: z.enum(['hook', 'cta', 'vo', 'format', 'brand', 'product', 'shoot']),
      id: z.string().max(60).describe('Its id (or, for a shoot, its code)'),
      note: z.string().max(1000).optional().describe('A message to go with it'),
      organisation: organisationArg
    }),
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, guarded(async ({ type, id, note }: { type: 'hook' | 'cta' | 'vo' | 'format' | 'brand' | 'product' | 'shoot', id: string, note?: string, organisation?: string }, org, db) => {
    let card: { title: string, preview?: string, path: string, id: string } | null = null
    if (type === 'hook') {
      const row = must(await db.from('hook_templates').select('id, script').eq('id', id).maybeSingle())
      if (row) card = { id: row.id, title: 'Hook', preview: row.script, path: paths.hook(row.id) }
    } else if (type === 'cta') {
      const row = must(await db.from('cta_templates').select('id, script, mode').eq('id', id).maybeSingle())
      if (row) card = { id: row.id, title: row.mode === 'vo' ? 'CTA · voiceover' : 'CTA · on camera', preview: row.script, path: paths.cta(row.id) }
    } else if (type === 'vo') {
      const row = must(await db.from('body_templates').select('id, title, beats, shoot:shoots(code), format:formats(code)').eq('id', id).maybeSingle())
      const code = (row?.shoot as { code: string } | null)?.code
      if (row && code) card = { id: row.id, title: row.title || `VO · ${(row.format as { code: string } | null)?.code ?? ''} · ${code}`, preview: parseBeats(row.beats).map(beat => beat.script).join(' '), path: paths.vo(code, row.id) }
    } else if (type === 'format') {
      const row = must(await db.from('formats').select('id, code, name, description').eq('id', id).maybeSingle())
      if (row) card = { id: row.id, title: `${row.code} · ${row.name}`, preview: row.description ?? undefined, path: paths.format(row.id) }
    } else if (type === 'brand') {
      const row = must(await db.from('brands').select('id, name, notes').eq('id', id).maybeSingle())
      if (row) card = { id: row.id, title: row.name, preview: row.notes ?? undefined, path: paths.brand(row.id) }
    } else if (type === 'product') {
      const row = must(await db.from('products').select('id, name, brand_id, notes, brand:brands(name)').eq('id', id).maybeSingle())
      if (row) card = { id: row.id, title: `${(row.brand as { name: string } | null)?.name ?? ''} · ${row.name}`, preview: row.notes ?? undefined, path: paths.product(row.brand_id, row.id) }
    } else {
      const row = must(await db.from('shoots').select('id, code, status, product:products(name, brand:brands(name))').eq('code', id.trim().toUpperCase()).maybeSingle())
      const product = row?.product as { name: string, brand: { name: string } | null } | null
      if (row) card = { id: row.id, title: `${row.code} · ${product?.brand?.name ?? ''} — ${product?.name ?? ''}`, preview: row.status, path: paths.shoot(row.code) }
    }
    if (!card) return failure(`There's no ${type} with that id here.`)
    must(await db.from('org_messages').insert({ kind: 'share', body: note?.trim() ?? '', ref: { type, ...card } }))
    return text({ shared: card.title, organisation: org.name, link: link(card.path) })
  }))

  server.registerTool('read_chat', {
    title: 'Read chat',
    description: "The organisation's chat, newest last: what the team has said, what they shared (hooks, CTAs, brands, shoots) and Kreate's updates (shoots planned, filmed, Live).",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).optional().describe('At most this many recent messages (default 30)'),
      organisation: organisationArg
    }),
    annotations: { readOnlyHint: true }
  }, guarded(async ({ limit }: { limit?: number, organisation?: string }, org, db) => {
    const [rows, members] = await Promise.all([
      db.from('org_messages').select('author_id, kind, body, ref, via, created_at, deleted_at').order('created_at', { ascending: false }).limit(limit ?? 30),
      db.from('org_members').select('user_id, display_name, profile:profiles(display_name, full_name, email)')
    ])
    const names = new Map((must(members) ?? []).map((row) => {
      const profile = row.profile as { display_name: string | null, full_name: string | null, email: string | null } | null
      return [row.user_id, row.display_name || profile?.display_name || profile?.full_name || profile?.email || 'Someone'] as const
    }))
    return text({
      organisation: org.name,
      messages: (must(rows) ?? []).reverse().filter(row => !row.deleted_at).map(row => ({
        from: row.kind === 'event' ? 'Kreate' : names.get(row.author_id ?? '') ?? 'Someone',
        ...(row.via ? { via: row.via } : {}),
        at: row.created_at,
        text: row.body || null,
        ...(row.kind === 'share' && row.ref ? { shared: row.ref } : {})
      }))
    })
  }))

  server.registerTool('post_to_chat', {
    title: 'Post to chat',
    description: "Post a message to the organisation's chat, as the person (labelled as coming through your app). Only when they ask you to. Mention a teammate with @ and their name as read_chat shows it.",
    inputSchema: z.object({
      message: z.string().min(1).max(2000),
      organisation: organisationArg
    }),
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, guarded(async ({ message }: { message: string, organisation?: string }, org, db) => {
    const members = must(await db.from('org_members').select('user_id, display_name, profile:profiles(display_name, full_name, email)')) ?? []
    const mentions = members.filter((row) => {
      const profile = row.profile as { display_name: string | null, full_name: string | null, email: string | null } | null
      const name = row.display_name || profile?.display_name || profile?.full_name || profile?.email
      return !!name && message.includes(`@${name}`)
    }).map(row => row.user_id)
    must(await db.from('org_messages').insert({ kind: 'text', body: message.trim(), mentions }))
    return text({ posted: true, organisation: org.name })
  }))

  return server
}
