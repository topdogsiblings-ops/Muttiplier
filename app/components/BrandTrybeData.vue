<script setup lang="ts">
import type { TrybeData } from '#shared/utils/brandImport'

// What the last Scrybe import knew about a brand on Trybe. Read-only: re-import to refresh.
const props = defineProps<{ data: unknown, brandId: string | null, trybeUrl?: string | null }>()

const data = computed(() => (props.data && typeof props.data === 'object' ? props.data as Partial<TrybeData> : null))

/** Scrybe only exports the About text Trybe shows before "See more", so it often ends in "...". */
const aboutCutOff = computed(() => /(\.\.\.|…)\s*$/.test(data.value?.about ?? ''))

const money = (value: number | null | undefined) => value === null || value === undefined ? null : formatMoney(value, 'USD')
const pct = (value: number | null | undefined) => value === null || value === undefined ? null : `${value}%`

const facts = computed(() => {
  const d = data.value
  if (!d) return []
  return [
    { label: 'Commission', value: pct(d.commission_pct) },
    { label: 'Ad spend', value: pct(d.ad_spend_pct) },
    { label: 'Flat per video', value: money(d.flat_per_video) },
    { label: 'Flat per order', value: money(d.flat_per_order) },
    { label: 'Retainer', value: money(d.retainer) },
    { label: 'Cap', value: d.cap === 'none' ? 'No cap' : money(d.cap as number | null) },
    { label: 'Rating', value: d.rating !== null && d.rating !== undefined ? `${d.rating} / 5${d.reviews ? ` (${d.reviews} reviews)` : ''}` : null },
    { label: 'Creator earnings', value: d.creator_earnings ?? null },
    { label: 'Total creators', value: d.total_creators?.toString() ?? null },
    { label: 'Free samples', value: d.samples === true ? 'Yes' : d.samples === false ? 'No' : null },
    { label: 'New on Trybe', value: d.new === true ? 'Yes' : null }
  ].filter(fact => fact.value !== null)
})
</script>

<template>
  <UCard v-if="data">
    <template #header>
      <div class="flex items-center gap-3">
        <img v-if="data.logo" :src="data.logo" alt="" class="size-10 rounded-md object-cover" referrerpolicy="no-referrer">
        <div class="min-w-0 flex-1">
          <h2 class="font-semibold text-highlighted">
            Trybe data
          </h2>
          <p class="text-xs text-muted">
            From Scrybe<template v-if="data.scanned_on">
              · scanned {{ formatDate(data.scanned_on) }}
            </template>
            <template v-if="props.brandId">
              · ID <code>{{ props.brandId }}</code>
            </template>
          </p>
        </div>
        <UBadge
          v-if="data.matched"
          :label="data.matched === 'yes' ? 'Matched filters' : data.matched === 'no' ? 'Didn\'t match' : 'Match unknown'"
          :color="data.matched === 'yes' ? 'success' : data.matched === 'no' ? 'neutral' : 'warning'"
          variant="subtle"
        />
      </div>
    </template>

    <div class="space-y-4 text-sm">
      <p v-if="data.match_notes?.length" class="text-muted">
        {{ data.match_notes.join('; ') }}
      </p>

      <dl v-if="facts.length" class="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <div v-for="fact in facts" :key="fact.label">
          <dt class="text-xs text-muted">
            {{ fact.label }}
          </dt>
          <dd class="font-medium text-highlighted">
            {{ fact.value }}
          </dd>
        </div>
      </dl>

      <div v-if="data.pay_terms?.length">
        <p class="mb-1 text-xs text-muted">
          Pay terms on Trybe
        </p>
        <ul class="list-disc space-y-0.5 pl-4">
          <li v-for="term in data.pay_terms" :key="term">
            {{ term }}
          </li>
        </ul>
      </div>

      <div v-if="data.categories?.length" class="flex flex-wrap gap-1">
        <UBadge v-for="category in data.categories" :key="category" :label="category" color="neutral" variant="outline" size="sm" />
      </div>

      <div v-if="data.top_products?.length">
        <p class="mb-1 text-xs text-muted">
          Top products
        </p>
        <p>{{ data.top_products.join(', ') }}</p>
      </div>

      <div v-if="data.about">
        <p class="mb-1 text-xs text-muted">
          About
        </p>
        <p class="whitespace-pre-line">
          {{ data.about }}
        </p>
        <p v-if="aboutCutOff" class="mt-1 text-xs text-muted">
          Trybe only shows the start of this in its list, so that's all Scrybe could export.
          <a
            v-if="props.trybeUrl"
            :href="props.trybeUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-0.5 text-primary hover:underline"
          >Read the full description on Trybe<UIcon name="i-lucide-external-link" class="size-3" /></a>
        </p>
      </div>

      <!-- columns from a Scrybe export this version of Muttiplier doesn't know yet -->
      <dl v-if="data.extra && Object.keys(data.extra).length" class="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-default pt-3">
        <div v-for="(value, label) in data.extra" :key="label">
          <dt class="text-xs text-muted">
            {{ label }}
          </dt>
          <dd class="break-words text-highlighted">
            {{ value }}
          </dd>
        </div>
      </dl>
    </div>
  </UCard>
</template>
