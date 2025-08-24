/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        jakarta: ['Plus_Jakarta_Sans', 'sans-serif'],
      },
      colors: {
        primary: '#E65CFF',
        textSecondary: '#A3A3A3',
        background: '#232323',
        backgroundCard: '#181818',
        progressBar: '#333333',
      }
    },
  },
  plugins: [],
}