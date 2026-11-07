<script setup lang="ts">
// Connect your AI (spec §11), the Settings tab: Kreate has no AI of its own; people connect theirs
// (Claude, ChatGPT…) to Kreate's connector, an MCP server at /mcp. This gives the address and the
// steps, and lists the AI apps this person has connected so they can disconnect one. Open to every
// member, not just admins: each person connects their own AI.
const supabase = useSupabaseClient()
const toast = useToast()
const { currentOrg } = useOrg()

const connectorUrl = computed(() => import.meta.client ? `${window.location.origin}/mcp` : '/mcp')

type Grant = { client: { id: string, name: string, uri: string, logo_uri: string }, granted_at: string }
const grants = ref<Grant[]>([])
const loading = ref(true)
const loadError = ref('')
/** the account the list is for: AI apps are connected per person */
const { access } = useAccess()
async function loadGrants() {
  loading.value = true
  const { data, error } = await supabase.auth.oauth.listGrants()
  loadError.value = error?.message ?? ''
  grants.value = Array.isArray(data) ? data : []
  loading.value = false
}
onMounted(loadGrants)

async function copyUrl() {
  await navigator.clipboard.writeText(connectorUrl.value)
  toast.add({ title: 'Connector address copied', color: 'success' })
}

const { confirmDialog } = useConfirm()
async function disconnect(grant: Grant) {
  if (!(await confirmDialog({
    title: `Disconnect ${grant.client.name}?`,
    description: 'It loses access to Kreate straight away. You can connect it again any time.',
    confirmLabel: 'Disconnect',
    danger: true
  }))) return
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId: grant.client.id })
  if (error) toast.add({ title: 'Couldn\'t disconnect it', description: error.message, color: 'error' })
  else toast.add({ title: `${grant.client.name} disconnected`, color: 'success' })
  await loadGrants()
}

const date = (value: string) => new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })
</script>

<template>
  <div class="space-y-4">
    <UCard>
      <template #header>
        <h3 class="font-semibold text-highlighted">
          Use your own AI with Kreate
        </h3>
        <p class="text-sm text-muted">
          Connect the AI app you already use, such as Claude or ChatGPT, and ask it to write hooks, CTAs and VOs for {{ currentOrg?.name ?? 'your organisation' }}.
          It reads your brands, Library, shoots and your voice from Settings → Scripts, and adds what it writes to your Library for you to review.
        </p>
      </template>

      <div class="space-y-4">
        <UFormField label="Connector address">
          <div class="flex gap-2">
            <UInput :model-value="connectorUrl" readonly class="flex-1 font-mono" />
            <UButton icon="i-lucide-copy" label="Copy" color="neutral" variant="subtle" @click="copyUrl" />
          </div>
        </UFormField>

        <ol class="list-decimal space-y-1.5 pl-5 text-sm text-default">
          <li>In your AI app, add a <span class="font-medium">custom connector</span> (often under Settings → Connectors) and paste the address above.</li>
          <li>Sign in to Kreate when it asks, and approve the connection.</li>
          <li>Ask it for what you need, e.g. “Write six curiosity hooks for our newest product, in our voice”.</li>
        </ol>
        <p class="text-xs text-muted">
          Custom connectors may need a paid plan in your AI app. What it adds is tagged <code>ai-draft</code> in the Library, so you can find and review it.
        </p>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="font-semibold text-highlighted">
          Connected AI apps
        </h3>
        <p v-if="access?.email" class="text-sm text-muted">
          The ones connected while signed in to Kreate as {{ access.email }}.
        </p>
      </template>
      <p v-if="loading" class="flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" /> Loading…
      </p>
      <p v-else-if="loadError" class="text-sm text-error">
        Couldn't load them: {{ loadError }}
      </p>
      <p v-else-if="!grants.length" class="text-sm text-muted">
        None yet.
      </p>
      <ul v-else class="divide-y divide-default">
        <li v-for="grant in grants" :key="grant.client.id" class="flex items-center gap-3 py-2">
          <UAvatar v-bind="aiAppLogo(grant.client)" :alt="grant.client.name" size="sm" :ui="{ icon: 'text-highlighted' }" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">
              {{ grant.client.name }}
            </p>
            <p class="text-xs text-muted">
              Connected {{ date(grant.granted_at) }}
            </p>
          </div>
          <UButton label="Disconnect" size="sm" color="neutral" variant="ghost" @click="disconnect(grant)" />
        </li>
      </ul>
    </UCard>
  </div>
</template>
