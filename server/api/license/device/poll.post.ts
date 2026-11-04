// Klip checks back with its device code, every `interval` seconds. Answers { status }:
// 'pending' (not approved yet), 'slow_down' (checking too often: wait longer), 'denied',
// 'expired' (or already used: start again), or 'approved' with the license token, handed over once.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ deviceCode?: string } | null>(event).catch(() => null)
  if (!body?.deviceCode) throw createError({ statusCode: 400, statusMessage: 'Send the device code' })
  const db = serviceDb(event)
  const { data: row } = await db.from('license_device_codes').select('*')
    .eq('device_code_hash', hashDeviceCode(body.deviceCode)).maybeSingle()
  if (!row || row.status === 'claimed' || new Date(row.expires_at).getTime() < Date.now()) return { status: 'expired' as const }
  if (row.status === 'denied') return { status: 'denied' as const }

  const now = Date.now()
  const tooSoon = row.last_polled_at && now - new Date(row.last_polled_at).getTime() < (DEVICE_POLL_SECONDS - 1) * 1000
  await db.from('license_device_codes').update({ last_polled_at: new Date(now).toISOString() }).eq('id', row.id)
  if (row.status === 'pending') return { status: tooSoon ? 'slow_down' as const : 'pending' as const }

  // approved: claim it (only once, even if two checks race) and hand over the license
  const { data: claimed } = await db.from('license_device_codes').update({ status: 'claimed' })
    .eq('id', row.id).eq('status', 'approved').select('org_id, user_id').maybeSingle()
  if (!claimed?.org_id || !claimed.user_id) return { status: 'expired' as const }
  return { status: 'approved' as const, ...(await issueLicense(event, claimed.org_id, claimed.user_id)) }
})
