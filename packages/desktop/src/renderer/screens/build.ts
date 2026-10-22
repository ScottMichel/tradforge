import { busy, h, inside, showError } from "../dom.js";
import { configuredRoot } from "../state.js";
import { count, plural } from "../view.js";

/** "Write the translated files", on the translation and review screens. */
export function setupBuild(): void {
  for (const card of document.querySelectorAll<HTMLElement>(".card.build")) {
    const button = inside<HTMLButtonElement>(card, ".build-button");
    const force = inside<HTMLInputElement>(card, ".build-force");
    const error = inside(card, ".build-error");
    const report = inside(card, ".build-report");
    button.addEventListener("click", () =>
      busy(button, async () => {
        const root = configuredRoot();
        if (root === undefined) return;
        showError(error, undefined);
        report.replaceChildren();
        try {
          const built = await window.tradforge.build(root, force.checked);
          const written = built.filter((file) => file.written).length;
          report.replaceChildren(
            ...built.map((file) =>
              h(
                "li",
                {},
                h("span", { class: "mono" }, file.output),
                h(
                  "span",
                  { class: "muted" },
                  `${count(file.translated)} sur ${count(file.translated + file.untranslated)} traduits` +
                    (file.written ? "" : " · inchangé"),
                ),
              ),
            ),
            h(
              "li",
              { class: "strong" },
              built.length === 0
                ? "Aucun fichier source trouvé."
                : `${plural(written, "fichier écrit", "fichiers écrits")}, ${count(built.length - written)} déjà à jour.`,
            ),
          );
        } catch (failure) {
          showError(error, failure);
        }
      }),
    );
  }
}
