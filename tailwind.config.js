/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        abyss: '#04080f',
        navy: {
          950: '#06121f',
          900: '#0a1a2e',
          800: '#10263f',
          700: '#16344f'
        },
        emeraldx: {
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669'
        },
        gold: '#d4af37'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      animation: {
        'orbit-spin': 'orbitSpin 24s linear infinite',
        'orbit-spin-rev': 'orbitSpinRev 36s linear infinite',
        'float-slow': 'floatSlow 7s ease-in-out infinite',
        'fade-up': 'fadeUp .35s ease both',
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
        'shimmer': 'shimmer 1.6s linear infinite'
      },
      keyframes: {
        orbitSpin: { to: { transform: 'rotate(360deg)' } },
        orbitSpinRev: { to: { transform: 'rotate(-360deg)' } },
        floatSlow: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        fadeUp: { from: { opacity: 0, transform: 'translateY(10px)' }, to: { opacity: 1, transform: 'none' } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: .55 } },
        shimmer: { from: { backgroundPosition: '-400px 0' }, to: { backgroundPosition: '400px 0' } }
      }
    }
  },
  plugins: []
}
