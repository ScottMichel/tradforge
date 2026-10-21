/** How a language writes the plural forms of a text, in the terms of the gettext Plural-Forms header. */
export interface PluralForms {
  /** nplurals: how many msgstr[n] a plural entry holds. */
  readonly count: number;
  /** plural: the C expression that picks the form for a number n. */
  readonly expression: string;
  /** The form used for n = 1, which takes the singular text; undefined when one form serves every number. */
  readonly one: number | undefined;
}

const ONE = { count: 1, expression: "0", one: undefined } as const;
const NOT_ONE = { count: 2, expression: "(n != 1)", one: 0 } as const;
const OVER_ONE = { count: 2, expression: "(n > 1)", one: 0 } as const;
const SLAVIC_EAST = {
  count: 3,
  expression: "(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2)",
  one: 0,
} as const;
const SLAVIC_WEST = { count: 3, expression: "(n==1 ? 0 : (n>=2 && n<=4) ? 1 : 2)", one: 0 } as const;

/** The rules of the gettext manual and of the CLDR, for the languages people translate into most. */
const RULES: Readonly<Record<string, PluralForms>> = {
  ja: ONE,
  zh: ONE,
  ko: ONE,
  vi: ONE,
  th: ONE,
  id: ONE,
  ms: ONE,
  km: ONE,
  lo: ONE,
  my: ONE,
  en: NOT_ONE,
  de: NOT_ONE,
  nl: NOT_ONE,
  sv: NOT_ONE,
  da: NOT_ONE,
  nb: NOT_ONE,
  nn: NOT_ONE,
  no: NOT_ONE,
  fi: NOT_ONE,
  et: NOT_ONE,
  el: NOT_ONE,
  he: NOT_ONE,
  hu: NOT_ONE,
  it: NOT_ONE,
  es: NOT_ONE,
  pt: NOT_ONE,
  ca: NOT_ONE,
  eu: NOT_ONE,
  gl: NOT_ONE,
  bg: NOT_ONE,
  af: NOT_ONE,
  eo: NOT_ONE,
  tr: NOT_ONE,
  az: NOT_ONE,
  ka: NOT_ONE,
  kk: NOT_ONE,
  sq: NOT_ONE,
  hi: NOT_ONE,
  bn: NOT_ONE,
  ur: NOT_ONE,
  ta: NOT_ONE,
  te: NOT_ONE,
  sw: NOT_ONE,
  fr: OVER_ONE,
  "pt-br": OVER_ONE,
  fa: OVER_ONE,
  fil: OVER_ONE,
  tl: OVER_ONE,
  oc: OVER_ONE,
  ru: SLAVIC_EAST,
  uk: SLAVIC_EAST,
  be: SLAVIC_EAST,
  sr: SLAVIC_EAST,
  hr: SLAVIC_EAST,
  bs: SLAVIC_EAST,
  cs: SLAVIC_WEST,
  sk: SLAVIC_WEST,
  pl: { count: 3, expression: "(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2)", one: 0 },
  ro: { count: 3, expression: "(n==1 ? 0 : (n==0 || (n%100 > 0 && n%100 < 20)) ? 1 : 2)", one: 0 },
  lt: { count: 3, expression: "(n%10==1 && n%100!=11 ? 0 : n%10>=2 && (n%100<10 || n%100>=20) ? 1 : 2)", one: 0 },
  lv: { count: 3, expression: "(n%10==1 && n%100!=11 ? 0 : n != 0 ? 1 : 2)", one: 0 },
  sl: { count: 4, expression: "(n%100==1 ? 0 : n%100==2 ? 1 : n%100==3 || n%100==4 ? 2 : 3)", one: 0 },
  is: { count: 2, expression: "(n%10!=1 || n%100==11)", one: 0 },
  ga: { count: 5, expression: "(n==1 ? 0 : n==2 ? 1 : n<7 ? 2 : n<11 ? 3 : 4)", one: 0 },
  ar: {
    count: 6,
    expression: "(n==0 ? 0 : n==1 ? 1 : n==2 ? 2 : n%100>=3 && n%100<=10 ? 3 : n%100>=11 ? 4 : 5)",
    one: 1,
  },
};

/** The plural rule of a language ("pt-BR", "fr_CA", "ru"): the region's when it has its own, the language's otherwise. */
export function pluralForms(language: string): PluralForms | undefined {
  const code = language.toLowerCase().replace(/_/g, "-");
  const [base = ""] = code.split("-");
  return RULES[code] ?? RULES[base];
}

/** "pt-BR" → "pt_BR", the way the Language header and the file names of gettext write it. */
export function gettextLanguage(language: string): string {
  return language
    .split(/[-_]/)
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      if (part.length === 4) return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(); // a script: Hant
      return part.toUpperCase();
    })
    .join("_");
}
