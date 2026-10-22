import path from "node:path";
import { languageName } from "../../../core/languages.js";
import type { FormatDescriptor } from "../../format.js";
import { baseLanguage, folderPrefix } from "../../project/detection.js";
import { gettextLanguage } from "../po/plurals.js";
import { propertiesReader } from "./reader.js";
import { propertiesWriter } from "./writer.js";

/** A bundle name ending with a locale: messages_fr, messages_pt_BR. */
const BUNDLE_LOCALE = /^(.+?)_([a-z]{2,3}(?:_[A-Z]{2})?)$/;
/** Names that only resource bundles take, even without a translation next to them. */
const BUNDLE_NAME = /(?:^|[_.-])(?:messages|strings|labels|i18n|l10n|texts?|translations?|resources|bundle)$/i;

/** Java resource bundles (.properties). */
export const propertiesFormat: FormatDescriptor = {
  id: "properties",
  reader: propertiesReader,
  writer: propertiesWriter,
  extensions: [".properties"],
  /**
   * messages.properties (the default, in the source language) or messages_en.properties, whose translations are
   * messages_fr.properties. A .properties file without a locale is only taken when translations sit next to it or
   * its name is that of a bundle: application.properties and gradle.properties are settings.
   */
  detect({ file, files, sourceLanguage, targetLanguage }) {
    const folder = path.posix.dirname(file);
    const prefix = folderPrefix(file);
    const name = path.posix.basename(file, path.posix.extname(file));
    const target = targetLanguage === undefined ? "{lang}" : gettextLanguage(targetLanguage);
    const locale = BUNDLE_LOCALE.exec(name);
    const code = locale?.[2];
    if (locale !== null && code !== undefined && languageName(code.replace("_", "-")) !== code.replace("_", "-")) {
      if (baseLanguage(code) !== baseLanguage(sourceLanguage)) return { reason: "bundle of another language" };
      return { format: "properties", include: file, output: `${prefix}${locale[1]}_${target}.properties` };
    }
    const translations = files.some((other) => {
      const otherName = path.posix.basename(other, path.posix.extname(other));
      return path.posix.dirname(other) === folder && otherName.startsWith(`${name}_`) && other.endsWith(".properties");
    });
    if (!translations && !BUNDLE_NAME.test(name)) {
      return { reason: "settings rather than texts (no translation next to it, and not the name of a bundle)" };
    }
    return { format: "properties", include: file, output: `${prefix}${name}_${target}.properties` };
  },
};
