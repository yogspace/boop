// Runs before `pnpm dev` and `pnpm build`.
//
// Downloads the Telma font (Indian Type Foundry, ITF Free Font License) from
// Fontshare into public/fonts/ – the variable font only. The license allows
// self-hosting for your own website but no redistribution, so the files are
// not in git (public/fonts/ is ignored) but fetched here. If the download
// fails, the build goes on: the pages then use the system font.
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const target = fileURLToPath(new URL("../public/fonts/", import.meta.url));
const files = {
  "Fonts/WEB/fonts/Telma-Variable.woff2": "Telma-Variable.woff2",
  "License/FFL.txt": "Telma-License.txt",
};

const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

if (await exists(join(target, "Telma-Variable.woff2"))) process.exit(0);

try {
  const response = await fetch(
    "https://api.fontshare.com/v2/fonts/download/telma"
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
  await mkdir(target, { recursive: true });
  for (const [suffix, name] of Object.entries(files)) {
    const entry = Object.keys(archive).find((path) => path.endsWith(suffix));
    if (!entry) throw new Error(`${suffix} missing in the archive`);
    await writeFile(join(target, name), archive[entry]);
  }
  console.info("✓ Telma loaded into public/fonts/");
} catch (error) {
  console.warn(
    `⚠ Telma could not be loaded (${error.message}) – the system font applies.`
  );
}
