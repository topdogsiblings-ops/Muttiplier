<script setup lang="ts">
import type { Row } from '#shared/types/models'
import type { Json } from '#shared/types/database.types'

const db = useDb()
const run = useAction()
const { confirmDialog } = useConfirm()
const { people, channels, settings, load } = useRefData()
const { access } = useAccess()

const tabs = [
  { label: 'Channels', value: 'channels', icon: 'i-lucide-tv' },
  { label: 'Members', value: 'members', icon: 'i-lucide-shield-check' },
  { label: 'Defaults', value: 'defaults', icon: 'i-lucide-timer' },
  { label: 'Dropbox', value: 'dropbox', icon: 'i-simple-icons-dropbox' }
]
const route = useRoute()
const tab = ref(tabs.some(t => t.value === route.query.tab) ? String(route.query.tab) : 'channels')

// the org's members, and the emails invited who haven't signed in yet
const members = ref<(Row<'org_members'> & { profile: { email: string | null, full_name: string | null } | null })[]>([])
const invites = ref<Row<'org_invites'>[]>([])
async function loadMembers() {
  const [memberRows, inviteRows] = await Promise.all([
    db.from('org_members').select('*, profile:profiles(email, full_name)').order('created_at'),
    db.from('org_invites').select('*').order('email')
  ])
  members.value = must(memberRows) as typeof members.value
  invites.value = must(inviteRows)
}

// who's on each channel
const personChannels = ref<{ person_id: string, channel_id: string }[]>([])
async function loadPersonChannels() {
  personChannels.value = must(await db.from('person_channels').select('person_id, channel_id'))
}

await Promise.all([load(true), loadMembers(), loadPersonChannels()])

const saving = ref(false)

// --- channels --------------------------------------------------------------
const channelOpen = ref(false)
const channel = reactive({ id: '', name: '', slug: '', dogs: [] as string[], dog_phrase: '', folder_slug: '', active: true, members: [] as string[] })
const requestChannelOpen = useGuardedClose(channelOpen, channel)

// A channel's members: signed-in members (user:<id>), and invited emails (invite:<email>) who join it
// when they first sign in. Adding a member makes their person record in the database.
const memberOptions = computed(() => [
  ...members.value.map(row => ({ label: row.display_name || row.profile?.full_name || row.profile?.email || '', value: `user:${row.user_id}` })),
  ...invites.value.map(row => ({ label: `${row.display_name || row.email} (invited)`, value: `invite:${row.email}` }))
])
function membersOf(channelId: string) {
  const linked = personChannels.value.filter(link => link.channel_id === channelId)
    .map(link => people.value.find(person => person.id === link.person_id)?.user_id)
  const chosen = new Set([
    ...linked.filter(Boolean).map(id => `user:${id}`),
    ...invites.value.filter(row => row.channel_ids.includes(channelId)).map(row => `invite:${row.email}`)
  ])
  return memberOptions.value.filter(option => chosen.has(option.value))
}

function editChannel(row?: Row<'channels'>) {
  Object.assign(channel, {
    id: row?.id ?? '',
    name: row?.name ?? '',
    slug: row?.slug ?? '',
    dogs: [...(row?.dogs ?? [])],
    dog_phrase: row?.dog_phrase ?? '',
    folder_slug: row?.folder_slug ?? '',
    active: row?.active ?? true,
    members: row ? membersOf(row.id).map(entry => entry.value) : []
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
    const id = channel.id
      ? (must(await db.from('channels').update(fields).eq('id', channel.id)), channel.id)
      : mustOne(await db.from('channels').insert({ ...fields, slug: channel.slug, folder_slug: slugify(channel.folder_slug) }).select('id').single()).id
    must(await db.rpc('set_channel_members', {
      p_channel_id: id,
      p_user_ids: channel.members.filter(value => value.startsWith('user:')).map(value => value.slice(5))
    }))
    // invited emails keep their channels on the invite until they sign in
    for (const row of invites.value) {
      const wanted = channel.members.includes(`invite:${row.email}`)
      if (wanted === row.channel_ids.includes(id)) continue
      const channelIds = wanted ? [...row.channel_ids, id] : row.channel_ids.filter(channelId => channelId !== id)
      must(await db.from('org_invites').update({ channel_ids: channelIds }).eq('email', row.email))
    }
    await Promise.all([load(true), loadPersonChannels(), loadMembers()])
  }, 'Channel saved')
  saving.value = false
  if (ok) channelOpen.value = false
}

// --- members -----------------------------------------------------------------
// Admins invite by email; members don't pay. An invite becomes a membership when that Google
// account signs in (straight away if it already has).
const userOpen = ref(false)
const member = reactive({ user_id: '', invited: false, email: '', role: 'member', display_name: '' })
const requestUserOpen = useGuardedClose(userOpen, member)
const roles = [{ label: 'Member', value: 'member' }, { label: 'Admin', value: 'admin' }]
const isSelf = (userId: string) => userId === access.value?.id

function editMember(row?: typeof members.value[number]) {
  Object.assign(member, { user_id: row?.user_id ?? '', invited: false, email: row?.profile?.email ?? '', role: row?.role ?? 'member', display_name: row?.display_name ?? '' })
  userOpen.value = true
}

function editInvite(row: Row<'org_invites'>) {
  Object.assign(member, { user_id: '', invited: true, email: row.email, role: row.role, display_name: row.display_name ?? '' })
  userOpen.value = true
}

async function saveMember() {
  saving.value = true
  const ok = await run(async () => {
    const fields = { role: member.role, display_name: member.display_name.trim() || null }
    if (member.user_id) {
      must(await db.from('org_members').update(fields).eq('user_id', member.user_id))
      // how they read on shot lists (their folder slug never changes)
      if (fields.display_name) must(await db.from('people').update({ name: fields.display_name }).eq('user_id', member.user_id))
    }
    else if (member.invited) must(await db.from('org_invites').update(fields).eq('email', member.email))
    else must(await db.from('org_invites').insert({ ...fields, email: member.email.trim().toLowerCase() }))
    await Promise.all([load(true), loadMembers()])
  }, 'Members updated')
  saving.value = false
  if (ok) userOpen.value = false
}

async function removeMember(row: typeof members.value[number]) {
  if (!(await confirmDialog({
    title: `Remove ${row.profile?.email} from the organisation?`,
    description: 'They lose access immediately and come off their channels. Past shoots keep them.',
    confirmLabel: 'Remove',
    danger: true
  }))) return
  await run(async () => {
    const person = people.value.find(entry => entry.user_id === row.user_id)
    if (person) {
      must(await db.from('person_channels').delete().eq('person_id', person.id))
      must(await db.from('people').update({ active: false }).eq('id', person.id))
    }
    must(await db.from('org_members').delete().eq('user_id', row.user_id))
    await Promise.all([load(true), loadMembers(), loadPersonChannels()])
  }, 'Removed')
}

async function removeInvite(row: Row<'org_invites'>) {
  await run(async () => {
    must(await db.from('org_invites').delete().eq('email', row.email))
    await loadMembers()
  }, 'Invite removed')
}

// --- defaults --------------------------------------------------------------
const defaults = reactive({
  default_submission_rate: 5,
  minutes_per_hook: 4.5,
  minutes_per_cta_sync: 3,
  minutes_per_vo: 9,
  minutes_per_cta_vo: 3,
  productive_hours_per_day: 6,
  words_per_second: 2.5
})
/** General product shots suggested on every shoot (pack shots, label close-ups…). */
const generalBroll = ref<BrollSuggestion[]>([])
/** Presets for the sanity checks on clips submitted from the checklist. VO shares are shown as %. */
const clipChecks = reactive({
  clip_aspect_width: DEFAULT_CLIP_RULES.aspectWidth,
  clip_aspect_height: DEFAULT_CLIP_RULES.aspectHeight,
  clip_min_width: DEFAULT_CLIP_RULES.minWidth,
  clip_min_height: DEFAULT_CLIP_RULES.minHeight,
  clip_min_fps: DEFAULT_CLIP_RULES.minFps,
  clip_max_fps: DEFAULT_CLIP_RULES.maxFps,
  vo_min_share: DEFAULT_CLIP_RULES.voMinShare * 100,
  vo_max_share: DEFAULT_CLIP_RULES.voMaxShare * 100
})

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
  const rules = clipRulesFrom(value)
  Object.assign(clipChecks, {
    clip_aspect_width: rules.aspectWidth,
    clip_aspect_height: rules.aspectHeight,
    clip_min_width: rules.minWidth,
    clip_min_height: rules.minHeight,
    clip_min_fps: rules.minFps,
    clip_max_fps: rules.maxFps,
    vo_min_share: Math.round(rules.voMinShare * 100),
    vo_max_share: Math.round(rules.voMaxShare * 100)
  })
}, { immediate: true })

const clipCheckFields = [
  { key: 'clip_aspect_width', label: 'Aspect ratio width', unit: '', step: 1, help: 'e.g. 9 for 9:16 vertical' },
  { key: 'clip_aspect_height', label: 'Aspect ratio height', unit: '', step: 1, help: 'e.g. 16 for 9:16 vertical' },
  { key: 'clip_min_width', label: 'Minimum width', unit: 'px', step: 1, help: 'Short side of the frame' },
  { key: 'clip_min_height', label: 'Minimum height', unit: 'px', step: 1, help: 'Long side of the frame' },
  { key: 'clip_min_fps', label: 'Minimum frame rate', unit: 'fps', step: 1, help: '23.976 counts as 24' },
  { key: 'clip_max_fps', label: 'Maximum frame rate', unit: 'fps', step: 1, help: 'Higher is usually slow motion' },
  { key: 'vo_min_share', label: 'Shortest VO', unit: '%', step: 5, help: 'Of the script\'s estimated reading time' },
  { key: 'vo_max_share', label: 'Longest VO', unit: '%', step: 5, help: 'Of the script\'s estimated reading time' }
] as const

const defaultFields = [
  { key: 'default_submission_rate', label: 'Default batch size', unit: '%', help: 'Share of a shoot\'s valid recipes each batch renders and submits; each shoot can change it' },
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
      general_broll: parseSuggestions(generalBroll.value) as unknown as Json,
      ...clipChecks,
      vo_min_share: clipChecks.vo_min_share / 100,
      vo_max_share: clipChecks.vo_max_share / 100
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
        <!-- Channels -->
        <template v-if="tab === 'channels'">
          <div class="flex items-center justify-between">
            <p class="text-sm text-muted">
              Creator channels and who's on them. The dog phrase fills <code v-pre>{{dog}}</code>.
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
              <span class="flex w-full flex-wrap items-center gap-1.5">
                <UBadge v-for="entry in membersOf(row.id)" :key="entry.value" :label="entry.label" color="neutral" variant="outline" size="sm" />
                <span v-if="!membersOf(row.id).length" class="text-xs text-muted">No members yet</span>
              </span>
            </button>
          </div>
        </template>

        <!-- Members -->
        <template v-else-if="tab === 'members'">
          <div class="flex items-center justify-between">
            <p class="text-sm text-muted">
              Only these Google accounts can use this organisation. Members don't pay.
            </p>
            <UButton icon="i-lucide-plus" label="Invite" @click="editMember()" />
          </div>
          <div class="divide-y divide-default rounded-lg border border-default">
            <div v-for="row in members" :key="row.user_id" class="flex items-center gap-3 px-4 py-3">
              <button type="button" class="min-w-0 flex-1 text-left" @click="editMember(row)">
                <p class="truncate font-medium text-highlighted">
                  {{ row.profile?.email }}
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
                :disabled="isSelf(row.user_id)"
                @click="removeMember(row)"
              />
            </div>
            <div v-for="row in invites" :key="row.email" class="flex items-center gap-3 px-4 py-3">
              <button type="button" class="min-w-0 flex-1 text-left" @click="editInvite(row)">
                <p class="truncate font-medium text-highlighted">
                  {{ row.email }}
                </p>
                <p class="text-sm text-muted">
                  Invited: joins when they sign in with Google
                </p>
              </button>
              <UBadge :label="row.role" :color="row.role === 'admin' ? 'primary' : 'neutral'" variant="subtle" class="capitalize" />
              <UButton icon="i-lucide-trash-2" color="error" variant="ghost" aria-label="Remove invite" @click="removeInvite(row)" />
            </div>
          </div>
        </template>

        <!-- Defaults -->
        <DropboxSettings v-else-if="tab === 'dropbox'" />

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

          <UCard>
            <template #header>
              <h3 class="font-semibold text-highlighted">
                Clip checks
              </h3>
              <p class="text-sm text-muted">
                Every clip filmed, recorded or uploaded from the checklist is checked against these. Videos: shape, resolution and frame rate. VO recordings: length against the script's estimated reading time at the speech pace above. Anything off asks before uploading.
              </p>
            </template>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField v-for="field in clipCheckFields" :key="field.key" :label="field.label" :help="field.help">
                <UInput v-model.number="clipChecks[field.key]" type="number" :step="field.step" min="1" class="w-full">
                  <template v-if="field.unit" #trailing>
                    <span class="text-xs text-muted">{{ field.unit }}</span>
                  </template>
                </UInput>
              </UFormField>
            </div>
            <template #footer>
              <UButton label="Save clip checks" :loading="saving" @click="saveDefaults" />
            </template>
          </UCard>
        </template>
      </div>

      <UModal :open="channelOpen" @update:open="requestChannelOpen" :title="channel.id ? 'Edit channel' : 'Add channel'">
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
            <UFormField label="Members" help="Who films for this channel. On a shoot they film every hook, VO and CTA for it. Invite someone in the Members tab to add them here.">
              <USelectMenu
                v-model="channel.members"
                :items="memberOptions"
                value-key="value"
                multiple
                placeholder="No members"
                class="w-full"
              />
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

      <UModal :open="userOpen" @update:open="requestUserOpen" :title="member.user_id || member.invited ? 'Edit access' : 'Invite someone'">
        <template #body>
          <div class="space-y-4">
            <UFormField label="Google account email" required>
              <UInput v-model="member.email" type="email" class="w-full" :disabled="!!member.user_id || member.invited" />
            </UFormField>
            <UFormField label="Display name">
              <UInput v-model="member.display_name" class="w-full" />
            </UFormField>
            <UFormField label="Role" :help="isSelf(member.user_id) ? 'You can\'t change your own role' : undefined">
              <USelect v-model="member.role" :items="roles" class="w-full" :disabled="isSelf(member.user_id)" />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <UButton label="Save" :loading="saving" :disabled="!member.email.includes('@')" @click="saveMember" />
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
