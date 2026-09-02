#!/usr/bin/env node
/**
 * Turn source photography into the web assets the landing page imports.
 *
 *   node scripts/optimise-images.mjs
 *
 * Reads from `assets-src/` (gitignored — see .gitignore) and writes WebP into
 * `src/assets/images/`. The originals are 2-6MB JPEGs straight off Pexels and
 * have no business in a git history; the 24 we were sent came to 52MB, against
 * 908KB for the five we actually use.
 *
 * Why ONE size per picture and not a ladder of widths: `next/image` generates
 * the responsive set at request time from a static import, so committing
 * multiple widths would duplicate work Next already does. 1800px on the long
 * edge at q78 is enough for a hero on a 2x display.
 *
 * Adding a picture: drop it in `assets-src/`, add a line to PICKS, re-run.
 */

import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'assets-src');
const OUT = join(root, 'src', 'assets', 'images');

/** The long edge, in pixels. Anything larger is invisible on a phone. */
const MAX_EDGE = 1800;

/**
 * slug -> source filename.
 *
 * The slug is what the page imports, so it names what the picture is FOR, not
 * who shot it. Credits are in the page footer, under the Pexels licence.
 */
const PICKS = [
  ['hero-phone', 'pexels-shutter-rwanda-2157056879-36660381.jpg'],
  ['earn-hustle', 'pexels-khetho-mkhaliphi-2162957143-38975156.jpg'],
  ['move-commute', 'pexels-ntate-mohlala-sir-2160208879-37177402.jpg'],
  ['share-together', 'pexels-ario-stories-278509849-31638581.jpg'],
  ['identity-beadwork', 'pexels-alvincaal-2853593.jpg'],
];

if (!existsSync(SRC)) {
  console.error(
    `\n  No assets-src/ directory.\n` +
      `  It is gitignored on purpose — put the original JPEGs there and re-run.\n`,
  );
  process.exit(1);
}

await mkdir(OUT, { recursive: true });

let total = 0;
for (const [slug, file] of PICKS) {
  const input = join(SRC, file);
  if (!existsSync(input)) {
    console.error(`  missing: ${file}`);
    process.exitCode = 1;
    continue;
  }

  const info = await sharp(input)
    .rotate() // honour EXIF orientation before measuring anything
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78, effort: 6 })
    .toFile(join(OUT, `${slug}.webp`));

  total += info.size;
  console.log(
    `  ${slug.padEnd(20)} ${String(info.width).padStart(4)}x${String(info.height).padEnd(4)}` +
      ` ${(info.size / 1024).toFixed(0).padStart(4)}KB`,
  );
}

console.log(`\n  ${(total / 1024).toFixed(0)}KB total in src/assets/images/\n`);
