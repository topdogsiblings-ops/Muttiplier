import { colors } from '../shared/design/tokens'

export default defineAppConfig({
  ui: {
    colors: { ...colors },
    // the top bar sits above the dashboard, so panels and the sidebar fill what's left of the
    // screen rather than all of it (their default)
    dashboardPanel: { slots: { root: 'min-h-0' } },
    dashboardSidebar: { slots: { root: 'min-h-0' } }
  }
})
