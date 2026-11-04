<script setup lang="ts">
// Connecting UGC Klip: it shows a code and opens this page (the code filled in). The member
// checks it matches, picks the org Klip is for, and approves; Klip then gets its license. Signing in
// first comes back here.
definePageMeta({ layout: 'plain' })

const route = useRoute()
const { orgs, currentOrg, load } = useOrg()
await load()

const code = ref(String(route.query.code ?? ''))
const orgId = ref(currentOrg.value?.id ?? orgs.value[0]?.id)
const orgItems = computed(() => orgs.value.map(org => ({ label: org.name, value: org.id })))

/** "kq7xm2pd" -> "KQ7X-M2PD" as it's typed */
const normalised = computed(() => code.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))
watch(normalised, (value) => {
  const shown = value.length > 4 ? `${value.slice(0, 4)}-${value.slice(4)}` : value
  if (shown !== code.value) code.value = shown
}, { immediate: true })

const valid = ref<boolean | null>(null)
watch(normalised, async (value) => {
  valid.value = null
  if (value.length !== 8) return
  const result = await $fetch<{ valid: boolean }>('/api/license/device/check', { query: { code: value } }).catch(() => ({ valid: false }))
  if (normalised.value === value) valid.value = result.valid
}, { immediate: true })

const done = ref<'approved' | 'denied' | null>(null)
const error = ref('')
const sending = ref(false)
async function answer(approve: boolean) {
  sending.value = true
  error.value = ''
  try {
    await $fetch('/api/license/device/approve', { method: 'POST', body: { code: normalised.value, orgId: orgId.value, approve } })
    done.value = approve ? 'approved' : 'denied'
  } catch (failure) {
    error.value = (failure as { data?: { statusMessage?: string } }).data?.statusMessage ?? (failure as Error).message
  }
  sending.value = false
}

const orgName = computed(() => orgs.value.find(org => org.id === orgId.value)?.name)
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center p-4">
    <UCard class="w-full max-w-sm" :ui="{ body: 'space-y-4' }">
      <div class="text-center">
        <UIcon name="i-lucide-scissors" class="size-10 text-primary" />
        <h1 class="mt-2 text-xl font-semibold text-highlighted">
          Connect UGC Klip
        </h1>
      </div>

      <template v-if="done === 'approved'">
        <p class="text-center text-sm text-muted">
          UGC Klip is connected to {{ orgName }}. You can close this tab and go back to it.
        </p>
      </template>
      <template v-else-if="done === 'denied'">
        <p class="text-center text-sm text-muted">
          Cancelled: UGC Klip wasn't connected. You can close this tab.
        </p>
      </template>
      <template v-else>
        <p class="text-center text-sm text-muted">
          Check this matches the code UGC Klip is showing. Only approve a code you started yourself.
        </p>
        <UFormField label="Code" :error="valid === false ? 'That code has expired or was already used. Start again in UGC Klip.' : false">
          <UInput v-model="code" class="w-full" size="xl" :ui="{ base: 'text-center font-mono tracking-widest' }" placeholder="XXXX-XXXX" autofocus />
        </UFormField>
        <UFormField v-if="orgs.length > 1" label="Organisation">
          <USelect v-model="orgId" :items="orgItems" class="w-full" />
        </UFormField>
        <p v-if="error" class="text-sm text-error">
          {{ error }}
        </p>
        <div class="flex gap-2">
          <UButton class="flex-1" block label="Approve" :loading="sending" :disabled="!valid || !orgId" @click="answer(true)" />
          <UButton color="neutral" variant="subtle" label="Cancel" :disabled="!valid || sending" @click="answer(false)" />
        </div>
      </template>
    </UCard>
  </div>
</template>
