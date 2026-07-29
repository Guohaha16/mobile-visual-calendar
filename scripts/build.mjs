import { cp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { build } from "vite";

const projectRoot = process.cwd();
const temporaryOutput = resolve(tmpdir(), "mobile-visual-calendar-dist");
const projectOutput = resolve(projectRoot, "dist");

await rm(temporaryOutput, { force: true, recursive: true });
await build({
  root: projectRoot,
  build: {
    emptyOutDir: true,
    outDir: temporaryOutput
  }
});

await rm(projectOutput, { force: true, recursive: true });
await mkdir(projectOutput, { recursive: true });
await cp(temporaryOutput, projectOutput, { recursive: true });
