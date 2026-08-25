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
          bg: '#0A0A0B',
          card: '#121214',
          border: '#27272A',
          muted: '#71717A',
          accent: '#3B82F6',
          accentHover: '#2563EB',
          text: '#F4F4F5',
          subtext: '#A1A1AA'
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      boxShadow: {
        'phero-subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'phero-float': '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
        'phero-glow': '0 0 15px -3px rgba(59, 130, 246, 0.25)'
      }
    },
  },
  plugins: [],
}
