<script setup lang="ts">
import type { LoadedShoot } from '#shared/utils/loadShoot'
import type { Manifest } from '#shared/utils/manifest'
import type { Recipe } from '#shared/utils/recipes'

// Batches (spec §14), once a shoot is ready for batching. Every valid recipe comes from the
// latest manifest; a batch takes the shoot's share of them (Best in Show: no repeated hook + VO
// pair, spread across people, formats and angles, nothing batched twice, nothing rated bad).
// Generating one writes recipes.json, batches/B01.json (+ CSV) and an empty renders/B01/<channel>/
// per channel for the stitcher; all of it grouped by channel. Ratings (good / bad per person's
// hook, VO and CTA) shape later batches.
const props = defineProps<{ bundle: LoadedShoot }>()
const emit = defineEmits<{ changed: [] }>()

const db = useDb()
const run = useAction()
const toast = useToast()
const dropbox = useDropbox()
const shoot = computed(() => props.bundle.shoot)
const base = computed(() => shootFolder(props.bundle))

// --- the latest manifest and what's been batched -------------------------------------
const manifest = shallowRef<Manifest | null>(null)
const batches = ref<{ code: string, size: number, entry_ids: string[], manifest_version: number | null, created_at: string }[]>([])
async function load() {
  const [latest, rows] = await Promise.all([
    db.from('shoot_manifests').select('data').eq('shoot_id', shoot.value.id).order('version', { ascending: false }).limit(1).maybeSingle(),
    db.from('shoot_shortlists').select('code, size, entry_ids, manifest_version, created_at').eq('shoot_id', shoot.value.id).order('code')
  ])
  manifest.value = (latest.data?.data ?? null) as Manifest | null
  batches.value = rows.data ?? []
}
onMounted(load)
watch(() => props.bundle, load)

const recipes = computed<Recipe[]>(() => manifest.value ? buildRecipes(manifest.value) : [])
const ratings = computed(() => new Map(props.bundle.items.filter(item => item.rating).map(item => [item.id, item.rating!])))
const batched = computed(() => new Set(batches.value.flatMap(batch => batch.entry_ids)))
const available = computed(() => availableRecipes(recipes.value, { exclude: batched.value, ratings: ratings.value }))
const size = computed(() => batchSize(recipes.value.length, Number(shoot.value.submission_rate)))
const nextCode = computed(() => nextBatchCode(batches.value.map(batch => batch.code)))

// --- generating a batch ------------------------------------------------------------------
const generating = ref(false)
async function generate() {
  if (!manifest.value) return
  const status = await dropbox.refresh().catch(() => null)
  if (!status?.connected) {
    toast.add({ title: 'Dropbox isn\'t connected', description: 'An admin can connect it in Settings → Dropbox.', color: 'warning', icon: 'i-lucide-cloud-off' })
    return
  }
  generating.value = true
  const code = nextCode.value
  // written grouped by channel, in pick order within each
  const chosen = batchOrder(chooseBatch(recipes.value, { size: size.value, exclude: batched.value, ratings: ratings.value }))
  const ok = await run(async () => {
    if (!chosen.length) throw new Error('Nothing left to batch: every valid recipe has been batched or has a part rated bad')
    const generatedAt = new Date().toISOString()
    const manifestVersion = manifest.value!.version
    // every valid recipe, b-roll and all; batches reference them by id
    await dropboxUploader.writeText(`${base.value}/recipes.json`, JSON.stringify({
      schema_version: 1,
      shoot: shoot.value.code,
      manifest_version: manifestVersion,
      generated_at: generatedAt,
      // file paths are relative to the shoot's edited/ folder
      recipes: recipes.value
    }, null, 2))
    await dropboxUploader.writeText(`${base.value}/batches/${code}.json`, JSON.stringify({
      // 2: renders split by channel
      schema_version: 2,
      shoot: shoot.value.code,
      batch: code,
      manifest_version: manifestVersion,
      generated_at: generatedAt,
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
      manifest_version: manifestVersion
    }))
  }, `${code}: ${chosen.length} recipe${chosen.length === 1 ? '' : 's'} batched`)
  generating.value = false
  if (ok) {
    await load()
    emit('changed')
  }
}

// --- ratings: good / bad per person's hook, VO and CTA (every channel they filmed it for) ---
const rateable = computed(() => {
  const rows = new Map<string, { key: string, kind: string, code: string, person: string, items: typeof props.bundle.items }>()
  for (const item of props.bundle.items.filter(item => item.status === 'filmed')) {
    const key = `${item.kind}|${item.code}|${item.person_id}`
    const row = rows.get(key) ?? { key, kind: item.kind, code: item.code, person: props.bundle.people.find(p => p.id === item.person_id)?.name ?? '', items: [] }
    row.items.push(item)
    rows.set(key, row)
  }
  const order = { hook: 0, body: 1, cta: 2 } as Record<string, number>
  return [...rows.values()].sort((a, b) => order[a.kind]! - order[b.kind]! || a.code.localeCompare(b.code, 'en', { numeric: true }) || a.person.localeCompare(b.person))
})
const ratingOf = (row: { items: { rating?: string | null }[] }) => row.items[0]?.rating ?? null
const ratingsOpen = ref(false)

async function rate(row: { items: { id: string, rating?: 'good' | 'bad' | null }[] }, value: 'good' | 'bad') {
  const next = ratingOf(row) === value ? null : value
  await run(async () => {
    must(await db.from('shoot_items').update({ rating: next }).in('id', row.items.map(item => item.id)))
    for (const item of row.items) item.rating = next
  })
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <UCard :ui="{ body: 'space-y-4' }">
    <div class="flex flex-wrap items-start gap-3">
      <UIcon name="i-lucide-layers" class="mt-0.5 size-6 shrink-0 text-primary" />
      <div class="min-w-0 flex-1">
        <p class="font-medium text-highlighted">
          Batches
        </p>
        <p v-if="!manifest" class="text-sm text-muted">
          No manifest yet: check the edits above first.
        </p>
        <p v-else class="text-sm text-muted">
          {{ recipes.length }} valid recipe{{ recipes.length === 1 ? '' : 's' }} (manifest v{{ manifest.version }}) ·
          {{ batched.size }} batched · {{ available.length }} left.
          A batch takes {{ Math.round(Number(shoot.submission_rate) * 1000) / 10 }}% of the valid recipes: {{ size }}.
        </p>
      </div>
      <UButton
        v-if="manifest"
        :label="`Generate ${nextCode}`"
        icon="i-lucide-sparkles"
        size="sm"
        :loading="generating"
        :disabled="!available.length || !size"
        @click="generate"
      />
    </div>

    <ul v-if="batches.length" class="divide-y divide-default rounded-lg border border-default text-sm">
      <li v-for="batch in [...batches].reverse()" :key="batch.code" class="flex flex-wrap items-center gap-2 px-3 py-2">
        <span class="font-mono font-semibold text-highlighted">{{ batch.code }}</span>
        <span class="text-muted">{{ batch.size }} recipe{{ batch.size === 1 ? '' : 's' }}</span>
        <span v-if="batch.manifest_version" class="text-xs text-dimmed">manifest v{{ batch.manifest_version }}</span>
        <span class="ml-auto text-xs text-muted">{{ when(batch.created_at) }}</span>
      </li>
    </ul>

    <!-- ratings: what worked shapes the next batch -->
    <div class="rounded-lg border border-default">
      <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm" :aria-expanded="ratingsOpen" @click="ratingsOpen = !ratingsOpen">
        <UIcon name="i-lucide-thumbs-up" class="size-4 text-muted" />
        <span class="flex-1 font-medium text-highlighted">What worked</span>
        <span class="text-xs text-muted">{{ rateable.filter(row => ratingOf(row)).length }} rated</span>
        <UIcon :name="ratingsOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4 text-muted" />
      </button>
      <div v-if="ratingsOpen" class="space-y-1 border-t border-default px-3 py-2">
        <p class="pb-1 text-xs text-muted">
          Later batches leave out anything marked bad and favour anything marked good.
        </p>
        <div v-for="row in rateable" :key="row.key" class="flex items-center gap-2 text-sm">
          <span class="w-12 font-mono font-semibold text-highlighted">{{ row.code }}</span>
          <span class="min-w-0 flex-1 truncate text-default">{{ row.person }}</span>
          <UButton
            icon="i-lucide-thumbs-up"
            size="xs"
            :color="ratingOf(row) === 'good' ? 'success' : 'neutral'"
            :variant="ratingOf(row) === 'good' ? 'solid' : 'ghost'"
            :aria-label="`${row.code} by ${row.person} worked`"
            @click="rate(row, 'good')"
          />
          <UButton
            icon="i-lucide-thumbs-down"
            size="xs"
            :color="ratingOf(row) === 'bad' ? 'error' : 'neutral'"
            :variant="ratingOf(row) === 'bad' ? 'solid' : 'ghost'"
            :aria-label="`${row.code} by ${row.person} didn't work`"
            @click="rate(row, 'bad')"
          />
        </div>
      </div>
    </div>
  </UCard>
</template>
