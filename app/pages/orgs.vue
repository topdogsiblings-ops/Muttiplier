<script setup lang="ts">
// Someone in several orgs chooses which one to work in.
definePageMeta({ layout: 'plain' })

const { orgs, switchOrg } = useOrg()
const run = useAction()
const choosing = ref<string | null>(null)

async function choose(id: string) {
  choosing.value = id
  const ok = await run(() => switchOrg(id))
  if (!ok) choosing.value = null
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center p-4">
    <UCard class="w-full max-w-sm" :ui="{ body: 'space-y-4' }">
      <div class="text-center">
        <AppLogo class="mx-auto size-12 text-highlighted" />
        <h1 class="mt-2 text-xl font-semibold text-highlighted">
          Choose an organisation
        </h1>
      </div>
      <div class="space-y-2">
        <UButton
          v-for="org in orgs"
          :key="org.id"
          block
          size="lg"
          color="neutral"
          variant="subtle"
          :label="org.name"
          :loading="choosing === org.id"
          :disabled="!!choosing"
          @click="choose(org.id)"
        />
      </div>
    </UCard>
  </div>
</template>
