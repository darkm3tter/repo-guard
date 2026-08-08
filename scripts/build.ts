import { build } from "bun";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const distDir = join(root, "dist");
mkdirSync(distDir, { recursive: true });

const entries = [
  { entry: join(root, "src", "bin.ts"), out: "cli.js" },
  { entry: join(root, "src", "hook.ts"), out: "hook.js" },
];

for (const { entry, out } of entries) {
  const result = await build({ entrypoints: [entry], target: "node", outdir: distDir, minify: true });
  const artifact = result.outputs[0];
  if (artifact === undefined) throw new Error(`no output for ${out}`);
  const outfile = join(distDir, out);
  writeFileSync(outfile, "#!/usr/bin/env node\n" + (await artifact.text()));
  console.log(`built ${outfile} (${artifact.size} bytes)`);
}
