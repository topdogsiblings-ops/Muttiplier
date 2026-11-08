<script setup lang="ts">
import type { MyOrg } from '~/composables/useOrg'

// Your account: everything that's yours rather than an organisation's. Your organisations (open
// one, or start another), your name and photo, your email and password, the AI apps you've
// connected, and signing out. Billing stays with each organisation (its Settings).
definePageMeta({ layout: 'account' })

const supabase = useSupabaseClient()
const toast = useToast()
const run = useAction()
const { orgs, load: loadOrgs, switchOrg, signupOpen } = useOrg()
const { profile, load: loadProfile, save, uploadPhoto, removePhoto } = useProfile()
const { reset } = useAccess()

const canCreateOrg = ref(false)
await Promise.all([loadOrgs(), loadProfile()])
onMounted(async () => {
  canCreateOrg.value = await signupOpen()
})

// --- organisations ---------------------------------------------------------
const opening = ref<string | null>(null)
async function open(org: MyOrg) {
  if (org.is_current) return navigateTo('/shoots')
  opening.value = org.id
  if (!(await run(() => switchOrg(org.id)))) opening.value = null
}
const status = (org: MyOrg) => !org.entitled
  ? { label: 'Needs billing', color: 'warning' as const }
  : null

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

// the sidebar's Connect your AI button links to #ai
onMounted(() => {
  if (useRoute().hash === '#ai') nextTick(() => document.getElementById('ai')?.scrollIntoView({ behavior: 'smooth' }))
})
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

    <!-- Organisations -->
    <section class="space-y-3">
      <h2 class="font-semibold text-highlighted">
        Your organisations
      </h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <button
          v-for="org in orgs"
          :key="org.id"
          type="button"
          class="flex items-center gap-3 rounded-lg border border-default p-3 text-left transition hover:bg-elevated/60 disabled:opacity-60"
          :class="org.is_current && 'ring-1 ring-inset ring-primary/60'"
          :disabled="!!opening"
          @click="open(org)"
        >
          <UAvatar :src="org.logo_url ?? undefined" :alt="org.name" size="lg" />
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium text-highlighted">
              {{ org.name }}
            </p>
            <p class="text-xs text-muted capitalize">
              {{ org.role }}<template v-if="org.is_current">
                · open now
              </template>
            </p>
          </div>
          <UBadge v-if="status(org)" :label="status(org)!.label" :color="status(org)!.color" variant="subtle" size="sm" />
          <UIcon v-if="opening === org.id" name="i-lucide-loader-circle" class="size-4 animate-spin text-muted" />
          <UIcon v-else name="i-lucide-chevron-right" class="size-4 text-dimmed" />
        </button>
        <NuxtLink
          v-if="canCreateOrg"
          to="/onboarding"
          class="flex items-center gap-3 rounded-lg border border-dashed border-default p-3 text-muted transition hover:bg-elevated/60 hover:text-default"
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

    <!-- Connect your AI -->
    <section id="ai" class="scroll-mt-4 space-y-3">
      <h2 class="font-semibold text-highlighted">
        Connect your AI
      </h2>
      <AiSettings />
    </section>
  </div>
</template>
