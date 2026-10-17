<script setup lang="ts">
// Settings → Dropbox (spec §12): connect the team's Dropbox once, choose the folder everything
// goes under, or disconnect. Connecting goes through Dropbox's own sign-in page and comes back
// to /settings?tab=dropbox&dropbox=connected (or =error&message=…).
const route = useRoute()
const router = useRouter()
const db = useDb()
const run = useAction()
const toast = useToast()
const { confirmDialog } = useConfirm()
const { status, refresh } = useDropbox()

const loading = ref(true)
onMounted(async () => {
  await refresh().catch(() => {})
  loading.value = false
  // back from Dropbox's sign-in
  if (route.query.dropbox) {
    if (route.query.dropbox === 'connected') {
      toast.add({ title: 'Dropbox connected', description: 'Now choose the folder clips go into.', color: 'success', icon: 'i-lucide-circle-check' })
      browse(status.value?.root ?? '')
    } else {
      toast.add({ title: 'Dropbox wasn\'t connected', description: String(route.query.message ?? 'Try again.'), color: 'error', icon: 'i-lucide-cloud-off' })
    }
    router.replace({ query: { tab: 'dropbox' } })
  }
})

const connect = () => navigateTo('/api/dropbox/connect', { external: true })

const disconnecting = ref(false)
async function disconnect() {
  if (!(await confirmDialog({
    title: 'Disconnect Dropbox?',
    description: 'Clips will upload in test mode until it\'s connected again. Clips already in Dropbox stay there.',
    confirmLabel: 'Disconnect',
    danger: true
  }))) return
  disconnecting.value = true
  await run(async () => {
    await $fetch('/api/dropbox/disconnect', { method: 'POST' })
    await refresh()
  }, 'Dropbox disconnected')
  disconnecting.value = false
}

// --- choosing the root folder -------------------------------------------------------------

const picking = ref(false)
const folderPath = ref('')
const folders = ref<{ name: string, path: string }[]>([])
const listing = ref(false)
const listError = ref('')

async function browse(path: string) {
  picking.value = true
  listing.value = true
  listError.value = ''
  try {
    const result = await $fetch<{ path: string, folders: { name: string, path: string }[] }>('/api/dropbox/folders', { query: { path } })
    folderPath.value = result.path
    folders.value = result.folders
  } catch (error) {
    listError.value = (error as { data?: { statusMessage?: string } }).data?.statusMessage ?? 'Couldn\'t open that folder.'
    // a stale root (e.g. renamed in Dropbox): start from the top instead
    if (path) return browse('')
  } finally {
    listing.value = false
  }
}

/** "/UGC/Clients" -> [{ name: 'Dropbox', path: '' }, { name: 'UGC', path: '/UGC' }, { name: 'Clients', path: '/UGC/Clients' }] */
const crumbs = computed(() => {
  const parts = folderPath.value.split('/').filter(Boolean)
  return [{ name: 'Dropbox', path: '' }, ...parts.map((name, index) => ({ name, path: `/${parts.slice(0, index + 1).join('/')}` }))]
})

const saving = ref(false)
async function useFolder() {
  saving.value = true
  const ok = await run(async () => {
    must(await db.from('dropbox_connection').update({ root: folderPath.value }).eq('singleton', true))
    await refresh()
  }, `Clips will go into ${folderPath.value}`)
  saving.value = false
  if (ok) picking.value = false
}
</script>

<template>
  <div class="space-y-4">
    <p class="text-sm text-muted">
      Clips upload from each phone straight into this Dropbox once a shoot is ended. One connection for the whole team.
    </p>

    <UAlert
      v-if="status && !status.configured"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Dropbox isn't set up on the server"
      description="Add DROPBOX_APP_KEY and DROPBOX_APP_SECRET to the environment variables, then redeploy."
    />

    <UCard>
      <div v-if="loading" class="flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="animate-spin" /> Checking Dropbox…
      </div>

      <!-- not connected -->
      <div v-else-if="!status?.connected" class="flex flex-wrap items-center gap-3">
        <UIcon name="i-lucide-cloud-off" class="size-6 text-muted" />
        <div class="min-w-0 flex-1">
          <p class="font-medium text-highlighted">
            Not connected
          </p>
          <p class="text-sm text-muted">
            Uploads run in test mode until Dropbox is connected.
          </p>
        </div>
        <UButton label="Connect Dropbox" icon="i-simple-icons-dropbox" :disabled="!status?.configured" @click="connect" />
      </div>

      <!-- connected -->
      <div v-else class="space-y-4">
        <div class="flex flex-wrap items-center gap-3">
          <UIcon name="i-lucide-cloud-check" class="size-6 text-success" />
          <div class="min-w-0 flex-1">
            <p class="font-medium text-highlighted">
              Connected to {{ status.accountName ?? 'Dropbox' }}
            </p>
            <p v-if="status.accountEmail" class="truncate text-sm text-muted">
              {{ status.accountEmail }}
            </p>
          </div>
          <UButton label="Disconnect" color="neutral" variant="ghost" :loading="disconnecting" @click="disconnect" />
        </div>

        <div class="flex flex-wrap items-center gap-3 border-t border-default pt-4">
          <UIcon name="i-lucide-folder" class="size-5 text-muted" />
          <div class="min-w-0 flex-1">
            <p class="text-sm text-muted">
              Clips go into
            </p>
            <p class="truncate font-mono text-highlighted">
              {{ status.root }}
            </p>
          </div>
          <UButton label="Choose folder" icon="i-lucide-folder-search" color="neutral" variant="subtle" @click="browse(status.root)" />
        </div>
      </div>
    </UCard>

    <UModal v-model:open="picking" title="Choose the folder clips go into" description="Brands, products and shoots are filed inside it.">
      <template #body>
        <div class="space-y-3">
          <!-- where we are -->
          <div class="flex flex-wrap items-center gap-1 text-sm">
            <template v-for="(crumb, index) in crumbs" :key="crumb.path">
              <UIcon v-if="index" name="i-lucide-chevron-right" class="size-3.5 text-dimmed" />
              <button
                type="button"
                class="rounded px-1 hover:bg-elevated"
                :class="index === crumbs.length - 1 ? 'font-medium text-highlighted' : 'text-muted'"
                @click="browse(crumb.path)"
              >
                {{ crumb.name }}
              </button>
            </template>
          </div>

          <p v-if="listError" class="text-sm text-error">
            {{ listError }}
          </p>
          <div class="max-h-80 divide-y divide-default overflow-y-auto rounded-lg border border-default">
            <div v-if="listing" class="flex items-center gap-2 px-3 py-4 text-sm text-muted">
              <UIcon name="i-lucide-loader-circle" class="animate-spin" /> Loading folders…
            </div>
            <template v-else>
              <button
                v-for="folder in folders"
                :key="folder.path"
                type="button"
                class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-elevated/50"
                @click="browse(folder.path)"
              >
                <UIcon name="i-lucide-folder" class="size-4 shrink-0 text-muted" />
                <span class="min-w-0 flex-1 truncate text-highlighted">{{ folder.name }}</span>
                <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed" />
              </button>
              <p v-if="!folders.length" class="px-3 py-4 text-center text-sm text-muted">
                No folders in here.
              </p>
            </template>
          </div>
        </div>
      </template>
      <template #footer="{ close }">
        <div class="flex w-full items-center justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="close" />
          <UButton
            :label="folderPath ? `Use ${folderPath.split('/').pop()}` : 'Open a folder first'"
            icon="i-lucide-check"
            :disabled="!folderPath || listing"
            :loading="saving"
            @click="useFolder"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
