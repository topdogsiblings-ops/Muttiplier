<script setup lang="ts">
import type { LoadedShoot } from '#shared/utils/loadShoot'
import type { Element, ElementKind, Score } from '#shared/utils/batchLoop'
import type { BatchLoop, BatchRow, BatchStatus } from '~/composables/useBatchLoop'

// A Live shoot's batches (spec §14b). Each goes batched -> rendering (Showdog) -> submitted (to the
// brand) -> measured: every element it used is scored winner, mid or loser by the guidelines. Once
// every batch is measured the next can be made: dropped elements are left out, the exploit share
// goes to recipes with winning elements and the rest explores untried ones. Nothing is batched
// twice. Making one writes batches/B01.json (+ CSV) and an empty renders/B01/<channel>/ per channel
// for Showdog, all of it grouped by channel; the recipes themselves were written when it went Live.
const props = defineProps<{ bundle: LoadedShoot, loop: BatchLoop }>()
const emit = defineEmits<{ changed: [] }>()

const db = useDb()
// admins run the batches (the database enforces it); members can see them
const { isAdmin } = useAccess()
const run = useAction()
const toast = useToast()
const dropbox = useDropbox()
const shoot = computed(() => props.bundle.shoot)
const base = computed(() => shootFolder(props.bundle))
const loop = props.loop
const { batches, recipes, batched, records, canBatch } = loop

// --- the next batch ----------------------------------------------------------------------
const size = computed(() => batchSize(recipes.value.length, Number(shoot.value.submission_rate)))
const nextCode = computed(() => nextBatchCode(batches.value.map(batch => batch.code)))
const exploitPct = ref(Math.round(Number(shoot.value.exploit_share ?? DEFAULT_EXPLOIT_SHARE) * 100))
watch(() => shoot.value.exploit_share, value => exploitPct.value = Math.round(Number(value ?? DEFAULT_EXPLOIT_SHARE) * 100))
const preview = computed(() => pickBatch(recipes.value, { size: size.value, exclude: batched.value, exploitShare: exploitPct.value / 100, records: records.value }))
const waitingOn = computed(() => batches.value.filter(batch => batch.status !== 'measured').map(batch => batch.code))

async function saveShare() {
  const share = Math.min(100, Math.max(0, Math.round(Number(exploitPct.value) || 0)))
  exploitPct.value = share
  await run(async () => {
    must(await db.from('shoots').update({ exploit_share: share / 100 }).eq('id', shoot.value.id))
  })
  emit('changed')
}

const generating = ref(false)
async function generate() {
  const status = await dropbox.refresh().catch(() => null)
  if (!status?.connected) {
    toast.add({ title: 'Dropbox isn\'t connected', description: 'An admin can connect it in Settings → Dropbox.', color: 'warning', icon: 'i-lucide-cloud-off' })
    return
  }
  generating.value = true
  const code = nextCode.value
  const pick = preview.value
  // written grouped by channel, in pick order within each
  const chosen = batchOrder(pick.recipes)
  const ok = await run(async () => {
    if (!canBatch.value) throw new Error(`Measure ${waitingOn.value.join(', ')} first`)
    if (!chosen.length) throw new Error('Nothing left to batch: every recipe has been batched or has a dropped element')
    const manifestVersion = loop.manifest.value!.version
    await dropboxUploader.writeText(`${base.value}/batches/${code}.json`, JSON.stringify({
      // 8: recipes.json is written when the shoot goes Live; a treated version's files are the
      // treated copies (sidecars) Klip made; `pick` says how many exploit winners and how many
      // explore. 7: beats, hook and CTA can be shown screen (text: `text`, no file) or voice_note;
      // treatments can be combinations (`parts`). 6: recipe.treatment. 5: standalone VOs, each beat's
      // option and show. 4: hook.hook_type. 3: mixed VOs. 2: renders split by channel
      schema_version: 8,
      shoot: shoot.value.code,
      batch: code,
      manifest_version: manifestVersion,
      generated_at: new Date().toISOString(),
      pick: { exploit: pick.exploit, explore: pick.explore },
      // the recipes are in ../recipes.json; render each into renders/<batch>/<channel>/<recipe id>.mp4
      recipes_file: 'recipes.json',
      renders_folder: `renders/${code}`,
      recipes: chosen.map(recipe => recipe.id)
    }, null, 2))
    await dropboxUploader.writeText(`${base.value}/batches/${code}.csv`, batchCsv(chosen))
    for (const channel of new Set(chosen.map(recipe => recipe.channel))) {
      await dropboxEnsureFolder(`${base.value}/${renderFolder(code, channel)}`)
    }
    must(await db.from('shoot_shortlists').insert({
      shoot_id: shoot.value.id,
      code,
      size: chosen.length,
      entry_ids: chosen.map(recipe => recipe.id),
      manifest_version: manifestVersion,
      exploit_share: exploitPct.value / 100
    }))
  }, `${code}: ${chosen.length} recipe${chosen.length === 1 ? '' : 's'} batched`)
  generating.value = false
  if (ok) await loop.load()
}

// --- statuses ------------------------------------------------------------------------------
const NEXT: Partial<Record<BatchStatus, { status: BatchStatus, label: string, icon: string }>> = {
  batched: { status: 'rendering', label: 'Rendering', icon: 'i-lucide-clapperboard' },
  rendering: { status: 'submitted', label: 'Submitted', icon: 'i-lucide-send' }
}
async function advance(batch: BatchRow, status: BatchStatus) {
  await run(() => loop.setStatus(batch, status), `${batch.code}: ${BATCH_STATUS_LABELS[status]}`)
}

// --- measuring: score every element a batch used ----------------------------------------
const measuring = ref<BatchRow | null>(null)
const measureElements = computed(() => measuring.value ? batchElements(loop.batchRecipes(measuring.value)) : [])
const measureScores = computed(() => measuring.value ? loop.scoresOf(measuring.value) : new Map<string, Score>())
const unscored = computed(() => measureElements.value.filter(element => !measureScores.value.has(elementId(element))).length)
const grouped = (elements: Element[]) => ELEMENT_KINDS
  .map(kind => ({ kind, elements: elements.filter(element => element.kind === kind) }))
  .filter(group => group.elements.length)

async function score(element: Element, value: Score) {
  if (!measuring.value) return
  const next = measureScores.value.get(elementId(element)) === value ? null : value
  await run(() => loop.setScore(measuring.value!, element.kind, element.key, next))
}

const savingMeasure = ref(false)
async function markMeasured() {
  if (!measuring.value || unscored.value) return
  savingMeasure.value = true
  const ok = await run(() => loop.setStatus(measuring.value!, 'measured'), `${measuring.value.code} measured: the next batch is open`)
  savingMeasure.value = false
  if (ok) measuring.value = null
}

// --- every element: where it stands, dropped or kept by hand -------------------------------
const elementsOpen = ref(false)
const allElements = computed(() => batchElements(recipes.value))
const stateOf = (element: Element) => elementState(records.value.get(elementId(element)))
const STATE_BADGE = {
  winner: { label: 'Winner', color: 'success' },
  tried: { label: 'Tried', color: 'neutral' },
  untried: { label: 'Untried', color: 'info' },
  dropped: { label: 'Dropped', color: 'error' }
} as const
const droppedCount = computed(() => allElements.value.filter(element => stateOf(element) === 'dropped').length)

async function toggleDrop(element: Element) {
  const record = records.value.get(elementId(element))
  const dropped = stateOf(element) === 'dropped'
  // a manual override that matches the automatic rule goes back to automatic
  const auto = !!record && record.losers >= DROP_AFTER_LOSSES && record.winners === 0
  await run(() => loop.setDropped(element.kind, element.key, auto === !dropped ? null : !dropped))
}

// --- naming elements ---------------------------------------------------------------------
const plan = computed(() => loop.manifest.value?.plan)
const formatName = (code: string) => props.bundle.plannedFormats.find(format => format.code === code)?.name ?? ''
const scriptOf = (kind: string, code: string) => {
  const clip = loop.manifest.value?.clips.find(clip => clip.kind === kind && (clip as { code?: string }).code === code) as { script?: string } | undefined
  return clip?.script ?? ''
}
function describe(element: Element): { title: string, detail: string } {
  switch (element.kind) {
    case 'treatment': return { title: plan.value?.treatments?.find(t => t.slug === element.key)?.name ?? element.key, detail: '' }
    case 'format': return { title: element.key, detail: formatName(element.key) }
    case 'person': return { title: plan.value?.people?.find(person => person.slug === element.key)?.name ?? element.key, detail: '' }
    case 'hook_type': return { title: element.key, detail: '' }
    case 'hook': return { title: element.key, detail: scriptOf('hook', element.key) }
    case 'cta': return { title: element.key, detail: scriptOf('cta', element.key) }
    case 'vo': {
      const clip = loop.manifest.value?.clips.find(clip => clip.kind === 'vo' && (clip as { code?: string }).code === element.key) as { format?: string | null } | undefined
      return { title: element.key, detail: clip?.format ? formatName(clip.format) || clip.format : '' }
    }
  }
}
const tally = (element: Element) => {
  const record = records.value.get(elementId(element))
  return record ? `${record.winners}W · ${record.mids}M · ${record.losers}L` : ''
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const pct = (value: number | null) => value === null ? null : Math.round(Number(value) * 100)
const KIND_ICONS: Record<ElementKind, string> = {
  treatment: 'i-lucide-sparkles', hook: 'i-lucide-anchor', format: 'i-lucide-layout-template', hook_type: 'i-lucide-tags',
  vo: 'i-lucide-mic', cta: 'i-lucide-megaphone', person: 'i-lucide-user'
}
</script>

<template>
  <div class="space-y-4">
    <!-- the next batch -->
    <UCard :ui="{ body: 'space-y-3' }">
      <div class="flex flex-wrap items-start gap-3">
        <UIcon name="i-lucide-layers" class="mt-0.5 size-6 shrink-0 text-primary" />
        <div class="min-w-0 flex-1">
          <p class="font-medium text-highlighted">
            Next batch: {{ nextCode }}
          </p>
          <p v-if="!recipes.length" class="text-sm text-muted">
            {{ loop.loading.value ? 'Loading the recipes…' : 'No recipes: the Live manifest made none.' }}
          </p>
          <p v-else-if="!canBatch" class="text-sm text-muted">
            Measure {{ waitingOn.join(', ') }} first: each batch learns from the scores of the ones before it.
          </p>
          <p v-else class="text-sm text-muted">
            {{ formatNumber(preview.recipes.length) }} recipes ({{ Math.round(Number(shoot.submission_rate) * 1000) / 10 }}% of {{ formatNumber(recipes.length) }}):
            <template v-if="preview.exploit">
              {{ formatNumber(preview.exploit) }} exploit winners, {{ formatNumber(preview.explore) }} explore.
            </template>
            <template v-else>
              all exploring, until something wins.
            </template>
            <template v-if="preview.dropped">
              {{ formatNumber(preview.dropped) }} left out for a dropped element.
            </template>
          </p>
        </div>
        <UButton
          v-if="isAdmin"
          :label="`Make ${nextCode}`"
          icon="i-lucide-sparkles"
          size="sm"
          :loading="generating"
          :disabled="!canBatch || !preview.recipes.length"
          @click="generate"
        />
      </div>
      <div v-if="isAdmin" class="flex flex-wrap items-center gap-2 text-sm">
        <span class="text-muted">Exploit</span>
        <UInput v-model.number="exploitPct" type="number" min="0" max="100" class="w-20" size="sm" @change="saveShare">
          <template #trailing>
            <span class="text-xs text-muted">%</span>
          </template>
        </UInput>
        <span class="text-muted">· explore {{ 100 - exploitPct }}%</span>
        <span class="text-xs text-dimmed">Exploit: recipes with elements that have won. Explore: recipes with elements not tried yet.</span>
      </div>
    </UCard>

    <!-- the batches so far -->
    <ul v-if="batches.length" class="divide-y divide-default rounded-lg border border-default text-sm">
      <li v-for="(batch, index) in [...batches].reverse()" :key="batch.code" class="flex flex-wrap items-center gap-2 px-3 py-2">
        <span class="size-2.5 rounded-sm" :class="BATCH_COLORS[(batches.length - 1 - index) % BATCH_COLORS.length]" />
        <span class="font-mono font-semibold text-highlighted">{{ batch.code }}</span>
        <UBadge :label="BATCH_STATUS_LABELS[batch.status]" :color="BATCH_STATUS_COLORS[batch.status]" variant="subtle" size="sm" />
        <span class="text-muted">{{ batch.size }} recipe{{ batch.size === 1 ? '' : 's' }}</span>
        <span v-if="pct(batch.exploit_share) !== null" class="text-xs text-dimmed">{{ pct(batch.exploit_share) }}% exploit</span>
        <span class="ml-auto text-xs text-muted">{{ BATCH_STATUS_LABELS[batch.status] }} {{ when(batch.status_at) }}</span>
        <UButton
          v-if="isAdmin && NEXT[batch.status]"
          :label="`Mark ${NEXT[batch.status]!.label.toLowerCase()}`"
          :icon="NEXT[batch.status]!.icon"
          size="xs"
          color="neutral"
          variant="subtle"
          @click="advance(batch, NEXT[batch.status]!.status)"
        />
        <UButton
          v-else-if="isAdmin"
          :label="batch.status === 'measured' ? 'Scores' : 'Measure'"
          icon="i-lucide-gauge"
          size="xs"
          :color="batch.status === 'measured' ? 'neutral' : 'primary'"
          :variant="batch.status === 'measured' ? 'ghost' : 'solid'"
          @click="measuring = batch"
        />
      </li>
    </ul>

    <!-- every element: where it stands -->
    <UCard :ui="{ body: elementsOpen ? 'space-y-4' : 'hidden' }">
      <template #header>
        <button type="button" class="flex w-full items-center gap-2 text-left" :aria-expanded="elementsOpen" @click="elementsOpen = !elementsOpen">
          <UIcon name="i-lucide-chevron-right" class="size-4 text-muted transition-transform" :class="{ 'rotate-90': elementsOpen }" />
          <h2 class="flex-1 font-semibold text-highlighted">
            Elements
          </h2>
          <UBadge v-if="droppedCount" :label="`${droppedCount} dropped`" color="error" variant="subtle" size="sm" />
        </button>
      </template>
      <p class="text-sm text-muted">
        Scores from measured batches. An element is dropped after {{ DROP_AFTER_LOSSES }} losers with no wins; drop or keep any by hand.
      </p>
      <div v-for="group in grouped(allElements)" :key="group.kind" class="space-y-1">
        <p class="flex items-center gap-1.5 text-xs font-medium text-muted uppercase">
          <UIcon :name="KIND_ICONS[group.kind]" class="size-3.5" />
          {{ ELEMENT_LABELS[group.kind] }}
        </p>
        <div v-for="element in group.elements" :key="elementId(element)" class="flex items-center gap-2 text-sm">
          <span class="w-28 shrink-0 truncate font-medium text-highlighted">{{ describe(element).title }}</span>
          <span class="min-w-0 flex-1 truncate text-muted">{{ describe(element).detail }}</span>
          <span class="text-xs text-dimmed tabular-nums">{{ tally(element) }}</span>
          <UBadge :label="STATE_BADGE[stateOf(element)].label" :color="STATE_BADGE[stateOf(element)].color" variant="subtle" size="sm" />
          <UIcon v-if="records.get(elementId(element))?.manual" name="i-lucide-hand" class="size-3.5 text-muted" title="Set by hand" />
          <UButton
            v-if="isAdmin"
            :label="stateOf(element) === 'dropped' ? 'Keep' : 'Drop'"
            size="xs"
            :color="stateOf(element) === 'dropped' ? 'neutral' : 'error'"
            variant="ghost"
            @click="toggleDrop(element)"
          />
        </div>
      </div>
    </UCard>

    <!-- measuring a batch -->
    <UModal :open="!!measuring" :title="measuring ? `Measure ${measuring.code}` : ''" :ui="{ content: 'max-w-2xl' }" @update:open="open => { if (!open) measuring = null }">
      <template #body>
        <div class="space-y-4">
          <ul class="space-y-1 rounded-lg bg-elevated/50 p-3 text-sm">
            <li v-for="value in SCORES" :key="value">
              <span class="font-medium" :class="{ 'text-success': value === 'winner', 'text-error': value === 'loser', 'text-highlighted': value === 'mid' }">{{ SCORE_GUIDE[value].label }}:</span>
              <span class="text-muted"> {{ SCORE_GUIDE[value].rule }}</span>
            </li>
          </ul>
          <div v-for="group in grouped(measureElements)" :key="group.kind" class="space-y-1">
            <p class="flex items-center gap-1.5 text-xs font-medium text-muted uppercase">
              <UIcon :name="KIND_ICONS[group.kind]" class="size-3.5" />
              {{ ELEMENT_LABELS[group.kind] }}
            </p>
            <div v-for="element in group.elements" :key="elementId(element)" class="flex items-center gap-2 text-sm">
              <span class="w-28 shrink-0 truncate font-medium text-highlighted">{{ describe(element).title }}</span>
              <span class="min-w-0 flex-1 truncate text-muted">{{ describe(element).detail }}</span>
              <div class="flex shrink-0 gap-1">
                <UButton
                  v-for="value in SCORES"
                  :key="value"
                  :label="SCORE_GUIDE[value].label"
                  size="xs"
                  :color="measureScores.get(elementId(element)) === value ? (value === 'winner' ? 'success' : value === 'loser' ? 'error' : 'neutral') : 'neutral'"
                  :variant="measureScores.get(elementId(element)) === value ? 'solid' : 'ghost'"
                  @click="score(element, value)"
                />
              </div>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-end gap-2">
          <span v-if="measuring?.status !== 'measured'" class="mr-auto text-xs text-muted">
            {{ unscored ? `${unscored} element${unscored === 1 ? '' : 's'} still to score` : 'Every element scored' }}
          </span>
          <UButton label="Close" color="neutral" variant="ghost" @click="measuring = null" />
          <UButton
            v-if="measuring?.status !== 'measured'"
            label="Mark measured"
            icon="i-lucide-gauge"
            :disabled="unscored > 0"
            :loading="savingMeasure"
            @click="markMeasured"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
