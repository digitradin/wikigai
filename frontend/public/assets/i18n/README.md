# Wikigai translations (i18n)

Languages: **English (source), French, Spanish**. Every page has a language
switcher (EN · FR · ES). The choice is remembered in the browser (`wk_lang`) and
on the account (`users.locale`, used for emails).

## Layout

```
frontend/public/assets/i18n/
  i18n.js                     runtime + LOCALES registry (the only code file)
  locales/
    en/ui.js                  UI dictionary — SOURCE OF TRUTH (keys + English)
    fr/ui.js, es/ui.js        same keys, translated
    fr/content/*.js           survey content catalogs (one file per area)
    es/content/*.js           taxonomy · careers · tasks · sources · stage1 · stage2
backend/src/i18n/
  index.js                    server language detection + t()
  locales/{en,fr,es}.json     email texts
tools/i18n/
  extract-content.js          lists every content string in the survey data files
  check.js                    coverage check — run before every deploy
```

## Two kinds of text

| Kind | Where | Lookup | Example |
|---|---|---|---|
| **UI** (labels, buttons, messages, titles) | `locales/<code>/ui.js` | key | `T('survey.begin', { n: 2 })` |
| **Content** (questions, domains, professions, task lines, data sources) | `locales/<code>/content/*.js` | English source text (gettext style) | `WK.i18n.tc('Software Engineer')` |

Content is keyed by the English text so saved results (which store English
names) display in any language, and the survey data files stay unchanged.
English needs no content files.

In HTML use `data-i18n="key"`, `data-i18n-html="key"` (trusted HTML),
`data-i18n-attr="placeholder:key; aria-label:key"`. Plural forms:
`{ one: '…', other: '…' }` with a `count` variable.

## Adding text

1. Add the key and English text to `locales/en/ui.js` (or add the question to
   the survey data/bank file as usual).
2. Add the same key / source string to every other language.
3. Run `node tools/i18n/check.js` — it lists anything missing and fails if a
   placeholder like `{n}` is lost.

## Adding a language (e.g. Portuguese)

1. `i18n.js` → add `{ code: 'pt', label: 'PT', name: 'Português', htmlLang: 'pt', dir: 'ltr', intl: 'pt-PT' }` to `LOCALES`.
2. Copy `locales/en/ui.js` → `locales/pt/ui.js`, change `register('en'` to `register('pt'`, translate the values.
3. Copy `locales/fr/content/` → `locales/pt/content/`, change the register code, translate the **values** (keys stay English).
4. `backend/src/i18n/locales/pt.json` + add `'pt'` to `SUPPORTED` in `backend/src/i18n/index.js`.
5. `node tools/i18n/check.js` until it shows 0 errors. With more than 4 languages the switcher becomes a dropdown automatically.

No database change is needed (`users.locale` is free text).

## Style guide

- FR uses **vous**, ES uses **tú** (matches the original landing page).
- Job titles: masculine generic, as on French/Spanish job boards.
- Survey stems must read naturally before an **infinitive** — the generator pairs
  stems with random activity lines (EN gerunds → FR/ES infinitives).
- Never translate the brand: always **Wikigai**.
