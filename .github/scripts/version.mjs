// The next version, from the Conventional Commits since the last release tag. The rule of tradforge: the minor number
// counts the features (each feat, or breaking change, adds one), and without a feature each fix or perf adds one to
// the patch. The major number moves only when decided (--major: 1.0 comes with the new look of the application).
// Usage: node .github/scripts/version.mjs                    shows the next version and why
//        node .github/scripts/version.mjs --write            also sets it in the packages and dates CHANGELOG.md
//        node .github/scripts/version.mjs --major [--write]  the next major version (x.0.0)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

let lastTag;
try {
  lastTag = git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*");
} catch {
  lastTag = undefined; // no release yet: every commit counts, from 0.0.0
}
const current = lastTag?.replace(/^v/, "") ?? "0.0.0";
const range = lastTag === undefined ? "HEAD" : `${lastTag}..HEAD`;
const commits = git("log", range, "--format=%s%n%b%x00")
  .split("\0")
  .map((commit) => commit.trim())
  .filter((commit) => commit !== "");

const counts = { breaking: 0, feat: 0, fix: 0, other: 0 };
for (const commit of commits) {
  const subject = commit.split("\n")[0] ?? "";
  if (/^\w+(\([^)]*\))?!:/.test(subject) || /^BREAKING[ -]CHANGE:/m.test(commit)) counts.breaking++;
  else if (/^feat(\([^)]*\))?:/.test(subject)) counts.feat++;
  else if (/^(fix|perf)(\([^)]*\))?:/.test(subject)) counts.fix++;
  else counts.other++;
}

const [major, minor, patch] = current.split(".").map(Number);
let next;
const features = counts.breaking + counts.feat;
if (process.argv.includes("--major")) next = `${major + 1}.0.0`;
else if (features > 0) next = `${major}.${minor + features}.0`;
else if (counts.fix > 0) next = `${major}.${minor}.${patch + counts.fix}`;

const since = lastTag === undefined ? "since the start" : `since ${lastTag}`;
console.log(
  `${commits.length} commits ${since}: ${counts.breaking} breaking, ${counts.feat} features, ${counts.fix} fixes, ` +
    `${counts.other} others.`,
);
if (next === undefined) {
  console.log("No feature and no fix: nothing to release.");
  process.exit(0);
}
console.log(`Next version: ${next} (tag v${next})`);

if (process.argv.includes("--write")) {
  for (const manifest of ["packages/cli/package.json", "packages/desktop/package.json"]) {
    const json = JSON.parse(readFileSync(manifest, "utf8"));
    json.version = next;
    writeFileSync(manifest, `${JSON.stringify(json, null, 2)}\n`);
  }
  const versionFile = "packages/cli/src/version.ts";
  writeFileSync(versionFile, readFileSync(versionFile, "utf8").replace(/VERSION = "[^"]+"/, `VERSION = "${next}"`));
  // The local date (sv gives YYYY-MM-DD): after midnight here, UTC may still be the day before.
  const date = new Date().toLocaleDateString("sv");
  const changelog = readFileSync("CHANGELOG.md", "utf8");
  if (!changelog.includes("## [Unreleased]")) throw new Error('CHANGELOG.md has no "## [Unreleased]" section');
  writeFileSync("CHANGELOG.md", changelog.replace("## [Unreleased]", `## [Unreleased]\n\n## [${next}] - ${date}`));
  console.log(`Written: both package.json, ${versionFile}, CHANGELOG.md. Run "npm install" to update the lock file.`);
}
