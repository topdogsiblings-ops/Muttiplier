/**
 * The product + channel a library script is previewed against. Shared so the choice sticks between
 * drawers. Custom slots stay unfilled here: they're filled in on each shoot.
 */
export const usePreviewContext = () => {
  const { products, channels } = useRefData()
  const productId = useState<string | undefined>('preview-product', () => undefined)
  const channelId = useState<string | undefined>('preview-channel', () => undefined)

  const context = computed(() => {
    const product = products.value.find(p => p.id === productId.value)
    const channel = channels.value.find(c => c.id === channelId.value)
    return buildSlotContext({
      brand: product?.brand.name,
      product: product?.name,
      dogPhrase: channel?.dog_phrase
    })
  })

  return { productId, channelId, context }
}
