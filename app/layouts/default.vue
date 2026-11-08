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
    avatar: { src: org.logo_url ?? undefined, alt: org.name },
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

// Connect your AI stays at the foot of the pane until they've connected an AI app
const { grants, loaded: aiLoaded, load: loadAiApps } = useAiApps()
onMounted(() => loadAiApps().catch(() => {}))
const showConnectAi = computed(() => aiLoaded.value && grants.value.length === 0)

/** the collapsed pane's labels: beside each icon, centred on it, as soon as it's hovered */
const tooltip = { delayDuration: 0, content: { side: 'right' as const, align: 'center' as const } }

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
            <UTooltip :text="currentOrg?.name ?? 'Kreate'" :disabled="!collapsed" v-bind="tooltip">
              <UButton
                :label="collapsed ? undefined : currentOrg?.name ?? 'Kreate'"
                :avatar="{ src: currentOrg?.logo_url ?? undefined, alt: currentOrg?.name ?? 'Kreate', size: '2xs' }"
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
            </UTooltip>
          </UDropdownMenu>
        </div>

        <UNavigationMenu :items="items" orientation="vertical" :collapsed="collapsed" :tooltip="tooltip" />

        <!-- Connect your AI (Settings → Connect your AI, open to every member), at the foot of the pane,
             until they've connected one -->
        <UTooltip v-if="showConnectAi" text="Connect your AI" :disabled="!collapsed" v-bind="tooltip">
          <UButton
            to="/settings?tab=ai"
            icon="i-lucide-plug"
            :label="collapsed ? undefined : 'Connect your AI'"
            color="neutral"
            variant="outline"
            block
            :square="collapsed"
            class="mt-auto"
            aria-label="Connect your AI"
          />
        </UTooltip>
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
          <UTooltip text="Sign out" :disabled="!collapsed" v-bind="tooltip">
            <UButton icon="i-lucide-log-out" color="neutral" variant="ghost" aria-label="Sign out" @click="signOut" />
          </UTooltip>
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
