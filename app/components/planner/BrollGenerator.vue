<script setup lang="ts">
import type { BrollSection } from './Broll.vue'
import type { DraftBrollShot } from '~~/server/api/ai/broll.post'

// "Generate b-roll": drafts shots for every section from the brand, product, formats, beat
// descriptions and VO scripts. Drafts are reviewed here; only ticked shots are added.
const props = defineProps<{
  shootId: string
  shootCode: string
  sections: BrollSection[]
  nextOrder: number
}>()
const emit = defineEmits<{ added: [] }>()

const db = useDb()
const run = useAction()

const open = ref(false)
const loading = ref(false)
const adding = ref(false)
const drafts = ref<DraftBrollShot[]>([])
const picked = ref<Set<number>>(new Set())
const requestOpen = useGuardedClose(open, () => ({ drafts: drafts.value, picked: [...picked.value] }))

async function generate() {
  open.value = true
  loading.value = true
  drafts.value = []
  await run(async () => {
    const response = await $fetch('/api/ai/broll', { method: 'POST', body: { shootCode: props.shootCode } })
    drafts.value = response.shots
    picked.value = new Set(response.shots.map((_, index) => index))
  })
  loading.value = false
}

/** Drafts grouped as section -> beat, in the planner's order. */
const grouped = computed(() => props.sections
  .map(section => ({
    section,
    beats: section.beats
      .map(beat => ({
        beat,
        shots: drafts.value
          .map((shot, index) => ({ shot, index }))
          .filter(({ shot }) => shot.format_id === section.formatId && shot.beat === beat)
      }))
      .filter(entry => entry.shots.length)
  }))
  .filter(entry => entry.beats.length))

function toggle(index: number) {
  const next = new Set(picked.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  picked.value = next
}

async function add() {
  const rows = drafts.value.filter((_, index) => picked.value.has(index))
  if (!rows.length) return
  adding.value = true
  const ok = await run(async () => {
    must(await db.from('broll_shots').insert(rows.map((shot, index) => ({
      shoot_id: props.shootId,
      channel_id: null,
      format_id: shot.format_id,
      beat: shot.beat,
      description: shot.description,
      product_visible: shot.product_visible,
      min_clips: shot.min_clips,
      sort_order: props.nextOrder + index
    }))))
  }, `Added ${rows.length} b-roll shot${rows.length === 1 ? '' : 's'}`)
  adding.value = false
  if (ok) {
    open.value = false
    emit('added')
  }
}
</script>

<template>
  <UButton label="Generate b-roll" icon="i-lucide-sparkles" color="neutral" variant="subtle" @click="generate" />

  <UModal
    :open="open"
    @update:open="requestOpen"
    title="Suggested b-roll"
    description="Drafted from the product, brand, formats, beat descriptions and VO scripts. Untick anything you don't want."
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div v-if="loading" class="flex items-center justify-center gap-2 py-12 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        Planning shots for every section…
      </div>
      <p v-else-if="!drafts.length" class="py-8 text-center text-sm text-muted">
        No suggestions came back. Try again.
      </p>
      <div v-else class="max-h-[60vh] space-y-4 overflow-y-auto">
        <div v-for="entry in grouped" :key="entry.section.value">
          <h3 class="mb-1 font-semibold text-highlighted">
            {{ entry.section.label }}
          </h3>
          <div v-for="beatEntry in entry.beats" :key="beatEntry.beat" class="mb-2">
            <p class="mb-1 text-xs font-medium text-muted uppercase">
              {{ beatEntry.beat }}
            </p>
            <label
              v-for="{ shot, index } in beatEntry.shots"
              :key="index"
              class="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-elevated/50"
            >
              <UCheckbox :model-value="picked.has(index)" class="mt-0.5" @update:model-value="toggle(index)" />
              <span class="min-w-0 flex-1 text-sm text-highlighted">{{ shot.description }}</span>
              <UBadge v-if="shot.product_visible" label="product" icon="i-lucide-package" color="neutral" variant="subtle" size="sm" />
              <span class="shrink-0 text-xs text-muted tabular-nums">{{ shot.min_clips }} clips</span>
            </label>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <UButton label="Generate again" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :disabled="loading" @click="generate" />
        <UButton
          :label="`Add ${picked.size} shot${picked.size === 1 ? '' : 's'}`"
          :loading="adding"
          :disabled="loading || !picked.size"
          @click="add"
        />
      </div>
    </template>
  </UModal>
</template>
