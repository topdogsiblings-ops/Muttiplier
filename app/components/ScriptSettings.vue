<script setup lang="ts">
import type { Database, Json } from '#shared/types/database.types'

// Settings → Scripts: what the org tells its own AI about itself (its profile, and the preamble
// written from it or its own), its channel slots (filled per channel, Settings → Channels) and
// its script rules (words flagged while writing, and given to its AI to avoid). Kreate has no AI
// of its own: people connect theirs, through Kreate's AI connector.
const db = useDb()
const run = useAction()
const { settings, load } = useRefData()
const { currentOrg } = useOrg()

const profile = reactive<OrgProfile>({ ...EMPTY_PROFILE })
const preamble = ref('')
/** the preamble is the org's own, not the recommended one */
const customPreamble = ref(false)
const channelSlots = ref<ChannelSlot[]>([])
const rules = ref<ScriptRule[]>([])

watch(settings, (row) => {
  Object.assign(profile, parseOrgProfile(row?.org_profile))
  customPreamble.value = !!row?.ai_preamble?.trim()
  preamble.value = row?.ai_preamble?.trim() || recommendedPreamble(currentOrg.value?.name ?? '', profile)
  channelSlots.value = parseChannelSlots(row?.channel_slots).map(slot => ({ ...slot }))
  rules.value = parseScriptRules(row?.script_rules).map(rule => ({ ...rule, phrases: [...rule.phrases], suggestion: rule.suggestion ?? '' }))
}, { immediate: true })

const recommended = computed(() => recommendedPreamble(currentOrg.value?.name ?? '', parseOrgProfile(profile)))
// while it's the recommended one, it follows the profile as it's edited
watch(recommended, (text) => {
  if (!customPreamble.value) preamble.value = text
})
function editPreamble(text: string) {
  preamble.value = text
  customPreamble.value = text.trim() !== recommended.value
}
function useRecommended() {
  preamble.value = recommended.value
  customPreamble.value = false
}

// slot braces, set in script because they can't be written inside a template interpolation
const OPEN = '{{'
const CLOSE = '}}'

const saving = ref(false)
async function save(patch: Database['public']['Tables']['settings']['Update'], message: string) {
  if (!settings.value) return
  saving.value = true
  await run(async () => {
    must(await db.from('settings').update(patch).eq('id', settings.value!.id))
    await load(true)
  }, message)
  saving.value = false
}

const saveAi = () => save({
  org_profile: { ...parseOrgProfile(profile) } as unknown as Json,
  ai_preamble: customPreamble.value ? preamble.value.trim() : null
}, 'Voice saved')

// --- channel slots -----------------------------------------------------------
const slotName = (text: string) => text.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
const slotProblem = (slot: ChannelSlot, index: number) => {
  const name = slotName(slot.name)
  if (!name) return 'Give it a name'
  if ((BUILT_IN_SLOTS as readonly string[]).includes(name)) return `{{${name}}} is built in`
  if (channelSlots.value.some((other, at) => at < index && slotName(other.name) === name)) return 'Already a channel slot'
  return null
}
const slotsValid = computed(() => channelSlots.value.every((slot, index) => !slotProblem(slot, index)))
const saveSlots = () => save({
  channel_slots: channelSlots.value.map(slot => ({ name: slotName(slot.name), description: slot.description.trim(), example: slot.example.trim() })) as unknown as Json
}, 'Channel slots saved')

// --- script rules --------------------------------------------------------------
const rulesValid = computed(() => rules.value.every(rule => rule.phrases.length && rule.message.trim()))
const saveRules = () => save({
  script_rules: parseScriptRules(rules.value) as unknown as Json
}, 'Script rules saved')
</script>

<template>
  <div class="space-y-4">
    <UCard>
      <template #header>
        <h3 class="font-semibold text-highlighted">
          Your voice
        </h3>
        <p class="text-sm text-muted">
          Who {{ currentOrg?.name ?? 'your organisation' }} is and how its scripts should sound. When you connect your own AI to Kreate, it's told this before it writes anything.
        </p>
      </template>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="What does your organisation do?">
          <UInput v-model="profile.about" class="w-full" placeholder="a UGC agency making ads for beauty brands" />
        </UFormField>
        <UFormField label="What do the ads sell?">
          <UInput v-model="profile.products" class="w-full" placeholder="skincare and haircare" />
        </UFormField>
        <UFormField label="Who films them?">
          <UInput v-model="profile.creators" class="w-full" placeholder="creators filming their routines at home" />
        </UFormField>
        <UFormField label="Who are they for?">
          <UInput v-model="profile.audience" class="w-full" placeholder="women in their 20s and 30s who love skincare" />
        </UFormField>
        <UFormField label="How should scripts sound?">
          <UInput v-model="profile.voice" class="w-full" placeholder="warm, funny, never salesy" />
        </UFormField>
        <UFormField label="Spelling">
          <USelect v-model="profile.language" :items="LANGUAGES" class="w-full" placeholder="Any" />
        </UFormField>
      </div>
      <UFormField
        label="Preamble"
        class="mt-4"
        :help="customPreamble ? 'Your own wording. The answers above no longer change it.' : 'Written from the answers above. Edit it to say it your own way.'"
      >
        <UTextarea :model-value="preamble" autoresize :rows="3" class="w-full" @update:model-value="editPreamble(String($event))" />
      </UFormField>
      <template #footer>
        <div class="flex flex-wrap gap-2">
          <UButton label="Save" :loading="saving" @click="saveAi" />
          <UButton v-if="customPreamble" label="Use the recommended preamble" color="neutral" variant="subtle" @click="useRecommended" />
        </div>
      </template>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="font-semibold text-highlighted">
          Channel slots
        </h3>
        <p class="text-sm text-muted">
          Slots each channel fills with its own words, set on each channel in the Channels tab: say <code v-pre>{{pet}}</code> as “my Doberman” on one channel and “our two cats” on another.
          A line that uses one is filmed once per channel; any other line is filmed once and used on all of a person's channels.
        </p>
      </template>
      <div class="space-y-3">
        <div v-for="(slot, index) in channelSlots" :key="index" class="grid gap-2 sm:grid-cols-[10rem_1fr_1fr_auto] sm:items-start">
          <UFormField :error="slotProblem(slot, index) ?? false">
            <UInput v-model="slot.name" placeholder="pet" class="w-full font-mono">
              <template #leading>
                <span class="text-xs text-muted" v-text="OPEN" />
              </template>
              <template #trailing>
                <span class="text-xs text-muted" v-text="CLOSE" />
              </template>
            </UInput>
          </UFormField>
          <UInput v-model="slot.description" placeholder="How the channel's pet is said" class="w-full" />
          <UInput v-model="slot.example" placeholder="e.g. my Doberman" class="w-full" />
          <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" aria-label="Remove" @click="channelSlots.splice(index, 1)" />
        </div>
        <p v-if="!channelSlots.length" class="text-sm text-muted">
          No channel slots: every line reads the same on every channel.
        </p>
        <UButton label="Add a channel slot" icon="i-lucide-plus" color="neutral" variant="subtle" size="sm" @click="channelSlots.push({ name: '', description: '', example: '' })" />
      </div>
      <template #footer>
        <div class="space-y-2">
          <p class="text-xs text-muted">
            Removing one leaves it in existing scripts as an ordinary slot, filled in on each shoot.
          </p>
          <UButton label="Save channel slots" :loading="saving" :disabled="!slotsValid" @click="saveSlots" />
        </div>
      </template>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="font-semibold text-highlighted">
          Script rules
        </h3>
        <p class="text-sm text-muted">
          Words you don't want in your scripts. They're underlined wherever a script is written, with your warning, and your connected AI is told to avoid them. Plurals are caught too.
        </p>
      </template>
      <div class="space-y-4">
        <div v-for="(rule, index) in rules" :key="index" class="space-y-2 rounded-md p-3 ring ring-default">
          <div class="flex items-start gap-2">
            <UFormField label="Words or phrases" class="flex-1" help="Press Enter after each">
              <UInputTags v-model="rule.phrases" class="w-full" placeholder="owner" />
            </UFormField>
            <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" aria-label="Remove rule" class="mt-6" @click="rules.splice(index, 1)" />
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <UFormField label="Warning">
              <UInput v-model="rule.message" class="w-full" placeholder="We don't say “owners”: it's too cold." />
            </UFormField>
            <UFormField label="Say instead" hint="Optional">
              <UInput v-model="rule.suggestion" class="w-full" placeholder="pet parent" />
            </UFormField>
          </div>
        </div>
        <p v-if="!rules.length" class="text-sm text-muted">
          No script rules yet.
        </p>
        <UButton label="Add a rule" icon="i-lucide-plus" color="neutral" variant="subtle" size="sm" @click="rules.push({ phrases: [], message: '', suggestion: '' })" />
      </div>
      <template #footer>
        <UButton label="Save script rules" :loading="saving" :disabled="!rulesValid" @click="saveRules" />
      </template>
    </UCard>
  </div>
</template>
