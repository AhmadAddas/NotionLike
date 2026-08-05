import type { NextConfig } from "next";
const config: NextConfig = { output: "standalone", transpilePackages: ["@notionlike/editor", "@notionlike/contracts"] };
export default config;

