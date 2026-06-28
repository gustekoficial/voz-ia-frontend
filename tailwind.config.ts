import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        carvao: "#16140F",
        painel: "#211E16",
        ambar: "#E8A23D",
        fitaverde: "#6FA287",
        papel: "#F2ECDD",
        cinzafita: "#8C8573",
        erro: "#D9694F",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
  plugins: [],
};

export default config;
