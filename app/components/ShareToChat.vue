<script setup lang="ts">
import type { ChatShare } from '~/composables/useChat'

// Share something to the organisation's chat as a card (a hook, CTA, format, brand or shoot), with
// an optional note. It opens from the item's row or page.
const props = defineProps<{ share: ChatShare, size?: 'xs' | 'sm' | 'md' }>()

const chat = useChat()
const toast = useToast()
const open = ref(false)
const note = ref('')
const sending = ref(false)

async function send() {
  sending.value = true
  try {
    if (!chat.members.value.length) await chat.loadMembers()
    await chat.send(note.value, { share: props.share })
    open.value = false
    note.value = ''
    toast.add({
      title: 'Shared to chat',
      color: 'success',
      icon: 'i-lucide-messages-square',
      actions: [{ label: 'Open chat', color: 'neutral', variant: 'outline', to: '/chat' }]
    })
  } catch (failure) {
    toast.add({ title: 'Couldn\'t share it', description: (failure as Error).message, color: 'error' })
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'end', side: 'bottom' }">
    <UTooltip text="Share to chat" :delay-duration="0">
      <UButton icon="i-lucide-message-square-share" color="neutral" variant="ghost" :size="props.size" aria-label="Share to chat" @click.stop />
    </UTooltip>
    <template #content>
      <div class="w-72 space-y-3 p-3" @click.stop>
        <p class="text-sm font-medium text-highlighted">
          Share to chat
        </p>
        <div class="rounded-md border border-default bg-elevated/40 p-2">
          <p class="truncate text-sm font-medium text-highlighted">
            {{ props.share.title }}
          </p>
          <p v-if="props.share.preview" class="line-clamp-2 text-xs text-muted">
            {{ props.share.preview }}
          </p>
        </div>
        <UTextarea v-model="note" :rows="2" autoresize placeholder="Add a note (optional)" class="w-full" />
        <div class="flex justify-end gap-2">
          <UButton label="Cancel" size="sm" color="neutral" variant="ghost" @click="open = false" />
          <UButton label="Share" size="sm" icon="i-lucide-send-horizontal" :loading="sending" @click="send" />
        </div>
      </div>
    </template>
  </UPopover>
</template>
