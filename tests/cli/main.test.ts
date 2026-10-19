import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CliIo } from "../../src/cli/io.js";
import { EXIT, runCli } from "../../src/cli/main.js";
import { ProviderUnavailableError, type Provider } from "../../src/core/provider.js";
import { createMockProvider } from "../../src/providers/mock/provider.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tradforge-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Runs the CLI in the temporary project, with the mock provider unless a test gives another one. */
async function cli(command: string, io: Partial<CliIo> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(command.split(" ").filter(Boolean), {
    cwd: root,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    createProvider: () => createMockProvider(),
    ...io,
  });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

async function createFile(file: string, content: string): Promise<void> {
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

const read = (file: string) => readFile(path.join(root, file), "utf8");

/** A project created with init, with one small source file. */
async function createProject(): Promise<void> {
  expect((await cli("init")).code).toBe(EXIT.ok);
  await createFile(
    "locales/en/ui.json",
    JSON.stringify({ title: "Welcome", menu: { play: "Play", quit: "Quit game" }, hello: "Hello {name}" }),
  );
}

describe("the command line", () => {
  it("shows the version and the help", async () => {
    expect(await cli("--version")).toMatchObject({ code: EXIT.ok, out: "0.1.0" });
    const help = await cli("--help");
    expect(help.code).toBe(EXIT.ok);
    for (const command of ["init", "status", "extract", "diff", "translate", "build", "import", "export"]) {
      expect(help.out).toContain(command);
    }
    expect((await cli("")).out).toContain("Usage: tradforge <command>");
    expect((await cli("help translate")).out).toContain("--dry-run");
    expect((await cli("translate --help")).out).toContain("--retry");
  });

  it.each([
    ["frobnicate", /unknown command "frobnicate"/],
    ["status --bogus", /Unknown option '--bogus'/],
    ["status --force", /--force is not an option of "status"/],
    ["status extra", /too many arguments/],
    ["translate --limit abc", /--limit must be a positive integer/],
    ["import", /missing the CSV file/],
  ])("rejects %j as a usage error", async (command, message) => {
    const result = await cli(command);
    expect(result.code).toBe(EXIT.usage);
    expect(result.err).toMatch(message);
  });

  it("creates a configuration once, unless forced", async () => {
    expect(await cli("init")).toMatchObject({ code: EXIT.ok });
    expect(await read("tradforge.config.json")).toContain('"targetLanguage": "fr"');
    const again = await cli("init");
    expect(again.code).toBe(EXIT.error);
    expect(again.err).toContain("--force");
    expect((await cli("init --force")).code).toBe(EXIT.ok);
  });

  it("explains configuration problems", async () => {
    await createFile("tradforge.config.json", '{ "targetLanguage": 3 }');
    const result = await cli("status");
    expect(result.code).toBe(EXIT.error);
    expect(result.err).toMatch(/sourceLanguage[\s\S]*targetLanguage[\s\S]*sources/);
  });

  it("runs the whole workflow: status, translate, build, export, import", async () => {
    await createProject();
    expect((await cli("status")).out).toMatch(/to translate\s+4/);
    expect((await cli("extract")).out).toContain("Found 4 unique texts (4 occurrences) in 1 file");

    const failingProvider = () => {
      throw new Error("the provider must not be created for a dry run");
    };
    const dryRun = await cli("translate --dry-run", { createProvider: failingProvider });
    expect(dryRun.out).toContain("Would translate 4 texts");

    expect((await cli("translate --limit 3")).out).toContain("Done: 3 translated, 0 failed");
    const rest = await cli("translate");
    expect(rest.out).toContain("Done: 1 translated, 0 failed");
    expect(rest.out).toMatch(/memory\.json/);
    expect((await cli("translate")).out).toContain("Nothing to translate");
    expect((await cli("status")).out).toMatch(/translated\s+4/);

    const build = await cli("build");
    expect(build.code).toBe(EXIT.ok);
    expect(JSON.parse(await read("locales/fr/ui.json"))).toEqual({
      title: "[fr] Welcome",
      menu: { play: "[fr] Play", quit: "[fr] Quit game" },
      hello: "[fr] Hello {name}",
    });

    expect((await cli("export")).code).toBe(EXIT.ok);
    const csv = await read(".tradforge/review.csv");
    await writeFile(path.join(root, "reviewed.csv"), csv.replace("[fr] Play", "Jouer"));
    expect((await cli("import reviewed.csv")).out).toContain("1 updated");
    await cli("build");
    expect(JSON.parse(await read("locales/fr/ui.json")).menu.play).toBe("Jouer");
  });

  it("lists new, removed and changed texts", async () => {
    await createProject();
    await cli("translate");
    await createFile(
      "locales/en/ui.json",
      JSON.stringify({ title: "Welcome", menu: { play: "Play", quit: "Quit game." }, more: "Brand new" }),
    );
    const diff = await cli("diff");
    expect(diff.out).toContain("1 new, 1 removed, 1 changed");
    expect(diff.out).toMatch(/"Quit game" → "Quit game."/);
    expect(diff.out).toContain('"Brand new"');
    expect(diff.out).toContain('"Hello {name}"');
  });

  it("translates only the texts of the given files", async () => {
    await createProject();
    await createFile("locales/en/items.json", JSON.stringify({ axe: "Axe", rope: "Rope" }));
    expect((await cli("translate --only locales/en/items.json")).out).toContain("Done: 2 translated");
    expect((await cli("status")).out).toMatch(/to translate\s+4/);
  });

  it("reports failures and how to deal with them", async () => {
    await createProject();
    const inventing = () => createMockProvider({ translate: (s) => (s === "Play" ? "Jouer {town}" : `[fr] ${s}`) });
    const result = await cli("translate", { createProvider: inventing });
    expect(result.out).toContain("Done: 3 translated, 1 failed");
    expect(result.out).toContain("--retry");
    expect((await cli("status")).out).toMatch(/failed\s+1/);
  });

  it("stops with a clear message when the provider is unavailable", async () => {
    await createProject();
    const down = (): Provider => ({
      model: "m",
      translateBatch: async () => {
        throw new ProviderUnavailableError('cannot reach Ollama: start it with "ollama serve"');
      },
    });
    const result = await cli("translate", { createProvider: down });
    expect(result.code).toBe(EXIT.error);
    expect(result.err).toContain("ollama serve");
  });

  it("stops cleanly when interrupted, keeping what was done", async () => {
    await createProject();
    const controller = new AbortController();
    controller.abort();
    const result = await cli("translate", { signal: controller.signal });
    expect(result.code).toBe(EXIT.interrupted);
    expect(result.out).toContain("Interrupted");
  });

  it("prints the texts as JSON for scripts", async () => {
    await createProject();
    const segments = JSON.parse((await cli("extract --json")).out);
    expect(segments[0]).toMatchObject({ source: "Hello {name}", locations: [{ file: "locales/en/ui.json", key: "hello" }] });
  });
});
