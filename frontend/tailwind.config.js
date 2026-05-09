/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './utils/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sky: {
          450: '#0ea5e9',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      animation: {
        'float': 'float 4s ease-in-out infinite',
        'bubble-in': 'bubble-in 0.2s cubic-bezier(.34,1.56,.64,1)',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        'bubble-in': {
          from: { opacity: '0', transform: 'translateX(-50%) scale(0.85)' },
          to:   { opacity: '1', transform: 'translateX(-50%) scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
