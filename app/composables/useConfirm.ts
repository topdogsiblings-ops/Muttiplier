interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  /** red confirm button, for removals */
  danger?: boolean
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (confirmed: boolean) => void
}

/**
 * App-wide confirmation dialog (rendered once by <ConfirmDialog> in app.vue), used instead of
 * the browser's confirm(): `if (!(await confirmDialog({ title: 'Remove…?' }))) return`
 */
export const useConfirm = () => {
  const request = useState<ConfirmRequest | null>('confirm-request', () => null)

  function confirmDialog(options: ConfirmOptions): Promise<boolean> {
    // a new request answers any pending one with "no"
    request.value?.resolve(false)
    return new Promise((resolve) => {
      request.value = { ...options, resolve }
    })
  }

  function answer(confirmed: boolean) {
    request.value?.resolve(confirmed)
    request.value = null
  }

  return { request, confirmDialog, answer }
}
