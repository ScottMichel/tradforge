/** Language folders of Project Zomboid (media/lua/shared/Translate/<CODE>/) that are not the code in capitals. */
const SPECIAL_CODES = new Map([
  ["pt-br", "PTBR"],
  ["zh-cn", "CN"],
  ["zh-hans", "CN"],
  ["zh-tw", "CH"],
  ["zh-hant", "CH"],
  ["ja", "JP"],
  ["uk", "UA"],
  ["nb", "NO"],
]);

/** "fr" → "FR", "pt-BR" → "PTBR", "zh-TW" → "CH": the folder and file suffix the game uses for a language. */
export function pzLanguageCode(language: string): string {
  const tag = language.toLowerCase().replace("_", "-");
  return SPECIAL_CODES.get(tag) ?? tag.toUpperCase().replaceAll("-", "_");
}
