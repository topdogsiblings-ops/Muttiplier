export interface SlotInfo {
  name: string
  /** fills itself: from the product, or from the channel */
  builtIn: boolean
  description: string
}

const BUILT_IN_DESCRIPTIONS: Record<string, string> = {
  brand: 'Brand name, filled from the product',
  product: 'Product name, filled from the product'
}

/**
 * The slots a script can use. The built-ins fill themselves from the product, and the org's
 * channel slots (Settings → Scripts) from each channel; any other `{{name}}` is a custom slot,
 * filled in on each shoot (the planner's Fill in slots), so it isn't defined anywhere first.
 */
export const useSlotNames = () => {
  const { settings } = useRefData()
  const channelSlots = computed(() => parseChannelSlots(settings.value?.channel_slots))

  const slots = computed<SlotInfo[]>(() => [
    ...BUILT_IN_SLOTS.map(name => ({ name, builtIn: true, description: BUILT_IN_DESCRIPTIONS[name]! })),
    ...channelSlots.value.map(slot => ({
      name: slot.name,
      builtIn: true,
      description: `${slot.description || 'Each channel\'s own words'}${slot.example ? `, e.g. “${slot.example}”` : ''}. Filmed once per channel.`
    }))
  ])

  const isBuiltIn = (name: string) => slots.value.some(slot => slot.name === name.toLowerCase())
  const isChannelSlot = (name: string) => channelSlots.value.some(slot => slot.name === name.toLowerCase())

  return { slots, channelSlots, isBuiltIn, isChannelSlot }
}
