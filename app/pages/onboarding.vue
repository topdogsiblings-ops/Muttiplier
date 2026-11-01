<script setup lang="ts">
// Starting a new org, for someone who isn't in one. The access gate only sends people here while
// new orgs are open (they're closed until billing exists); members join through an admin's invite.
definePageMeta({ layout: 'plain' })

const { createOrg } = useOrg()
const { reset } = useAccess()
const supabase = useSupabaseClient()
const run = useAction()

const name = ref('')
const slug = computed(() => slugify(name.value))
const saving = ref(false)

async function create() {
  saving.value = true
  const ok = await run(() => createOrg(name.value.trim(), slug.value))
  if (!ok) saving.value = false
}

async function signOut() {
  await supabase.auth.signOut()
  reset()
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center p-4">
    <UCard class="w-full max-w-sm" :ui="{ body: 'space-y-4' }">
      <div class="text-center">
        <UIcon name="i-lucide-dog" class="size-10 text-primary" />
        <h1 class="mt-2 text-xl font-semibold text-highlighted">
          Start your organisation
        </h1>
        <p class="text-sm text-muted">
          You'll be its admin, and can invite your team. If your team is already here, ask an admin to invite you instead.
        </p>
      </div>
      <UFormField label="Organisation name" required>
        <UInput v-model="name" class="w-full" autofocus />
      </UFormField>
      <UButton block size="lg" label="Create" :loading="saving" :disabled="!slug" @click="create" />
      <UButton block color="neutral" variant="ghost" label="Sign out" @click="signOut" />
    </UCard>
  </div>
</template>
