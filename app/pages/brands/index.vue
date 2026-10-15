<script setup lang="ts">
import type { Row } from '#shared/types/models'

type BrandRow = Row<'brands'> & {
  brand_channels: { channel_id: string }[]
  products: { id: string }[]
}

const db = useDb()
const run = useAction()
const { channels, load } = useRefData()

const brands = ref<BrandRow[]>([])
const search = ref('')
const status = ref('all')
const statusOptions = [{ label: 'All statuses', value: 'all' }, ...selectOptions(BRAND_STATUSES)]

async function loadBrands() {
  // In pages: the Data API returns at most 1,000 rows per request, and imports can bring in more.
  const all: BrandRow[] = []
  for (let from = 0; ; from += 1000) {
    const page = must(await db
      .from('brands')
      .select('*, brand_channels(channel_id), products(id)')
      .order('name')
      .range(from, from + 999)) as BrandRow[]
    all.push(...page)
    if (page.length < 1000) break
  }
  brands.value = all
}
await Promise.all([load(), loadBrands()])

// --- filters ---------------------------------------------------------------
// A brand with no value for a filtered field (e.g. no Trybe score yet) is left out by that filter.
const DEFAULT_FILTERS = {
  minScore: 0,
  payModel: 'all',
  minCommission: 0,
  minFlat: 0,
  category: 'all',
  channel: 'all',
  matched: 'all'
}
const filters = reactive({ ...DEFAULT_FILTERS })
const activeFilters = computed(() =>
  (Object.keys(DEFAULT_FILTERS) as (keyof typeof DEFAULT_FILTERS)[]).filter(key => filters[key] !== DEFAULT_FILTERS[key]).length
)
const clearFilters = () => Object.assign(filters, DEFAULT_FILTERS)

const scoreOptions = [{ label: 'Any score', value: 0 }, ...[50, 60, 70, 80, 90].map(n => ({ label: `${n}+`, value: n }))]
const payOptions = [{ label: 'Any pay model', value: 'all' }, ...PAY_MODELS, { label: 'Not set', value: 'none' }]
const commissionOptions = [{ label: 'Any commission', value: 0 }, ...[5, 10, 15, 20, 30].map(n => ({ label: `${n}%+`, value: n }))]
const flatOptions = [{ label: 'Any flat fee', value: 0 }, ...[10, 25, 50, 100, 250].map(n => ({ label: `${n}+ per video`, value: n }))]
const matchedOptions = [
  { label: 'Any', value: 'all' },
  { label: 'Matched in Scrybe', value: 'yes' },
  { label: 'Didn\'t match', value: 'no' },
  { label: 'Unknown', value: 'unknown' }
]

const trybe = (brand: BrandRow) => (brand.trybe_data ?? {}) as { categories?: string[], matched?: string, logo?: unknown }

/** Trybe categories across all brands, most common first. */
const categoryOptions = computed(() => {
  const counts = new Map<string, number>()
  for (const brand of brands.value) for (const category of trybe(brand).categories ?? []) counts.set(category, (counts.get(category) ?? 0) + 1)
  return [
    { label: 'Any category', value: 'all' },
    ...[...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([category, count]) => ({ label: `${category} (${count})`, value: category }))
  ]
})
const channelFilterOptions = computed(() => [
  { label: 'Any channel', value: 'all' },
  ...channels.value.map(channel => ({ label: channel.name, value: channel.id })),
  { label: 'No channels assigned', value: 'none' }
])

const sort = ref('name')
const sortOptions = [
  { label: 'Name A–Z', value: 'name' },
  { label: 'Trybe score', value: 'score' },
  { label: 'Commission', value: 'commission' },
  { label: 'Flat fee', value: 'flat' },
  { label: 'Newest', value: 'newest' }
]

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  const list = brands.value.filter((brand) => {
    const data = trybe(brand)
    return (status.value === 'all' || brand.status === status.value)
      && (!term || brand.name.toLowerCase().includes(term))
      && (!filters.minScore || (brand.trybe_score !== null && Number(brand.trybe_score) >= filters.minScore))
      && (filters.payModel === 'all' || (filters.payModel === 'none' ? !brand.pay_model : brand.pay_model === filters.payModel))
      && (!filters.minCommission || (brand.commission_pct !== null && Number(brand.commission_pct) >= filters.minCommission))
      && (!filters.minFlat || (brand.flat_fee !== null && Number(brand.flat_fee) >= filters.minFlat))
      && (filters.category === 'all' || (data.categories ?? []).includes(filters.category))
      && (filters.channel === 'all' || (filters.channel === 'none'
        ? !brand.brand_channels.length
        : brand.brand_channels.some(link => link.channel_id === filters.channel)))
      && (filters.matched === 'all' || data.matched === filters.matched)
  })
  // brands without the sorted value go last
  const desc = (pick: (brand: BrandRow) => number | null) => (a: BrandRow, b: BrandRow) =>
    (pick(b) ?? -Infinity) - (pick(a) ?? -Infinity) || a.name.localeCompare(b.name)
  const sorters: Record<string, (a: BrandRow, b: BrandRow) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    score: desc(brand => brand.trybe_score === null ? null : Number(brand.trybe_score)),
    commission: desc(brand => brand.commission_pct === null ? null : Number(brand.commission_pct)),
    flat: desc(brand => brand.flat_fee === null ? null : Number(brand.flat_fee)),
    newest: (a, b) => b.created_at.localeCompare(a.created_at)
  }
  return list.sort(sorters[sort.value] ?? sorters.name)
})

// 24 per page fits the 1-, 2- and 3-column grids evenly.
const page = ref(1)
const pageSize = 24
watch([search, status, sort, filters], () => {
  page.value = 1
})
const pageBrands = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))

const trybeLogo = (brand: BrandRow) => {
  const logo = trybe(brand).logo
  return typeof logo === 'string' && /^https?:\/\//.test(logo) ? logo : null
}

const channelName = (id: string) => channels.value.find(channel => channel.id === id)?.name ?? '?'

const open = ref(false)
const saving = ref(false)
const draft = reactive({ name: '', slug: '', status: 'prospect' })
watch(() => draft.name, (name) => {
  draft.slug = slugify(name)
})

const deal = ref(toBrandDeal())

function create() {
  Object.assign(draft, { name: '', slug: '', status: 'prospect' })
  deal.value = toBrandDeal()
  open.value = true
}

async function save() {
  saving.value = true
  await run(async () => {
    const brand = mustOne(await db.from('brands').insert({ name: draft.name.trim(), slug: draft.slug, status: draft.status, ...fromBrandDeal(deal.value) }).select('*').single())
    open.value = false
    await navigateTo(`/brands/${brand.id}`)
  })
  saving.value = false
}
</script>

<template>
  <UDashboardPanel id="brands">
    <template #header>
      <UDashboardNavbar title="Brands">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <BrandImport @imported="loadBrands" />
          <UButton icon="i-lucide-plus" label="New brand" @click="create" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <div class="flex flex-wrap items-center gap-2 py-2">
          <UInput v-model="search" icon="i-lucide-search" placeholder="Search brands" class="w-full sm:w-56" />
          <USelect v-model="status" :items="statusOptions" class="w-36" />
          <USelect v-model="sort" :items="sortOptions" icon="i-lucide-arrow-up-down" class="w-40" />

          <UPopover :content="{ align: 'start' }">
            <UButton
              icon="i-lucide-sliders-horizontal"
              :label="activeFilters ? `Filters (${activeFilters})` : 'Filters'"
              :color="activeFilters ? 'primary' : 'neutral'"
              :variant="activeFilters ? 'soft' : 'subtle'"
            />
            <template #content>
              <div class="grid w-80 gap-3 p-4">
                <UFormField label="Trybe score">
                  <USelect v-model="filters.minScore" :items="scoreOptions" class="w-full" />
                </UFormField>
                <UFormField label="Pay model">
                  <USelect v-model="filters.payModel" :items="payOptions" class="w-full" />
                </UFormField>
                <div class="grid grid-cols-2 gap-3">
                  <UFormField label="Commission">
                    <USelect v-model="filters.minCommission" :items="commissionOptions" class="w-full" />
                  </UFormField>
                  <UFormField label="Flat fee">
                    <USelect v-model="filters.minFlat" :items="flatOptions" class="w-full" />
                  </UFormField>
                </div>
                <UFormField label="Trybe category">
                  <USelectMenu v-model="filters.category" :items="categoryOptions" value-key="value" class="w-full" />
                </UFormField>
                <UFormField label="Channel">
                  <USelect v-model="filters.channel" :items="channelFilterOptions" class="w-full" />
                </UFormField>
                <UFormField label="Scrybe match">
                  <USelect v-model="filters.matched" :items="matchedOptions" class="w-full" />
                </UFormField>
                <UButton
                  v-if="activeFilters"
                  label="Clear filters"
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  class="justify-self-start"
                  @click="clearFilters"
                />
              </div>
            </template>
          </UPopover>

          <span class="text-sm text-muted tabular-nums">
            {{ filtered.length }} of {{ brands.length }}
          </span>
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <NuxtLink
          v-for="brand in pageBrands"
          :key="brand.id"
          :to="`/brands/${brand.id}`"
          class="rounded-lg border border-default p-4 transition hover:bg-elevated/50"
        >
          <div class="flex items-start justify-between gap-2">
            <h2 class="flex min-w-0 items-center gap-2 font-semibold text-highlighted">
              <img
                v-if="trybeLogo(brand)"
                :src="trybeLogo(brand)!"
                alt=""
                class="size-6 shrink-0 rounded object-cover"
                loading="lazy"
                referrerpolicy="no-referrer"
              >
              <span class="truncate">{{ brand.name }}</span>
            </h2>
            <UBadge :label="brand.status" :color="BRAND_STATUS_COLORS[brand.status]" variant="subtle" class="capitalize" />
          </div>
          <p class="mt-1 text-sm text-muted">
            {{ brand.products.length }} product{{ brand.products.length === 1 ? '' : 's' }}
            <template v-if="dealSummary(brand)">
              · {{ dealSummary(brand) }}
            </template>
            <template v-if="brand.trybe_score !== null">
              · Trybe score {{ Number(brand.trybe_score) }}
            </template>
          </p>
          <div class="mt-3 flex flex-wrap gap-1">
            <UBadge
              v-for="link in brand.brand_channels"
              :key="link.channel_id"
              :label="channelName(link.channel_id)"
              color="neutral"
              variant="outline"
            />
            <span v-if="!brand.brand_channels.length" class="text-xs text-dimmed">No channels assigned</span>
          </div>
          <CreatedBy :by="brand.created_by" :at="brand.created_at" class="mt-2 block" />
        </NuxtLink>
      </div>
      <p v-if="!filtered.length" class="py-12 text-center text-sm text-muted">
        {{ brands.length ? 'No brands match.' : 'No brands yet. Create one to start planning shoots.' }}
      </p>
      <ListPager v-model:page="page" :total="filtered.length" :page-size="pageSize" class="mt-4" />

      <UModal v-model:open="open" title="New brand">
        <template #body>
          <div class="space-y-4">
            <UFormField label="Name" required>
              <UInput v-model="draft.name" class="w-full" autofocus />
            </UFormField>
            <UFormField label="Slug" help="Used in folder names. Can't change once set.">
              <UInput v-model="draft.slug" class="w-full" />
            </UFormField>
            <UFormField label="Status">
              <USelect v-model="draft.status" :items="selectOptions(BRAND_STATUSES)" class="w-full" />
            </UFormField>
            <USeparator label="Trybe deal" />
            <BrandDealFields v-model="deal" />
          </div>
        </template>
        <template #footer>
          <UButton label="Create brand" :loading="saving" :disabled="!draft.name.trim() || !draft.slug || !isValidUrl(deal.trybe_url)" @click="save" />
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
