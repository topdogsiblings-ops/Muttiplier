<script setup lang="ts">
import type { Row } from '#shared/types/models'
import type { BundleItem, BundleTreatment } from '#shared/utils/shootsheet'
import type { ItemRow } from '#shared/utils/loadShoot'

type ShootRow = Row<'shoots'> & {
  product: { id: string, name: string, brand: { id: string, name: string } }
  shoot_people: { person: { id: string, name: string } }[]
  shoot_channels: { channel: { id: string, name: string } }[]
}

const db = useDb()
const run = useAction()
const { products, productOptions, settings, load } = useRefData()

const shoots = ref<ShootRow[]>([])
const itemsByShoot = ref<Record<string, BundleItem[]>>({})
const treatments = ref<BundleTreatment[]>([])

async function loadShoots() {
  shoots.value = must(await db
    .from('shoots')
    .select('*, product:products(id, name, brand:brands(id, name)), shoot_people(person:people(id, name)), shoot_channels(channel:channels(id, name))')
    .order('code', { ascending: false })) as unknown as ShootRow[]

  // Items for the estimates, as the shoot page loads them (so the numbers match), fetched in
  // pages (the Data API returns at most 1,000 rows per request).
  const grouped: Record<string, BundleItem[]> = {}
  for (let from = 0; ; from += 1000) {
    const page = must(await db
      .from('shoot_items')
      .select(ITEM_SELECT)
      .order('id')
      .range(from, from + 999)) as unknown as ItemRow[]
    for (const row of page) (grouped[row.shoot_id] ??= []).push(toBundleItem(row))
    if (page.length < 1000) break
  }
  itemsByShoot.value = grouped
  // the Library's treatments that are on: every recipe gets a version for each that applies
  treatments.value = must(await db.from('treatments').select('name, kind, placement, needs, component, settings')
    .eq('active', true).eq('archived', false).order('sort_order'))
}
await Promise.all([load(), loadShoots()])

const calcSettings = computed(() => toCalcSettings(settings.value, DEFAULT_CALC_SETTINGS))

/** The same estimate as the shoot page's calculator (one shared input builder). */
function estimate(shoot: ShootRow) {
  return calculate(bundleToCalcInput({
    shoot,
    people: shoot.shoot_people.map(row => row.person),
    channels: shoot.shoot_channels.map(row => row.channel),
    items: itemsByShoot.value[shoot.id] ?? [],
    broll: [],
    treatments: treatments.value
  }, calcSettings.value)).totals
}

// --- filters ---------------------------------------------------------------
const brand = ref('all')
const product = ref('all')
const status = ref('all')

const brandFilter = computed(() => {
  const seen = new Map(products.value.map(p => [p.brand.id, p.brand.name]))
  return [{ label: 'All brands', value: 'all' }, ...[...seen].map(([value, label]) => ({ label, value }))]
})
const productFilter = computed(() => [
  { label: 'All products', value: 'all' },
  ...products.value.filter(p => brand.value === 'all' || p.brand.id === brand.value).map(p => ({ label: p.name, value: p.id }))
])
const statusFilter = [{ label: 'All statuses', value: 'all' }, ...Object.keys(SHOOT_STATUS_COLORS).map(value => ({ label: SHOOT_STATUS_LABELS[value] ?? value, value }))]
watch(brand, () => {
  product.value = 'all'
})

const rows = computed(() => shoots.value
  .filter(shoot =>
    (brand.value === 'all' || shoot.product.brand.id === brand.value)
    && (product.value === 'all' || shoot.product.id === product.value)
    && (status.value === 'all' || shoot.status === status.value))
  .map(shoot => ({ shoot, totals: estimate(shoot) })))

// --- new shoot -------------------------------------------------------------
const open = ref(false)
const saving = ref(false)
const kits = selectOptions(['audition', 'scale', 'custom'])
const draft = reactive({ product_id: undefined as string | undefined, shoot_date: '', kit: 'custom' })
const requestOpen = useGuardedClose(open, draft)

function create() {
  Object.assign(draft, { product_id: product.value === 'all' ? undefined : product.value, shoot_date: '', kit: 'custom' })
  open.value = true
}

async function save() {
  const chosen = products.value.find(p => p.id === draft.product_id)
  if (!chosen) return
  saving.value = true
  await run(async () => {
    const shoot = mustOne(await db.from('shoots').insert({
      product_id: chosen.id,
      shoot_date: draft.shoot_date || null,
      kit: draft.kit,
      submission_rate: Number(settings.value?.default_submission_rate ?? 0.05)
    }).select('*').single())

    // Channels default to the brand's assigned channels.
    const links = must(await db.from('brand_channels').select('channel_id').eq('brand_id', chosen.brand_id))
    if (links.length) {
      must(await db.from('shoot_channels').insert(links.map(link => ({ shoot_id: shoot.id, channel_id: link.channel_id }))))
    }
    open.value = false
    await navigateTo(`/shoots/${shoot.code}`)
  })
  saving.value = false
}
</script>

<template>
  <UDashboardPanel id="shoots">
    <template #header>
      <UDashboardNavbar title="Planner">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-plus" label="New shoot" @click="create" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <div class="flex flex-wrap gap-2 py-2">
          <USelect v-model="brand" :items="brandFilter" class="w-40" />
          <USelect v-model="product" :items="productFilter" class="w-44" />
          <USelect v-model="status" :items="statusFilter" class="w-36" />
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="overflow-x-auto rounded-lg border border-default">
        <table class="w-full min-w-[56rem] text-left text-sm">
          <thead class="bg-elevated/50 text-xs text-muted uppercase">
            <tr>
              <th class="px-4 py-2.5 font-medium">
                Code
              </th>
              <th class="px-4 py-2.5 font-medium">
                Brand / product
              </th>
              <th class="px-4 py-2.5 font-medium">
                Date
              </th>
              <th class="px-4 py-2.5 font-medium">
                Status
              </th>
              <th class="px-4 py-2.5 font-medium">
                People
              </th>
              <th class="px-4 py-2.5 font-medium">
                Channels
              </th>
              <th class="px-4 py-2.5 text-right font-medium">
                Est. recipes
              </th>
              <th class="px-4 py-2.5 text-right font-medium">
                Est. submissions
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr
              v-for="{ shoot, totals } in rows"
              :key="shoot.id"
              class="cursor-pointer hover:bg-elevated/50"
              @click="navigateTo(`/shoots/${shoot.code}`)"
            >
              <td class="px-4 py-3">
                <NuxtLink :to="`/shoots/${shoot.code}`" class="font-mono font-semibold text-highlighted" @click.stop>
                  {{ shoot.code }}
                </NuxtLink>
              </td>
              <td class="px-4 py-3">
                <p class="font-medium text-highlighted">
                  {{ shoot.product.name }}
                </p>
                <p class="text-xs text-muted">
                  {{ shoot.product.brand.name }}
                </p>
              </td>
              <td class="px-4 py-3 whitespace-nowrap">
                {{ formatDate(shoot.shoot_date) }}
                <CreatedBy :by="shoot.created_by" :at="shoot.created_at" class="block" />
              </td>
              <td class="px-4 py-3">
                <UBadge :label="SHOOT_STATUS_LABELS[shoot.status] ?? shoot.status" :color="SHOOT_STATUS_COLORS[shoot.status]" variant="subtle" />
              </td>
              <td class="px-4 py-3">
                {{ shoot.shoot_people.map(row => row.person.name).sort().join(', ') || '—' }}
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap gap-1">
                  <UBadge
                    v-for="row in shoot.shoot_channels"
                    :key="row.channel.id"
                    :label="row.channel.name"
                    color="neutral"
                    variant="outline"
                    size="sm"
                  />
                </div>
              </td>
              <td class="px-4 py-3 text-right tabular-nums">
                {{ formatNumber(totals.recipes) }}
              </td>
              <td class="px-4 py-3 text-right font-medium text-highlighted tabular-nums">
                {{ formatNumber(totals.submissions) }}
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!rows.length" class="px-4 py-12 text-center text-sm text-muted">
          {{ shoots.length ? 'No shoots match these filters.' : 'No shoots yet. Create one to start planning.' }}
        </p>
      </div>

      <UModal :open="open" @update:open="requestOpen" title="New shoot">
        <template #body>
          <div class="space-y-4">
            <UAlert
              v-if="!productOptions.length"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              title="Add a product first"
              description="A shoot is planned for one product. Create a brand and product in the Brands tab."
            />
            <UFormField label="Product" required>
              <USelectMenu
                v-model="draft.product_id"
                :items="productOptions"
                value-key="value"
                placeholder="Choose a product"
                class="w-full"
              />
            </UFormField>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Shoot date" help="Needed before the shoot can be planned">
                <UInput v-model="draft.shoot_date" type="date" class="w-full" />
              </UFormField>
              <UFormField label="Kit" help="Just a tag for this shoot (e.g. Audition = trial shoot for a new brand, Scale = full production). It doesn't change anything else.">
                <USelect v-model="draft.kit" :items="kits" class="w-full" />
              </UFormField>
            </div>
          </div>
        </template>
        <template #footer>
          <UButton label="Create shoot" :loading="saving" :disabled="!draft.product_id" @click="save" />
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
