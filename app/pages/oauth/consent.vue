<script setup lang="ts">
// Connecting an AI app to Kreate (spec §11): Supabase Auth sends the person here, signed in, with
// an authorization_id. They see which app is asking and which organisation it will work in, and
// approve or deny; Supabase then hands the app its token and sends the browser back to it.
// The app works in their current organisation (picking another here switches to it).
definePageMeta({ layout: 'plain' })

const route = useRoute()
const supabase = useSupabaseClient()
const { orgs, currentOrg, load } = useOrg()
await load()

const authorizationId = String(route.query.authorization_id ?? '')
type Details = { client: { name: string, uri: string, logo_uri: string }, scope: string }
const details = ref<Details | null>(null)
const error = ref('')
const done = ref<'approved' | 'denied' | null>(null)
const sending = ref(false)

onMounted(async () => {
  if (!authorizationId) {
    error.value = 'This link is missing its request. Start connecting again from your AI app.'
    return
  }
  const { data, error: failure } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
  // their sign-in here has ended (e.g. signed out from another device): sign in, then come back
  if (failure && (failure.name === 'AuthSessionMissingError' || (failure as { code?: string }).code === 'session_not_found')) {
    await supabase.auth.signOut({ scope: 'local' })
    useSupabaseCookieRedirect().path.value = route.fullPath
    await navigateTo('/login?expired=1')
    return
  }
  if (failure || !data) {
    error.value = failure?.message ?? 'This request has expired. Start connecting again from your AI app.'
    return
  }
  // approved before: straight back to the app
  if ('redirect_url' in data) {
    window.location.assign(data.redirect_url)
    return
  }
  details.value = data
})

const orgId = ref(currentOrg.value?.id)
/** it connects as whoever is signed in to Kreate here */
const { access } = useAccess()
const orgItems = computed(() => orgs.value.map(org => ({ label: org.name, value: org.id })))
const orgName = computed(() => orgs.value.find(org => org.id === orgId.value)?.name ?? '')

/** What the app can do, in plain words (the scopes are Supabase's sign-in ones). */
const permissions = computed(() => [
  'Read your brands, products, Library and shoots',
  'Read your organisation\'s voice and script rules',
  'Add hooks and CTAs to your Library, tagged for you to review',
  ...(details.value?.scope.split(' ').includes('email') ? ['See your email address'] : [])
])

async function answer(approve: boolean) {
  sending.value = true
  error.value = ''
  try {
    // it works in the organisation chosen here
    if (approve && orgId.value && orgId.value !== currentOrg.value?.id) {
      const { error: switchFailure } = await supabase.rpc('set_active_org', { p_org_id: orgId.value })
      if (switchFailure) throw switchFailure
    }
    const { data, error: failure } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
    if (failure || !data) throw failure ?? new Error('Kreate couldn\'t finish connecting. Try again from your AI app.')
    done.value = approve ? 'approved' : 'denied'
    window.location.assign(data.redirect_url)
  } catch (failure) {
    error.value = (failure as Error).message
    sending.value = false
  }
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center p-4">
    <UCard class="w-full max-w-md" :ui="{ body: 'space-y-4' }">
      <div class="flex items-center justify-center gap-3">
        <AppLogo class="size-10 text-highlighted" />
        <template v-if="details">
          <UIcon name="i-lucide-arrow-left-right" class="size-5 text-muted" />
          <UAvatar v-bind="aiAppLogo(details.client)" :alt="details.client.name" size="lg" :ui="{ icon: 'text-highlighted' }" />
        </template>
      </div>

      <template v-if="done">
        <p class="text-center text-sm text-muted">
          {{ done === 'approved' ? 'Connected. Taking you back…' : 'Cancelled. Taking you back…' }}
        </p>
      </template>

      <template v-else-if="details">
        <div class="text-center">
          <h1 class="text-xl font-semibold text-highlighted">
            Connect {{ details.client.name }} to Kreate
          </h1>
          <p class="text-sm text-muted">
            {{ details.client.name }} will work in Kreate as you.
            <a v-if="details.client.uri" :href="details.client.uri" target="_blank" rel="noopener" class="underline">{{ details.client.uri }}</a>
          </p>
        </div>

        <p class="rounded-md bg-elevated/60 px-3 py-2 text-sm text-muted">
          It will work as <span class="font-medium text-highlighted">{{ access?.email }}</span>.
        </p>

        <UFormField v-if="orgs.length > 1" label="Organisation" help="It works in this organisation. Choosing another switches Kreate to it too.">
          <USelect v-model="orgId" :items="orgItems" class="w-full" />
        </UFormField>
        <p v-else class="text-sm text-muted">
          It works in <span class="font-medium text-highlighted">{{ orgName }}</span>.
        </p>

        <div>
          <p class="mb-1.5 text-sm font-medium text-highlighted">
            It will be able to:
          </p>
          <ul class="space-y-1 text-sm text-muted">
            <li v-for="permission in permissions" :key="permission" class="flex items-start gap-2">
              <UIcon name="i-lucide-check" class="mt-0.5 shrink-0 text-success" />{{ permission }}
            </li>
          </ul>
          <p class="mt-2 text-xs text-dimmed">
            It can't delete anything, plan shoots or change billing. You can disconnect it any time from Your account in Kreate (your photo, top right).
          </p>
        </div>

        <p v-if="error" class="text-sm text-error">
          {{ error }}
        </p>
        <div class="flex gap-2">
          <UButton class="flex-1" block label="Approve" :loading="sending" @click="answer(true)" />
          <UButton color="neutral" variant="subtle" label="Cancel" :disabled="sending" @click="answer(false)" />
        </div>
      </template>

      <p v-else-if="error" class="text-center text-sm text-error">
        {{ error }}
      </p>
      <p v-else class="flex items-center justify-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
        Checking the request…
      </p>
    </UCard>
  </div>
</template>
