/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./public/**/*.html",
  ],
  theme: {
    extend: {
      colors: {
        // Salesforce Lightning Design System theme tokens
        background: "#F3F2F1",
        borderLine: "#DDDBDA",
        sfBorder: "#DDDBDA",
        sfBlue: "#0070D2",
        sfBlueHover: "#005FB2",
        sfBlueActive: "#004488",
        sfPurple: "#5867E8",
        sfTextPrimary: "#16325C",
        sfTextMuted: "#706E6B",
        sfSuccess: "#04844B",
        sfSuccessBg: "#EAF5EA",
        sfError: "#C23934",
        sfErrorBg: "#FEF0F0",
        sfWarning: "#DD7A01",
        sfWarningBg: "#FFF4E4",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
}
