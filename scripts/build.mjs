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
  assertAsciiPath(temporaryOutput, "temporary build output");

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
  const override = process.env.VISUAL_DIARY_ASCII_TEMP_DIR;

  if (override && !isAbsolute(override)) {
    throw new Error(
      "VISUAL_DIARY_ASCII_TEMP_DIR must be an absolute ASCII-only path."
    );
  }

  const candidates = [override, tmpdir()]
    .filter(Boolean)
    .map((candidate) => resolve(candidate));
  const base = candidates.find(isAscii);

  if (!base) {
    throw new Error(
      "No ASCII-only temporary directory is available. Set " +
        "VISUAL_DIARY_ASCII_TEMP_DIR to a writable ASCII-only path."
    );
  }

  return resolve(base);
}

function assertAsciiPath(path, label) {
  if (!isAscii(path)) {
    throw new Error(`${label} must use an ASCII-only path: ${path}`);
  }
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
