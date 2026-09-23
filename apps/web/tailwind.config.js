/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--vbx-bg)",
        surface: "var(--vbx-surface)",
        surface2: "var(--vbx-surface-2)",
        border: "var(--vbx-border)",
        text: "var(--vbx-text)",
        muted: "var(--vbx-muted)",
        accent: "var(--vbx-accent)",
        accent2: "var(--vbx-accent-2)",
        danger: "var(--vbx-danger)",
        warn: "var(--vbx-warn)",
        ok: "var(--vbx-ok)",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "Segoe UI", "sans-serif"],
        display: ["var(--font-sora)", "var(--font-manrope)", "sans-serif"],
      },
      boxShadow: {
        soft: "0 10px 40px rgba(0,0,0,.35)",
      },
    },
  },
  plugins: [],
};
