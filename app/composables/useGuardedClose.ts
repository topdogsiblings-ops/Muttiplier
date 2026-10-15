import type { Ref } from 'vue'

/**
 * Ask before a slideover closes with unsaved changes (clicking outside, Esc or the × button).
 * The form is snapshotted when the slideover opens; closing with nothing changed, or closing
 * by setting `open` directly (after a save), doesn't ask.
 *
 *   const requestOpen = useGuardedClose(open, form)
 *   <USlideover :open="open" @update:open="requestOpen">
 */
export function useGuardedClose(open: Ref<boolean>, form: object) {
  const { confirmDialog } = useConfirm()
  let snapshot = ''
  const current = () => JSON.stringify(form)

  // after the opener (and any watchers that adjust the form) have run
  watch(open, (isOpen) => {
    if (isOpen) nextTick(() => (snapshot = current()))
  })

  return async function requestOpen(value: boolean) {
    if (value || current() === snapshot) {
      open.value = value
      return
    }
    if (await confirmDialog({
      title: 'Discard your changes?',
      description: 'You have unsaved changes. Close without saving them?',
      confirmLabel: 'Discard',
      danger: true
    })) open.value = false
  }
}
