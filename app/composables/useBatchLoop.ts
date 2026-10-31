import type { LoadedShoot } from '#shared/utils/loadShoot'
import type { Manifest } from '#shared/utils/manifest'
import type { Recipe } from '#shared/utils/recipes'
import type { ElementKind, Score } from '#shared/utils/batchLoop'

export type BatchStatus = 'batched' | 'rendering' | 'submitted' | 'measured'
export const BATCH_STATUSES: BatchStatus[] = ['batched', 'rendering', 'submitted', 'measured']

export interface BatchRow {
  id: string
  code: string
  size: number
  entry_ids: string[]
  manifest_version: number | null
  status: BatchStatus
  status_at: string
  exploit_share: number | null
  created_at: string
}

/**
 * A Live shoot's batch loop (spec §14b): its recipes (from the Live manifest), its batches, every
 * element score and the elements dropped or kept by hand. Shared by the usage bar and the Batches tab.
 */
export function useBatchLoop(bundle: Ref<LoadedShoot>) {
  const db = useDb()
  const shoot = computed(() => bundle.value.shoot)
  const manifest = shallowRef<Manifest | null>(null)
  const batches = ref<BatchRow[]>([])
  const scores = ref<{ shortlist_id: string, element_kind: string, element_key: string, score: string }[]>([])
  const overrides = ref<{ element_kind: string, element_key: string, dropped: boolean }[]>([])
  const loading = ref(false)

  async function load() {
    if (shoot.value.status !== 'edited') return
    loading.value = true
    try {
      const [latest, rows, dropped] = await Promise.all([
        db.from('shoot_manifests').select('data').eq('shoot_id', shoot.value.id).order('version', { ascending: false }).limit(1).maybeSingle(),
        db.from('shoot_shortlists').select('id, code, size, entry_ids, manifest_version, status, status_at, exploit_share, created_at').eq('shoot_id', shoot.value.id).order('code'),
        db.from('shoot_element_overrides').select('element_kind, element_key, dropped').eq('shoot_id', shoot.value.id)
      ])
      manifest.value = (latest.data?.data ?? null) as Manifest | null
      batches.value = (rows.data ?? []) as BatchRow[]
      overrides.value = dropped.data ?? []
      const ids = batches.value.map(batch => batch.id)
      scores.value = ids.length
        ? (await db.from('batch_scores').select('shortlist_id, element_kind, element_key, score').in('shortlist_id', ids)).data ?? []
        : []
    } finally {
      loading.value = false
    }
  }
  watch(() => [shoot.value.id, shoot.value.status], load, { immediate: true })

  const recipes = computed<Recipe[]>(() => manifest.value ? buildRecipes(manifest.value) : [])
  const recipeById = computed(() => new Map(recipes.value.map(recipe => [recipe.id, recipe])))
  const batched = computed(() => new Set(batches.value.flatMap(batch => batch.entry_ids)))
  /** only measured batches' scores count towards picking */
  const measuredIds = computed(() => new Set(batches.value.filter(batch => batch.status === 'measured').map(batch => batch.id)))
  const records = computed(() => elementRecords(scores.value.filter(row => measuredIds.value.has(row.shortlist_id)), overrides.value))
  /** the next batch can be made once every batch so far is measured */
  const canBatch = computed(() => batches.value.every(batch => batch.status === 'measured'))
  const used = computed(() => recipes.value.length ? batched.value.size / recipes.value.length : 0)

  const batchRecipes = (batch: BatchRow) => batch.entry_ids.map(id => recipeById.value.get(id)).filter((recipe): recipe is Recipe => !!recipe)
  const scoresOf = (batch: BatchRow) => new Map(scores.value
    .filter(row => row.shortlist_id === batch.id)
    .map(row => [`${row.element_kind}:${row.element_key}`, row.score as Score]))

  async function setScore(batch: BatchRow, kind: ElementKind, key: string, score: Score | null) {
    if (score) {
      must(await db.from('batch_scores').upsert({ shortlist_id: batch.id, element_kind: kind, element_key: key, score, updated_at: new Date().toISOString() }))
    } else {
      must(await db.from('batch_scores').delete().eq('shortlist_id', batch.id).eq('element_kind', kind).eq('element_key', key))
    }
    scores.value = [
      ...scores.value.filter(row => !(row.shortlist_id === batch.id && row.element_kind === kind && row.element_key === key)),
      ...(score ? [{ shortlist_id: batch.id, element_kind: kind, element_key: key, score }] : [])
    ]
  }

  /** drop or keep an element by hand; null goes back to the automatic rule */
  async function setDropped(kind: ElementKind, key: string, dropped: boolean | null) {
    if (dropped === null) {
      must(await db.from('shoot_element_overrides').delete().eq('shoot_id', shoot.value.id).eq('element_kind', kind).eq('element_key', key))
    } else {
      must(await db.from('shoot_element_overrides').upsert({ shoot_id: shoot.value.id, element_kind: kind, element_key: key, dropped }))
    }
    overrides.value = [
      ...overrides.value.filter(row => !(row.element_kind === kind && row.element_key === key)),
      ...(dropped === null ? [] : [{ element_kind: kind, element_key: key, dropped }])
    ]
  }

  async function setStatus(batch: BatchRow, status: BatchStatus) {
    const at = new Date().toISOString()
    must(await db.from('shoot_shortlists').update({ status, status_at: at }).eq('id', batch.id))
    Object.assign(batch, { status, status_at: at })
  }

  return { manifest, batches, scores, overrides, loading, load, recipes, batched, records, canBatch, used, batchRecipes, scoresOf, setScore, setDropped, setStatus }
}

export type BatchLoop = ReturnType<typeof useBatchLoop>
