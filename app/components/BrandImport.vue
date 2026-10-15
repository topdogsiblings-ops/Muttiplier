<script setup lang="ts">
import type { Insert, Update } from '#shared/types/models'
import type { ImportPlan } from '#shared/utils/brandImport'

// Import brands from a Scrybe CSV export (format v2). New brands arrive as prospects;
// brands already here get their Trybe data refreshed. Nothing is written until "Import".
const emit = defineEmits<{ imported: [] }>()

const db = useDb()
const toast = useToast()

const open = ref(false)
const fileName = ref('')
const errors = ref<string[]>([])
const plan = ref<ImportPlan | null>(null)
const reading = ref(false)
const importing = ref(false)
const progress = ref(0)

const total = computed(() => (plan.value?.creates.length ?? 0) + (plan.value?.updates.length ?? 0))

function reset() {
  fileName.value = ''
  errors.value = []
  plan.value = null
  progress.value = 0
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  reset()
  fileName.value = file.name
  reading.value = true
  try {
    const parsed = parseScrybeCsv(await file.text())
    errors.value = parsed.errors
    if (parsed.brands.length) {
      const existing = must(await db.from('brands').select('id, name, slug, trybe_brand_id'))
      plan.value = planImport(parsed.brands, existing)
    }
  } catch (error) {
    errors.value = [error instanceof Error ? error.message : String(error)]
  }
  reading.value = false
}

async function runImport() {
  if (!plan.value) return
  importing.value = true
  progress.value = 0
  try {
    const { creates, updates } = plan.value
    for (let i = 0; i < creates.length; i += 100) {
      const batch = creates.slice(i, i + 100).map(brand => createFields(brand) as unknown as Insert<'brands'>)
      must(await db.from('brands').insert(batch))
      progress.value += batch.length
    }
    for (let i = 0; i < updates.length; i += 10) {
      const batch = updates.slice(i, i + 10)
      const results = await Promise.all(batch.map(update =>
        db.from('brands').update(updateFields(update.brand) as Update<'brands'>).eq('id', update.id)
      ))
      results.forEach(must)
      progress.value += batch.length
    }
    toast.add({
      title: 'Brands imported',
      description: `${creates.length} new prospect${creates.length === 1 ? '' : 's'}, ${updates.length} updated.`,
      color: 'success',
      icon: 'i-lucide-circle-check'
    })
    open.value = false
    reset()
    emit('imported')
  } catch (error) {
    toast.add({
      title: `Import stopped after ${progress.value} of ${total.value}`,
      description: error instanceof Error ? error.message : String(error),
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
    emit('imported')
  }
  importing.value = false
}

const payLabel = (brand: { pay_model: string | null, flat_fee: number | null, commission_pct: number | null, currency: string }) =>
  dealSummary(brand) ?? '—'
</script>

<template>
  <UButton label="Import CSV" icon="i-lucide-file-up" color="neutral" variant="subtle" @click="open = true" />

  <UModal
    v-model:open="open"
    title="Import brands from Scrybe"
    description="Upload a Scrybe brand export (CSV, format version 2). New brands are added as prospects."
    :ui="{ content: 'sm:max-w-3xl' }"
    :dismissible="!importing"
    @after:leave="reset"
  >
    <template #body>
      <div class="space-y-4">
        <label
          class="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-accented px-4 py-6 text-center hover:bg-elevated/50"
        >
          <UIcon :name="reading ? 'i-lucide-loader-circle' : 'i-lucide-file-spreadsheet'" class="size-8 text-muted" :class="{ 'animate-spin': reading }" />
          <span class="text-sm font-medium text-highlighted">{{ fileName || 'Choose a CSV file' }}</span>
          <span class="text-xs text-muted">scrybe-brands-YYYY-MM-DD.csv</span>
          <input type="file" accept=".csv,text/csv" class="sr-only" :disabled="importing" @change="onFile">
        </label>

        <UAlert
          v-if="errors.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="plan ? 'Notes on this file' : 'Can\'t import this file'"
        >
          <template #description>
            <ul class="list-disc space-y-0.5 pl-4">
              <li v-for="error in errors.slice(0, 8)" :key="error">
                {{ error }}
              </li>
              <li v-if="errors.length > 8">
                …and {{ errors.length - 8 }} more
              </li>
            </ul>
          </template>
        </UAlert>

        <template v-if="plan">
          <div class="grid grid-cols-2 gap-2">
            <div class="rounded-lg bg-primary/10 p-3">
              <p class="text-xs text-muted">
                New prospects
              </p>
              <p class="text-2xl font-semibold text-highlighted tabular-nums">
                {{ plan.creates.length }}
              </p>
            </div>
            <div class="rounded-lg bg-elevated/60 p-3">
              <p class="text-xs text-muted">
                Already here (Trybe data refreshed)
              </p>
              <p class="text-2xl font-semibold text-highlighted tabular-nums">
                {{ plan.updates.length }}
              </p>
            </div>
          </div>

          <div class="max-h-[40vh] overflow-auto rounded-lg border border-default">
            <table class="w-full text-left text-sm">
              <thead class="sticky top-0 bg-elevated text-xs text-muted uppercase">
                <tr>
                  <th class="px-3 py-2 font-medium">
                    Brand
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Pay
                  </th>
                  <th class="px-3 py-2 text-right font-medium">
                    Trybe score
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr v-for="brand in plan.creates" :key="`new-${brand.slug}`">
                  <td class="px-3 py-2 font-medium text-highlighted">
                    {{ brand.name }}
                  </td>
                  <td class="px-3 py-2 text-muted">
                    {{ payLabel(brand) }}
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    {{ brand.trybe_score ?? '—' }}
                  </td>
                  <td class="px-3 py-2">
                    <UBadge label="New prospect" color="primary" variant="subtle" size="sm" />
                  </td>
                </tr>
                <tr v-for="update in plan.updates" :key="`update-${update.id}`">
                  <td class="px-3 py-2 font-medium text-highlighted">
                    {{ update.brand.name }}
                    <span v-if="update.existingName !== update.brand.name" class="block text-xs font-normal text-muted">
                      matches “{{ update.existingName }}”
                    </span>
                  </td>
                  <td class="px-3 py-2 text-muted">
                    {{ payLabel(update.brand) }}
                  </td>
                  <td class="px-3 py-2 text-right tabular-nums">
                    {{ update.brand.trybe_score ?? '—' }}
                  </td>
                  <td class="px-3 py-2">
                    <UBadge label="Update" color="neutral" variant="subtle" size="sm" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="text-xs text-muted">
            Pay amounts are in US dollars, as Scrybe exports them. Existing brands keep their name, status, channels and notes.
          </p>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <span v-if="importing" class="text-sm text-muted tabular-nums">{{ progress }} / {{ total }}</span>
        <UButton
          class="ml-auto"
          :label="total ? `Import ${total} brand${total === 1 ? '' : 's'}` : 'Import'"
          icon="i-lucide-file-up"
          :loading="importing"
          :disabled="!total"
          @click="runImport"
        />
      </div>
    </template>
  </UModal>
</template>
