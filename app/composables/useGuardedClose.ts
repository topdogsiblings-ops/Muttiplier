import type { Ref } from 'vue'

/**
 * Ask before a slideover or modal closes with unsaved work (clicking outside, Esc, the ×
 * button, or leaving the page with it open, e.g. the phone's back gesture). What's being
 * worked on is snapshotted when it opens; closing with nothing changed, or closing by setting
 * `open` directly (after a save), doesn't ask.
 *
 * `work` is the form, or a function returning whatever holds the work (use one for Sets and
 * refs, e.g. `() => ({ form, drafts: drafts.value, picked: [...picked.value] })`).
 *
 *   const requestOpen = useGuardedClose(open, form)
 *   <USlideover :open="open" @update:open="requestOpen">
 */
export function useGuardedClose(open: Ref<boolean>, work: object | (() => unknown)) {
  const { confirmDialog } = useConfirm()
  let snapshot = ''
  const current = () => JSON.stringify(typeof work === 'function' ? work() : work)
  const unsaved = () => open.value && current() !== snapshot

  // after the opener (and any watchers that adjust the form) have run
  watch(open, (isOpen) => {
    if (isOpen) nextTick(() => (snapshot = current()))
  })

  const discard = () => confirmDialog({
    title: 'Discard your changes?',
    description: 'You have unsaved changes. Close without saving them?',
    confirmLabel: 'Discard',
    danger: true
  })

  onBeforeRouteLeave(async () => {
    if (!unsaved()) return true
    if (!(await discard())) return false
    open.value = false
    return true
  })

  return async function requestOpen(value: boolean) {
    if (value || !unsaved()) {
      open.value = value
      return
    }
    if (await discard()) open.value = false
  }
}
