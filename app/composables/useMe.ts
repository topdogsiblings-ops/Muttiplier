/**
 * The signed-in user's person on the cast (Settings → People links them), and whether they're an
 * admin. A VO is written by, and only edited by, its writer (or an admin).
 */
export const useMe = () => {
  const { access, isAdmin } = useAccess()
  const { people } = useRefData()
  const me = computed(() => people.value.find(person => person.allowed_user_id && person.allowed_user_id === access.value?.id) ?? null)
  /** can the signed-in user change a VO written by this person? */
  const canEditVo = (writerId: string | null | undefined) => isAdmin.value || (!!me.value && me.value.id === writerId)
  return { me, isAdmin, canEditVo }
}
