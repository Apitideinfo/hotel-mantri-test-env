/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Hotel Mantri brand palette
        brand: {
          // Primary electric / royal blue (from "H" of logo)
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#3b82f6',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1e40af',
          800: '#1e3a8a',
          900: '#172554',
          // Deep navy (from "M" of logo)
          navy: {
            50: '#f0f4fa',
            100: '#d9e2f1',
            200: '#b3c5e3',
            300: '#7d99c9',
            400: '#4a6ba8',
            500: '#2d4a7a',
            600: '#1f3559',
            700: '#162842',
            800: '#0f1c30',
            900: '#0a1628',
          },
          // Gold accent (from gold star)
          gold: {
            50: '#fffbeb',
            100: '#fef3c7',
            200: '#fde68a',
            300: '#fcd34d',
            400: '#fbbf24',
            500: '#f59e0b',
            600: '#d97706',
            700: '#b45309',
          },
        },
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(15, 28, 48, 0.06), 0 1px 2px -1px rgba(15, 28, 48, 0.05)',
        'card-hover': '0 4px 12px -2px rgba(15, 28, 48, 0.10), 0 2px 6px -2px rgba(15, 28, 48, 0.06)',
        'soft-blue': '0 4px 14px 0 rgba(37, 99, 235, 0.10)',
      },
      borderRadius: {
        card: '16px',
      },
    },
  },
  plugins: [],
};
