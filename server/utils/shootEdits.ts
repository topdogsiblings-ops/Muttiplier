import type { H3Event } from 'h3'

/**
 * A shoot and its footage in Dropbox (spec §14): the files under its raw/ and edited/ folders,
 * and how many clips are still saved on phones. For checking the editors' work and shortlisting.
 */
export async function shootEdits(event: H3Event) {
  const { db } = await requireAllowed(event)
  const code = getRouterParam(event, 'code')!
  const bundle = await loadShootBundle(db, code)
  if (!bundle) throw createError({ statusCode: 404, statusMessage: 'Shoot not found' })
  const { accessToken, root } = await dropboxAccess(event, db)
  const base = `${root}/${shootFolder(bundle)}`
  const [raw, edited, onPhones] = await Promise.all([
    dropboxFiles(accessToken, `${base}/raw`),
    dropboxFiles(accessToken, `${base}/edited`),
    db.from('shoot_clips').select('id', { count: 'exact', head: true }).eq('shoot_id', bundle.shoot.id).eq('state', 'saved')
  ])
  return { db, bundle, accessToken, base, raw, edited, onPhones: onPhones.count ?? 0 }
}
