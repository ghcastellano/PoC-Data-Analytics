/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        dark: { 900: '#0A1628', 800: '#0D1F3C', 700: '#131D33', 600: '#182440' },
        cyan: { 400: '#00D4FF', 500: '#00B8DB' },
        teal: { 400: '#00C9A7' },
        violet: { 400: '#7B61FF' },
        amber: { 400: '#FFB547' },
        rose: { 400: '#FF6B8A' },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        display: ['"Instrument Serif"', 'serif'],
      },
    },
  },
  plugins: [],
}
