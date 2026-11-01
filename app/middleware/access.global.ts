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

  if (needsPicker.value && to.path !== '/orgs') return navigateTo('/orgs')
  if (to.path.startsWith('/settings') && !isAdmin.value) return navigateTo('/')
})
