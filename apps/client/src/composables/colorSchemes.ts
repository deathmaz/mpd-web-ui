type ColorProperty =
  | '--color-surface'
  | '--color-surface-alt'
  | '--color-surface-hover'
  | '--color-primary'
  | '--color-primary-hover'
  | '--color-text'
  | '--color-text-muted'
  | '--color-border'

export interface ColorScheme {
  id: string
  name: string
  colors: Record<ColorProperty, string>
}

export const colorSchemes: ColorScheme[] = [
  {
    id: 'default',
    name: 'Default',
    colors: {
      '--color-surface': '#0f172a',
      '--color-surface-alt': '#1e293b',
      '--color-surface-hover': '#334155',
      '--color-primary': '#3b82f6',
      '--color-primary-hover': '#2563eb',
      '--color-text': '#f1f5f9',
      '--color-text-muted': '#94a3b8',
      '--color-border': '#334155',
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    colors: {
      '--color-surface': '#1e1e2e',
      '--color-surface-alt': '#181825',
      '--color-surface-hover': '#45475a',
      '--color-primary': '#89b4fa',
      '--color-primary-hover': '#74c7ec',
      '--color-text': '#cdd6f4',
      '--color-text-muted': '#a6adc8',
      '--color-border': '#45475a',
    },
  },
  {
    id: 'catppuccin-macchiato',
    name: 'Catppuccin Macchiato',
    colors: {
      '--color-surface': '#24273a',
      '--color-surface-alt': '#1e2030',
      '--color-surface-hover': '#494d64',
      '--color-primary': '#8aadf4',
      '--color-primary-hover': '#7dc4e4',
      '--color-text': '#cad3f5',
      '--color-text-muted': '#a5adcb',
      '--color-border': '#494d64',
    },
  },
  {
    id: 'catppuccin-frappe',
    name: 'Catppuccin Frappé',
    colors: {
      '--color-surface': '#303446',
      '--color-surface-alt': '#292c3c',
      '--color-surface-hover': '#51576d',
      '--color-primary': '#8caaee',
      '--color-primary-hover': '#85c1dc',
      '--color-text': '#c6d0f5',
      '--color-text-muted': '#a5adce',
      '--color-border': '#51576d',
    },
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    colors: {
      '--color-surface': '#eff1f5',
      '--color-surface-alt': '#e6e9ef',
      '--color-surface-hover': '#bcc0cc',
      '--color-primary': '#1e66f5',
      '--color-primary-hover': '#209fb5',
      '--color-text': '#4c4f69',
      '--color-text-muted': '#6c6f85',
      '--color-border': '#acb0be',
    },
  },
  {
    id: 'mono-dark',
    name: 'Mono Dark',
    colors: {
      '--color-surface': '#121212',
      '--color-surface-alt': '#0a0a0a',
      '--color-surface-hover': '#2a2a2a',
      '--color-primary': '#e0e0e0',
      '--color-primary-hover': '#b0b0b0',
      '--color-text': '#ebebeb',
      '--color-text-muted': '#7a7a7a',
      '--color-border': '#2a2a2a',
    },
  },
  {
    id: '256noir',
    name: '256 Noir',
    colors: {
      '--color-surface': '#000000',
      '--color-surface-alt': '#0a0a0a',
      '--color-surface-hover': '#303030',
      '--color-primary': '#af0000',
      '--color-primary-hover': '#870000',
      '--color-text': '#bcbcbc',
      '--color-text-muted': '#8a8a8a',
      '--color-border': '#303030',
    },
  },
]
