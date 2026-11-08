<script setup lang="ts">
import type { MyOrg } from '~/composables/useOrg'
import type { Database } from '#shared/types/database.types'

// Your account: everything that's yours rather than an organisation's, in three tabs (kept in the
// URL as ?tab=): Organisations (each at a glance; open one, or start another), Profile (name,
// photo, email, password) and Connect your AI. Billing stays with each organisation (its Settings).
definePageMeta({ layout: 'account' })

const tabs = [
  { label: 'Organisations', value: 'organisations', icon: 'i-lucide-building-2' },
  { label: 'Profile', value: 'profile', icon: 'i-lucide-user-round' },
  { label: 'Connect your AI', value: 'ai', icon: 'i-lucide-plug' }
]
const route = useRoute()
const router = useRouter()
// older links used #ai
const tabFrom = (value: unknown) => tabs.some(t => t.value === value) ? String(value) : route.hash === '#ai' ? 'ai' : 'organisations'
const tab = ref(tabFrom(route.query.tab))
watch(() => route.query.tab, value => (tab.value = tabFrom(value)))
watch(tab, (value) => {
  if (route.query.tab !== value) router.replace({ query: { ...route.query, tab: value }, hash: '' })
})

const supabase = useSupabaseClient()
const toast = useToast()
const run = useAction()
const { orgs, load: loadOrgs, switchOrg, signupOpen } = useOrg()
const { profile, load: loadProfile, save, uploadPhoto, removePhoto } = useProfile()
const { reset } = useAccess()

const canCreateOrg = ref(false)
type Summary = Database['public']['Functions']['my_org_summaries']['Returns'][number]
const summaries = shallowRef(new Map<string, Summary>())
async function loadSummaries(): Promise<Summary[]> {
  const { data, error } = await supabase.rpc('my_org_summaries')
  if (error) throw error
  return (data ?? []) as Summary[]
}
await Promise.all([
  loadOrgs(),
  loadProfile(),
  // the at-a-glance numbers are extra: the cards still show without them
  loadSummaries().then(rows => (summaries.value = new Map(rows.map(row => [row.org_id, row])))).catch(() => {})
])
onMounted(async () => {
  canCreateOrg.value = await signupOpen()
})

// --- organisations ---------------------------------------------------------
const opening = ref<string | null>(null)
async function open(org: MyOrg) {
  if (org.is_current) return navigateTo('/library')
  opening.value = org.id
  if (!(await run(() => switchOrg(org.id)))) opening.value = null
}
const day = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** where its billing stands, in a few words */
function billing(org: MyOrg): { label: string, color: 'success' | 'info' | 'warning' | 'error' | 'neutral' } {
  const summary = summaries.value.get(org.id)
  if (summary?.billing_exempt) return { label: 'Exempt', color: 'neutral' }
  switch (summary?.subscription_status) {
    case 'trialing': return { label: summary.trial_end ? `Trial · ends ${day(summary.trial_end)}` : 'Trial', color: 'info' }
    case 'active': return summary.cancel_at_period_end
      ? { label: `Ends ${day(summary.current_period_end)}`, color: 'warning' }
      : { label: summary.current_period_end ? `Active · renews ${day(summary.current_period_end)}` : 'Active', color: 'success' }
    case 'past_due': return { label: 'Payment due', color: 'warning' }
  }
  return org.entitled ? { label: 'Active', color: 'success' } : { label: 'Needs billing', color: 'error' }
}

/** an org at a glance: its team as faces, its shoots as a pipeline, and two big numbers */
function glance(org: MyOrg) {
  const summary = summaries.value.get(org.id)
  if (!summary) return null
  // a row of up to four faces, then +N for the rest
  const faces = ((Array.isArray(summary.faces) ? summary.faces : []) as { name: string | null, photo: string | null }[]).slice(0, 4)
  const total = summary.draft_shoots + summary.active_shoots + summary.live_shoots
  const share = (count: number) => total ? `${(count / total) * 100}%` : '0%'
  return {
    faces,
    more: Math.max(0, summary.members - faces.length),
    team: [
      plural(summary.members, 'member'),
      plural(summary.channels, 'channel'),
      ...(summary.invites ? [`${summary.invites} invited`] : [])
    ].join(' · '),
    total,
    // the pipeline, left to right: drafts, on their way (planned to editing), Live
    pipeline: [
      { key: 'draft', label: `${summary.draft_shoots} draft${summary.draft_shoots === 1 ? '' : 's'}`, width: share(summary.draft_shoots), bar: 'bg-accented', dot: 'bg-accented' },
      { key: 'active', label: `${summary.active_shoots} active`, width: share(summary.active_shoots), bar: 'bg-info', dot: 'bg-info' },
      { key: 'live', label: `${summary.live_shoots} live`, width: share(summary.live_shoots), bar: 'bg-success', dot: 'bg-success' }
    ],
    recent: [
      ...(summary.shoots_this_month ? [`${summary.shoots_this_month} this month`] : []),
      ...(summary.last_shoot_at ? [`last ${day(summary.last_shoot_at)}`] : [])
    ].join(' · '),
    numbers: [
      { label: summary.products ? `brands · ${plural(summary.products, 'product')}` : 'brands', value: summary.brands },
      { label: `hooks + CTAs`, value: summary.hooks + summary.ctas }
    ]
  }
}

const klipLabel = { purchased: 'Klip', exempt: 'Klip', trial: 'Klip (trial)', none: '' } as const

// --- profile ---------------------------------------------------------------
const form = reactive({ name: '' })
watch(profile, (value) => {
  form.name = value?.name ?? ''
}, { immediate: true })
const savingProfile = ref(false)
const photoInput = ref<HTMLInputElement | null>(null)

async function pickPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > 2 * 1024 * 1024) {
    toast.add({ title: 'That photo is over 2 MB', description: 'Pick a smaller one.', color: 'error' })
    return
  }
  savingProfile.value = true
  await run(async () => {
    const url = await uploadPhoto(file)
    await save({ name: form.name, photo_url: url })
  }, 'Photo saved')
  savingProfile.value = false
}

async function clearPhoto() {
  savingProfile.value = true
  await run(async () => {
    await removePhoto()
    await save({ name: form.name, photo_url: null })
  }, 'Photo removed')
  savingProfile.value = false
}

async function saveName() {
  savingProfile.value = true
  await run(async () => {
    await save({ name: form.name, photo_url: profile.value?.photo_url ?? null })
    await loadOrgs()
  }, 'Name saved')
  savingProfile.value = false
}

// --- email -----------------------------------------------------------------
// Supabase emails a link to confirm the new address (and, with secure email change, the old one
// too); the change happens once it's confirmed.
const newEmail = ref('')
const emailOk = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.value.trim()) && newEmail.value.trim().toLowerCase() !== profile.value?.email)
const emailSent = ref('')
const savingEmail = ref(false)
async function changeEmail() {
  savingEmail.value = true
  const address = newEmail.value.trim().toLowerCase()
  const { error } = await supabase.auth.updateUser({ email: address }, { emailRedirectTo: `${window.location.origin}/account` })
  if (error) toast.add({ title: 'Couldn\'t change your email', description: error.message, color: 'error' })
  else {
    emailSent.value = address
    newEmail.value = ''
  }
  savingEmail.value = false
}

// --- password --------------------------------------------------------------
const password = reactive({ next: '', again: '' })
const passwordOk = computed(() => password.next.length >= 8 && password.next === password.again)
const savingPassword = ref(false)
async function changePassword() {
  savingPassword.value = true
  const { error } = await supabase.auth.updateUser({ password: password.next })
  if (error) {
    toast.add({
      title: 'Couldn\'t change your password',
      description: /reauth|recent/i.test(error.message) ? 'For your security, sign out and back in, then try again.' : error.message,
      color: 'error'
    })
  } else {
    Object.assign(password, { next: '', again: '' })
    toast.add({ title: 'Password saved', description: 'You can sign in with your email and this password.', color: 'success' })
  }
  savingPassword.value = false
}

async function signOut() {
  await supabase.auth.signOut()
  reset()
  profile.value = null
  await navigateTo('/login')
}

</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
    <div class="flex items-center gap-4">
      <UAvatar :src="profile?.photo ?? undefined" :alt="profile?.name || profile?.email" size="3xl" />
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-2xl font-semibold text-highlighted">
          {{ profile?.name || 'Your account' }}
        </h1>
        <p class="truncate text-sm text-muted">
          {{ profile?.email }}
        </p>
      </div>
      <UButton label="Sign out" icon="i-lucide-log-out" color="neutral" variant="subtle" @click="signOut" />
    </div>

    <UTabs
      v-model="tab"
      :items="tabs"
      :content="false"
      variant="link"
      class="w-full"
      :ui="{ list: 'overflow-x-auto overflow-y-hidden' }"
    />

    <!-- Organisations -->
    <section v-if="tab === 'organisations'" class="space-y-3">
      <div class="grid gap-3 sm:grid-cols-2">
        <button
          v-for="org in orgs"
          :key="org.id"
          type="button"
          class="flex flex-col gap-3 rounded-lg border border-default p-4 text-left transition hover:bg-elevated/60 disabled:opacity-60"
          :class="org.is_current && 'ring-1 ring-inset ring-primary/60'"
          :disabled="!!opening"
          @click="open(org)"
        >
          <div class="flex w-full items-center gap-3">
            <UAvatar :src="org.logo_url ?? undefined" :alt="org.name" size="lg" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-highlighted">
                {{ org.name }}
              </p>
              <p class="text-xs text-muted">
                <span class="capitalize">{{ org.role }}</span><template v-if="org.is_current">
                  · Open now
                </template>
              </p>
            </div>
            <UIcon v-if="opening === org.id" name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin text-muted" />
            <UIcon v-else name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" />
          </div>

          <div v-if="glance(org)" class="w-full space-y-4 border-t border-default pt-3">
            <!-- team: faces, admins first -->
            <div class="flex items-center gap-3">
              <div class="flex shrink-0 -space-x-2">
                <UAvatar
                  v-for="(face, index) in glance(org)!.faces"
                  :key="index"
                  :src="face.photo ?? undefined"
                  :alt="face.name ?? ''"
                  size="sm"
                  class="ring-2 ring-(--ui-bg)"
                />
                <UAvatar v-if="glance(org)!.more" :text="`+${glance(org)!.more}`" size="sm" class="ring-2 ring-(--ui-bg)" />
              </div>
              <p class="min-w-0 truncate text-sm text-muted">
                {{ glance(org)!.team }}
              </p>
            </div>

            <!-- shoots: one bar, drafts → active → live -->
            <div class="space-y-1.5">
              <div class="flex items-baseline justify-between gap-2">
                <p class="text-xs font-medium text-dimmed">
                  Shoots
                </p>
                <p v-if="glance(org)!.recent" class="truncate text-xs text-dimmed">
                  {{ glance(org)!.recent }}
                </p>
              </div>
              <div class="flex h-2 w-full overflow-hidden rounded-full bg-elevated">
                <div
                  v-for="part in glance(org)!.pipeline"
                  :key="part.key"
                  :class="part.bar"
                  :style="{ width: part.width }"
                />
              </div>
              <p v-if="!glance(org)!.total" class="text-xs text-muted">
                No shoots yet
              </p>
              <ul v-else class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                <li v-for="part in glance(org)!.pipeline" :key="part.key" class="flex items-center gap-1.5">
                  <span class="size-2 rounded-full" :class="part.dot" />{{ part.label }}
                </li>
              </ul>
            </div>

            <!-- brands and the Library, as big numbers -->
            <div class="grid grid-cols-2 gap-3">
              <div v-for="number in glance(org)!.numbers" :key="number.label">
                <p class="text-2xl font-semibold tabular-nums text-highlighted">
                  {{ number.value }}
                </p>
                <p class="truncate text-xs text-muted">
                  {{ number.label }}
                </p>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap gap-1.5">
            <UBadge :label="billing(org).label" :color="billing(org).color" variant="subtle" size="sm" />
            <UBadge v-if="klipLabel[org.klip_access]" :label="klipLabel[org.klip_access]" icon="i-lucide-scissors" color="neutral" variant="outline" size="sm" />
          </div>
        </button>
        <NuxtLink
          v-if="canCreateOrg"
          to="/onboarding"
          class="flex min-h-32 items-center justify-center gap-3 rounded-lg border border-dashed border-default p-4 text-muted transition hover:bg-elevated/60 hover:text-default"
        >
          <span class="flex size-10 items-center justify-center rounded-full bg-elevated">
            <UIcon name="i-lucide-plus" class="size-5" />
          </span>
          <span class="font-medium">New organisation</span>
        </NuxtLink>
      </div>
      <p class="text-xs text-muted">
        Each organisation has its own plan and billing, in its Settings.
      </p>
    </section>

    <!-- Profile -->
    <div v-else-if="tab === 'profile'" class="space-y-6">
      <UCard>
        <template #header>
          <h2 class="font-semibold text-highlighted">
            Profile
          </h2>
          <p class="text-sm text-muted">
            The same in every organisation you're in.
          </p>
        </template>
        <div class="space-y-4">
          <div class="flex items-center gap-4">
            <UAvatar :src="profile?.photo ?? undefined" :alt="form.name || profile?.email" size="2xl" />
            <div class="space-y-1.5">
              <div class="flex gap-2">
                <UButton
                  :label="profile?.photo ? 'Change photo' : 'Add photo'"
                  icon="i-lucide-image-up"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :loading="savingProfile"
                  @click="photoInput?.click()"
                />
                <UButton
                  v-if="profile?.photo_url"
                  label="Remove"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :disabled="savingProfile"
                  @click="clearPhoto"
                />
              </div>
              <p class="text-xs text-muted">
                PNG, JPG, WebP or GIF, up to 2 MB.
              </p>
            </div>
            <input ref="photoInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" @change="pickPhoto">
          </div>
          <UFormField label="Your name" required help="How you appear on shot lists and to your teams">
            <UInput v-model="form.name" class="w-full" />
          </UFormField>
        </div>
        <template #footer>
          <UButton
            label="Save name"
            :loading="savingProfile"
            :disabled="!form.name.trim() || form.name.trim() === profile?.name"
            @click="saveName"
          />
        </template>
      </UCard>

      <!-- Email -->
      <UCard>
        <template #header>
          <h2 class="font-semibold text-highlighted">
            Email
          </h2>
          <p class="text-sm text-muted">
            You sign in with <span class="font-medium text-highlighted">{{ profile?.email }}</span>.
          </p>
        </template>
        <UAlert
          v-if="emailSent"
          color="success"
          variant="subtle"
          icon="i-lucide-mail-check"
          title="Check your email"
          :description="`We've sent a link to ${emailSent}. Your email changes once you open it (you may get one at your current address to confirm too).`"
          class="mb-4"
        />
        <UFormField label="New email">
          <UInput v-model="newEmail" type="email" autocomplete="email" class="w-full" @keydown.enter="emailOk && changeEmail()" />
        </UFormField>
        <template #footer>
          <UButton label="Change email" :loading="savingEmail" :disabled="!emailOk" @click="changeEmail" />
        </template>
      </UCard>

      <!-- Password -->
      <UCard>
        <template #header>
          <h2 class="font-semibold text-highlighted">
            Password
          </h2>
          <p class="text-sm text-muted">
            Set one to sign in with your email and password, as well as with Google if you use it.
          </p>
        </template>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="New password" help="At least 8 characters">
            <UInput v-model="password.next" type="password" autocomplete="new-password" class="w-full" />
          </UFormField>
          <UFormField label="Again" :error="password.again && password.again !== password.next ? 'They don\'t match' : undefined">
            <UInput v-model="password.again" type="password" autocomplete="new-password" class="w-full" />
          </UFormField>
        </div>
        <template #footer>
          <UButton label="Save password" :loading="savingPassword" :disabled="!passwordOk" @click="changePassword" />
        </template>
      </UCard>
    </div>

    <!-- Connect your AI -->
    <AiSettings v-else-if="tab === 'ai'" />
  </div>
</template>
