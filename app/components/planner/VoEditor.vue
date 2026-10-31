<script setup lang="ts">
import type { Row } from '#shared/types/models'
import type { Beat } from '#shared/utils/slots'
import type { Json } from '#shared/types/database.types'

// Slide-over editor for a VO, inside a shoot: VOs are only written here. Every VO is for the
// shoot's product, about one of its core features or the product as a whole, and is written by
// the signed-in user's person on the cast: only they perform it, and only they (or an admin) can
// edit it. It can be linked to some of the shoot's hooks and/or CTAs: then it only goes with
// those (they still go with other VOs). Open it with `edit(row)`, or `edit({ format_id })` to
// start a new VO in a format. Saving emits the saved VO; the shoot puts it on the plan.
export interface LinkOption { template_id: string, code: string, script: string }
const props = defineProps<{
  shootId: string
  productId: string
  /** the people on the shoot: a VO's writer has to be one of them */
  people: { id: string, name: string }[]
  /** the shoot's hooks and CTAs, to link to */
  hooks: LinkOption[]
  ctas: LinkOption[]
  /** the shoot's channels and who on the shoot films each: a VO is cast on people who share one with its writer */
  channels: { id: string, name: string }[]
  channelPeople: Record<string, string[]>
}>()
const emit = defineEmits<{ saved: [vo: Row<'body_templates'>, isNew: boolean] }>()

const db = useDb()
const run = useAction()
const { confirmDialog } = useConfirm()
const { formats, hookTypes, people: allPeople, featureOptions, featureOf, productOf, settings } = useRefData()
const { me, isAdmin, canEditVo } = useMe()
/** admins can write a VO for anyone on the shoot; everyone else writes their own */
const writerOptions = computed(() => props.people.map(person => ({ label: person.name, value: person.id })))
const choosesWriter = computed(() => isAdmin.value && !form.id)
const { context } = usePreviewContext()

const formatOptions = computed(() =>
  formats.value.filter(f => !f.archived).map(f => ({ label: `${f.code} — ${f.name}`, value: f.id }))
)
const formatOf = (id: string | undefined) => formats.value.find(f => f.id === id)

// --- the format's guidance, beat by beat ------------------------------------------
const format = computed(() => formatOf(form.format_id))
const standalone = computed(() => format.value?.kind === 'standalone')
const guidanceOf = (beat: string) => (format.value?.beat_descriptions as Record<string, string> | null)?.[beat] ?? null
const exampleOf = (beat: string) => (format.value?.beat_examples as Record<string, string> | null)?.[beat] ?? null
const showOf = (beat: string) => beatShow(format.value as Parameters<typeof beatShow>[0], beat)
const SHOW_LABELS: Record<string, string> = {
  face: 'Face to camera',
  broll: 'Over b-roll',
  screen: 'On screen: a text message, not filmed',
  voice_note: 'Voice note: filmed, played as audio'
}
const beatTitle = (beat: string) => standalone.value && beat === 'hook' ? 'Hook (opens the video)' : standalone.value && beat === 'cta' ? 'CTA (closes the video)' : `Beat: ${beat}`
/** a standalone format's hook beat: each wording gets a hook type, like a Library hook */
const isHookBeat = (beat: string) => standalone.value && beat === 'hook'
const hookTypeItems = computed(() => hookTypes.value.filter(type => !type.archived).map(type => ({ label: type.name, value: type.name })))

// --- alternate wordings: each is its own take, combined into extra versions (wording mixes) ---
function addAlternate(beat: Beat) {
  beat.alternates = [...(beat.alternates ?? []), { script: '' }]
}
function removeAlternate(beat: Beat, index: number) {
  beat.alternates = (beat.alternates ?? []).filter((_, i) => i !== index)
}
// --- copy from an earlier VO in the same format ---------------------------------------
// Formats are reusable, and scripts use slots ({{product}}…), so an earlier VO in the same
// format (anyone's, any product or feature) is a good start. Copying takes its beats and
// wordings; who writes it, the product and what it's about stay as they are here.
type CopyRow = Row<'body_templates'> & { feature: { name: string } | null, product: { name: string } | null }
const copyOpen = ref(false)
const copyLoading = ref(false)
const copyRows = shallowRef<CopyRow[]>([])
const copySearch = ref('')
async function openCopy() {
  if (!form.format_id) return
  copyOpen.value = true
  copySearch.value = ''
  copyLoading.value = true
  await run(async () => {
    copyRows.value = must(await db.from('body_templates')
      .select('*, feature:product_features(name), product:products(name)')
      .eq('format_id', form.format_id!).eq('archived', false).neq('id', form.id || '00000000-0000-0000-0000-000000000000')
      .order('created_at', { ascending: false }).limit(200)) as unknown as CopyRow[]
  })
  copyLoading.value = false
}
/** the writer's own VOs first, then everyone else's; filtered by the search */
const copyList = computed(() => {
  const term = copySearch.value.trim().toLowerCase()
  const text = (row: CopyRow) => `${personName(row.person_id ?? undefined)} ${row.product?.name ?? ''} ${row.feature?.name ?? ''} ${parseBeats(row.beats).map(beat => beat.script).join(' ')}`.toLowerCase()
  const rows = copyRows.value.filter(row => !term || text(row).includes(term))
  const mine = (row: CopyRow) => !!form.person_id && row.person_id === form.person_id
  return [...rows.filter(mine), ...rows.filter(row => !mine(row))]
})
async function copyFrom(row: CopyRow) {
  if (form.beats.some(beat => beat.script.trim() || beat.alternates?.some(alternate => alternate.script.trim())) && !(await confirmDialog({
    title: 'Replace your beats with this VO\u2019s?',
    description: 'The scripts you have written in each beat are replaced. Nothing is saved until you press Save.',
    confirmLabel: 'Replace'
  }))) return
  form.beats = alignBeats(format.value?.beats ?? parseBeats(row.beats).map(beat => beat.beat), parseBeats(row.beats))
  copyOpen.value = false
}

/** wordings land best on the first and last beats; flag when only the middle ones have them */
const onlyMiddleAlternates = computed(() => {
  const withAlternates = form.beats.map((beat, index) => beat.alternates?.length ? index : -1).filter(index => index >= 0)
  return withAlternates.length > 0 && withAlternates.every(index => index > 0 && index < form.beats.length - 1)
})
const personName = (id: string | undefined) => allPeople.value.find(person => person.id === id)?.name ?? 'Unknown'

/** 'general' = about the product as a whole */
const GENERAL = 'general'
const product = computed(() => productOf(props.productId))
const features = computed(() => [
  { label: `${product.value?.name ?? 'The product'} as a whole`, value: GENERAL },
  ...featureOptions(props.productId)
])
const linkItems = (options: LinkOption[]) => options.map(option => ({ label: `${option.code} · ${option.script}`, value: option.template_id }))

const open = ref(false)
const saving = ref(false)
const form = reactive({
  id: '',
  format_id: undefined as string | undefined,
  person_id: undefined as string | undefined,
  feature: GENERAL as string,
  hooks: [] as string[],
  ctas: [] as string[],
  /** the channel it's cast on: its cast are all on it, and perform it there only */
  cast_channel: undefined as string | undefined,
  cast: [] as string[],
  beats: [] as Beat[],
  tags: [] as string[],
  notes: '',
  source_url: ''
})
const requestOpen = useGuardedClose(open, form)
/** the links when it was opened, so saving only changes what changed */
const savedLinks = { hooks: [] as string[], ctas: [] as string[], cast: [] as string[] }

async function edit(row?: Partial<Row<'body_templates'>>) {
  let hooks: string[] = []
  let ctas: string[] = []
  let cast: string[] = []
  if (row?.id) {
    const ok = await run(async () => {
      hooks = must(await db.from('vo_hook_links').select('hook_template_id').eq('body_template_id', row.id!)).map(link => link.hook_template_id)
      ctas = must(await db.from('vo_cta_links').select('cta_template_id').eq('body_template_id', row.id!)).map(link => link.cta_template_id)
      cast = must(await db.from('vo_cast').select('person_id').eq('body_template_id', row.id!)).map(member => member.person_id)
    })
    if (!ok) return
  }
  Object.assign(savedLinks, { hooks, ctas, cast })
  Object.assign(form, {
    id: row?.id ?? '',
    format_id: row?.format_id ?? formatOptions.value[0]?.value,
    // a new VO is written by whoever is signed in (an admin can pick someone else on the shoot)
    person_id: row?.id
      ? row.person_id ?? undefined
      : props.people.some(person => person.id === me.value?.id) ? me.value?.id : undefined,
    feature: row?.feature_id ?? GENERAL,
    // only links to hooks / CTAs on this shoot can be changed here; others are kept
    hooks: hooks.filter(id => props.hooks.some(hook => hook.template_id === id)),
    ctas: ctas.filter(id => props.ctas.some(cta => cta.template_id === id)),
    cast_channel: row?.cast_channel_id ?? undefined,
    // only people on this shoot can be cast or uncast here; others are kept
    cast: cast.filter(id => props.people.some(person => person.id === id)),
    beats: parseBeats(row?.beats),
    tags: [...(row?.tags ?? [])],
    notes: row?.notes ?? '',
    source_url: row?.source_url ?? ''
  })
  open.value = true
}
defineExpose({ edit })

/** why this VO can't be saved by the signed-in user, if it can't */
const blocked = computed(() => {
  if (form.id) return canEditVo(form.person_id) ? null : `Only ${personName(form.person_id)} (who wrote it) or an admin can edit this VO.`
  if (isAdmin.value) return props.people.length ? null : 'Add people to the shoot first.'
  if (!me.value) return 'Your account isn\'t linked to anyone on the cast, so you can\'t write VOs. An admin can link you in Settings → People.'
  if (!props.people.some(person => person.id === me.value!.id)) return `You (${me.value.name}) aren't on this shoot. Add yourself in General to write VOs for it.`
  return null
})
const readonly = computed(() => !!blocked.value)

// One editor block per beat of the chosen format; scripts are kept when the format changes.
watch(() => [form.format_id, open.value] as const, () => {
  const chosen = formatOf(form.format_id)
  if (chosen && !beatsMatchFormat(chosen.beats, form.beats)) form.beats = alignBeats(chosen.beats, form.beats)
})

/**
 * A VO is cast on one channel: the writer's, picked first. Then anyone on the shoot who's on that
 * channel too can be cast; they record the same script, beat for beat, and perform it on that
 * channel only, where their beats can be mixed (cast mixes).
 */
const castChannelOptions = computed(() => props.channels
  .filter(channel => !!form.person_id && props.channelPeople[channel.id]?.includes(form.person_id))
  .map(channel => ({ label: channel.name, value: channel.id })))
const castOptions = computed(() => props.people
  .filter(person => person.id !== form.person_id && !!form.cast_channel && props.channelPeople[form.cast_channel]?.includes(person.id))
  .map(person => ({ label: person.name, value: person.id })))
// a new writer may not be on the cast channel; a new channel keeps only the cast who are on it
watch(() => form.person_id, () => {
  if (form.cast_channel && !castChannelOptions.value.some(option => option.value === form.cast_channel)) form.cast_channel = undefined
})
watch(() => [form.cast_channel, form.person_id], () => {
  form.cast = form.cast.filter(id => castOptions.value.some(option => option.value === id))
})

const featureId = computed(() => form.feature === GENERAL ? null : form.feature)
const feature = computed(() => featureOf(featureId.value ?? undefined))

// Draft the beats in place with AI. The person reviews them before saving.
const drafting = ref(false)
async function draftBeats() {
  if (form.beats.some(beat => beat.script.trim()) && !(await confirmDialog({
    title: 'Replace your beats with an AI draft?',
    description: 'The scripts you have written in each beat are replaced. Nothing is saved until you press Save VO.',
    confirmLabel: 'Replace'
  }))) return
  drafting.value = true
  await run(async () => {
    const response = await $fetch('/api/ai/draft', {
      method: 'POST',
      body: {
        type: 'body' as const,
        formatId: form.format_id!,
        brief: feature.value
          ? `Write it about this feature of the product: ${feature.value.name}${feature.value.description ? ` (${feature.value.description})` : ''}`
          : 'Write it about the product as a whole, not one feature of it.',
        productId: props.productId,
        count: 1
      }
    })
    const draft = response.drafts[0]
    if (!draft?.beats) throw new Error('No draft came back. Try again.')
    form.beats = alignBeats(formatOf(form.format_id)?.beats ?? draft.beats.map(beat => beat.beat), draft.beats)
  })
  drafting.value = false
}

const usesDog = computed(() => bodyUsesDog(form.beats))

// Length is worked out from the script at the speech pace in Settings → Defaults.
const pace = computed(() => Number(settings.value?.words_per_second) || DEFAULT_WORDS_PER_SECOND)
const script = computed(() => form.beats.map(beat => beat.script).join(' '))
const words = computed(() => countWords(script.value))
const estSeconds = computed(() => estimateSeconds(script.value, pace.value))
const target = computed(() => formatOf(form.format_id)?.target_seconds ?? null)
const canSave = computed(() =>
  !readonly.value && !!form.person_id && !!form.format_id && form.beats.length > 0 && form.beats.every(beat => beat.script.trim() !== '')
  && isValidUrl(form.source_url)
)
/** a beat as saved: trimmed, empty alternates dropped, hook types only on a standalone hook beat */
const cleanBeat = (beat: Beat): Beat => {
  const hookBeat = isHookBeat(beat.beat)
  const alternates = (beat.alternates ?? [])
    .map(alternate => ({ script: alternate.script.trim(), ...(hookBeat && alternate.hook_type ? { hook_type: alternate.hook_type } : {}) }))
    .filter(alternate => alternate.script)
  return {
    beat: beat.beat,
    script: beat.script.trim(),
    ...(hookBeat && beat.hook_type ? { hook_type: beat.hook_type } : {}),
    ...(alternates.length ? { alternates } : {})
  }
}

/** Make a link table match the picks, for the links this editor can see (ones on this shoot). */
async function syncLinks(table: 'vo_hook_links' | 'vo_cta_links' | 'vo_cast', voId: string, before: string[], after: string[], onShoot: string[]) {
  const column = table === 'vo_hook_links' ? 'hook_template_id' : table === 'vo_cta_links' ? 'cta_template_id' : 'person_id'
  const removed = before.filter(id => !after.includes(id) && onShoot.includes(id))
  const added = after.filter(id => !before.includes(id))
  if (removed.length) must(await db.from(table).delete().eq('body_template_id', voId).in(column, removed))
  if (added.length) must(await db.from(table).insert(added.map(id => ({ body_template_id: voId, [column]: id }) as never)))
}

async function save() {
  saving.value = true
  let saved: Row<'body_templates'> | null = null
  const isNew = !form.id
  const ok = await run(async () => {
    const fields = {
      format_id: form.format_id!,
      product_id: props.productId,
      feature_id: featureId.value,
      // no cast, no cast channel
      cast_channel_id: form.cast.length ? form.cast_channel ?? null : null,
      beats: form.beats.map(cleanBeat) as unknown as Json,
      est_seconds: estSeconds.value || null,
      tags: form.tags,
      notes: form.notes.trim() || null,
      source_url: normalizeUrl(form.source_url)
    }
    saved = form.id
      ? mustOne(await db.from('body_templates').update(fields).eq('id', form.id).select('*').single())
      : mustOne(await db.from('body_templates').insert({ ...fields, person_id: form.person_id!, shoot_id: props.shootId }).select('*').single())
    await syncLinks('vo_hook_links', saved.id, savedLinks.hooks, form.hooks, props.hooks.map(hook => hook.template_id))
    await syncLinks('vo_cta_links', saved.id, savedLinks.ctas, form.ctas, props.ctas.map(cta => cta.template_id))
    await syncLinks('vo_cast', saved.id, savedLinks.cast, form.cast, props.people.map(person => person.id))
  }, 'VO saved')
  saving.value = false
  if (ok && saved) {
    open.value = false
    emit('saved', saved, isNew)
  }
}
</script>

<template>
  <USlideover :open="open" @update:open="requestOpen" :title="form.id ? 'Edit VO' : 'Write a VO'" :ui="{ content: 'max-w-xl' }">
    <template #actions>
      <UButton
        v-if="!readonly"
        label="Copy from"
        icon="i-lucide-copy"
        size="sm"
        color="neutral"
        variant="subtle"
        :disabled="!form.format_id"
        @click="openCopy"
      />
    </template>
    <template #body>
      <div class="space-y-5">
        <UAlert v-if="blocked" color="warning" variant="subtle" icon="i-lucide-lock" :description="blocked" />
        <UFormField v-else-if="choosesWriter" label="Written by" required help="As an admin you can write a VO for anyone on the shoot. Only they perform it.">
          <USelectMenu v-model="form.person_id" :items="writerOptions" value-key="value" placeholder="Pick someone on the shoot" class="w-full" />
        </UFormField>
        <p v-else class="flex items-center gap-1.5 text-sm text-muted">
          <UIcon name="i-lucide-user" class="size-4" />
          Written by <span class="font-medium text-highlighted">{{ personName(form.person_id) }}</span>, who alone performs it.
        </p>

        <fieldset :disabled="readonly" class="space-y-5">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="About" required class="sm:col-span-2" :help="feature?.description ?? 'A core feature of the product, or the product as a whole'">
              <USelectMenu v-model="form.feature" :items="features" value-key="value" class="w-full" :disabled="readonly" />
            </UFormField>
            <UFormField label="Format" required class="sm:col-span-2">
              <USelect v-model="form.format_id" :items="formatOptions" class="w-full" :disabled="readonly" />
            </UFormField>
            <UFormField label="Cast on" help="The writer's channel the cast perform it on">
              <USelectMenu
                v-model="form.cast_channel"
                :items="castChannelOptions"
                value-key="value"
                placeholder="No cast"
                class="w-full"
                :clear="!!form.cast_channel"
                :disabled="readonly || !castChannelOptions.length"
              />
            </UFormField>
            <UFormField label="Cast with" help="On that channel: they record the same script, and their beats can be mixed (Cast mixes in General)">
              <USelectMenu
                v-model="form.cast"
                :items="castOptions"
                value-key="value"
                multiple
                :placeholder="form.cast_channel ? (castOptions.length ? 'Just the writer' : 'Nobody else is on it') : 'Pick a channel first'"
                class="w-full"
                :disabled="readonly || !form.cast_channel || !castOptions.length"
              />
            </UFormField>
            <UFormField label="Only with hooks" help="Empty = any hook">
              <USelectMenu
                v-model="form.hooks"
                :items="linkItems(props.hooks)"
                value-key="value"
                multiple
                :placeholder="props.hooks.length ? 'Any hook' : 'No hooks on the shoot yet'"
                class="w-full"
                :disabled="readonly || !props.hooks.length"
              />
            </UFormField>
            <UFormField label="Only with CTAs" help="Empty = any CTA">
              <USelectMenu
                v-model="form.ctas"
                :items="linkItems(props.ctas)"
                value-key="value"
                multiple
                :placeholder="props.ctas.length ? 'Any CTA' : 'No CTAs on the shoot yet'"
                class="w-full"
                :disabled="readonly || !props.ctas.length"
              />
            </UFormField>
          </div>
          <p v-if="product && features.length === 1" class="text-xs text-muted">
            {{ product.name }} has no core features yet. Add them on
            <NuxtLink :to="`/brands/${product.brand_id}`" class="text-primary hover:underline">{{ product.brand.name }}'s page</NuxtLink>
            to write VOs about one.
          </p>

          <div v-if="!readonly" class="flex flex-wrap items-center gap-2 rounded-lg bg-elevated/50 p-2">
            <UButton
              label="Draft beats with AI"
              icon="i-lucide-sparkles"
              size="sm"
              color="neutral"
              variant="subtle"
              :loading="drafting"
              :disabled="!form.format_id"
              @click="draftBeats"
            />
            <p class="w-full text-xs text-muted">
              Uses the product, what it's about and the format above. Review the beats before saving.
            </p>
          </div>

          <p v-if="format?.source_url" class="flex items-center gap-1.5 text-xs text-muted">
            Reference for {{ format.code }}: <SourceLink :url="format.source_url" />
          </p>
          <div v-for="beat in form.beats" :key="beat.beat" class="space-y-2 rounded-lg border border-default p-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-medium text-highlighted">{{ beatTitle(beat.beat) }}</span>
              <UBadge
                :label="SHOW_LABELS[showOf(beat.beat)]"
                color="neutral"
                variant="outline"
                size="sm"
              />
            </div>
            <p v-if="guidanceOf(beat.beat)" class="text-xs text-muted">
              {{ guidanceOf(beat.beat) }}
            </p>
            <p v-if="exampleOf(beat.beat)" class="text-xs text-dimmed italic">
              e.g. “{{ exampleOf(beat.beat) }}”
            </p>
            <ScriptEditor v-model="beat.script" />
            <USelectMenu
              v-if="isHookBeat(beat.beat)"
              :model-value="beat.hook_type ?? undefined"
              @update:model-value="beat.hook_type = $event ?? null"
              :items="hookTypeItems"
              value-key="value"
              placeholder="Hook type"
              size="sm"
              class="w-48"
              :disabled="readonly"
            />
            <!-- other wordings: each filmed as its own take -->
            <div v-for="(alternate, index) in beat.alternates ?? []" :key="index" class="space-y-1.5 border-l-2 border-primary/40 pl-3">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-medium text-muted">Wording {{ index + 2 }}</span>
                <UButton
                  v-if="!readonly"
                  icon="i-lucide-x"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :aria-label="`Remove wording ${index + 2}`"
                  @click="removeAlternate(beat, index)"
                />
              </div>
              <ScriptEditor v-model="alternate.script" />
              <USelectMenu
                v-if="isHookBeat(beat.beat)"
                :model-value="alternate.hook_type ?? undefined"
              @update:model-value="alternate.hook_type = $event ?? null"
                :items="hookTypeItems"
                value-key="value"
                placeholder="Hook type"
                size="sm"
                class="w-48"
                :disabled="readonly"
              />
            </div>
            <UButton
              v-if="!readonly"
              label="Another wording"
              icon="i-lucide-plus"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="addAlternate(beat)"
            />
          </div>
          <UAlert
            v-if="onlyMiddleAlternates"
            color="neutral"
            variant="subtle"
            icon="i-lucide-lightbulb"
            description="Other wordings make the biggest difference on the first and last beats: the opening and the close. Middle beats change less of the video."
          />

          <UAlert
            v-if="usesDog"
            color="warning"
            variant="subtle"
            icon="i-lucide-dog"
            title="This VO uses {{dog}}"
            description="A VO is recorded for each channel its writer is on, so write it dog-neutral (“my dog”, “my pup”). With more than one channel, {{dog}} shows each channel's phrase."
          />

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Estimated length" :help="`${words} words at ${pace} words per second (Settings → Defaults)`">
              <div class="flex h-8 items-center gap-2">
                <span class="text-lg font-semibold text-highlighted tabular-nums">{{ estSeconds }}s</span>
                <UBadge
                  v-if="target && estSeconds"
                  :label="estSeconds > target ? `${estSeconds - target}s over the ${target}s target` : `within the ${target}s target`"
                  :color="estSeconds > target ? 'warning' : 'success'"
                  variant="subtle"
                  size="sm"
                />
              </div>
            </UFormField>
            <UFormField label="Tags" help="Pick an existing tag or type a new one">
              <TagInput v-model="form.tags" />
            </UFormField>
          </div>
          <UFormField label="Source" help="Optional link to where this came from: a reference video, a competitor ad, a brief" :error="isValidUrl(form.source_url) ? undefined : 'Enter a valid link'">
            <UInput v-model="form.source_url" type="url" icon="i-lucide-link" placeholder="https://www.tiktok.com/@…" class="w-full" />
          </UFormField>
          <UFormField label="Notes">
            <UTextarea v-model="form.notes" autoresize class="w-full" />
          </UFormField>
        </fieldset>

        <div class="space-y-2 rounded-lg bg-elevated/50 p-3">
          <p class="text-xs font-medium text-muted uppercase">
            Live preview
          </p>
          <PreviewPicker />
          <p v-for="beat in form.beats" :key="beat.beat" class="text-highlighted">
            <span class="mr-1 text-xs font-medium text-muted uppercase">{{ beat.beat }}</span>
            <ScriptPreview :text="beat.script || '…'" :context="context" />
          </p>
        </div>
      </div>
    </template>
    <template #footer>
      <UButton :label="form.id ? 'Save VO' : 'Save and add to the shoot'" :loading="saving" :disabled="!canSave" @click="save" />
    </template>
  </USlideover>

  <UModal
    v-model:open="copyOpen"
    :title="`Copy from another ${format?.code ?? ''} VO`"
    description="Its beats and wordings are copied in. Who writes it, the product and what it's about stay as they are."
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <div class="space-y-3">
        <UInput v-model="copySearch" icon="i-lucide-search" placeholder="Search by writer, product, feature or script" class="w-full" />
        <div class="max-h-[55vh] divide-y divide-default overflow-y-auto rounded-lg border border-default">
          <button
            v-for="row in copyList"
            :key="row.id"
            type="button"
            class="block w-full space-y-1 px-3 py-2.5 text-left hover:bg-elevated/50"
            @click="copyFrom(row)"
          >
            <span class="flex flex-wrap items-center gap-1.5">
              <UBadge :label="personName(row.person_id ?? undefined)" :color="row.person_id === form.person_id ? 'primary' : 'neutral'" variant="subtle" size="sm" />
              <span class="text-xs text-muted">{{ row.product?.name ?? 'No product' }} · {{ row.feature?.name ?? 'the product as a whole' }}</span>
            </span>
            <span v-for="beat in parseBeats(row.beats)" :key="beat.beat" class="block text-sm text-highlighted">
              <span class="mr-1 text-xs font-medium text-muted uppercase">{{ beat.beat }}</span>
              <ScriptPreview :text="beat.script" />
              <span v-if="beat.alternates?.length" class="ml-1 text-xs text-muted">+{{ beat.alternates.length }} more</span>
            </span>
          </button>
          <p v-if="!copyList.length" class="px-3 py-8 text-center text-sm text-muted">
            {{ copyLoading ? 'Loading…' : copySearch ? 'Nothing matches.' : 'No other VOs in this format yet.' }}
          </p>
        </div>
      </div>
    </template>
  </UModal>
</template>
