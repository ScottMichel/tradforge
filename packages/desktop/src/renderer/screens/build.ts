import type { BuiltView } from "../../shared/bridge.js";
import { api } from "../api.js";
import { busy, h, inside, showError } from "../dom.js";
import { t } from "../i18n/index.js";
import { configuredRoot } from "../state.js";

/** "Write the translated files", on the translation and review screens. */

/** Each card and its last report, drawn again when the language of the interface changes. */
const reports = new Map<HTMLElement, readonly BuiltView[]>();

export function setupBuild(): void {
  for (const card of document.querySelectorAll<HTMLElement>(".card.build")) {
    const button = inside<HTMLButtonElement>(card, ".build-button");
    const force = inside<HTMLInputElement>(card, ".build-force");
    const error = inside(card, ".build-error");
    button.addEventListener("click", () =>
      busy(button, async () => {
        const root = configuredRoot();
        if (root === undefined) return;
        showError(error, undefined);
        reports.delete(card);
        inside(card, ".build-report").replaceChildren();
        try {
          reports.set(card, await api.build(root, force.checked));
          translateBuild();
        } catch (failure) {
          showError(error, failure);
        }
      }),
    );
  }
}

export function translateBuild(): void {
  for (const [card, built] of reports) {
    const messages = t();
    const written = built.filter((file) => file.written).length;
    inside(card, ".build-report").replaceChildren(
      ...built.map((file) =>
        h(
          "li",
          {},
          h("span", { class: "mono" }, file.output),
          h(
            "span",
            { class: "muted" },
            messages.builtFile(file.translated, file.translated + file.untranslated) +
              (file.written ? "" : ` · ${messages.unchanged}`),
          ),
        ),
      ),
      h(
        "li",
        { class: "strong" },
        built.length === 0 ? messages.noSourceFile : messages.builtSummary(written, built.length - written),
      ),
    );
  }
}
