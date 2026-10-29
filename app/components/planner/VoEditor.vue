<script setup lang="ts">
import type { Row } from '#shared/types/models'
import type { Beat } from '#shared/utils/slots'

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
const { formats, angles, angleOptions, people: allPeople, featureOptions, featureOf, productOf, settings } = useRefData()
const { me, isAdmin, canEditVo } = useMe()
/** admins can write a VO for anyone on the shoot; everyone else writes their own */
const writerOptions = computed(() => props.people.map(person => ({ label: person.name, value: person.id })))
const choosesWriter = computed(() => isAdmin.value && !form.id)
const { context } = usePreviewContext()

const formatOptions = computed(() =>
  formats.value.filter(f => !f.archived).map(f => ({ label: `${f.code} — ${f.name}`, value: f.id }))
)
const formatOf = (id: string | undefined) => formats.value.find(f => f.id === id)
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
  angle_id: undefined as string | undefined,
  person_id: undefined as string | undefined,
  feature: GENERAL as string,
  hooks: [] as string[],
  ctas: [] as string[],
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
    angle_id: row?.angle_id ?? undefined,
    // a new VO is written by whoever is signed in (an admin can pick someone else on the shoot)
    person_id: row?.id
      ? row.person_id ?? undefined
      : props.people.some(person => person.id === me.value?.id) ? me.value?.id : undefined,
    feature: row?.feature_id ?? GENERAL,
    // only links to hooks / CTAs on this shoot can be changed here; others are kept
    hooks: hooks.filter(id => props.hooks.some(hook => hook.template_id === id)),
    ctas: ctas.filter(id => props.ctas.some(cta => cta.template_id === id)),
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
 * Who can be cast on it: people on the shoot who share a channel with the writer. They record
 * the same script, beat for beat, so on a channel they share their beats can be mixed.
 */
const castOptions = computed(() => props.people
  .filter(person => person.id !== form.person_id)
  .map(person => {
    const shared = props.channels.filter(channel =>
      props.channelPeople[channel.id]?.includes(person.id) && !!form.person_id && props.channelPeople[channel.id]?.includes(form.person_id))
    return { label: shared.length ? `${person.name} · ${shared.map(channel => channel.name).join(', ')}` : person.name, value: person.id, disabled: !shared.length }
  })
  .sort((a, b) => Number(a.disabled) - Number(b.disabled)))
// the writer can't also be cast; nor can someone who no longer shares a channel with them
watch(() => form.person_id, () => {
  form.cast = form.cast.filter(id => castOptions.value.some(option => option.value === id && !option.disabled))
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
        angle: angles.value.find(a => a.id === form.angle_id)?.name,
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
      angle_id: form.angle_id ?? null,
      product_id: props.productId,
      feature_id: featureId.value,
      beats: form.beats.map(beat => ({ beat: beat.beat, script: beat.script.trim() })),
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
            <UFormField label="Format" required>
              <USelect v-model="form.format_id" :items="formatOptions" class="w-full" :disabled="readonly" />
            </UFormField>
            <UFormField label="Angle">
              <USelectMenu v-model="form.angle_id" :items="angleOptions" value-key="value" placeholder="None" class="w-full" :disabled="readonly" />
            </UFormField>
            <UFormField label="Cast with" class="sm:col-span-2" help="They record the same script too. Where they share a channel with the writer, their beats can be mixed (VO variations in General).">
              <USelectMenu
                v-model="form.cast"
                :items="castOptions"
                value-key="value"
                multiple
                placeholder="Just the writer"
                class="w-full"
                :disabled="readonly || !form.person_id"
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
              Uses the product, what it's about, the format and the angle above. Review the beats before saving.
            </p>
          </div>

          <UFormField v-for="beat in form.beats" :key="beat.beat" :label="`Beat: ${beat.beat}`" required>
            <template v-if="formatOf(form.format_id)?.beat_descriptions" #help>
              {{ (formatOf(form.format_id)!.beat_descriptions as Record<string, string>)[beat.beat] }}
            </template>
            <ScriptEditor v-model="beat.script" />
          </UFormField>

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
</template>
