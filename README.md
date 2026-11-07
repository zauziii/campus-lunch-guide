# Campus Lunch Guide

A simple, independent guide to today's meat and fish options at UniCafe restaurants across Helsinki campuses, with Chinese translations.

## How it works

- The browser fetches UniCafe's **English** menu feed, uses the current Helsinki date and refreshes the menu every 15 minutes while the page is open. Menu availability and lunch times come from UniCafe, not the translation service.
- Campuses are collapsed by default and show counts of restaurants with identified meat, official fish/shellfish markers, or dishes requiring review. Lunches that have ended and restaurants with no relevant dishes are hidden; unknown hours and uncertain dishes remain visible.
- Meat detection uses the official name and ingredients. Fish and shellfish use UniCafe's declared allergen fields. Both are independent of the Chinese translation; an unrecognized dish is not necessarily meat-free. Some fields in the English feed remain Finnish, so the recognition rules also account for those fields.
- Chinese and the official English-feed name appear together. An exact-match dictionary takes priority; GitHub Actions translates other new relevant English dish names with Azure Translator and publishes `data/translations.json`. Clearly Finnish titles detected in the English feed are not sent as English, but that detection is not exhaustive.
- If a new dish has not yet been translated, the page shows the original name and “中文待更新”. The two user-confirmed fish translations are maintained in the local dictionary. The page and browser never receive the Azure key.

This independent project is not affiliated with UniCafe. Automatic classification and translation can be wrong; consult UniCafe and restaurant staff for dietary or allergen decisions.
