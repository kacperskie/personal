import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17211f",
        paper: "#f7f7f2",
        line: "#dedfd5",
        moss: "#46684f",
        teal: "#1f7a73",
        saffron: "#c88a2c",
        berry: "#9f3d5b",
      },
      boxShadow: {
        panel: "0 18px 50px rgba(23, 33, 31, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
