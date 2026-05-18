import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rosewood: "#7f1d3a",
        petal: "#fff1f5",
        mint: "#dff8ef",
        ink: "#22181c",
        honey: "#f8d57e"
      },
      boxShadow: {
        soft: "0 18px 60px rgba(127, 29, 58, 0.16)"
      }
    }
  },
  plugins: []
};

export default config;
