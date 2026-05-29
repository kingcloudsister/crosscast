import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        muted: "#64748b",
        line: "#dbe3ec",
        canvas: "#f7f9fb",
        rednote: "#e11d48",
        threads: "#2563eb",
        linkedin: "#059669",
      },
      boxShadow: {
        workspace: "0 18px 48px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
