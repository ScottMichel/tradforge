# tradforge

[English](README.md) · **Français**

[![CI](https://github.com/ScottMichel/tradforge/actions/workflows/ci.yml/badge.svg)](https://github.com/ScottMichel/tradforge/actions/workflows/ci.yml)
[![Licence : MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Traduisez tous les textes d'un projet — un jeu, un mod, une application — avec un modèle d'IA qui tourne sur votre
propre ordinateur, en vous assurant que le résultat ne casse rien.**

Le modèle traduit. tradforge fait tout le reste : il trouve les textes dans vos fichiers, pilote le modèle, **vérifie
chaque traduction**, retient ce qui est fait, survit aux interruptions et écrit des fichiers traduits propres.

```text
$ tradforge translate
Translating 2,481 texts (96,320 characters) with mistral-small, 20 per batch...
  1,240/2,481 done, 1 failed, about 12 min left
  2,481/2,481 done, 1 failed
Done: 2,480 translated, 1 failed. Memory saved in .tradforge/memory.json.
```

## Pourquoi tradforge ?

Demander à un modèle de langage de traduire des milliers de lignes fonctionne… jusqu'au jour où ça ne fonctionne plus.
Les modèles sautent des lignes, répondent avec un JSON cassé, traduisent des noms de variables ou **inventent des
variables** (`town` devient `{town}`), et une seule ligne fautive peut faire planter un jeu. tradforge est né de la
traduction d'un gros mod de jeu (voir [l'étude de cas](#étude-de-cas)) et transforme ces leçons en garanties :

- **Validation stricte** de chaque traduction : variables conservées et jamais inventées (`{name}`, `%d`, `%1$s`),
  balises conservées (`<b>`, `<LINE>`), mêmes retours à la ligne, mêmes `*actions*`, mêmes espaces en début et en fin,
  rien de laissé en anglais, aucune longueur absurde. Une traduction refusée est retentée par groupes plus petits,
  puis notée en échec avec sa raison.
- **Mémoire de traduction** : chaque texte unique n'est traduit qu'une fois, même s'il apparaît 300 fois. Relancez
  après une mise à jour : seuls les nouveaux textes sont envoyés au modèle, et un texte dont seule la ponctuation a
  changé réutilise son ancienne traduction.
- **Conversations cohérentes** : les textes sont traduits dans l'ordre de leurs fichiers, une conversation reste dans
  un même lot, et chaque lot est accompagné de ses lignes voisines — et de leur traduction — comme contexte. Le ton et
  le tutoiement ou le vouvoiement restent les mêmes d'une ligne à l'autre.
- **Typographie et glossaire** : la typographie française est corrigée automatiquement (espaces insécables avant
  `; : ! ?`), et une traduction qui ignore le glossaire est refusée.
- **Aucun travail perdu** : la mémoire est enregistrée de façon atomique après chaque lot. Un Ctrl+C, un plantage ou une
  coupure de courant ne la corrompent jamais ; le lancement suivant reprend là où il s'était arrêté.
- **Relecture humaine protégée** : une traduction corrigée par une personne n'est jamais écrasée par le modèle.
  Exportez un CSV, relisez-le dans Excel ou LibreOffice, réimportez-le.
- **Sorties sûres** : les fichiers traduits gardent la structure des originaux ; tradforge refuse de remplacer un gros
  fichier de sortie par un beaucoup plus petit (l'accident classique du « lancé depuis le mauvais dossier »), sauf avec
  `--force`.
- **Local et gratuit** : fonctionne avec [Ollama](https://ollama.com) sur votre machine. Pas de clé d'API, aucun coût
  par phrase, vos textes ne quittent jamais votre ordinateur. Ou n'importe quelle API compatible OpenAI (OpenAI,
  Mistral, OpenRouter, Groq…) si vous préférez.
- **Aucune dépendance à l'exécution** : seulement Node.js.

## Démarrage rapide

1. **Installez [Node.js](https://nodejs.org) 22 ou plus récent et [Ollama](https://ollama.com)**, puis téléchargez un
   modèle :

   ```sh
   ollama pull mistral-small
   ```

2. **Installez tradforge.** Il n'est pas encore publié sur npm ; en attendant, installez-le depuis les sources :

   ```sh
   git clone https://github.com/ScottMichel/tradforge.git
   cd tradforge
   npm ci && npm run build && npm link
   ```

3. **Dans le dossier de votre projet :**

   ```sh
   tradforge init        # trouve vos fichiers de textes, écrit tradforge.config.json avec chaque réglage expliqué
   tradforge status      # combien de textes, combien déjà traduits
   tradforge translate   # traduit ce qui manque (Ctrl+C pour arrêter, relancez pour reprendre)
   tradforge build       # écrit les fichiers traduits
   ```

Envie de voir d'abord ? Le dossier [`examples/game`](examples/game) est un petit jeu avec une interface en JSON et des
dialogues en Lua : `cd examples/game`, puis `tradforge translate --dry-run`.

## Commandes

| Commande | Rôle |
| --- | --- |
| `init [--from <langue>] [--to <langue>] [--force]` | Trouve les fichiers de textes du dossier et crée un `tradforge.config.json` commenté |
| `status` | Textes du projet : traduits, relus, en échec, à traduire, obsolètes |
| `extract [--json]` | Trouve les textes à traduire, sans les traduire |
| `diff` | Textes nouveaux, retirés et *légèrement modifiés* depuis la dernière traduction |
| `translate [--limit <n>] [--only <chemin>] [--retry] [--dry-run]` | Traduit ce que la mémoire n'a pas encore ; `--dry-run` n'envoie rien et estime les tokens et le coût |
| `build [--force]` | Écrit les fichiers traduits |
| `export [<fichier.csv>]` | Écrit un CSV pour relire ou compléter les traductions |
| `import <fichier.csv> [--keep]` | Importe des traductions relues ou manuelles |

Toutes les commandes acceptent `--config <fichier>` et `--help`. Codes de sortie : `0` succès, `1` erreur, `2` ligne de
commande incorrecte, `130` interruption.

## Configuration

`tradforge init` écrit ce fichier avec un commentaire sur chaque réglage (les commentaires sont autorisés). Seules les
langues et les sources sont obligatoires.

```jsonc
{
  "sourceLanguage": "en",
  "targetLanguage": "fr",
  "workDir": ".tradforge",
  "sources": [
    {
      "format": "json",
      "include": ["locales/en/*.json"],
      "priority": 0,
      "context": "User interface",
      "group": "auto",
      "output": { "path": "locales/{lang}/{name}{ext}", "asciiOnly": false, "untranslated": "keep-source" }
    }
  ],
  "provider": { "type": "ollama", "model": "mistral-small", "host": "http://localhost:11434" },
  "translation": {
    "batchSize": 20,
    "instructions": "Video game texts. Keep a natural, casual tone.",
    "glossary": { "NPC": "PNJ" },
    "contextLines": 3,
    "typography": true,
    "reuse": true
  },
  "validation": { "placeholders": ["braces", "printf", "markup"], "glossary": true }
}
```

| Réglage | Signification | Par défaut |
| --- | --- | --- |
| `workDir` | Dossier de la mémoire de traduction. **À versionner** : il contient tout le travail. | `.tradforge` |
| `sources[].format` | `json`, `lua`, `srt`, `vtt`, `renpy`, `zomboid-txt`, `paradox-yml` ou `rimworld-xml` (voir [Formats pris en charge](#formats-pris-en-charge)) | obligatoire |
| `sources[].include` | Motifs de fichiers, relatifs au fichier de configuration | obligatoire |
| `sources[].priority` | Plus petit = traduit en premier (peut être négatif) | `0` |
| `sources[].context` | Indique au modèle comment les textes sont utilisés | aucun |
| `sources[].group` | Quels textes vont ensemble et restent dans un même lot : `auto` (même objet JSON ; lignes Lua sans ligne vide entre elles), `none`, `file`, ou `{ "keyPattern": "^Dialog_(\\w+)_" }` (clés ayant le même premier groupe capturé) | `auto` |
| `sources[].encoding` | Encodage des fichiers source : `auto` (marque d'ordre des octets, puis UTF-8 valide, puis `windows-1252`), `utf-8`, `windows-1251`… | `auto` |
| `sources[].output.path` | Où écrire les traductions. `{dir}`, `{name}`, `{ext}` viennent du fichier source ; `{stem}` est le nom sans son suffixe de langue (`UI_EN` → `UI`) ; `{lang}` est la langue cible, `{LANG}` la même en majuscules, `{language}` son nom anglais (`french`) | `{dir}/{name}.{lang}{ext}` |
| `sources[].output.asciiOnly` | Échappe les accents (`é` → `\u00e9` en JSON, `\195\169` en Lua) pour les programmes qui lisent mal l'UTF-8 | `false` |
| `sources[].output.untranslated` | `keep-source` ou `omit` (clés JSON uniquement) | `keep-source` |
| `sources[].output.encoding` | Encodage des fichiers traduits : `utf-8`, `utf-8-bom` (exigé par les jeux Paradox), `utf-16le`, `windows-1252`, `windows-1251`… Un caractère impossible à écrire est une erreur, jamais un `?` | `utf-8` |
| `provider` | Le moteur et son modèle : voir [Moteurs](#moteurs) | Ollama, `mistral-small` sur `localhost:11434` |
| `translation.batchSize` | Textes envoyés au modèle par requête | `20` |
| `translation.concurrency` | Lots envoyés en même temps. Gardez `1` pour un modèle local (la carte graphique est déjà occupée) ; essayez `4` à `8` avec une API distante, dans la limite de son débit. Des lots envoyés ensemble voient moins de voisins déjà traduits en contexte | `1` |
| `translation.instructions` | Ton, public, conventions, envoyés avec chaque lot | aucune |
| `translation.glossary` | Termes toujours traduits de la même façon (seuls ceux présents dans un lot sont envoyés) | `{}` |
| `translation.contextLines` | Lignes envoyées avant et après chaque lot, avec leur traduction si elle est connue, comme contexte seulement (`0` : aucune) | `3` |
| `translation.typography` | Corrige la typographie de la langue cible (français : espaces insécables avant `; : ! ?` et dans `« »`) | `true` |
| `translation.reuse` | Réutilise la traduction d'un texte légèrement modifié : copiée si seule la ponctuation a changé, montrée au modèle sinon | `true` |
| `validation.placeholders` | Syntaxes de variables à protéger : `braces` `{name}`, `printf` `%s`, `positional` `%1`, `bbcode` `[img=x]`, `ass` `{\an8}`, `timestamp` `<00:00:01.500>`, `markup` `<b>`. Les syntaxes `paradox`, `renpy` et `rimworld` arrivent automatiquement avec leur format | toutes sauf celles des formats |
| `validation.glossary` | Refuse une traduction qui n'utilise pas la traduction du glossaire pour un terme présent dans la source | `true` |

> **VS Code :** pour que l'éditeur ne signale plus les commentaires comme des erreurs, ajoutez
> `"files.associations": { "tradforge.config.json": "jsonc" }` à vos paramètres.

## Formats pris en charge

### Formats de fichiers

| Format | Lecture | Écriture |
| --- | --- | --- |
| **JSON** `.json` (`json`) | toutes les chaînes, objets et tableaux imbriqués (`menu.quit`, `tips.0`) ; aussi les traductions de Project Zomboid Build 42 | même structure, même indentation, mêmes fins de ligne ; échappements `\u` en option |
| **Lua** `.lua` (`lua`) | chaînes littérales de tout type (`"..."`, `'...'`, `[[...]]`, `[==[...]==]`, tous les échappements), en ignorant les commentaires et les **chaînes qui ressemblent à du code** (`"idle"`, `"media/ui/icon.png"`, `"hp=%d"`) | chaînes remplacées sur place, le reste du fichier conservé à l'octet près ; échappements `\ddd` en option |
| **SubRip** `.srt` (`srt`), **WebVTT** `.vtt` (`vtt`) | un texte par réplique, les répliques à moins de 2 s d'écart regroupées en scène ; balises, codes `{\an8}`, blocs NOTE/STYLE | textes remplacés sur place, numéros et minutages intacts ; `film.en.srt` → `film.fr.srt` |

### Dialectes de moteurs et de jeux

Ce sont de vrais types de fichiers, avec leurs propres règles : un `.yml` Paradox n'est pas du YAML valide, un `.txt`
Project Zomboid est une table proche du Lua, un `.xml` RimWorld suit un schéma fixe. tradforge les lit comme le moteur.

| Format | Type de fichier | Lecture | Écriture |
| --- | --- | --- | --- |
| **Scripts Ren'Py** (`renpy`) | `.rpy` | dialogues, narration, choix de menu, chaînes `_()` ; un groupe par label | copies traduites des scripts, écrites dans un dossier séparé ; balises `{b}` et interpolations `[nom]` protégées |
| **Tables de traduction Project Zomboid**, Build 41 (`zomboid-txt`) | `.txt` | `Translate/EN/UI_EN.txt`, lues comme le jeu les lit (texte entre le premier et le dernier guillemet, suites `..`, lignes abîmées ignorées) | `Translate/FR/UI_FR.txt`, table renommée, codes de langue du jeu (`PTBR`, `CH`…), anciens encodages |
| **Localisation Paradox** (`paradox-yml`) | `.yml`, dialecte Paradox | `localisation/english/*_l_english.yml` : Crusader Kings, Europa Universalis, Hearts of Iron, Stellaris, Victoria | en-tête `l_french:`, noms de langue du jeu (`braz_por`), UTF-8 avec BOM ; `$VAR$`, `§Y§!`, `£icône£`, `[Scope.Fonction]` protégés |
| **Données de langue RimWorld** (`rimworld-xml`) | `.xml`, racine `<LanguageData>` | `Languages/English/Keyed/` et `DefInjected/`, listes `<li>`, `\n` littéraux | `Languages/French/…`, XML échappé correctement ; symboles de grammaire `[PAWN_nameDef]` et têtes de règles protégés |

`tradforge init` les reconnaît tous dans un dossier (par extension, ou par chemin pour les dialectes dont l'extension
est générique) et propose les bons chemins de sortie. D'autres formats arrivent : YAML, gettext `.po`, Android, iOS, XLIFF, Markdown… Voir la
[feuille de route](#feuille-de-route).

## Moteurs

| `provider.type` | Réglages | Pour |
| --- | --- | --- |
| `ollama` (par défaut) | `model` (`mistral-small`), `host` (`http://localhost:11434`) | un modèle local, gratuit, hors ligne |
| `openai-compatible` | `model` (obligatoire), `baseUrl` (`https://api.openai.com/v1`), `apiKeyEnv` (`OPENAI_API_KEY`), `responseFormat` (`json-schema`) | OpenAI, Mistral, OpenRouter, Groq, et les serveurs locaux comme LM Studio ou vLLM |
| `anthropic` | `model` (obligatoire, par exemple `claude-haiku-5-5`), `baseUrl` (`https://api.anthropic.com/v1`), `apiKeyEnv` (`ANTHROPIC_API_KEY`) | Claude |
| `gemini` | `model` (obligatoire, par exemple `gemini-flash-latest`, qui suit le modèle Flash du moment), `baseUrl` (`https://generativelanguage.googleapis.com/v1beta`), `apiKeyEnv` (`GEMINI_API_KEY`) | Gemini, avec une offre gratuite pour essayer |

```jsonc
"provider": { "type": "openai-compatible", "model": "mistral-small-latest", "baseUrl": "https://api.mistral.ai/v1", "apiKeyEnv": "MISTRAL_API_KEY" }
```

La clé d'API est lue dans la variable d'environnement nommée par `apiKeyEnv` (`export MISTRAL_API_KEY=...`, ou
`$env:MISTRAL_API_KEY = "..."` dans PowerShell). tradforge refuse une clé écrite dans le fichier de configuration,
qui est souvent commité, et n'affiche jamais la clé dans ses messages. Les serveurs locaux n'en ont pas besoin.

`responseFormat` indique comment la réponse est contrainte : `json-schema` (la réponse doit suivre le schéma de
tradforge), `json-object` (n'importe quel JSON) ou `none` (les consignes seules), pour les serveurs qui refusent les
schémas.

`translate --dry-run` estime les tokens qu'un passage envoie et reçoit, mesurés sur le vrai prompt (consignes,
glossaire et lignes de contexte sont payés à chaque lot). Ajoutez `"pricing": { "inputPerMillion": 0.4,
"outputPerMillion": 1.6 }` au fournisseur, recopié de la grille tarifaire de votre API, pour obtenir le coût : tradforge
n'a pas de prix intégrés, qui changent trop souvent. Sur le projet d'exemple, l'estimation dépassait de 11 % le compte
réel pour l'envoi, et tombait juste pour la réception ; les nouvelles tentatives ne sont pas comptées.

Quand une API demande de ralentir (HTTP 429), tous les lots font une pause du délai donné par le serveur (sinon
1 s, 2 s, 4 s…), puis le même lot est renvoyé : une limite de débit ne compte jamais comme un échec. Après 6 attentes
de suite, tradforge s'arrête et conseille de baisser `translation.concurrency`. Un quota épuisé arrête tout de suite.

## Fonctionnement

```text
fichiers du projet ──► trouver (motifs include ; jamais le dossier de travail ni les traductions déjà produites)
                   ──► lire (un lecteur par format) ──► fusionner les textes identiques, garder l'ordre et les conversations
                   ──► retirer ce que la mémoire connaît ; réutiliser la traduction des textes dont seule la ponctuation a changé
                   ──► lots, par priorité, sans couper les conversations
                   ──► modèle (consignes + glossaire + lignes voisines + anciennes versions, réponse JSON imposée)
                   ──► typographie ──► valider ──► refusée ? nouvel essai : un quart du lot, puis seul, puis échec noté
                   ──► mémoire (enregistrement atomique après chaque lot)
                   ──► construire (un écrivain par format ; tout est préparé et vérifié avant la moindre écriture)
```

Le cœur (`src/core`) est de la logique pure : il ne touche jamais au disque ni au réseau. Les formats, les moteurs, le
stockage et la ligne de commande sont des adaptateurs branchés dessus ; c'est pourquoi un nouveau format ou un nouveau
moteur ne modifie jamais le cœur. Détails (en anglais) dans [docs/architecture.md](docs/architecture.md).

## Utilisation comme bibliothèque

```ts
import { createProvider, extractSegments, loadMemory, parseConfig, saveMemory, translateSegments } from "tradforge";

const config = parseConfig({ sourceLanguage: "en", targetLanguage: "fr", sources: [{ format: "json", include: ["locales/en/*.json"] }] });
const segments = await extractSegments(".", config);
const memory = await loadMemory(".tradforge", config);
await translateSegments({ segments, memory, provider: createProvider(config.provider), config, save: () => saveMemory(".tradforge", memory) });
```

## Étude de cas

tradforge est la version générique d'un script écrit pour traduire en français un gros mod communautaire du jeu
*Project Zomboid* :

| | |
| --- | --- |
| Textes | environ **98 000** phrases, ~5 millions de caractères |
| Matériel | une AMD Radeon RX 7900 XT |
| Modèle | `mistral-small` avec Ollama |
| Durée | environ **17 heures** |
| Refusées par la validation | **0,03 %**, corrigées à la main |

Aucun texte de ce mod, ni d'aucun autre projet tiers, ne figure dans ce dépôt : les exemples et les tests utilisent
des textes écrits pour tradforge.

## Limites

- Quatre sortes de moteurs pour l'instant : Ollama, les API compatibles OpenAI, Claude et Gemini.
- Les jeux Ren'Py reçoivent des copies traduites de leurs scripts, pas une traduction `game/tl/` que le joueur pourrait
  choisir.
- Les dossiers de langue de RimWorld sont nommés d'après le nom anglais de la langue (`French`) : renommez-les si votre
  mod utilise un autre nom.
- Les règles de typographie n'existent pour l'instant que pour le français (France et Canada).
- La vérification du glossaire cherche seulement le terme attendu dans la traduction : elle ne comprend pas la
  grammaire.
- Dans les fichiers JSON produits, les clés numériques (`"1"`, `"42"`) apparaissent en premier : une règle de
  JavaScript, le contenu est inchangé.

## Feuille de route

1. **Moteurs** : DeepL.
2. **Qualité** : `tradforge compare` (plusieurs modèles côte à côte), retraduction inverse des lignes suspectes.
3. **Formats d'applications** : XLIFF, YAML, `.po`, Android, iOS, `.properties`, `.resx`, `.arb`, Markdown, HTML.
4. **Application de bureau** : ouvrir un fichier ou un dossier, traduire, relire — sans ligne de commande.
5. **Documents bureautiques** : `.docx`, `.odt`, `.pptx`, `.xlsx`.

## Contribuer

Les contributions sont les bienvenues, en particulier les nouveaux formats : chacun est un lecteur et un écrivain
indépendants. Voir [CONTRIBUTING.md](CONTRIBUTING.md) (en anglais).

## Licence

[MIT](LICENSE) © Kazuugnii
