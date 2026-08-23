import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Calm, human palette — red used only as a meaningful accent.
        canvas: "#faf8f6",
        ink: {
          DEFAULT: "#1f2430",
          soft: "#4b5563",
          faint: "#9aa3af",
        },
        crimson: {
          50: "#fef2f2",
          100: "#fde4e4",
          500: "#c73a45",
          600: "#b02a37",
          700: "#93212e",
        },
        teal: {
          50: "#effaf8",
          100: "#d7f0ec",
          500: "#1f7a6d",
          600: "#186359",
          700: "#14504a",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Noto Sans",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(31,36,48,0.06), 0 8px 24px -12px rgba(31,36,48,0.12)",
        lift: "0 2px 4px rgba(31,36,48,0.08), 0 16px 40px -16px rgba(31,36,48,0.18)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
export default config;
