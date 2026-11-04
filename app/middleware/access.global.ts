// Org gate. @nuxtjs/supabase already sends signed-out visitors to /login; this signs out anyone
// who isn't in an org (they need an admin's invite), unless they can start one, and asks someone
// in several orgs which one they're working in.
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login' || to.path === '/confirm') return

  const user = useSupabaseUser()
  if (!user.value) return

  const { ensure, isAdmin, reset } = useAccess()
  const { needsPicker, signupOpen } = useOrg()
  if (!(await ensure(user.value))) {
    if (await signupOpen()) return to.path === '/onboarding' ? undefined : navigateTo('/onboarding')
    reset()
    await useSupabaseClient().auth.signOut()
    return navigateTo('/login?denied=1')
  }

  // connecting UGC Klip picks its own org, and works whatever the subscription (the license says)
  if (to.path === '/klip/activate' || to.path === '/cut/activate') return
  if (needsPicker.value && to.path !== '/orgs') return navigateTo('/orgs')
  // no live subscription: only billing (in Settings for admins) and switching org are open
  const { currentOrg } = useOrg()
  if (currentOrg.value && !currentOrg.value.entitled) {
    const open = ['/billing', '/orgs', ...(isAdmin.value ? ['/settings'] : [])]
    if (!open.includes(to.path)) return navigateTo(isAdmin.value ? '/settings?tab=profile' : '/billing')
  }
  if (to.path.startsWith('/settings') && !isAdmin.value) return navigateTo('/')
})
