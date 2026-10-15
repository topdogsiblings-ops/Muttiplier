// Allowlist gate. @nuxtjs/supabase already sends signed-out visitors to /login; this
// signs out anyone who is signed in with Google but not on the allowlist.
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login' || to.path === '/confirm') return

  const user = useSupabaseUser()
  if (!user.value) return

  const { ensure, isAdmin, reset } = useAccess()
  if (!(await ensure(user.value.email))) {
    reset()
    await useSupabaseClient().auth.signOut()
    return navigateTo('/login?denied=1')
  }

  if (to.path.startsWith('/settings') && !isAdmin.value) return navigateTo('/')
})
