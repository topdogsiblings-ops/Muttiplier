<script setup lang="ts">
import type { Row } from '#shared/types/models'

const route = useRoute()
const db = useDb()
const run = useAction()
const { channels, load } = useRefData()
const brandId = route.params.id as string

const brand = ref<Row<'brands'> | null>(null)
const assigned = ref<string[]>([])
const products = shallowRef<Row<'products'>[]>([])
const shoots = ref<Pick<Row<'shoots'>, 'id' | 'code' | 'product_id' | 'shoot_date' | 'status'>[]>([])

async function loadBrand() {
  const [b, links, prods] = await Promise.all([
    db.from('brands').select('*').eq('id', brandId).maybeSingle(),
    db.from('brand_channels').select('channel_id').eq('brand_id', brandId),
    db.from('products').select('*').eq('brand_id', brandId).order('name')
  ])
  brand.value = must(b)
  assigned.value = must(links).map(link => link.channel_id)
  products.value = must(prods)
  const ids = products.value.map(product => product.id)
  shoots.value = ids.length
    ? must(await db.from('shoots').select('id, code, product_id, shoot_date, status').in('product_id', ids).order('code', { ascending: false }))
    : []
}
await Promise.all([load(), loadBrand()])
if (!brand.value) throw createError({ statusCode: 404, statusMessage: 'Brand not found', fatal: true })

// --- brand fields ----------------------------------------------------------
const form = reactive({
  name: brand.value.name,
  status: brand.value.status,
  notes: brand.value.notes ?? ''
})
const deal = ref(toBrandDeal(brand.value))
const saving = ref(false)

async function saveBrand() {
  saving.value = true
  await run(async () => {
    must(await db.from('brands').update({
      name: form.name.trim(),
      status: form.status,
      notes: form.notes.trim() || null,
      ...fromBrandDeal(deal.value)
    }).eq('id', brandId))
    await loadBrand()
  }, 'Brand saved')
  saving.value = false
}

async function toggleChannel(channelId: string, on: boolean) {
  await run(async () => {
    if (on) must(await db.from('brand_channels').insert({ brand_id: brandId, channel_id: channelId }))
    else must(await db.from('brand_channels').delete().eq('brand_id', brandId).eq('channel_id', channelId))
    await loadBrand()
  })
}

// --- product drawer --------------------------------------------------------
const productOpen = ref(false)
const product = reactive({
  id: '',
  name: '',
  slug: '',
  slots: [] as { key: string, value: string }[],
  claims_allowed: '',
  claims_forbidden: '',
  notes: ''
})
watch(() => product.name, (name) => {
  if (!product.id) product.slug = slugify(name)
})

function editProduct(row?: Row<'products'>) {
  const values = (row?.slot_values ?? {}) as Record<string, unknown>
  Object.assign(product, {
    id: row?.id ?? '',
    name: row?.name ?? '',
    slug: row?.slug ?? '',
    slots: Object.entries(values).map(([key, value]) => ({ key, value: String(value ?? '') })),
    claims_allowed: row?.claims_allowed ?? '',
    claims_forbidden: row?.claims_forbidden ?? '',
    notes: row?.notes ?? ''
  })
  productOpen.value = true
}

const slotList = (row: Row<'products'>) =>
  Object.keys((row.slot_values ?? {}) as object).map(key => `{{${key}}}`).join(' ') || 'No custom slots'

const slotKey = (key: string) => key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
const reservedSlots = computed(() => product.slots.map(slot => slotKey(slot.key)).filter(key => (BUILT_IN_SLOTS as readonly string[]).includes(key)))
const productShoots = computed(() => shoots.value.filter(shoot => shoot.product_id === product.id))

async function saveProduct() {
  saving.value = true
  const ok = await run(async () => {
    const slot_values: Record<string, string> = {}
    for (const slot of product.slots) {
      const key = slotKey(slot.key)
      if (key) slot_values[key] = slot.value.trim()
    }
    const fields = {
      name: product.name.trim(),
      slot_values,
      claims_allowed: product.claims_allowed.trim() || null,
      claims_forbidden: product.claims_forbidden.trim() || null,
      notes: product.notes.trim() || null
    }
    if (product.id) must(await db.from('products').update(fields).eq('id', product.id))
    else must(await db.from('products').insert({ ...fields, brand_id: brandId, slug: product.slug }))
    await Promise.all([loadBrand(), load(true)])
  }, 'Product saved')
  saving.value = false
  if (ok) productOpen.value = false
}
</script>

<template>
  <UDashboardPanel v-if="brand" id="brand">
    <template #header>
      <UDashboardNavbar :title="brand.name">
        <template #leading>
          <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/brands" aria-label="Back to brands" />
        </template>
        <template #trailing>
          <UBadge :label="brand.status" :color="BRAND_STATUS_COLORS[brand.status]" variant="subtle" class="capitalize" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-2">
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Brand
            </h2>
          </template>
          <div class="space-y-4">
            <UFormField label="Name">
              <UInput v-model="form.name" class="w-full" />
            </UFormField>
            <UFormField label="Status">
              <USelect v-model="form.status" :items="selectOptions(BRAND_STATUSES)" class="w-full" />
            </UFormField>
            <USeparator label="Trybe deal" />
            <BrandDealFields v-model="deal" />
            <USeparator />
            <UFormField label="Notes">
              <UTextarea v-model="form.notes" autoresize class="w-full" />
            </UFormField>
            <p class="text-xs text-muted">
              Folder slug: <code>{{ brand.slug }}</code>
            </p>
            <CreatedBy :by="brand.created_by" :at="brand.created_at" />
          </div>
          <template #footer>
            <UButton label="Save brand" :loading="saving" :disabled="!form.name.trim() || !isValidUrl(deal.trybe_url)" @click="saveBrand" />
          </template>
        </UCard>

        <div class="space-y-6">
          <BrandTrybeData :data="brand.trybe_data" :brand-id="brand.trybe_brand_id" :trybe-url="brand.trybe_url" />

          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Channels
              </h2>
              <p class="text-sm text-muted">
                New brands start with every channel. New shoots for this brand start with the ones ticked here.
              </p>
            </template>
            <div class="space-y-3">
              <USwitch
                v-for="channel in channels.filter(c => c.active || assigned.includes(c.id))"
                :key="channel.id"
                :model-value="assigned.includes(channel.id)"
                :label="channel.name"
                :description="`${channel.dogs.join(' + ')} · “${channel.dog_phrase}”`"
                @update:model-value="toggleChannel(channel.id, $event)"
              />
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="font-semibold text-highlighted">
                  Products
                </h2>
                <UButton icon="i-lucide-plus" label="Add product" size="sm" @click="editProduct()" />
              </div>
            </template>
            <div class="-my-2 divide-y divide-default">
              <button
                v-for="row in products"
                :key="row.id"
                type="button"
                class="flex w-full items-center gap-3 py-3 text-left"
                @click="editProduct(row)"
              >
                <div class="min-w-0 flex-1">
                  <p class="font-medium text-highlighted">
                    {{ row.name }}
                  </p>
                  <p class="truncate text-xs text-muted">
                    {{ slotList(row) }}
                  </p>
                  <CreatedBy :by="row.created_by" :at="row.created_at" />
                </div>
                <UBadge
                  :label="`${shoots.filter(s => s.product_id === row.id).length} shoots`"
                  color="neutral"
                  variant="subtle"
                />
                <UIcon name="i-lucide-chevron-right" class="text-dimmed" />
              </button>
              <p v-if="!products.length" class="py-4 text-center text-sm text-muted">
                No products yet.
              </p>
            </div>
          </UCard>
        </div>
      </div>

      <USlideover v-model:open="productOpen" :title="product.id ? product.name : 'New product'" :ui="{ content: 'max-w-xl' }">
        <template #body>
          <div class="space-y-5">
            <UFormField label="Name" required help="Fills {{product}}">
              <UInput v-model="product.name" class="w-full" />
            </UFormField>
            <UFormField label="Slug" help="Used in folder names. Can't change once set.">
              <UInput v-model="product.slug" class="w-full" :disabled="!!product.id" />
            </UFormField>

            <UFormField label="Slot values" help="Custom slots scripts can use, e.g. benefit → calmer walks fills {{benefit}}">
              <div class="space-y-2">
                <div v-for="(slot, index) in product.slots" :key="index" class="flex gap-2">
                  <UInput v-model="slot.key" placeholder="benefit" class="w-36 shrink-0 font-mono" />
                  <UInput v-model="slot.value" placeholder="calmer walks" class="flex-1" />
                  <UButton
                    icon="i-lucide-x"
                    color="neutral"
                    variant="ghost"
                    aria-label="Remove slot"
                    @click="product.slots.splice(index, 1)"
                  />
                </div>
                <UButton
                  icon="i-lucide-plus"
                  label="Add slot"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  @click="product.slots.push({ key: '', value: '' })"
                />
                <p v-if="reservedSlots.length" class="text-xs text-warning">
                  {{ reservedSlots.join(', ') }} {{ reservedSlots.length === 1 ? 'is' : 'are' }} built in and filled automatically; a custom value is ignored.
                </p>
              </div>
            </UFormField>

            <UFormField label="Allowed claims">
              <UTextarea v-model="product.claims_allowed" autoresize class="w-full" />
            </UFormField>
            <UFormField label="Forbidden claims" help="AI drafting is told to avoid these">
              <UTextarea v-model="product.claims_forbidden" autoresize class="w-full" />
            </UFormField>
            <UFormField label="Notes">
              <UTextarea v-model="product.notes" autoresize class="w-full" />
            </UFormField>

            <div v-if="product.id">
              <h3 class="mb-2 text-sm font-medium text-highlighted">
                Shoots for this product
              </h3>
              <div class="divide-y divide-default rounded-lg border border-default">
                <NuxtLink
                  v-for="shoot in productShoots"
                  :key="shoot.id"
                  :to="`/shoots/${shoot.code}`"
                  class="flex items-center gap-3 px-3 py-2 hover:bg-elevated/50"
                >
                  <span class="font-mono font-medium text-highlighted">{{ shoot.code }}</span>
                  <span class="text-sm text-muted">{{ formatDate(shoot.shoot_date) }}</span>
                  <UBadge
                    :label="shoot.status"
                    :color="SHOOT_STATUS_COLORS[shoot.status]"
                    variant="subtle"
                    class="ml-auto capitalize"
                  />
                </NuxtLink>
                <p v-if="!productShoots.length" class="px-3 py-3 text-sm text-muted">
                  No shoots yet.
                </p>
              </div>
            </div>
          </div>
        </template>
        <template #footer>
          <UButton label="Save product" :loading="saving" :disabled="!product.name.trim() || !product.slug" @click="saveProduct" />
        </template>
      </USlideover>
    </template>
  </UDashboardPanel>
</template>
