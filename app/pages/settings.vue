<script setup lang="ts">
import type { Row } from '#shared/types/models'
import type { Json } from '#shared/types/database.types'

const db = useDb()
const run = useAction()
const { confirmDialog } = useConfirm()
const { people, channels, settings, load } = useRefData()
const { access } = useAccess()

const tab = ref('people')
const tabs = [
  { label: 'People', value: 'people', icon: 'i-lucide-users' },
  { label: 'Channels', value: 'channels', icon: 'i-lucide-tv' },
  { label: 'Allowlist', value: 'allowlist', icon: 'i-lucide-shield-check' },
  { label: 'Defaults', value: 'defaults', icon: 'i-lucide-timer' }
]

const allowed = ref<Row<'allowed_users'>[]>([])
async function loadAllowed() {
  allowed.value = must(await db.from('allowed_users').select('*').order('email'))
}

// which channels each person appears on
const personChannels = ref<{ person_id: string, channel_id: string }[]>([])
async function loadPersonChannels() {
  personChannels.value = must(await db.from('person_channels').select('person_id, channel_id'))
}
const channelsOf = (personId: string) => personChannels.value.filter(link => link.person_id === personId).map(link => link.channel_id)

await Promise.all([load(true), loadAllowed(), loadPersonChannels()])

const saving = ref(false)

// --- people ----------------------------------------------------------------
const personOpen = ref(false)
const person = reactive({ id: '', name: '', slug: '', active: true, allowed_user_id: undefined as string | undefined, channel_ids: [] as string[] })

function editPerson(row?: Row<'people'>) {
  Object.assign(person, { id: row?.id ?? '', name: row?.name ?? '', slug: row?.slug ?? '', active: row?.active ?? true, allowed_user_id: row?.allowed_user_id ?? undefined, channel_ids: row ? channelsOf(row.id) : [] })
  personOpen.value = true
}
watch(() => person.name, (name) => {
  if (!person.id) person.slug = slugify(name)
})

/** Allowlisted users not already linked to another person. */
const linkOptions = computed(() => allowed.value
  .filter(user => !people.value.some(p => p.allowed_user_id === user.id && p.id !== person.id))
  .map(user => ({ label: user.display_name ? `${user.display_name} (${user.email})` : user.email, value: user.id })))
const linkedUser = (id: string | null) => allowed.value.find(user => user.id === id)

async function savePerson() {
  saving.value = true
  const ok = await run(async () => {
    const fields = { name: person.name.trim(), active: person.active, allowed_user_id: person.allowed_user_id ?? null }
    const id = person.id
      ? (must(await db.from('people').update(fields).eq('id', person.id)), person.id)
      : mustOne(await db.from('people').insert({ ...fields, slug: person.slug }).select('id').single()).id
    // channels: add the newly ticked, remove the unticked
    const current = channelsOf(id)
    const added = person.channel_ids.filter(channelId => !current.includes(channelId))
    const removed = current.filter(channelId => !person.channel_ids.includes(channelId))
    if (added.length) must(await db.from('person_channels').insert(added.map(channel_id => ({ person_id: id, channel_id }))))
    if (removed.length) must(await db.from('person_channels').delete().eq('person_id', id).in('channel_id', removed))
    await Promise.all([load(true), loadPersonChannels()])
  }, 'Person saved')
  saving.value = false
  if (ok) personOpen.value = false
}

// --- channels --------------------------------------------------------------
const channelOpen = ref(false)
const channel = reactive({ id: '', name: '', slug: '', dogs: [] as string[], dog_phrase: '', folder_slug: '', active: true })

function editChannel(row?: Row<'channels'>) {
  Object.assign(channel, {
    id: row?.id ?? '',
    name: row?.name ?? '',
    slug: row?.slug ?? '',
    dogs: [...(row?.dogs ?? [])],
    dog_phrase: row?.dog_phrase ?? '',
    folder_slug: row?.folder_slug ?? '',
    active: row?.active ?? true
  })
  channelOpen.value = true
}
watch(() => channel.name, (name) => {
  if (!channel.id) channel.slug = slugify(name)
})

async function saveChannel() {
  saving.value = true
  const ok = await run(async () => {
    const fields = {
      name: channel.name.trim(),
      dogs: channel.dogs.map(dog => dog.trim().toLowerCase()).filter(Boolean),
      dog_phrase: channel.dog_phrase.trim(),
      active: channel.active
    }
    if (channel.id) must(await db.from('channels').update(fields).eq('id', channel.id))
    else must(await db.from('channels').insert({ ...fields, slug: channel.slug, folder_slug: slugify(channel.folder_slug) }))
    await load(true)
  }, 'Channel saved')
  saving.value = false
  if (ok) channelOpen.value = false
}

// --- allowlist -------------------------------------------------------------
const userOpen = ref(false)
const allowedUser = reactive({ id: '', email: '', role: 'member', display_name: '' })
const roles = [{ label: 'Member', value: 'member' }, { label: 'Admin', value: 'admin' }]
const isSelf = (email: string) => email === access.value?.email

function editUser(row?: Row<'allowed_users'>) {
  Object.assign(allowedUser, { id: row?.id ?? '', email: row?.email ?? '', role: row?.role ?? 'member', display_name: row?.display_name ?? '' })
  userOpen.value = true
}

async function saveUser() {
  saving.value = true
  const ok = await run(async () => {
    const fields = { role: allowedUser.role, display_name: allowedUser.display_name.trim() || null }
    if (allowedUser.id) must(await db.from('allowed_users').update(fields).eq('id', allowedUser.id))
    else must(await db.from('allowed_users').insert({ ...fields, email: allowedUser.email.trim().toLowerCase() }))
    await loadAllowed()
  }, 'Allowlist updated')
  saving.value = false
  if (ok) userOpen.value = false
}

async function removeUser(row: Row<'allowed_users'>) {
  if (!(await confirmDialog({
    title: `Remove ${row.email} from the allowlist?`,
    description: 'They lose access immediately.',
    confirmLabel: 'Remove',
    danger: true
  }))) return
  await run(async () => {
    must(await db.from('allowed_users').delete().eq('id', row.id))
    await loadAllowed()
  }, 'Removed')
}

// --- defaults --------------------------------------------------------------
const defaults = reactive({
  default_submission_rate: 15,
  minutes_per_hook: 4.5,
  minutes_per_cta_sync: 3,
  minutes_per_vo: 9,
  minutes_per_cta_vo: 3,
  productive_hours_per_day: 6,
  words_per_second: 2.5
})
/** General product shots suggested on every shoot (pack shots, label close-ups…). */
const generalBroll = ref<BrollSuggestion[]>([])

watch(settings, (value) => {
  if (!value) return
  Object.assign(defaults, {
    default_submission_rate: Math.round(Number(value.default_submission_rate) * 1000) / 10,
    minutes_per_hook: Number(value.minutes_per_hook),
    minutes_per_cta_sync: Number(value.minutes_per_cta_sync),
    minutes_per_vo: Number(value.minutes_per_vo),
    minutes_per_cta_vo: Number(value.minutes_per_cta_vo),
    productive_hours_per_day: Number(value.productive_hours_per_day),
    words_per_second: Number(value.words_per_second)
  })
  generalBroll.value = parseSuggestions(value.general_broll)
}, { immediate: true })

const defaultFields = [
  { key: 'default_submission_rate', label: 'Default submission rate', unit: '%', help: 'Share of recipes rendered and submitted' },
  { key: 'minutes_per_hook', label: 'Minutes per hook', unit: 'min', help: 'On camera' },
  { key: 'minutes_per_cta_sync', label: 'Minutes per sync CTA', unit: 'min', help: 'On camera' },
  { key: 'minutes_per_vo', label: 'Minutes per VO', unit: 'min', help: 'Recorded off set' },
  { key: 'minutes_per_cta_vo', label: 'Minutes per VO CTA', unit: 'min', help: 'Recorded off set' },
  { key: 'productive_hours_per_day', label: 'Productive hours per day', unit: 'h', help: 'Used for the shoot-days estimate' },
  { key: 'words_per_second', label: 'Speech pace', unit: 'words/s', help: 'Used to estimate each VO\'s length from its script. 2.5 is about 150 words a minute.' }
] as const

async function saveDefaults() {
  if (!settings.value) return
  saving.value = true
  await run(async () => {
    must(await db.from('settings').update({
      ...defaults,
      default_submission_rate: defaults.default_submission_rate / 100,
      general_broll: parseSuggestions(generalBroll.value) as unknown as Json
    }).eq('id', settings.value!.id))
    await load(true)
  }, 'Defaults saved')
  saving.value = false
}
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
      <!-- The tabs' own bottom border is the toolbar's divider, so the active indicator sits on it. -->
      <UDashboardToolbar class="items-end overflow-visible border-b-0 px-0 sm:px-0">
        <UTabs
          v-model="tab"
          :items="tabs"
          :content="false"
          variant="link"
          class="w-full min-w-0"
          :ui="{ list: 'overflow-x-auto overflow-y-hidden border-b-0 px-4 shadow-[inset_0_-1px_0_var(--ui-border)] sm:px-6', indicator: 'bottom-0' }"
        />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-4">
        <!-- People -->
        <template v-if="tab === 'people'">
          <div class="flex items-center justify-between">
            <p class="text-sm text-muted">
              On-camera talent. The slug is used in folder names and can't change once set.
            </p>
            <UButton icon="i-lucide-plus" label="Add person" @click="editPerson()" />
          </div>
          <div class="divide-y divide-default rounded-lg border border-default">
            <button
              v-for="row in people"
              :key="row.id"
              type="button"
              class="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevated/50"
              @click="editPerson(row)"
            >
              <span class="font-medium text-highlighted">{{ row.name }}</span>
              <code class="text-xs text-muted">{{ row.slug }}</code>
              <span v-if="linkedUser(row.allowed_user_id)" class="flex items-center gap-1 text-xs text-muted">
                <UIcon name="i-lucide-link" />{{ linkedUser(row.allowed_user_id)!.email }}
              </span>
              <UBadge
                v-for="channelId in channelsOf(row.id)"
                :key="channelId"
                :label="channels.find(c => c.id === channelId)?.name ?? '?'"
                color="neutral"
                variant="outline"
                size="sm"
              />
              <UBadge v-if="!row.active" label="Inactive" color="neutral" variant="subtle" class="ml-auto" />
            </button>
            <p v-if="!people.length" class="px-4 py-6 text-center text-sm text-muted">
              No people yet. Add everyone who appears on camera.
            </p>
          </div>
        </template>

        <!-- Channels -->
        <template v-else-if="tab === 'channels'">
          <div class="flex items-center justify-between">
            <p class="text-sm text-muted">
              Creator channels. The dog phrase fills <code v-pre>{{dog}}</code>.
            </p>
            <UButton icon="i-lucide-plus" label="Add channel" @click="editChannel()" />
          </div>
          <div class="divide-y divide-default rounded-lg border border-default">
            <button
              v-for="row in channels"
              :key="row.id"
              type="button"
              class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-elevated/50"
              @click="editChannel(row)"
            >
              <span class="font-medium text-highlighted">{{ row.name }}</span>
              <UBadge v-for="dog in row.dogs" :key="dog" :label="dog" color="neutral" variant="subtle" />
              <span class="text-sm text-muted">“{{ row.dog_phrase }}”</span>
              <code class="ml-auto text-xs text-muted">b-roll/{{ row.folder_slug }}</code>
              <UBadge v-if="!row.active" label="Inactive" color="neutral" variant="subtle" />
            </button>
          </div>
        </template>

        <!-- Allowlist -->
        <template v-else-if="tab === 'allowlist'">
          <div class="flex items-center justify-between">
            <p class="text-sm text-muted">
              Only these Google accounts can sign in.
            </p>
            <UButton icon="i-lucide-plus" label="Add email" @click="editUser()" />
          </div>
          <div class="divide-y divide-default rounded-lg border border-default">
            <div v-for="row in allowed" :key="row.id" class="flex items-center gap-3 px-4 py-3">
              <button type="button" class="min-w-0 flex-1 text-left" @click="editUser(row)">
                <p class="truncate font-medium text-highlighted">
                  {{ row.email }}
                </p>
                <p v-if="row.display_name" class="text-sm text-muted">
                  {{ row.display_name }}
                </p>
              </button>
              <UBadge :label="row.role" :color="row.role === 'admin' ? 'primary' : 'neutral'" variant="subtle" class="capitalize" />
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                aria-label="Remove"
                :disabled="isSelf(row.email)"
                @click="removeUser(row)"
              />
            </div>
          </div>
        </template>

        <!-- Defaults -->
        <template v-else>
          <p class="text-sm text-muted">
            Used by the calculator's time estimates and as the starting submission rate for new shoots.
          </p>
          <UCard>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField v-for="field in defaultFields" :key="field.key" :label="field.label" :help="field.help">
                <UInput v-model.number="defaults[field.key]" type="number" :step="field.key === 'words_per_second' ? 0.1 : 0.5" min="0" class="w-full">
                  <template #trailing>
                    <span class="text-xs text-muted">{{ field.unit }}</span>
                  </template>
                </UInput>
              </UFormField>
            </div>
            <template #footer>
              <UButton label="Save defaults" :loading="saving" @click="saveDefaults" />
            </template>
          </UCard>

          <UCard>
            <template #header>
              <h3 class="font-semibold text-highlighted">
                General product shots
              </h3>
              <p class="text-sm text-muted">
                Suggested in every shoot's "General product shots" b-roll section: pack shots, label close-ups and the like. Beat-specific suggestions are set on each format in the Library.
              </p>
            </template>
            <BrollSuggestionsEditor v-model="generalBroll" placeholder="e.g. Pack shot on a clean surface" />
            <template #footer>
              <UButton label="Save product shots" :loading="saving" @click="saveDefaults" />
            </template>
          </UCard>
        </template>
      </div>

      <UModal v-model:open="personOpen" :title="person.id ? 'Edit person' : 'Add person'">
        <template #body>
          <div class="space-y-4">
            <UFormField label="Name" required>
              <UInput v-model="person.name" class="w-full" autofocus />
            </UFormField>
            <UFormField label="Slug" help="Lowercase, used in folder names">
              <UInput v-model="person.slug" class="w-full" :disabled="!!person.id" />
            </UFormField>
            <UFormField
              label="Channels"
              help="The channels this person appears on. On a shoot, a channel's recipes can mix hooks, VOs and CTAs from all the people linked to it."
            >
              <USelectMenu
                v-model="person.channel_ids"
                :items="channels.filter(c => c.active || person.channel_ids.includes(c.id)).map(c => ({ label: c.name, value: c.id }))"
                value-key="value"
                multiple
                placeholder="No channels"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Linked user" help="The allowlisted account this person signs in with. Their checklist opens on their own shots.">
              <USelectMenu
                v-model="person.allowed_user_id"
                :items="linkOptions"
                value-key="value"
                placeholder="Not linked"
                class="w-full"
                clear
              />
            </UFormField>
            <USwitch v-model="person.active" label="Active" description="Inactive people can't be added to new shoots" />
          </div>
        </template>
        <template #footer>
          <UButton label="Save" :loading="saving" :disabled="!person.name.trim() || !person.slug" @click="savePerson" />
        </template>
      </UModal>

      <UModal v-model:open="channelOpen" :title="channel.id ? 'Edit channel' : 'Add channel'">
        <template #body>
          <div class="space-y-4">
            <UFormField label="Name" required>
              <UInput v-model="channel.name" class="w-full" placeholder="topdognix" />
            </UFormField>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Slug">
                <UInput v-model="channel.slug" class="w-full" :disabled="!!channel.id" />
              </UFormField>
              <UFormField label="Folder slug" help="b-roll folder, e.g. nix / whiskey / both">
                <UInput v-model="channel.folder_slug" class="w-full" :disabled="!!channel.id" />
              </UFormField>
            </div>
            <UFormField label="Dogs" help="Press Enter after each dog">
              <UInputTags v-model="channel.dogs" class="w-full" placeholder="nix" />
            </UFormField>
            <UFormField label="Dog phrase" help="Fills {{dog}}, e.g. “my Doberman”">
              <UInput v-model="channel.dog_phrase" class="w-full" />
            </UFormField>
            <USwitch v-model="channel.active" label="Active" />
          </div>
        </template>
        <template #footer>
          <UButton
            label="Save"
            :loading="saving"
            :disabled="!channel.name.trim() || !channel.slug || !channel.folder_slug"
            @click="saveChannel"
          />
        </template>
      </UModal>

      <UModal v-model:open="userOpen" :title="allowedUser.id ? 'Edit access' : 'Add to allowlist'">
        <template #body>
          <div class="space-y-4">
            <UFormField label="Google account email" required>
              <UInput v-model="allowedUser.email" type="email" class="w-full" :disabled="!!allowedUser.id" />
            </UFormField>
            <UFormField label="Display name">
              <UInput v-model="allowedUser.display_name" class="w-full" />
            </UFormField>
            <UFormField label="Role" :help="isSelf(allowedUser.email) ? 'You can\'t change your own role' : undefined">
              <USelect v-model="allowedUser.role" :items="roles" class="w-full" :disabled="isSelf(allowedUser.email)" />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <UButton label="Save" :loading="saving" :disabled="!allowedUser.email.includes('@')" @click="saveUser" />
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
