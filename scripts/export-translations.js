/* global __dirname */
// Export all application text keys into one reviewable file, including missing values.
const fs = require('node:fs');
const path = require('node:path');
const languages = ['en', 'de', 'fr', 'ar', 'es', 'it'];
const root = path.join(__dirname, '..', 'src', 'localization');
function flatten(value, prefix = '', result = {}) {
  for (const [key, text] of Object.entries(value)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof text === 'string') result[full] = text;
    else if (text && typeof text === 'object') flatten(text, full, result);
  }
  return result;
}
const locales = Object.fromEntries(
  languages.map((language) => [
    language,
    flatten(
      JSON.parse(
        fs.readFileSync(path.join(root, 'locales', `${language}.json`), 'utf8'),
      ),
    ),
  ]),
);
const keys = [
  ...new Set(Object.values(locales).flatMap((locale) => Object.keys(locale))),
].sort();
const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
const rows = [
  ['key', ...languages],
  ...keys.map((key) => [
    key,
    ...languages.map((language) => locales[language][key] ?? ''),
  ]),
];
fs.writeFileSync(
  path.join(root, 'translation-review.csv'),
  '\uFEFF' + rows.map((row) => row.map(quote).join(',')).join('\n') + '\n',
);
