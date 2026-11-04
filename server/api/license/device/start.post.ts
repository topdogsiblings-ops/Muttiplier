// Cut asks to connect: a secret device code it keeps (to check back with) and a short code the
// person approves in Kit, at verificationUriComplete (the code filled in) or verificationUri.
export default defineEventHandler(async (event) => {
  const db = serviceDb(event)
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  // tidy up codes that ran out over a day ago
  await db.from('license_device_codes').delete().lt('expires_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  const deviceCode = newDeviceCode()
  const expiresAt = new Date(Date.now() + DEVICE_CODE_SECONDS * 1000)
  // a clash on the short code is vanishingly rare: try again if it happens
  for (let attempt = 0; attempt < 3; attempt++) {
    const userCode = newUserCode()
    const { error } = await db.from('license_device_codes').insert({
      device_code_hash: hashDeviceCode(deviceCode),
      user_code: userCode,
      expires_at: expiresAt.toISOString()
    })
    if (error?.code === '23505') continue
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    return {
      deviceCode,
      userCode: formatUserCode(userCode),
      verificationUri: `${origin}/cut/activate`,
      verificationUriComplete: `${origin}/cut/activate?code=${formatUserCode(userCode)}`,
      expiresIn: DEVICE_CODE_SECONDS,
      interval: DEVICE_POLL_SECONDS
    }
  }
  throw createError({ statusCode: 500, statusMessage: 'Couldn\'t make a code. Try again.' })
})
