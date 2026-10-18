// Filmed → ready for shortlist (status `edited`), only once the editors' work checks out. The
// check runs here, on the server, so it can't be skipped.
export default defineEventHandler(async (event) => {
  const { db, bundle, raw, edited, onPhones } = await shootEdits(event)
  if (bundle.shoot.status !== 'filmed') throw createError({ statusCode: 409, statusMessage: 'Only an ended (filmed) shoot can be marked ready for shortlist' })
  const check = checkEdits(bundle, raw, edited, onPhones)
  if (!check.ok) throw createError({ statusCode: 409, statusMessage: 'The edits don\'t check out yet', data: check })
  const { error } = await db.from('shoots').update({ status: 'edited' }).eq('id', bundle.shoot.id).eq('status', 'filmed')
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return check
})
