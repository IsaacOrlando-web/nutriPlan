// Design tokens (spec section 11). Owner: Frontend. Never hardcode colors in components; use these.
import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1440px" } },
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        brand: { DEFAULT: "#16A34A", foreground: "#FFFFFF", soft: "#DCFCE7", dark: "#15803D" },
        ink: { DEFAULT: "#0F172A", muted: "#475569", subtle: "#94A3B8" },
        surface: { DEFAULT: "#F8FAFC", raised: "#FFFFFF", sunken: "#F1F5F9" },
        success: { DEFAULT: "#22C55E", soft: "#DCFCE7" },
        warning: { DEFAULT: "#F59E0B", soft: "#FEF3C7" },
        danger: { DEFAULT: "#EF4444", soft: "#FEE2E2" },
        agent: {
          doctor: "#2563EB",
          chef: "#EA580C",
          budget: "#059669",
          monitor: "#7C3AED",
          orchestrator: "#475569",
        },
        // shadcn/ui semantic tokens (mapped to CSS variables in app/globals.css)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "agent-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 var(--pulse-color)" },
          "50%": { boxShadow: "0 0 0 14px transparent" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%, 60%": { transform: "translateX(-6px)" },
          "40%, 80%": { transform: "translateX(6px)" },
        },
      },
      animation: {
        "agent-pulse": "agent-pulse 1.4s ease-in-out infinite",
        shake: "shake 0.45s ease-in-out",
      },
    },
  },
  plugins: [animate],
};

export default config;
