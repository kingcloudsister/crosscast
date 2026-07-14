import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#2c3040",
        muted: "#5b6178",
        line: "#e3e4ec",
        canvas: "#fefdf8",
        surface: "#ffffff",
        violet: "#4a6fa8",
        coral: "#9096b0",
        teal: "#8bade4",
        amber: "#9096b0",
        rednote: "#6b7f9f",
        threads: "#4a6fa8",
        linkedin: "#789bcf",
        periwinkle: "#8bade4",
        slateblue: "#9096b0",
        ice: "#d3eafa",
        ivory: "#fefdf8",
      },
      boxShadow: {
        workspace: "0 1px 2px rgba(44, 48, 64, 0.05), 0 8px 24px rgba(44, 48, 64, 0.06)",
        brand: "0 5px 14px rgba(74, 111, 168, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
