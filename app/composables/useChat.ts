import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Row } from '#shared/types/models'

export type ChatMessage = Row<'org_messages'>

/** What a shared card points at: a Library item, a brand or a shoot. */
export interface ChatShare {
  type: 'hook' | 'cta' | 'vo' | 'format' | 'brand' | 'product' | 'shoot'
  id: string
  title: string
  preview?: string
  path: string
}

export interface ChatMember {
  id: string
  name: string
  photo: string | null
}

/**
 * The organisation's chat (spec §4): one channel per organisation. Messages arrive live; the
 * unread count is shared with the sidebar (and Your account's cards count per organisation).
 */
export const useChat = () => {
  const db = useDb()
  const { access } = useAccess()
  const messages = useState<ChatMessage[]>('chat-messages', () => [])
  const members = useState<ChatMember[]>('chat-members', () => [])
  const unread = useState('chat-unread', () => 0)
  const hasMore = useState('chat-has-more', () => true)
  const loaded = useState('chat-loaded', () => false)
  const PAGE = 50

  const memberOf = (id: string | null) => members.value.find(member => member.id === id) ?? null

  async function loadMembers() {
    const rows = must(await db.from('org_members').select('user_id, display_name, profile:profiles(display_name, full_name, email, photo_url, avatar_url)'))
    members.value = rows.map((row) => {
      const profile = row.profile as { display_name: string | null, full_name: string | null, email: string | null, photo_url: string | null, avatar_url: string | null } | null
      return {
        id: row.user_id,
        name: row.display_name || profile?.display_name || profile?.full_name || profile?.email || 'Someone',
        photo: profile?.photo_url || profile?.avatar_url || null
      }
    })
  }

  /** The latest page, or the page before the oldest one shown. */
  async function load(older = false) {
    const before = older ? messages.value[0]?.created_at : undefined
    let query = db.from('org_messages').select('*').order('created_at', { ascending: false }).limit(PAGE)
    if (before) query = query.lt('created_at', before)
    const rows = must(await query).reverse()
    hasMore.value = rows.length === PAGE
    messages.value = older ? [...rows, ...messages.value] : rows
    loaded.value = true
  }

  function upsert(message: ChatMessage) {
    const index = messages.value.findIndex(entry => entry.id === message.id)
    if (index >= 0) messages.value.splice(index, 1, message)
    else messages.value = [...messages.value, message].sort((a, b) => a.created_at.localeCompare(b.created_at))
  }

  /** The names written as @Name in a message: the members it mentions. */
  const mentionsIn = (body: string) => members.value.filter(member => body.includes(`@${member.name}`)).map(member => member.id)

  async function send(body: string, options: { replyTo?: string | null, share?: ChatShare } = {}) {
    const text = body.trim()
    if (!text && !options.share) return
    const row = must(await db.from('org_messages').insert({
      kind: options.share ? 'share' : 'text',
      body: text,
      ref: options.share ? { ...options.share } : null,
      reply_to: options.replyTo ?? null,
      mentions: mentionsIn(text)
    }).select('*').single())
    upsert(row)
    return row
  }

  async function edit(message: ChatMessage, body: string) {
    upsert(must(await db.from('org_messages').update({ body: body.trim(), edited_at: new Date().toISOString() }).eq('id', message.id).select('*').single()))
  }

  async function remove(message: ChatMessage) {
    upsert(must(await db.from('org_messages').update({ body: '', deleted_at: new Date().toISOString() }).eq('id', message.id).select('*').single()))
  }

  async function refreshUnread() {
    const { data } = await db.rpc('chat_unread_count')
    unread.value = data ?? 0
  }

  async function markRead() {
    await db.rpc('mark_chat_read')
    unread.value = 0
  }

  /**
   * Live messages for the open organisation (the layout holds the one subscription). `onNew` hears
   * each new message from someone else: read on the chat page, unread anywhere else.
   */
  function subscribe(orgId: string, onNew?: (message: ChatMessage) => void): RealtimeChannel {
    return db.channel(`org-chat-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'org_messages', filter: `org_id=eq.${orgId}` }, (payload) => {
        if (payload.eventType === 'DELETE') return
        const message = payload.new as ChatMessage
        const fresh = payload.eventType === 'INSERT' && !messages.value.some(entry => entry.id === message.id)
        if (loaded.value) upsert(message)
        if (fresh && message.author_id !== access.value?.id) onNew?.(message)
      })
      .subscribe()
  }

  return { messages, members, unread, hasMore, loaded, memberOf, loadMembers, load, send, edit, remove, refreshUnread, markRead, subscribe }
}
