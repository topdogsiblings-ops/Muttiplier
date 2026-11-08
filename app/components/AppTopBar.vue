<script setup lang="ts">
// The bar across the top of every signed-in page: Kreate and the organisation you're in on the
// left (switch from it), your photo on the right: a menu with Your account (your organisations,
// profile and AI), light or dark, and signing out.
// On Your account there's no organisation to show, so it reads "Kreate / Your account".
const props = defineProps<{ account?: boolean }>()

const { orgs, currentOrg, switchOrg, signupOpen } = useOrg()
const { profile, load } = useProfile()
const { reset } = useAccess()
const supabase = useSupabaseClient()
const colorMode = useColorMode()
const run = useAction()

const canCreateOrg = ref(false)
onMounted(async () => {
  await Promise.all([
    profile.value ? undefined : load().catch(() => {}),
    signupOpen().then(open => (canCreateOrg.value = open))
  ])
})

const orgItems = computed(() => [
  orgs.value.map(org => ({
    label: org.name,
    avatar: { src: org.logo_url ?? undefined, alt: org.name },
    type: 'checkbox' as const,
    checked: org.is_current,
    onSelect: (event: Event) => {
      event.preventDefault()
      if (!org.is_current) run(() => switchOrg(org.id))
    }
  })),
  [
    { label: 'All organisations', icon: 'i-lucide-layout-grid', to: '/account' },
    ...(canCreateOrg.value ? [{ label: 'New organisation', icon: 'i-lucide-plus', to: '/onboarding' }] : [])
  ]
])

async function signOut() {
  await supabase.auth.signOut()
  reset()
  profile.value = null
  await navigateTo('/login')
}

/** a radio row per theme: picking one keeps the menu open so the change shows */
const themeItem = (label: string, value: 'light' | 'dark' | 'system', icon: string) => ({
  label,
  icon,
  type: 'checkbox' as const,
  checked: colorMode.preference === value,
  onSelect: (event: Event) => {
    event.preventDefault()
    colorMode.preference = value
  }
})

const accountItems = computed(() => [
  [{ type: 'label' as const, label: profile.value?.name || 'You', description: profile.value?.email, avatar: { src: profile.value?.photo ?? undefined, alt: profile.value?.name || 'You' } }],
  [{ label: 'Your account', icon: 'i-lucide-user-round', to: '/account' }],
  [
    themeItem('Light', 'light', 'i-lucide-sun'),
    themeItem('Dark', 'dark', 'i-lucide-moon'),
    themeItem('Match my device', 'system', 'i-lucide-monitor')
  ],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: signOut }]
])
</script>

<template>
  <header class="flex h-14 shrink-0 items-center gap-2 border-b border-default bg-default px-3 sm:px-4">
    <NuxtLink :to="currentOrg ? '/shoots' : '/account'" class="flex shrink-0 items-center gap-2 px-1 text-highlighted" aria-label="Kreate">
      <AppLogo class="size-6 shrink-0" />
      <span class="hidden items-baseline gap-1.5 sm:flex">
        <span class="text-lg font-semibold tracking-tight">Kreate</span>
        <span class="text-xs font-light text-muted">by UGC Kompany</span>
      </span>
    </NuxtLink>

    <span class="text-lg font-light text-dimmed" aria-hidden="true">/</span>

    <span v-if="props.account" class="truncate text-sm font-medium text-highlighted">Your account</span>
    <UDropdownMenu
      v-else
      :items="orgItems"
      :content="{ align: 'start', collisionPadding: 12 }"
      :ui="{ content: 'w-60' }"
    >
      <UButton
        :label="currentOrg?.name ?? 'Kreate'"
        :avatar="{ src: currentOrg?.logo_url ?? undefined, alt: currentOrg?.name ?? 'Kreate', size: '2xs' }"
        trailing-icon="i-lucide-chevrons-up-down"
        color="neutral"
        variant="ghost"
        class="min-w-0 data-[state=open]:bg-elevated"
        :ui="{ label: 'truncate', trailingIcon: 'text-dimmed' }"
        aria-label="Switch organisation"
      />
    </UDropdownMenu>

    <UDropdownMenu :items="accountItems" :content="{ align: 'end', collisionPadding: 12 }" :ui="{ content: 'w-60' }">
      <button type="button" class="ms-auto shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-primary" aria-label="Your account">
        <UAvatar :src="profile?.photo ?? undefined" :alt="profile?.name || profile?.email || 'You'" size="md" class="ring-1 ring-default transition hover:ring-2 hover:ring-primary" />
      </button>
    </UDropdownMenu>
  </header>
</template>
