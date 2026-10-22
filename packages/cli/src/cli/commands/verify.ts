import type { ProviderConfig } from "../../core/config.js";
import type { Provider } from "../../core/provider.js";
import { type Judge, selectForCheck, verifyTranslations } from "../../core/verify.js";
import { extractSegments } from "../../formats/extract.js";
import { createProvider } from "../../providers/factory.js";
import { loadMemory, saveMemory } from "../../storage/memory-store.js";
import { type Command, EXIT, UsageError } from "../command.js";
import { parseEngines } from "../engines.js";
import { formatCount, plural, quote } from "../format.js";
import { projectOf } from "../project.js";
import { onlyIn, parseLimit } from "../selection.js";

export const verifyCommand: Command = {
  name: "verify",
  summary: "Translate suspicious translations back, and have a model judge them",
  usage: "verify [--all] [--only <path>] [--limit <n>] [--judge <type[:model]>]",
  options: ["all", "only", "limit", "judge"],
  maxArgs: 0,
  async run(context) {
    const { io, options } = context;
    const limit = parseLimit(options.limit);
    const { root, config, workDir } = await projectOf(context);
    const all = await extractSegments(root, config);
    const segments = options.only === undefined ? all : onlyIn(all, options.only);
    const memory = await loadMemory(workDir, config);
    const candidates = selectForCheck(segments, memory, config, {
      ...(options.all === true ? { all: true } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
    if (candidates.length === 0) {
      io.out(
        options.all === true
          ? "Nothing to check: every machine translation is already checked."
          : 'Nothing to check: no suspicious machine translation left. Use "--all" to check every one.',
      );
      return EXIT.ok;
    }

    const make = io.createProvider ?? createProvider;
    // The project engine translates back: DeepL can do that. Judging needs a language model.
    const translator = make(config.provider);
    const judge = judgeOf(
      options.judge === undefined ? translator : judgeFromSpec(options.judge, config.provider, make),
    );
    const suspicious = candidates.filter((candidate) => candidate.reasons.length > 0).length;
    io.out(
      `Checking ${plural(candidates.length, "translation")} (${formatCount(suspicious)} suspicious): ` +
        `translated back with ${translator.model}, judged by ${judge.model}...`,
    );
    const summary = await verifyTranslations({
      candidates,
      memory,
      config,
      translator,
      judge,
      save: () => saveMemory(workDir, memory),
      onProgress: (event) => io.out(`  ${formatCount(event.done)}/${formatCount(event.total)} judged`),
      ...(io.signal !== undefined ? { signal: io.signal } : {}),
    });

    if (summary.interrupted) {
      io.out(`Interrupted: ${formatCount(summary.checked)} checked, saved. Run the same command to go on.`);
      return EXIT.interrupted;
    }
    io.out(
      `Done: ${formatCount(summary.checked)} checked: ${formatCount(summary.same)} same, ` +
        `${formatCount(summary.nuance)} nuance, ${formatCount(summary.different)} different, ` +
        `${formatCount(summary.failed)} failed.`,
    );
    for (const candidate of candidates) {
      const check = memory.get(candidate.source)?.check;
      if (check === undefined || check.verdict === "same") continue;
      io.out("");
      io.out(`${check.verdict}: ${quote(candidate.source)}`);
      io.out(`  translation:      ${quote(candidate.target)}`);
      io.out(`  back-translation: ${quote(check.backTranslation)}`);
      io.out(`  note: ${check.note}`);
    }
    if (summary.nuance + summary.different > 0) {
      io.out("");
      io.out('Run "tradforge export" to correct them: the CSV file has the verdicts and back-translations.');
    }
    return EXIT.ok;
  },
};

/** --judge: one engine, written as for compare --engines. */
function judgeFromSpec(spec: string, project: ProviderConfig, make: (config: ProviderConfig) => Provider): Provider {
  const engines = parseEngines(spec, project);
  const [engine] = engines;
  if (engine === undefined || engines.length > 1) throw new UsageError("--judge takes one engine, e.g. --judge ollama");
  return make(engine.config);
}

/** Only language models can judge: DeepL translates back, but cannot say whether the meaning is kept. */
function judgeOf(provider: Provider): Judge {
  const { review } = provider;
  if (review === undefined) {
    throw new UsageError(
      `${provider.model} cannot judge back-translations: add a language model with --judge, e.g. --judge ollama`,
    );
  }
  return { model: provider.model, review };
}
