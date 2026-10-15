/** The product + channel a library script is previewed against. Shared so the choice sticks between drawers. */
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
      slotValues: product?.slot_values,
      dogPhrase: channel?.dog_phrase
    })
  })

  return { productId, channelId, context }
}
