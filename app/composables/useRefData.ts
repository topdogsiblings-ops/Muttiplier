import type { ProductWithBrand, Row } from '#shared/types/models'

/** Reference data used across tabs: loaded once, refreshed after edits. */
export const useRefData = () => {
  const db = useDb()
  const people = useState<Row<'people'>[]>('ref-people', () => [])
  const channels = useState<Row<'channels'>[]>('ref-channels', () => [])
  const angles = useState<Row<'angles'>[]>('ref-angles', () => [])
  const formats = useState<Row<'formats'>[]>('ref-formats', () => [])
  const products = useState<ProductWithBrand[]>('ref-products', () => [])
  const features = useState<Row<'product_features'>[]>('ref-features', () => [])
  const settings = useState<Row<'settings'> | null>('ref-settings', () => null)
  const loaded = useState('ref-loaded', () => false)

  async function load(force = false) {
    if (loaded.value && !force) return
    const [p, c, a, f, pr, s, fe] = await Promise.all([
      db.from('people').select('*').order('name'),
      db.from('channels').select('*').order('name'),
      db.from('angles').select('*').order('name'),
      db.from('formats').select('*').order('code'),
      db.from('products').select('*, brand:brands(*)').order('name'),
      db.from('settings').select('*').limit(1).maybeSingle(),
      db.from('product_features').select('*').order('sort_order').order('created_at')
    ])
    people.value = must(p)
    channels.value = must(c)
    angles.value = must(a)
    formats.value = must(f)
    products.value = must(pr) as ProductWithBrand[]
    settings.value = must(s)
    features.value = must(fe)
    loaded.value = true
  }

  const angleName = (id: string | null) => angles.value.find(angle => angle.id === id)?.name ?? null

  const angleOptions = computed(() =>
    angles.value.filter(angle => !angle.archived).map(angle => ({ label: angle.name, value: angle.id }))
  )
  const productOptions = computed(() =>
    products.value.map(product => ({ label: `${product.brand.name} — ${product.name}`, value: product.id }))
  )
  /** A product's core features, in order, as select options. */
  const featureOptions = (productId: string | null | undefined) =>
    features.value.filter(feature => feature.product_id === productId).map(feature => ({ label: feature.name, value: feature.id }))
  const featureOf = (id: string | null | undefined) => features.value.find(feature => feature.id === id) ?? null
  const productOf = (id: string | null | undefined) => products.value.find(product => product.id === id) ?? null

  const channelOptions = computed(() =>
    channels.value.filter(channel => channel.active).map(channel => ({ label: channel.name, value: channel.id }))
  )

  return { people, channels, angles, formats, products, features, settings, load, angleName, angleOptions, productOptions, featureOptions, featureOf, productOf, channelOptions }
}
