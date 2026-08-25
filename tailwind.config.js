/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,html}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        phero: {
          bg: '#09090B',
          surface: '#111113',
          surfaceHover: '#18181B',
          surfaceActive: '#202024',
          border: '#232326',
          borderHover: '#36363A',
          textPrimary: '#F4F4F6',
          textSecondary: '#8A8A93',
          textMuted: '#52525B',
          accent: '#3B82F6',
          accentSubtle: 'rgba(59, 130, 246, 0.12)',
        },
        provider: {
          chatgpt: '#10A37F',
          claude: '#D97706',
          gemini: '#1A73E8',
        }
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif'
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      boxShadow: {
        'phero-subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.4)',
        'phero-card': '0 4px 20px -2px rgba(0, 0, 0, 0.5), 0 2px 6px -1px rgba(0, 0, 0, 0.4)',
      },
      letterSpacing: {
        tightest: '-0.02em',
        tighter: '-0.015em',
      }
    },
  },
  plugins: [],
}
