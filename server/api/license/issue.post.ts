// A Klip license token for the member signed in to Kreate: their current org's, or { orgId } to
// pick one they're in. Always issued to a member; whether Klip opens is in the token
// (subscriptionState, klipPurchased). Klip itself connects with a code (./device/*).
export default defineEventHandler(async (event) => {
  const userId = await licenseUser(event)
  const body = await readBody<{ orgId?: string } | null>(event).catch(() => null)
  const orgId = await licenseOrg(event, userId, body?.orgId)
  return await issueLicense(event, orgId, userId)
})
