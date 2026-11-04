<script setup lang="ts">
// A textarea with `{{slot}}` highlighting: a styled copy of the text sits behind a
// transparent textarea, both in the same grid cell so they wrap and grow together.
// Slots are highlighted as soon as the closing braces are typed: ones that fill themselves
// (built-ins and the org's channel slots) in one colour, custom slots (filled in on each shoot) in
// another. While the editor has focus, a palette of those slots is shown and clicking one inserts
// it at the cursor. The org's script rules (Settings → Scripts) are underlined, with their warnings.
const props = withDefaults(defineProps<{
  placeholder?: string
  disabled?: boolean
  /** slots to flag as errors */
  invalidSlots?: string[]
  /** show the slot palette while focused */
  palette?: boolean
}>(), { palette: true })

const model = defineModel<string>({ default: '' })

const { slots, isBuiltIn } = useSlotNames()
const { settings } = useRefData()
const segments = computed(() => renderSegments(model.value))
const custom = computed(() => extractSlots(model.value).filter(name => !isBuiltIn(name)))
const rules = computed(() => parseScriptRules(settings.value?.script_rules))
const flagged = computed(() => flaggedWords(model.value, rules.value))
/** each broken rule once, with the words that broke it */
const warnings = computed(() => {
  const byRule = new Map<ScriptRule, string[]>()
  for (const word of flagged.value) {
    const words = byRule.get(word.rule) ?? []
    if (!words.some(text => text.toLowerCase() === word.text.toLowerCase())) words.push(word.text)
    byRule.set(word.rule, words)
  }
  return [...byRule].map(([rule, words]) => ({ rule, words }))
})

function slotClass(name: string) {
  if (props.invalidSlots?.includes(name)) return 'bg-error/20 text-error'
  if (isBuiltIn(name)) return 'bg-primary/20 text-primary'
  return 'bg-info/15 text-info'
}

/** `{{name}}`, built in script because braces can't be written inside a template interpolation */
const token = (name: string) => `{{${name}}}`

const textarea = useTemplateRef<HTMLTextAreaElement>('textarea')
const focused = ref(false)

function insert(name: string) {
  const el = textarea.value
  const text = token(name)
  const start = el?.selectionStart ?? model.value.length
  const end = el?.selectionEnd ?? start
  model.value = model.value.slice(0, start) + text + model.value.slice(end)
  nextTick(() => {
    el?.focus()
    el?.setSelectionRange(start + text.length, start + text.length)
  })
}
</script>

<template>
  <div class="space-y-1.5" @focusin="focused = true" @focusout="focused = false">
    <div
      class="grid rounded-md bg-default text-sm ring ring-inset ring-accented focus-within:ring-2 focus-within:ring-primary"
      :class="{ 'opacity-75': props.disabled }"
    >
      <div aria-hidden="true" class="layer pointer-events-none text-highlighted">
        <template v-for="(segment, index) in segments" :key="index">
          <template v-if="segment.type === 'text'">
            <span
              v-for="(run, at) in splitFlagged(segment.text, rules)"
              :key="at"
              :class="{ 'underline decoration-warning decoration-wavy underline-offset-2': run.flagged }"
            >{{ run.text }}</span>
          </template>
          <span v-else class="rounded-sm" :class="slotClass(segment.name)">{{ segment.raw }}</span>
        </template>
        <!-- keeps a trailing newline from collapsing -->
        <span>&#8203;</span>
      </div>
      <textarea
        ref="textarea"
        v-model="model"
        class="layer resize-none overflow-hidden bg-transparent text-transparent caret-[var(--ui-text-highlighted)] outline-none placeholder:text-dimmed"
        :placeholder="props.placeholder"
        :disabled="props.disabled"
        spellcheck="true"
      />
    </div>

    <p v-if="custom.length" class="text-xs text-muted">
      Custom {{ custom.length === 1 ? 'slot' : 'slots' }} {{ custom.map(token).join(', ') }}: filled in on each shoot.
    </p>

    <p v-for="(warning, index) in warnings" :key="index" class="flex items-start gap-1 text-xs text-warning">
      <UIcon name="i-lucide-triangle-alert" class="mt-0.5 shrink-0" />
      <span>
        {{ warning.rule.message || `Avoid ${warning.words.map(text => `“${text}”`).join(', ')}.` }}
        <template v-if="warning.rule.suggestion">Try “{{ warning.rule.suggestion }}” for {{ warning.words.map(text => `“${text}”`).join(', ') }}.</template>
      </span>
    </p>

    <div v-if="props.palette && focused && !props.disabled" class="flex flex-wrap items-center gap-1">
      <span class="mr-0.5 text-xs text-muted">Insert:</span>
      <UTooltip
        v-for="slot in slots"
        :key="slot.name"
        :text="props.invalidSlots?.includes(slot.name) ? 'Not allowed here' : slot.description"
      >
        <button
          type="button"
          class="rounded px-1.5 py-0.5 font-mono text-xs ring ring-inset transition"
          :class="props.invalidSlots?.includes(slot.name)
            ? 'text-dimmed line-through ring-default'
            : slot.builtIn
              ? 'bg-primary/10 text-primary ring-primary/30 hover:bg-primary/20'
              : 'bg-elevated text-default ring-default hover:bg-accented/60'"
          @mousedown.prevent
          @click="insert(slot.name)"
        >
          {{ token(slot.name) }}
        </button>
      </UTooltip>
      <span class="text-xs text-dimmed">
        or type your own, like {{ token('benefit') }}, and fill it in on the shoot.
      </span>
    </div>
  </div>
</template>

<style scoped>
.layer {
  grid-area: 1 / 1;
  min-height: 4.5rem;
  padding: 0.5rem 0.75rem;
  font: inherit;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
