<script setup lang="ts">
import type { Beat } from '#shared/utils/slots'

// AI drafting for the Library (spec §11). Drafts open in the normal editor: nothing is
// saved until a person reviews it and presses Save.
const props = defineProps<{ kind: 'hook' | 'body' | 'cta' }>()
const emit = defineEmits<{
  use: [draft: {
    script?: string
    caption?: string
    title?: string
    beats?: Beat[]
    angle_id?: string
    format_id?: string
    is_universal?: boolean
    mode?: string
    tags?: string[]
    product_ids?: string[]
  }]
}>()

const run = useAction()
const { formats, angles, angleOptions, productOptions } = useRefData()

const TITLES = { hook: 'Draft hooks with AI', body: 'Draft a body with AI', cta: 'Draft CTAs with AI' }
const MAX = { hook: 12, body: 4, cta: 12 }
const modes = [{ label: 'Sync (on camera)', value: 'sync' }, { label: 'VO over b-roll', value: 'vo' }]

const open = ref(false)
const loading = ref(false)
const drafts = ref<{ title?: string, script?: string, caption?: string, beats?: Beat[] }[]>([])
const form = reactive({
  angle_id: undefined as string | undefined,
  format_id: undefined as string | undefined,
  product_id: undefined as string | undefined,
  mode: 'sync',
  tags: [] as string[],
  universal: false,
  count: props.kind === 'body' ? 2 : 6,
  brief: ''
})
const requestOpen = useGuardedClose(open, () => ({ form, drafts: drafts.value }))

const formatOptions = computed(() =>
  formats.value.filter(format => !format.archived).map(format => ({ label: `${format.code} — ${format.name}`, value: format.id }))
)
watch(open, (isOpen) => {
  if (isOpen) form.format_id ??= formatOptions.value[0]?.value
})

const canGenerate = computed(() => props.kind !== 'body' || !!form.format_id)

async function generate() {
  loading.value = true
  await run(async () => {
    const angle = angles.value.find(a => a.id === form.angle_id)?.name
    const shared = { count: form.count, brief: form.brief.trim() || undefined, productId: form.universal ? undefined : form.product_id }
    const body = props.kind === 'hook'
      ? { type: 'hooks' as const, ...shared, angle, tags: form.tags, universal: form.universal }
      : props.kind === 'cta'
        ? { type: 'ctas' as const, ...shared, mode: form.mode as 'sync' | 'vo', tags: form.tags }
        : { type: 'body' as const, ...shared, angle, formatId: form.format_id! }
    const response = await $fetch('/api/ai/draft', { method: 'POST', body })
    drafts.value = response.drafts
  })
  loading.value = false
}

function use(draft: { title?: string, script?: string, caption?: string, beats?: Beat[] }) {
  if (props.kind === 'hook') emit('use', { script: draft.script, caption: draft.caption, angle_id: form.angle_id, is_universal: form.universal, tags: [...form.tags] })
  else if (props.kind === 'cta') emit('use', { script: draft.script, mode: form.mode, tags: [...form.tags] })
  // a VO drafted for a product is for that product
  else emit('use', { title: draft.title, beats: draft.beats, format_id: form.format_id, angle_id: form.angle_id, product_ids: form.product_id ? [form.product_id] : [] })
  open.value = false
}
</script>

<template>
  <UButton label="Draft with AI" aria-label="Draft with AI" icon="i-lucide-sparkles" color="neutral" variant="subtle" :ui="ICON_ON_MOBILE" class="max-sm:px-1.5" @click="open = true" />

  <UModal
    :open="open"
    @update:open="requestOpen"
    :title="TITLES[props.kind]"
    description="Drafts are suggestions. Open one to edit it, then save it to the Library yourself."
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField v-if="props.kind === 'body'" label="Format" required>
            <USelect v-model="form.format_id" :items="formatOptions" class="w-full" />
          </UFormField>
          <UFormField v-if="props.kind === 'cta'" label="Mode">
            <USelect v-model="form.mode" :items="modes" class="w-full" />
          </UFormField>
          <UFormField v-if="props.kind !== 'cta'" label="Angle">
            <USelectMenu v-model="form.angle_id" :items="angleOptions" value-key="value" placeholder="Any" class="w-full" />
          </UFormField>
          <UFormField label="Product" help="Optional. Its forbidden claims are respected.">
            <USelectMenu
              v-model="form.product_id"
              :items="productOptions"
              value-key="value"
              placeholder="None (brand-agnostic)"
              class="w-full"
              :disabled="form.universal"
            />
          </UFormField>
          <UFormField label="How many">
            <UInput v-model.number="form.count" type="number" min="1" :max="MAX[props.kind]" class="w-full" />
          </UFormField>
        </div>
        <UFormField v-if="props.kind !== 'body'" label="Tags" help="Themes to lean on. Pick existing tags or type new ones.">
          <TagInput v-model="form.tags" />
        </UFormField>
        <USwitch
          v-if="props.kind === 'hook'"
          v-model="form.universal"
          label="Universal hooks"
          description="Brand-agnostic: only {{dog}} is allowed."
        />
        <UFormField label="Brief" help="Optional notes: audience, tone, what to avoid">
          <UTextarea v-model="form.brief" autoresize :rows="2" class="w-full" />
        </UFormField>

        <div v-if="drafts.length" class="divide-y divide-default rounded-lg border border-default">
          <div v-for="(draft, index) in drafts" :key="index" class="flex items-start gap-3 px-3 py-2.5">
            <div class="min-w-0 flex-1 space-y-1 text-sm">
              <p v-if="draft.title" class="font-medium text-highlighted">
                {{ draft.title }}
              </p>
              <template v-if="draft.beats">
                <p v-for="beat in draft.beats" :key="beat.beat">
                  <span class="mr-1 text-xs font-medium text-muted uppercase">{{ beat.beat }}</span>
                  <ScriptPreview :text="beat.script" />
                </p>
              </template>
              <p v-else class="text-highlighted">
                <ScriptPreview :text="draft.script ?? ''" />
              </p>
              <p v-if="draft.caption" class="flex items-start gap-1 text-muted">
                <UIcon name="i-lucide-captions" class="mt-0.5 shrink-0" />
                <ScriptPreview :text="draft.caption" />
              </p>
            </div>
            <UButton label="Review" size="sm" color="neutral" variant="subtle" @click="use(draft)" />
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <UButton
        :label="drafts.length ? 'Generate again' : 'Generate drafts'"
        icon="i-lucide-sparkles"
        :loading="loading"
        :disabled="!canGenerate"
        @click="generate"
      />
    </template>
  </UModal>
</template>
