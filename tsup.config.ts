import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node18",
  banner: ({ format }) => {
    if (format === "esm") {
      return {
        js: "// @acprotocol/server — Apache 2.0",
      };
    }
  },
});
