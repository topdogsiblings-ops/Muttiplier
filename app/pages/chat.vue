<script setup lang="ts">
import type { ChatMessage, ChatShare } from '~/composables/useChat'

// The organisation's chat (spec §4): one channel for everyone in it. People write, @mention each
// other, reply and share Library items, brands and shoots as cards; Kreate posts its own updates
// (shoots moving along, people joining, AI drafts). New messages arrive live (the layout subscribes).
const chat = useChat()
const { messages, hasMore } = chat
const { access } = useAccess()
const { currentOrg } = useOrg()
const run = useAction()
const { confirmDialog } = useConfirm()

const list = ref<HTMLElement | null>(null)
const nearBottom = () => !list.value || list.value.scrollHeight - list.value.scrollTop - list.value.clientHeight < 120
const toBottom = (smooth = false) => nextTick(() => list.value?.scrollTo({ top: list.value.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }))

await Promise.all([chat.loadMembers(), chat.load()])
onMounted(() => {
  toBottom()
  chat.markRead().catch(() => {})
})
// a new message: follow it down if they were already at the bottom (or wrote it)
watch(() => messages.value.at(-1)?.id, (id, before) => {
  if (!id || id === before) return
  const mine = messages.value.at(-1)?.author_id === access.value?.id
  if (mine || nearBottom()) toBottom(true)
})

const loadingOlder = ref(false)
async function older() {
  if (!list.value) return
  loadingOlder.value = true
  const height = list.value.scrollHeight
  await run(() => chat.load(true))
  loadingOlder.value = false
  await nextTick()
  list.value.scrollTop = list.value.scrollHeight - height
}

// --- showing messages --------------------------------------------------------------------
const day = (value: string) => new Date(value).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
const time = (value: string) => new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
/** each message, with whether it starts a new day and whether it follows on from the same person */
const rows = computed(() => messages.value.map((message, index) => {
  const previous = messages.value[index - 1]
  const newDay = !previous || day(previous.created_at) !== day(message.created_at)
  const sameRun = !newDay && !!previous && previous.kind !== 'event' && message.kind !== 'event'
    && previous.author_id === message.author_id && !message.reply_to
    && Date.parse(message.created_at) - Date.parse(previous.created_at) < 5 * 60 * 1000
  return { message, newDay, sameRun }
}))

/** a message's text in pieces, with @mentions of members and links picked out */
function pieces(body: string): { text: string, mention: boolean, href?: string, internal?: boolean }[] {
  const names = chat.members.value.map(member => member.name).sort((a, b) => b.length - a.length)
  const escaped = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(https?://[^\\s<>"]+${escaped.length ? `|@(?:${escaped.join('|')})` : ''})`, 'g')
  return body.split(pattern).filter(Boolean).map((text) => {
    if (/^https?:\/\//.test(text)) {
      // links into this Kreate open in place; anything else in a new tab
      try {
        const url = new URL(text)
        const internal = import.meta.client && url.origin === window.location.origin
        return { text, mention: false, href: internal ? `${url.pathname}${url.search}${url.hash}` : text, internal }
      } catch {
        return { text, mention: false }
      }
    }
    return { text, mention: text.startsWith('@') && names.includes(text.slice(1)) }
  })
}
const replyOf = (message: ChatMessage) => message.reply_to ? messages.value.find(entry => entry.id === message.reply_to) ?? null : null
const authorName = (message: ChatMessage | null) => message?.author_id ? chat.memberOf(message.author_id)?.name ?? 'Someone' : 'Kreate'
const share = (message: ChatMessage) => message.ref as unknown as ChatShare
const SHARE_ICONS: Record<string, string> = {
  hook: 'i-lucide-message-square-quote',
  cta: 'i-lucide-megaphone',
  vo: 'i-lucide-mic',
  format: 'i-lucide-layout-template',
  brand: 'i-lucide-store',
  product: 'i-lucide-package',
  shoot: 'i-lucide-clapperboard'
}
const EVENT_ICONS: Record<string, string> = {
  shoot_planned: 'i-lucide-calendar-check',
  shoot_shooting: 'i-lucide-video',
  shoot_filmed: 'i-lucide-film',
  shoot_editing: 'i-lucide-scissors',
  shoot_live: 'i-lucide-rocket',
  member_joined: 'i-lucide-user-plus',
  ai_drafts: 'i-lucide-sparkles'
}
const eventOf = (message: ChatMessage) => (message.ref ?? {}) as { event?: string, shoot_code?: string }
const mentionsMe = (message: ChatMessage) => !!access.value && message.mentions.includes(access.value.id)

// --- writing ---------------------------------------------------------------------------------
const draft = ref('')
const replyTo = shallowRef<ChatMessage | null>(null)
const editing = shallowRef<ChatMessage | null>(null)
const sending = ref(false)
const replyPreview = computed(() => replyTo.value ? replyTo.value.body || (replyTo.value.ref as { title?: string } | null)?.title || '' : '')
const composer = ref<HTMLTextAreaElement | null>(null)
const mirror = ref<HTMLElement | null>(null)
const focused = ref(false)
const focus = () => nextTick(() => composer.value?.focus())
/** the box grows with what's typed, up to about eight lines, then scrolls */
function fit() {
  const area = composer.value
  if (!area) return
  area.style.height = 'auto'
  area.style.height = `${Math.min(area.scrollHeight, 200)}px`
  syncScroll()
}
/** the highlighted copy behind the box scrolls with it */
function syncScroll() {
  if (mirror.value && composer.value) mirror.value.scrollTop = composer.value.scrollTop
}
watch(draft, () => nextTick(fit))

async function send() {
  if (!draft.value.trim() || sending.value) return
  sending.value = true
  const ok = await run(async () => {
    if (editing.value) await chat.edit(editing.value, draft.value)
    else await chat.send(draft.value, { replyTo: replyTo.value?.id })
  })
  sending.value = false
  if (!ok) return
  draft.value = ''
  replyTo.value = null
  editing.value = null
  mention.value = null
}

function startReply(message: ChatMessage) {
  editing.value = null
  replyTo.value = message
  focus()
}
function startEdit(message: ChatMessage) {
  replyTo.value = null
  editing.value = message
  draft.value = message.body
  focus()
}
function cancel() {
  if (editing.value) draft.value = ''
  editing.value = null
  replyTo.value = null
}
async function remove(message: ChatMessage) {
  if (!(await confirmDialog({ title: 'Delete this message?', description: 'It\'s removed for everyone.', confirmLabel: 'Delete', danger: true }))) return
  await run(() => chat.remove(message))
}

// @mentions: typing @ and a few letters offers the members whose names match
const mention = ref<{ start: number, query: string } | null>(null)
const mentionOptions = computed(() => {
  if (!mention.value || !focused.value) return []
  const query = mention.value.query.toLowerCase()
  return chat.members.value.filter(member => member.id !== access.value?.id && member.name.toLowerCase().includes(query)).slice(0, 6)
})
function onInput() {
  const area = composer.value
  if (!area) return
  const before = draft.value.slice(0, area.selectionStart ?? draft.value.length)
  const match = /(^|\s)@([^\s@]{0,30})$/.exec(before)
  mention.value = match ? { start: before.length - match[2]!.length - 1, query: match[2]! } : null
}
function pickMention(name: string) {
  if (!mention.value) return
  const area = composer.value
  const end = area?.selectionStart ?? draft.value.length
  draft.value = `${draft.value.slice(0, mention.value.start)}@${name} ${draft.value.slice(end)}`
  mention.value = null
  focus()
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    if (mentionOptions.value.length) {
      event.preventDefault()
      pickMention(mentionOptions.value[0]!.name)
      return
    }
    event.preventDefault()
    send()
  } else if (event.key === 'Escape') {
    if (mention.value) mention.value = null
    else cancel()
  }
}
</script>

<template>
  <UDashboardPanel id="chat" :ui="{ body: 'p-0 sm:p-0 gap-0' }">
    <template #header>
      <UDashboardNavbar :title="`${currentOrg?.name ?? 'Organisation'} chat`">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex min-h-0 flex-1 flex-col">
        <!-- the messages -->
        <div ref="list" class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div class="mx-auto w-full max-w-3xl">
            <div v-if="hasMore && messages.length" class="mb-4 flex justify-center">
              <UButton label="Earlier messages" size="xs" color="neutral" variant="ghost" icon="i-lucide-arrow-up" :loading="loadingOlder" @click="older" />
            </div>
            <div v-if="!messages.length" class="flex flex-col items-center gap-2 py-16 text-center text-muted">
              <UIcon name="i-lucide-messages-square" class="size-10 text-dimmed" />
              <p class="font-medium text-highlighted">
                Say hello to {{ currentOrg?.name ?? 'your team' }}
              </p>
              <p class="max-w-sm text-sm">
                Everyone in the organisation sees this chat. Share hooks, CTAs, brands and shoots from their menus, and Kreate posts here when shoots move along.
              </p>
            </div>

            <template v-for="{ message, newDay, sameRun } in rows" :key="message.id">
              <div v-if="newDay" class="my-4 flex items-center gap-3 text-xs text-dimmed">
                <span class="h-px flex-1 bg-(--ui-border)" />{{ day(message.created_at) }}<span class="h-px flex-1 bg-(--ui-border)" />
              </div>

              <!-- Kreate's own updates -->
              <div v-if="message.kind === 'event'" class="my-2 flex items-center justify-center gap-2 text-center text-sm text-muted">
                <UIcon :name="EVENT_ICONS[eventOf(message).event ?? ''] ?? 'i-lucide-bell'" class="size-4 shrink-0 text-dimmed" />
                <NuxtLink v-if="eventOf(message).shoot_code" :to="`/shoots/${eventOf(message).shoot_code}`" class="hover:text-highlighted hover:underline">
                  {{ message.body }}
                </NuxtLink>
                <span v-else>{{ message.body }}</span>
                <span class="text-xs text-dimmed">{{ time(message.created_at) }}</span>
              </div>

              <!-- people's messages -->
              <div
                v-else
                class="group relative flex gap-3 rounded-md px-2 py-1 hover:bg-elevated/40"
                :class="[sameRun ? 'mt-0' : 'mt-3', mentionsMe(message) && 'bg-primary/5']"
              >
                <div class="w-8 shrink-0">
                  <UAvatar
                    v-if="!sameRun"
                    :src="chat.memberOf(message.author_id)?.photo ?? undefined"
                    :alt="authorName(message)"
                    size="sm"
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <div v-if="!sameRun" class="flex flex-wrap items-baseline gap-x-2">
                    <span class="text-sm font-semibold text-highlighted">{{ authorName(message) }}</span>
                    <UBadge v-if="message.via" :label="`via ${message.via}`" icon="i-lucide-sparkles" color="neutral" variant="subtle" size="sm" />
                    <span class="text-xs text-dimmed">{{ time(message.created_at) }}</span>
                  </div>

                  <!-- what it replies to -->
                  <div v-if="replyOf(message)" class="mb-1 flex items-center gap-1.5 border-l-2 border-default pl-2 text-xs text-muted">
                    <UIcon name="i-lucide-reply" class="size-3 shrink-0" />
                    <span class="font-medium">{{ authorName(replyOf(message)) }}</span>
                    <span class="truncate">{{ replyOf(message)!.deleted_at ? 'Deleted message' : replyOf(message)!.body || share(replyOf(message)!)?.title }}</span>
                  </div>

                  <p v-if="message.deleted_at" class="text-sm italic text-dimmed">
                    Message deleted
                  </p>
                  <template v-else>
                    <p v-if="message.body" class="text-sm whitespace-pre-wrap break-words text-default">
                      <template v-for="(piece, index) in pieces(message.body)" :key="index">
                        <span v-if="piece.mention" class="rounded bg-primary/15 px-0.5 font-medium text-highlighted">{{ piece.text }}</span>
                        <NuxtLink v-else-if="piece.href && piece.internal" :to="piece.href" class="break-all text-highlighted underline">{{ piece.text }}</NuxtLink>
                        <a v-else-if="piece.href" :href="piece.href" target="_blank" rel="noopener" class="break-all text-highlighted underline">{{ piece.text }}</a>
                        <template v-else>
                          {{ piece.text }}
                        </template>
                      </template>
                      <span v-if="message.edited_at" class="text-xs text-dimmed"> (edited)</span>
                    </p>

                    <!-- a shared item -->
                    <NuxtLink
                      v-if="message.kind === 'share' && message.ref"
                      :to="share(message).path"
                      class="mt-1.5 flex max-w-md items-start gap-3 rounded-lg border border-default bg-elevated/40 p-3 transition hover:bg-elevated"
                    >
                      <UIcon :name="SHARE_ICONS[share(message).type] ?? 'i-lucide-link'" class="mt-0.5 size-5 shrink-0 text-muted" />
                      <span class="min-w-0 flex-1">
                        <span class="block text-xs font-medium tracking-wide text-dimmed uppercase">{{ share(message).type === 'cta' ? 'CTA' : share(message).type === 'vo' ? 'VO' : share(message).type }}</span>
                        <span class="block truncate text-sm font-medium text-highlighted">{{ share(message).title }}</span>
                        <span v-if="share(message).preview" class="line-clamp-3 block text-sm text-muted">{{ share(message).preview }}</span>
                      </span>
                      <UIcon name="i-lucide-arrow-up-right" class="size-4 shrink-0 text-dimmed" />
                    </NuxtLink>
                  </template>
                </div>

                <!-- reply, edit, delete -->
                <div v-if="!message.deleted_at" class="absolute -top-3 right-2 hidden items-center rounded-md border border-default bg-default shadow-sm group-hover:flex">
                  <UTooltip text="Reply" :delay-duration="0">
                    <UButton icon="i-lucide-reply" size="xs" color="neutral" variant="ghost" aria-label="Reply" @click="startReply(message)" />
                  </UTooltip>
                  <template v-if="message.author_id === access?.id">
                    <UTooltip v-if="message.kind === 'text'" text="Edit" :delay-duration="0">
                      <UButton icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" aria-label="Edit" @click="startEdit(message)" />
                    </UTooltip>
                    <UTooltip text="Delete" :delay-duration="0">
                      <UButton icon="i-lucide-trash-2" size="xs" color="neutral" variant="ghost" aria-label="Delete" @click="remove(message)" />
                    </UTooltip>
                  </template>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- writing -->
        <div class="shrink-0 border-t border-default px-4 py-3 sm:px-6">
          <div class="relative mx-auto w-full max-w-3xl">
            <div v-if="replyTo || editing" class="mb-2 flex items-center gap-2 text-xs text-muted">
              <UIcon :name="editing ? 'i-lucide-pencil' : 'i-lucide-reply'" class="size-3.5" />
              <span class="min-w-0 flex-1 truncate">
                <template v-if="editing">Editing your message</template>
                <template v-else>Replying to <span class="font-medium">{{ authorName(replyTo) }}</span>: {{ replyPreview }}</template>
              </span>
              <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" aria-label="Cancel" @click="cancel" />
            </div>

            <!-- @mention suggestions -->
            <ul v-if="mentionOptions.length" class="absolute bottom-full left-0 z-30 mb-2 w-64 overflow-hidden rounded-md border border-default bg-default shadow-lg">
              <li v-for="member in mentionOptions" :key="member.id">
                <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-elevated" @mousedown.prevent="pickMention(member.name)">
                  <UAvatar :src="member.photo ?? undefined" :alt="member.name" size="2xs" />{{ member.name }}
                </button>
              </li>
            </ul>

            <div class="flex items-end gap-2">
              <!-- the box: its own text is see-through, and a copy behind it shows @mentions highlighted -->
              <div class="relative min-w-0 flex-1 rounded-md bg-default ring ring-accented ring-inset focus-within:ring-2 focus-within:ring-primary">
                <div
                  ref="mirror"
                  aria-hidden="true"
                  class="pointer-events-none absolute inset-0 overflow-hidden px-3 py-2 text-sm leading-6 break-words whitespace-pre-wrap text-default"
                >
                  <template v-for="(piece, index) in pieces(draft)" :key="index">
                    <span v-if="piece.mention" class="rounded bg-primary/20 text-highlighted">{{ piece.text }}</span>
                    <template v-else>
                      {{ piece.text }}
                    </template>
                  </template>&#8203;
                </div>
                <textarea
                  ref="composer"
                  v-model="draft"
                  rows="1"
                  :placeholder="`Message ${currentOrg?.name ?? 'your team'}… (@ to mention)`"
                  class="relative block max-h-[200px] w-full resize-none bg-transparent px-3 py-2 text-sm leading-6 break-words whitespace-pre-wrap text-transparent caret-(--ui-text-highlighted) outline-none placeholder:text-dimmed"
                  @input="onInput"
                  @click="onInput"
                  @keyup="onInput"
                  @keydown="onKeydown"
                  @scroll="syncScroll"
                  @focus="focused = true"
                  @blur="focused = false"
                />
              </div>
              <UButton icon="i-lucide-send-horizontal" :loading="sending" :disabled="!draft.trim()" aria-label="Send" @click="send" />
            </div>
            <p class="mt-1 hidden text-xs text-dimmed sm:block">
              Enter to send · Shift+Enter for a new line
            </p>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
