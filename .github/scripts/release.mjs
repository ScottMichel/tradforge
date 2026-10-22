// Checks that a release tag matches the versions of the packages, and writes the notes of the release from
// CHANGELOG.md. Run by .github/workflows/release.yml; can be run by hand before tagging.
// Usage: node .github/scripts/release.mjs <tag, e.g. v0.2.0> <notes file to write>
import { readFileSync, writeFileSync } from "node:fs";

const [tag, notesFile] = process.argv.slice(2);
if (tag === undefined || notesFile === undefined) fail("usage: release.mjs <tag> <notes file>");

const version = tag.replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`${tag} is not a version tag such as v1.2.3`);

for (const manifest of ["packages/cli/package.json", "packages/desktop/package.json"]) {
  const found = JSON.parse(readFileSync(manifest, "utf8")).version;
  if (found !== version) fail(`${manifest} has version ${found}, but the tag is ${tag}`);
}
// What "tradforge --version" and the application show.
const shown = /VERSION = "([^"]+)"/.exec(readFileSync("packages/cli/src/version.ts", "utf8"))?.[1];
if (shown !== version) fail(`packages/cli/src/version.ts has version ${shown}, but the tag is ${tag}`);

// The section of this version: from its heading to the next one.
const lines = readFileSync("CHANGELOG.md", "utf8").split("\n");
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
if (start === -1) fail(`CHANGELOG.md has no "## [${version}]" section: write it before tagging`);
if (/not published/i.test(lines[start])) fail(`CHANGELOG.md: give "## [${version}]" its release date`);
const end = lines.findIndex((line, index) => index > start && line.startsWith("## ["));
const changes = lines
  .slice(start + 1, end === -1 ? undefined : end)
  .join("\n")
  .trim();

const notes = `## Download

**\`tradforge-${version}-portable.exe\`**: the desktop application for Windows, in one file. No installation: download it,
then double-click it.

It is not signed yet, so Windows SmartScreen warns about an unknown publisher the first time: choose "More info", then
"Run anyway". The \`.sha256\` file holds its SHA-256 checksum, to check the download
(\`Get-FileHash tradforge-${version}-portable.exe\` in PowerShell).

The command line is installed from the sources for now: see the README.

## Changes

${changes}
`;
writeFileSync(notesFile, notes);
console.log(`Release ${tag}: versions match, notes written to ${notesFile}`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
