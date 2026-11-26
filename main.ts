// best-flight-game-20261126-0057 — hand-in program.
//
// The game lives in game/ (plain static files a desktop browser loads
// offline) and screenshots/ holds 3–4 JPEGs or PNGs of it in play. This
// program copies both into the grader's output directory and writes
// dossier.json there — the summary the judge reads — built by the vendored
// make.fun library (vendor/makefun-game.ts, untouched).
//
//   MAKEFUN_OUTPUT_DIR=/tmp/out node main.ts
//
// Without MAKEFUN_OUTPUT_DIR it writes to /output, the grader's directory.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const MIN_SCREENSHOTS = 3;
const MAX_SCREENSHOTS = 4;
const MAX_SCREENSHOT_BYTES = 262144; // 256 KiB — the gate's per-screenshot cap
const MAX_DOSSIER_BYTES = 1_572_864; // 1.5 MiB — the gate's dossier cap

function fail(message: string): never {
  console.error(`main.ts: ${message}`);
  process.exit(1);
}

// Count the regular files under a directory, recursively, and their bytes.
function treeStats(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      const sub = treeStats(path);
      files += sub.files;
      bytes += sub.bytes;
    } else if (st.isFile()) {
      files += 1;
      bytes += st.size;
    }
  }
  return { files, bytes };
}

function main(): void {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const gameDir = join(root, 'game');
  const shotsDir = join(root, 'screenshots');

  // Refuse to hand in a broken entry instead of letting the gate reject it.
  if (!existsSync(join(gameDir, 'index.html'))) {
    fail('game/index.html is missing — the game has no entry page to hand in.');
  }
  if (!existsSync(shotsDir)) {
    fail('screenshots/ is missing — the entry needs 3–4 screenshots.');
  }
  const shots = readdirSync(shotsDir).filter((name) => !name.startsWith('.'));
  if (shots.length < MIN_SCREENSHOTS || shots.length > MAX_SCREENSHOTS) {
    fail(
      `screenshots/ holds ${shots.length} image(s); the gate needs ` +
        `${MIN_SCREENSHOTS}–${MAX_SCREENSHOTS}.`,
    );
  }
  // The gate caps each screenshot at 256 KiB; refuse an oversize one here
  // with its name instead of letting the dossier build reject the entry.
  for (const name of shots) {
    const size = statSync(join(shotsDir, name)).size;
    if (size > MAX_SCREENSHOT_BYTES) {
      fail(
        `screenshots/${name} is ${size} bytes, over the ` +
          `${MAX_SCREENSHOT_BYTES}-byte cap per screenshot.`,
      );
    }
  }

  const game = treeStats(gameDir);
  const shotsStats = treeStats(shotsDir);

  mkdirSync(outDir, { recursive: true });
  cpSync(gameDir, join(outDir, 'game'), { recursive: true });
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

  // The scorer's own caps (kit reference/gate.json): only text_max_bytes
  // shapes the dossier's bytes; the rest refuse an entry the scorer would
  // refuse (more than 4 screenshots or one over 256 KiB; more than 993 files
  // in game/ or 48 MiB of game files in all, or a path under game/ over
  // 1000 bytes — game/ counts beside /output's own 1000-entry cap, its
  // screenshots/ and dossier.json).
  const dossier = buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  });
  const dossierPath = join(outDir, 'dossier.json');
  writeFileSync(dossierPath, dossier);
  const dossierBytes = statSync(dossierPath).size;
  if (dossierBytes > MAX_DOSSIER_BYTES) {
    fail(`dossier.json is ${dossierBytes} bytes, over the ${MAX_DOSSIER_BYTES}-byte cap.`);
  }

  console.log(
    `handed in: game/ ${game.files} files, ${game.bytes} bytes; ` +
      `screenshots/ ${shotsStats.files} files, ${shotsStats.bytes} bytes; ` +
      `dossier.json ${dossierBytes} bytes`,
  );
}

main();
