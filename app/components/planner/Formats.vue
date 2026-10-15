<script setup lang="ts">
import type { BrollFormat } from './Broll.vue'

// The shoot's formats: added by hand, or brought in by the VOs on the structure.
// Removing a format takes its VOs off the structure (for everyone) and its b-roll shots with it.
const props = defineProps<{
  shootId: string
  formats: BrollFormat[]
  /** b-roll shots per format id, for the remove confirmation */
  brollCounts: Record<string, number>
  /** shoot item ids (every person's copy) of each format's VOs */
  voItemIds: Record<string, string[]>
  draft: boolean
}>()
const emit = defineEmits<{ changed: [] }>()

const db = useDb()
const run = useAction()
const { formats: allFormats } = useRefData()

const addable = computed(() => allFormats.value
  .filter(format => !format.archived && !props.formats.some(on => on.id === format.id))
  .map(format => ({ label: `${format.code} · ${format.name}`, value: format.id })))
const toAdd = ref<string | undefined>()

async function add(formatId: string | undefined) {
  if (!formatId) return
  await run(async () => {
    must(await db.from('shoot_formats').insert({ shoot_id: props.shootId, format_id: formatId }))
    emit('changed')
  })
  toAdd.value = undefined
}

const removing = ref<BrollFormat | null>(null)

async function remove() {
  const format = removing.value
  if (!format) return
  await run(async () => {
    const itemIds = props.voItemIds[format.id] ?? []
    for (let i = 0; i < itemIds.length; i += 200) {
      must(await db.from('shoot_items').delete().in('id', itemIds.slice(i, i + 200)))
    }
    must(await db.from('broll_shots').delete().eq('shoot_id', props.shootId).eq('format_id', format.id))
    must(await db.from('shoot_formats').delete().eq('shoot_id', props.shootId).eq('format_id', format.id))
    emit('changed')
  }, `${format.code} removed from the plan`)
  removing.value = null
}
</script>

<template>
  <div class="space-y-3">
    <div class="divide-y divide-default rounded-lg border border-default">
      <div v-for="format in props.formats" :key="format.id" class="flex items-start gap-3 px-4 py-3">
        <div class="min-w-0 flex-1 space-y-1">
          <p class="text-highlighted">
            <span class="mr-2 font-mono font-semibold">{{ format.code }}</span>
            <span class="font-medium">{{ format.name }}</span>
          </p>
          <p v-if="format.description" class="text-sm text-muted">
            {{ format.description }}
          </p>
          <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>Beats:</span>
            <UBadge v-for="beat in format.beats" :key="beat" :label="beat" color="neutral" variant="subtle" size="sm" />
            <span v-if="format.usedBy.length" class="ml-2">· Used by {{ format.usedBy.join(', ') }}</span>
            <span v-else class="ml-2">· No VOs yet</span>
          </div>
        </div>
        <UButton
          v-if="props.draft"
          icon="i-lucide-x"
          size="xs"
          color="neutral"
          variant="ghost"
          :aria-label="`Remove ${format.code} from the plan`"
          @click="removing = format"
        />
      </div>
      <p v-if="!props.formats.length" class="px-4 py-6 text-center text-sm text-muted">
        No formats yet. Add one here, or add VOs to the structure and their formats appear automatically.
      </p>
    </div>

    <USelectMenu
      v-model="toAdd"
      :items="addable"
      value-key="value"
      placeholder="Add format"
      icon="i-lucide-plus"
      class="w-full sm:w-72"
      @update:model-value="add"
    />

    <UModal :open="!!removing" :title="`Remove ${removing?.code} from the plan?`" @update:open="removing = $event ? removing : null">
      <template #body>
        <ul v-if="removing" class="list-disc space-y-1 pl-5 text-sm text-default">
          <li v-if="removing.usedBy.length">
            Its {{ removing.usedBy.length }} VO{{ removing.usedBy.length === 1 ? '' : 's' }} ({{ removing.usedBy.join(', ') }}) come off the structure for everyone.
          </li>
          <li>
            Its b-roll section goes<template v-if="props.brollCounts[removing.id]">, with {{ props.brollCounts[removing.id] }} planned shot{{ props.brollCounts[removing.id] === 1 ? '' : 's' }}</template>.
          </li>
        </ul>
      </template>
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="close" />
          <UButton label="Remove" color="error" icon="i-lucide-trash-2" @click="remove" />
        </div>
      </template>
    </UModal>
  </div>
</template>
