<script setup lang="ts">
// Connect your AI (spec §11), in Your account: Kreate has no AI of its own; people connect theirs
// (Claude, ChatGPT…) to Kreate's connector, an MCP server at /mcp. This gives the address and the
// steps, and lists the AI apps this person has connected, with the organisations each may use
// (editable) and Disconnect. Each person connects their own AI.
const supabase = useSupabaseClient()
const toast = useToast()
const { orgs, currentOrg, load: loadOrgs } = useOrg()

const connectorUrl = computed(() => import.meta.client ? `${window.location.origin}/mcp` : '/mcp')

type Grant = AiGrant
const { grants, loadError, load } = useAiApps()
const loading = ref(true)
/** the account the list is for: AI apps are connected per person */
const { access } = useAccess()
/** the organisations each app may use, by app (client) id */
const access_ = ref(new Map<string, string[]>())
async function loadGrants() {
  loading.value = true
  const [, rows] = await Promise.all([
    load(),
    supabase.from('connector_org_access').select('client_id, org_id'),
    orgs.value.length ? undefined : loadOrgs()
  ])
  const byApp = new Map<string, string[]>()
  for (const row of rows.data ?? []) byApp.set(row.client_id, [...(byApp.get(row.client_id) ?? []), row.org_id])
  access_.value = byApp
  loading.value = false
}
/** an app's organisations: the ones picked, or (connected before picking existed) the current one */
const orgIdsOf = (grant: Grant) => access_.value.get(grant.client.id) ?? (currentOrg.value ? [currentOrg.value.id] : [])
const orgNamesOf = (grant: Grant) => orgs.value.filter(org => orgIdsOf(grant).includes(org.id)).map(org => org.name).join(', ') || 'None'

// editing which organisations an app may use
const editing = ref<Grant | null>(null)
const editIds = ref<string[]>([])
const savingOrgs = ref(false)
function editOrgs(grant: Grant) {
  editing.value = grant
  editIds.value = [...orgIdsOf(grant)]
}
async function saveOrgs() {
  if (!editing.value) return
  savingOrgs.value = true
  const { error } = await supabase.rpc('set_connector_orgs', { p_client_id: editing.value.client.id, p_org_ids: editIds.value })
  savingOrgs.value = false
  if (error) return toast.add({ title: 'Couldn\'t save that', description: error.message, color: 'error' })
  toast.add({ title: `${editing.value.client.name} updated`, color: 'success' })
  editing.value = null
  await loadGrants()
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
          Connect the AI app you already use, such as Claude or ChatGPT, and ask it to write hooks, CTAs and VOs for your organisation.
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
              Connected {{ date(grant.granted_at) }}<template v-if="orgs.length > 1">
                · {{ orgNamesOf(grant) }}
              </template>
            </p>
          </div>
          <UButton v-if="orgs.length > 1" label="Organisations" size="sm" color="neutral" variant="outline" @click="editOrgs(grant)" />
          <UButton label="Disconnect" size="sm" color="neutral" variant="ghost" @click="disconnect(grant)" />
        </li>
      </ul>
    </UCard>

    <UModal
      :open="!!editing"
      :title="`Organisations ${editing?.client.name ?? 'it'} can use`"
      description="It only reaches the ones ticked. You tell it which one you mean as you go."
      @update:open="value => { if (!value) editing = null }"
    >
      <template #body>
        <OrgChecklist v-model="editIds" :orgs="orgs" />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="editing = null" />
          <UButton label="Save" :loading="savingOrgs" :disabled="!editIds.length" @click="saveOrgs" />
        </div>
      </template>
    </UModal>
  </div>
</template>
