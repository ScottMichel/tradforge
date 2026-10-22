import { readFile } from "node:fs/promises";

/** The content of a UTF-8 file, or undefined if it does not exist. Other errors are thrown. */
export async function readFileIfExists(file: string): Promise<string | undefined> {
  const bytes = await readBytesIfExists(file);
  return bytes === undefined ? undefined : Buffer.from(bytes).toString("utf8");
}

/** The bytes of a file, or undefined if it does not exist. Other errors are thrown. */
export async function readBytesIfExists(file: string): Promise<Uint8Array | undefined> {
  try {
    return await readFile(file);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
