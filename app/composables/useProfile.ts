export interface MyProfile {
  id: string
  email: string
  /** the name they chose, else the one from sign-in */
  name: string
  /** the photo they chose, else the one from sign-in (Google) */
  photo: string | null
  /** just the photo they chose (null when it's the sign-in one, or none) */
  photo_url: string | null
}

/**
 * The signed-in person's own account (Your account, /account, and the photo in the top bar): name,
 * photo and email, the same in every organisation they're in.
 */
export const useProfile = () => {
  const db = useDb()
  const profile = useState<MyProfile | null>('my-profile', () => null)

  async function load() {
    const { data: claims } = await db.auth.getClaims()
    const id = claims?.claims.sub
    if (!id) {
      profile.value = null
      return null
    }
    const row = mustOne(await db.from('profiles').select('id, email, full_name, avatar_url, display_name, photo_url').eq('id', id).single())
    profile.value = {
      id: row.id,
      email: row.email ?? '',
      name: row.display_name || row.full_name || row.email || '',
      photo: row.photo_url || row.avatar_url || null,
      photo_url: row.photo_url
    }
    return profile.value
  }

  /** saves their name and photo here and in every org they're in */
  async function save(fields: { name: string, photo_url: string | null }) {
    must(await db.rpc('update_my_profile', { p_display_name: fields.name, p_photo_url: fields.photo_url as string }))
    await load()
  }

  /** puts a new photo in their folder of the avatars bucket and returns its address */
  async function uploadPhoto(file: File) {
    const id = profile.value?.id
    if (!id) throw new Error('Not signed in')
    const path = `${id}/photo`
    const { error } = await db.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' })
    if (error) throw error
    return `${db.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
  }

  async function removePhoto() {
    const id = profile.value?.id
    if (id) await db.storage.from('avatars').remove([`${id}/photo`])
  }

  return { profile, load, save, uploadPhoto, removePhoto }
}
