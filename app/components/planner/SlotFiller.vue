<script setup lang="ts">
import type { Json } from '#shared/types/database.types'
import type { LoadedShoot } from '#shared/utils/loadShoot'

// Fill in the slots the shoot's scripts use but nothing fills yet, right in the planner, rather
// than hunting through the product and Settings. Custom slots ({{benefit}}, {{offer}}…) are saved
// to the product's own values, so its next shoots have them too; {{dog}} is each channel's dog
// phrase (Settings → Channels, admins only). Marking the shoot as planned freezes the filled
// scripts, so this only shows on drafts.
const props = defineProps<{ bundle: LoadedShoot }>()
const emit = defineEmits<{ changed: [] }>()

const db = useDb()
const run = useAction()
const { isAdmin } = useAccess()

const KIND_ORDER = { hook: 0, cta: 1, body: 2 } as const

/** The words around a slot in a line, with the slot as a blank: "…keeps your dog ___ all day…". */
function excerpt(line: string, slot: string, reach = 40) {
  const token = `{{${slot}}}`
  const at = line.indexOf(token)
  if (at < 0) return ''
  const start = Math.max(0, line.lastIndexOf(' ', Math.max(0, at - reach)) + 1)
  const endSpace = line.indexOf(' ', at + token.length + reach)
  const end = endSpace < 0 ? line.length : endSpace
  // other unfilled slots in the window stay readable as their names
  const text = line.slice(start, end).replace(token, '___').replace(/\{\{(\w+)\}\}/g, '[$1]')
  return `${start > 0 ? '…' : ''}${text.trim()}${end < line.length ? '…' : ''}`
}

/** Each unfilled slot, the codes that use it and an example of it in context, hooks and CTAs first. */
const slots = computed(() => {
  const bySlot = new Map<string, { codes: Set<string>, rank: number, example: string }>()
  for (const item of props.bundle.items) {
    if (item.status === 'skipped') continue
    const script = resolveItemScript(props.bundle, item)
    const line = script.beats ? script.beats.map(beat => beat.script).join(' ') : script.text ?? ''
    for (const slot of script.unfilled) {
      const entry = bySlot.get(slot) ?? { codes: new Set<string>(), rank: 9, example: '' }
      entry.codes.add(item.code)
      // the example comes from the first hook, then CTA, then VO that uses it
      if (KIND_ORDER[item.kind] < entry.rank || !entry.example) {
        entry.example = excerpt(line, slot) || entry.example
      }
      entry.rank = Math.min(entry.rank, KIND_ORDER[item.kind])
      bySlot.set(slot, entry)
    }
  }
  return [...bySlot]
    .map(([name, entry]) => ({
      name,
      codes: [...entry.codes].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
      rank: entry.rank,
      example: entry.example
    }))
    .sort((a, b) => (a.name === 'dog' ? -1 : b.name === 'dog' ? 1 : a.rank - b.rank || a.name.localeCompare(b.name)))
})

/** Channels on the shoot with no dog phrase: what leaves {{dog}} unfilled. */
const channelsWithoutPhrase = computed(() => props.bundle.channels.filter(channel => !channel.dog_phrase?.trim()))

// what's typed, by slot name and by channel id
const values = reactive<Record<string, string>>({})
const phrases = reactive<Record<string, string>>({})
const typed = computed(() =>
  slots.value.some(slot => slot.name !== 'dog' && values[slot.name]?.trim())
  || channelsWithoutPhrase.value.some(channel => phrases[channel.id]?.trim()))

/** collapsed until opened: the blocker list above already says slots need filling */
const open = ref(false)

const saving = ref(false)
async function save() {
  saving.value = true
  const ok = await run(async () => {
    const filled = Object.fromEntries(slots.value
      .filter(slot => slot.name !== 'dog' && values[slot.name]?.trim())
      .map(slot => [slot.name, values[slot.name]!.trim()]))
    if (Object.keys(filled).length) {
      const current = (props.bundle.product.slot_values ?? {}) as Record<string, Json>
      must(await db.from('products').update({ slot_values: { ...current, ...filled } }).eq('id', props.bundle.product.id))
    }
    if (isAdmin.value) {
      for (const channel of channelsWithoutPhrase.value) {
        const phrase = phrases[channel.id]?.trim()
        if (phrase) must(await db.from('channels').update({ dog_phrase: phrase }).eq('id', channel.id))
      }
    }
  }, 'Slots filled')
  saving.value = false
  if (!ok) return
  for (const key of Object.keys(values)) delete values[key]
  for (const key of Object.keys(phrases)) delete phrases[key]
  emit('changed')
}
</script>

<template>
  <UCard v-if="slots.length" :ui="{ body: open ? 'space-y-4' : 'hidden', header: open ? undefined : 'border-b-0' }">
    <template #header>
      <button type="button" class="flex w-full items-start gap-2 text-left" :aria-expanded="open" @click="open = !open">
        <UIcon name="i-lucide-braces" class="mt-0.5 size-5 shrink-0 text-warning" />
        <div class="min-w-0 flex-1">
          <p class="font-medium text-highlighted">
            Fill in slots
            <span class="ml-1 text-sm font-normal text-muted">{{ slots.length }} to fill</span>
          </p>
          <p v-if="open" class="text-sm text-muted">
            These scripts use slots nothing fills yet. Values are saved to {{ props.bundle.product.name }}, so its next shoots have them too.
          </p>
        </div>
        <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="mt-0.5 size-5 shrink-0 text-muted" />
      </button>
    </template>

    <div v-for="slot in slots" :key="slot.name" class="space-y-1.5">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <code class="rounded bg-elevated px-1.5 py-0.5 text-sm font-semibold text-highlighted" v-text="`{{${slot.name}}}`" />
        <span class="text-xs text-muted">used in {{ slot.codes.join(', ') }}</span>
      </div>
      <p v-if="slot.example" class="text-sm text-muted italic">
        "{{ slot.example }}"
      </p>

      <!-- {{dog}}: each channel's own phrase -->
      <template v-if="slot.name === 'dog'">
        <template v-if="isAdmin">
          <UFormField
            v-for="channel in channelsWithoutPhrase"
            :key="channel.id"
            :label="channel.name"
            :help="`How ${channel.name}'s dog is said in a script, e.g. &quot;my Doberman&quot; or &quot;my two dogs&quot;. Saved to the channel.`"
          >
            <UInput v-model="phrases[channel.id]" :placeholder="slot.example ? `Fills the blank: ${slot.example}` : 'my Doberman'" class="w-full" />
          </UFormField>
        </template>
        <p v-else class="text-sm text-muted">
          {{ channelsWithoutPhrase.map(channel => channel.name).join(', ') }} {{ channelsWithoutPhrase.length === 1 ? 'has' : 'have' }} no dog phrase yet.
          An admin can add it in Settings → Channels.
        </p>
      </template>

      <UInput
        v-else
        v-model="values[slot.name]"
        :placeholder="slot.example ? `Fills the blank: ${slot.example}` : `What ${slot.name} means for ${props.bundle.product.name}`"
        class="w-full"
      />
    </div>

    <template v-if="open" #footer>
      <div class="flex items-center justify-end gap-2">
        <span class="mr-auto text-xs text-muted">Or override the line itself in the structure below.</span>
        <UButton label="Save" icon="i-lucide-check" :disabled="!typed" :loading="saving" @click="save" />
      </div>
    </template>
  </UCard>
</template>
