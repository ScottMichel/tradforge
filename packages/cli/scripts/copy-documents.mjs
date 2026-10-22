// npm publishes what is in the package folder: the documents of the repository root are copied in before packing.
import { copyFile } from "node:fs/promises";
import path from "node:path";

const root = path.join(import.meta.dirname, "..", "..", "..");
const target = path.join(import.meta.dirname, "..");
for (const name of ["README.md", "LICENSE", "CHANGELOG.md"]) {
  await copyFile(path.join(root, name), path.join(target, name));
}
