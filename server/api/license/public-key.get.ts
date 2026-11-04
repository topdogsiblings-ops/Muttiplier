// The Ed25519 public key license tokens are signed with (SPKI DER, base64), for building into Pawcessor.
export default defineEventHandler(event => ({ algorithm: 'Ed25519', publicKey: licensePublicKey(event) }))
