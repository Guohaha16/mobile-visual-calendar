import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const projectOutput = resolve(projectRoot, "dist");
const requiresPathWorkaround =
  process.platform === "win32" && !isAscii(projectRoot);

if (!requiresPathWorkaround) {
  await build({ root: projectRoot });
} else {
  const temporaryBase = resolveAsciiTemporaryBase();
  await mkdir(temporaryBase, { recursive: true });

  const temporaryOutput = await mkdtemp(
    resolve(temporaryBase, "mobile-visual-calendar-")
  );
  assertChildPath(temporaryBase, temporaryOutput, "temporary build output");
  assertChildPath(projectRoot, projectOutput, "project build output");

  try {
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
  } finally {
    await rm(temporaryOutput, { force: true, recursive: true });
  }
}

function isAscii(value) {
  return [...value].every((character) => character.codePointAt(0) <= 127);
}

function resolveAsciiTemporaryBase() {
  const candidates = [
    process.env.VISUAL_DIARY_ASCII_TEMP_DIR,
    tmpdir()
  ].filter(Boolean);
  const base = candidates.find(isAscii);

  if (!base) {
    throw new Error(
      "No ASCII-only temporary directory is available. Set " +
        "VISUAL_DIARY_ASCII_TEMP_DIR to a writable ASCII-only path."
    );
  }

  return resolve(base);
}

function assertChildPath(parent, child, label) {
  const relativePath = relative(parent, child);
  const isChild =
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..\\`) &&
    !relativePath.startsWith("../") &&
    !isAbsolute(relativePath);

  if (!isChild) {
    throw new Error(`Refusing to remove unsafe ${label}: ${child}`);
  }
}
