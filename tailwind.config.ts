import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#080a35",
        muted: "#687292",
        line: "#e1e5f5",
        canvas: "#f7f8ff",
        surface: "#ffffff",
        violet: "#6842ff",
        coral: "#ff4168",
        teal: "#02afc4",
        amber: "#ffa51f",
        rednote: "#ff4168",
        threads: "#6842ff",
        linkedin: "#02afc4",
      },
      boxShadow: {
        workspace: "0 18px 48px rgba(8, 10, 53, 0.08)",
        brand: "0 18px 44px rgba(104, 66, 255, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
