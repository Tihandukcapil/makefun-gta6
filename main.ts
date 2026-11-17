// Sunset Keys — dossier generator for the make.fun GTA 6 bounty.
// Walks the repo, lists every file with its size and sha256, and writes
// dossier.json into $MAKEFUN_OUTPUT_DIR (default ./out). The dossier is
// the entry's manifest: the judge reads it to find the game, the shots
// and the README. Run it twice and the output must be byte-identical —
// the file list is sorted, so nothing in it depends on readdir order.

import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const outDir = process.env.MAKEFUN_OUTPUT_DIR
  ? resolve(process.env.MAKEFUN_OUTPUT_DIR)
  : join(root, 'out');
const SKIP_DIRS = new Set(['.git', 'out', 'node_modules', 'vendor']);

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(full, files);
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  const files = await walk(root);
  const entries = [];
  let totalBytes = 0;
  for (const full of files) {
    const data = await readFile(full);
    const st = await stat(full);
    const sha = createHash('sha256').update(data).digest('hex');
    totalBytes += st.size;
    entries.push({ path: relative(root, full), size: st.size, sha256: sha });
  }
  const shots = entries.filter((e) => e.path.startsWith('screenshots/'));
  const dossier = {
    title: 'Sunset Keys',
    game: 'Marisol Bay — an open-world crime game',
    entrypoint: 'game/index.html',
    files: entries,
    fileCount: entries.length,
    totalBytes,
    screenshots: shots.map((s) => s.path),
    generatedBy: 'main.ts',
  };
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, 'dossier.json');
  await writeFile(outPath, JSON.stringify(dossier, null, 2) + '\n');
  console.log(`dossier written: ${outPath} (${entries.length} files, ${totalBytes} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
