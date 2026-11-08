<script setup lang="ts">
// Starting a new org: for someone who isn't in one (the access gate sends them here while new orgs
// are open), or from the organisation menu. Members join through an admin's invite. What it does
// becomes its profile: its voice, given to its own AI when connected (changeable in Settings → Scripts).
definePageMeta({ layout: 'plain' })

const { orgs, createOrg } = useOrg()
const { reset } = useAccess()
const supabase = useSupabaseClient()
const run = useAction()

const name = ref('')
const slug = computed(() => slugify(name.value))
const profile = reactive<OrgProfile>({ ...EMPTY_PROFILE, language: defaultLanguage() })
const saving = ref(false)

/** The spelling the browser's locale suggests. */
function defaultLanguage() {
  const locale = import.meta.client ? navigator.language : ''
  return { 'en-AU': 'Australian English', 'en-GB': 'British English', 'en-US': 'American English', 'en-CA': 'Canadian English', 'en-NZ': 'New Zealand English' }[locale] ?? ''
}

const ready = computed(() => !!slug.value && !!profile.about.trim() && !!profile.products.trim() && !!profile.creators.trim() && !!profile.audience.trim())
const preview = computed(() => recommendedPreamble(name.value, parseOrgProfile(profile)))

async function create() {
  saving.value = true
  const ok = await run(() => createOrg(name.value.trim(), slug.value, parseOrgProfile(profile)))
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
    <UCard class="w-full max-w-lg" :ui="{ body: 'space-y-4' }">
      <div class="text-center">
        <AppLogo class="mx-auto size-12 text-highlighted" />
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

      <USeparator label="About your ads" />
      <p class="text-sm text-muted">
        This is your voice: when you connect your own AI to Kreate, it writes scripts the way you describe here. You can change it any time in Settings → Scripts.
      </p>
      <UFormField label="What does your organisation do?" required>
        <UInput v-model="profile.about" class="w-full" placeholder="a UGC agency making ads for beauty brands" />
      </UFormField>
      <UFormField label="What are your ad categories?" required help="Pick as many as you make ads for.">
        <AdCategoryPicker v-model="profile.products" />
      </UFormField>
      <UFormField label="Who films them?" required>
        <UInput v-model="profile.creators" class="w-full" placeholder="creators filming their routines at home" />
      </UFormField>
      <UFormField label="Who are they for?" required>
        <UInput v-model="profile.audience" class="w-full" placeholder="women in their 20s and 30s who love skincare" />
      </UFormField>
      <UFormField label="How should scripts sound?" hint="Optional">
        <UInput v-model="profile.voice" class="w-full" placeholder="warm, funny, never salesy" />
      </UFormField>
      <UFormField label="Spelling" hint="Optional">
        <USelect v-model="profile.language" :items="LANGUAGES" class="w-full" placeholder="Any" />
      </UFormField>
      <p v-if="ready" class="rounded-md bg-elevated p-3 text-xs text-muted">
        <span class="font-medium text-default">Your AI will be told:</span> {{ preview }}
      </p>

      <UButton block size="lg" label="Create" :loading="saving" :disabled="!ready" @click="create" />
      <UButton v-if="orgs.length" block color="neutral" variant="ghost" label="Back" to="/account" />
      <UButton v-else block color="neutral" variant="ghost" label="Sign out" @click="signOut" />
    </UCard>
  </div>
</template>
