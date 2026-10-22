import type { ProjectView } from "../../shared/bridge.js";
import { busy, byId, h, showError } from "../dom.js";
import { currentProject, recentFolders, rememberFolder, setProject } from "../state.js";
import { count, formatLabel, languageLabel, outputFor, plural } from "../view.js";

/** Step 1: open a folder, see the formats found in it, and make it a tradforge project. */

/** Left-out files listed at once; the others are behind "show all". */
const SKIPPED_SHOWN = 3;

const from = byId<HTMLInputElement>("project-from");
const to = byId<HTMLInputElement>("project-to");
const error = byId("project-error");
const view = byId("project-view");
const actions = byId("project-actions");
const proceed = byId<HTMLButtonElement>("project-continue");

export function setupProject(): void {
  const choose = byId<HTMLButtonElement>("choose-folder");
  choose.addEventListener("click", () =>
    busy(choose, async () => {
      const root = await window.tradforge.chooseFolder();
      if (root !== undefined) await open(root);
    }),
  );

  // A folder dropped on the window opens like a chosen one.
  const drop = byId("drop");
  document.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("dragging");
  });
  document.addEventListener("dragleave", (event) => {
    if (event.relatedTarget === null) drop.classList.remove("dragging");
  });
  document.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("dragging");
    const file = event.dataTransfer?.files[0];
    if (file !== undefined) void open(window.tradforge.pathOf(file));
  });

  // Other languages: what detection looks for changes.
  for (const input of [from, to]) {
    input.addEventListener("change", () => {
      const project = currentProject();
      if (project !== undefined && !project.configured) void open(project.root);
    });
  }

  proceed.addEventListener("click", () =>
    busy(proceed, async () => {
      const project = currentProject();
      if (project === undefined) return;
      if (!project.configured) {
        const chosen = [...view.querySelectorAll<HTMLInputElement>("input[data-source]")]
          .filter((box) => box.checked)
          .map((box) => Number(box.dataset.source));
        try {
          showError(error, undefined);
          setProject(await window.tradforge.createProject(project.root, from.value, to.value, chosen));
        } catch (failure) {
          showError(error, failure);
          return;
        }
      }
      window.location.hash = "#settings";
    }),
  );

  showRecent();
}

async function open(root: string): Promise<void> {
  showError(error, undefined);
  try {
    const project = await window.tradforge.openFolder(root, from.value.trim(), to.value.trim());
    rememberFolder(project.root);
    setProject(project);
    showRecent();
  } catch (failure) {
    showError(error, failure);
  }
}

/** Called when the step is shown: the project may have changed in another step. */
export async function enterProject(): Promise<void> {
  const project = currentProject();
  if (project?.configured === true) await open(project.root);
  else render(project);
}

export function render(project: ProjectView | undefined): void {
  view.replaceChildren();
  actions.hidden = project === undefined;
  if (project === undefined) return;
  if (project.configured) {
    from.value = project.sourceLanguage;
    to.value = project.targetLanguage;
  }
  proceed.textContent = project.configured ? "Continuer vers les réglages" : "Créer le projet et continuer";
  proceed.disabled = project.sources.length === 0;
  view.append(projectCard(project));
}

function projectCard(project: ProjectView): HTMLElement {
  const languages = `${languageLabel(project.sourceLanguage)} → ${languageLabel(project.targetLanguage)}`;
  const summary =
    project.sources.length === 0
      ? "Aucun fichier à traduire trouvé"
      : `${plural(project.sources.length, "format")} · ${languages}`;
  const badge = project.configured
    ? h(
        "span",
        { class: "badge success" },
        `Projet tradforge · ${count(project.stats?.translated ?? 0)} sur ${plural(project.stats?.total ?? 0, "texte traduit", "textes traduits")}`,
      )
    : h("span", { class: "badge" }, "Nouveau projet : choisis les formats à traduire");

  const rows = project.sources.map((source, index) =>
    h(
      "tr",
      {},
      !project.configured &&
        h(
          "td",
          {},
          h("input", {
            type: "checkbox",
            checked: true,
            "data-source": String(index),
            "aria-label": `Traduire ${formatLabel(source.format)}`,
          }),
        ),
      h("td", { class: "strong" }, formatLabel(source.format)),
      h(
        "td",
        { class: "mono" },
        source.include.join(", ") + (source.files !== undefined ? ` · ${count(source.files)}` : ""),
      ),
      h("td", { class: "mono muted" }, outputFor(source.output, project.targetLanguage)),
    ),
  );
  const head = h(
    "tr",
    {},
    !project.configured && h("th", {}, "Traduire"),
    h("th", {}, "Format"),
    h("th", {}, "Fichiers"),
    h("th", {}, "Sera écrit dans"),
  );

  return h(
    "section",
    { class: "card", "aria-label": "Projet ouvert" },
    h(
      "div",
      { class: "card-head" },
      h("div", {}, h("p", { class: "strong path" }, project.root), h("p", { class: "muted" }, summary)),
      badge,
    ),
    rows.length > 0 &&
      h("div", { class: "table-scroll" }, h("table", {}, h("thead", {}, head), h("tbody", {}, ...rows))),
    project.skipped.length > 0 && skippedNote(project),
  );
}

function skippedNote(project: ProjectView): HTMLElement {
  const describe = ({ file, reason }: { file: string; reason: string }) => `${file} (${reason})`;
  const first = project.skipped.slice(0, SKIPPED_SHOWN).map(describe).join(", ");
  const note = h(
    "div",
    { class: "card-foot muted" },
    `${plural(project.skipped.length, "fichier laissé", "fichiers laissés")} de côté : ${first}`,
  );
  if (project.skipped.length > SKIPPED_SHOWN) {
    note.append(
      h(
        "details",
        {},
        h("summary", {}, "Tout afficher"),
        h("ul", {}, ...project.skipped.map((skipped) => h("li", {}, describe(skipped)))),
      ),
    );
  }
  return note;
}

function showRecent(): void {
  const folders = recentFolders();
  byId("recent").hidden = folders.length === 0;
  byId("recent-list").replaceChildren(
    ...folders.map((folder) => {
      const button = h("button", { type: "button", class: "link mono" }, folder);
      button.addEventListener("click", () => busy(button, () => open(folder)));
      return h("li", {}, button);
    }),
  );
}
