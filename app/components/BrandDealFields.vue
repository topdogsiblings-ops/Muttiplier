<script setup lang="ts">
// Trybe deal terms for a brand: how it pays (flat fee, commission or both) and its Trybe numbers.
export interface BrandDeal {
  pay_model: string | undefined
  flat_fee: number | undefined
  commission_pct: number | undefined
  currency: string
  trybe_score: number | undefined
  trybe_url: string
}

const deal = defineModel<BrandDeal>({ required: true })

const showFlat = computed(() => deal.value.pay_model === 'flat' || deal.value.pay_model === 'both')
const showCommission = computed(() => deal.value.pay_model === 'commission' || deal.value.pay_model === 'both')
</script>

<template>
  <div class="space-y-4">
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="Pay model">
        <USelect v-model="deal.pay_model" :items="PAY_MODELS" placeholder="Not agreed yet" class="w-full" />
      </UFormField>
      <UFormField label="Currency">
        <USelect v-model="deal.currency" :items="CURRENCIES" class="w-full" />
      </UFormField>
      <UFormField v-if="showFlat" label="Flat fee" help="Per approved video">
        <UInput v-model.number="deal.flat_fee" type="number" min="0" step="0.01" class="w-full">
          <template #leading>
            <span class="text-xs text-muted">{{ currencySymbol(deal.currency) }}</span>
          </template>
        </UInput>
      </UFormField>
      <UFormField v-if="showCommission" label="Commission" help="On sales">
        <UInput v-model.number="deal.commission_pct" type="number" min="0" max="100" step="0.5" class="w-full">
          <template #trailing>
            <span class="text-xs text-muted">%</span>
          </template>
        </UInput>
      </UFormField>
      <UFormField label="Trybe score">
        <UInput v-model.number="deal.trybe_score" type="number" min="0" step="0.1" class="w-full" />
      </UFormField>
    </div>
    <UFormField label="Trybe URL" :error="isValidUrl(deal.trybe_url) ? undefined : 'Enter a valid link'">
      <UInput v-model="deal.trybe_url" type="url" icon="i-lucide-link" placeholder="https://" class="w-full" />
    </UFormField>
  </div>
</template>
