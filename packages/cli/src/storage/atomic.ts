import { randomBytes } from "node:crypto";
import { open, rename, rm } from "node:fs/promises";

/**
 * Writes a file so that readers only ever see the old content or the new one, never half of it:
 * write a temporary file next to it, flush it to the disk, then rename it over the target.
 */
export async function writeFileAtomic(file: string, content: string | Uint8Array): Promise<void> {
  // Same directory as the target: a rename is only atomic within one file system.
  const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    const handle = await open(temp, "wx"); // x: fail rather than reuse an existing file
    try {
      await handle.writeFile(content); // a string is written as UTF-8
      await handle.sync(); // the data is on the disk before the rename makes it visible
    } finally {
      await handle.close();
    }
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}
