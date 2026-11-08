// Org gate. @nuxtjs/supabase already sends signed-out visitors to /login; this signs out anyone
// who isn't in an org (they need an admin's invite), unless they can start one, and asks someone
// in several orgs which one they're working in.
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login' || to.path === '/confirm' || to.path === '/reset-password') return

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

  // connecting Klip picks its own org, and works whatever the subscription (the license says)
  // connecting an AI app picks its own org too
  if (to.path === '/klip/activate' || to.path === '/oauth/consent') return
  // Your account is theirs, whatever the organisation's state; it's also where they pick one
  if (to.path === '/account') return
  if (needsPicker.value) return navigateTo('/account')
  // no live subscription: only billing (in Settings for admins) and switching org are open
  const { currentOrg } = useOrg()
  if (currentOrg.value && !currentOrg.value.entitled) {
    const open = ['/billing', ...(isAdmin.value ? ['/settings'] : [])]
    if (!open.includes(to.path)) return navigateTo(isAdmin.value ? '/settings?tab=profile' : '/billing')
  }
  // Settings is the organisation's, for admins; members' own things are in Your account
  if (to.path.startsWith('/settings') && !isAdmin.value) return navigateTo('/account')
  // Connect your AI moved from Settings to Your account
  if (to.path.startsWith('/settings') && to.query.tab === 'ai') return navigateTo('/account#ai')
})
