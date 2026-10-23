// Matches the light design system used by the driver pickup and delivery screens.
export const orderColors = {
  canvas: '#F3F4F6', surface: '#FFFFFF', subtle: '#F9FAFB', text: '#111827',
  secondary: '#627080', border: '#D1D5DB', primary: '#16A34A', onPrimary: '#FFFFFF',
  success: '#166534', successSoft: '#EAF6F0', accent: '#F1B900', accentSoft: '#FFF1B8',
  contact: '#0F766E', info: '#385D7B', infoSoft: '#EDF4FA',
  danger: '#B52D3A', dangerSoft: '#FFF0F1', warning: '#805A12', warningSoft: '#FFF7E5',
} as const;
export const orderSpace = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;
export const orderRadius = { sm: 10, md: 14, lg: 20 } as const;
