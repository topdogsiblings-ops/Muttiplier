// Build a shoot's whole folder tree in Dropbox (spec §10d): every clip folder under raw/ and
// edited/, plus renders/, and the current shootsheet.json. Folders that already exist are left
// exactly as they are (no renaming, nothing removed), so this is safe to run again and again:
// after planning, before each upload, or by hand. Any allowlisted user; not for drafts, whose
// codes can still change.
export default defineEventHandler(async (event) => {
  const { db } = await requireAllowed(event)
  const { shootCode } = await readBody<{ shootCode?: string }>(event)
  if (!shootCode) throw createError({ statusCode: 400, statusMessage: 'Which shoot?' })

  const bundle = await loadShootBundle(db, shootCode)
  if (!bundle) throw createError({ statusCode: 404, statusMessage: 'Shoot not found' })
  if (bundle.shoot.status === 'draft') throw createError({ statusCode: 409, statusMessage: 'Mark the shoot as planned first: its codes can still change' })

  const { accessToken, root } = await dropboxAccess(event, db)
  const auth = { Authorization: `Bearer ${accessToken}` }
  const paths = skeletonFolders(bundle).map(folder => `${root}/${folder}`)

  // autorename off: a folder that's already there comes back as a conflict and is left alone
  type Entry = { '.tag': 'success' } | { '.tag': 'failure', failure: { '.tag': string, path?: { '.tag': string } } }
  type Launch = { '.tag': 'complete', entries: Entry[] } | { '.tag': 'async_job_id', async_job_id: string } | { '.tag': 'in_progress' | 'failed' }
  let result = await $fetch<Launch>('https://api.dropboxapi.com/2/files/create_folder_batch', {
    method: 'POST',
    headers: auth,
    body: { paths, autorename: false }
  })
  // big batches run in the background: check on the job until it's done
  const jobId = result['.tag'] === 'async_job_id' ? result.async_job_id : null
  for (let attempt = 0; jobId && result['.tag'] !== 'complete' && result['.tag'] !== 'failed' && attempt < 30; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500))
    result = await $fetch<Launch>('https://api.dropboxapi.com/2/files/create_folder_batch/check', {
      method: 'POST',
      headers: auth,
      body: { async_job_id: jobId }
    })
  }
  if (result['.tag'] !== 'complete') throw createError({ statusCode: 502, statusMessage: 'Dropbox didn\'t finish creating the folders. Try again.' })

  const created = result.entries.filter(entry => entry['.tag'] === 'success').length
  const failed = result.entries.filter(entry => entry['.tag'] === 'failure' && entry.failure.path?.['.tag'] !== 'conflict').length

  // the shoot sheet is regenerated each time, so it always matches the plan
  await $fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      ...auth,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': dropboxArg({ path: `${root}/${shootFolder(bundle)}/shootsheet.json`, mode: 'overwrite', mute: true })
    },
    body: JSON.stringify(buildShootsheet(bundle), null, 2)
  })

  return { folders: paths.length, created, existing: paths.length - created - failed, failed, root: `${root}/${shootFolder(bundle)}` }
})
