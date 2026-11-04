<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { access, isAdmin, reset } = useAccess()
const { orgs, currentOrg, switchOrg, signupOpen } = useOrg()
const run = useAction()
// The organisation menu at the top of the sidebar, under the logo (Nuxt UI's dashboard "teams
// menu"): your orgs to switch between, and (while new orgs are open) starting another.
const canCreateOrg = ref(false)
onMounted(async () => {
  canCreateOrg.value = await signupOpen()
})
const orgItems = computed(() => [
  orgs.value.map(org => ({
    label: org.name,
    avatar: { alt: org.name },
    type: 'checkbox' as const,
    checked: org.is_current,
    onSelect: (event: Event) => {
      event.preventDefault()
      if (!org.is_current) run(() => switchOrg(org.id))
    }
  })),
  ...(canCreateOrg.value ? [[{ label: 'New organisation', icon: 'i-lucide-plus', to: '/onboarding' }]] : [])
])
const supabase = useSupabaseClient()
const route = useRoute()

const items = computed<NavigationMenuItem[]>(() => [
  { label: 'Library', icon: 'i-lucide-library', to: '/library' },
  { label: 'Planner', icon: 'i-lucide-clapperboard', to: '/shoots', active: route.path.startsWith('/shoots') },
  { label: 'Brands', icon: 'i-lucide-store', to: '/brands', active: route.path.startsWith('/brands') },
  ...(isAdmin.value ? [{ label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }] : [])
])

async function signOut() {
  await supabase.auth.signOut()
  reset()
  await navigateTo('/login')
}
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible :ui="{ footer: 'border-t border-default' }">
      <template #header="{ collapsed }">
        <NuxtLink to="/shoots" class="flex items-center gap-2 px-1.5 text-highlighted" aria-label="Kreate">
          <AppLogo class="size-6 shrink-0" />
          <span v-if="!collapsed" class="flex min-w-0 items-baseline gap-1.5">
            <span class="text-lg font-semibold tracking-tight">Kreate</span>
            <span class="truncate text-xs font-light text-muted">by UGC Kompany</span>
          </span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <!-- the organisation picker, ruled off across the full width of the pane -->
        <div class="-mx-4 -mt-2 border-y border-default px-4 py-2">
          <UDropdownMenu
            :items="orgItems"
            :content="{ align: 'center', collisionPadding: 12 }"
            :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
          >
            <UButton
              :label="collapsed ? undefined : currentOrg?.name ?? 'Kreate'"
              :avatar="{ alt: currentOrg?.name ?? 'Kreate', size: '2xs' }"
              :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
              color="neutral"
              variant="ghost"
              block
              :square="collapsed"
              class="data-[state=open]:bg-elevated"
              :class="[!collapsed && 'py-2']"
              :ui="{ trailingIcon: 'text-dimmed' }"
              aria-label="Switch organisation"
            />
          </UDropdownMenu>
        </div>

        <UNavigationMenu :items="items" orientation="vertical" :collapsed="collapsed" />
      </template>

      <template #footer="{ collapsed }">
        <div class="flex w-full items-center gap-2">
          <div v-if="!collapsed" class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">
              {{ access?.display_name || access?.email }}
            </p>
            <p class="truncate text-xs text-muted capitalize">
              {{ access?.role }}
            </p>
          </div>
          <UButton icon="i-lucide-log-out" color="neutral" variant="ghost" aria-label="Sign out" @click="signOut" />
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
