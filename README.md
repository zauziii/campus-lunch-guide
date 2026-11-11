# 吃好饭 · Chi Hao Fan

An independent guide to meat and fish options at University of Helsinki and Aalto Otaniemi restaurants, with Chinese translations. The University of Helsinki and today's Helsinki date are selected by default; use the switches to view Aalto or tomorrow's published menu.

## How it works

- **UniCafe:** The browser loads UniCafe's English menu feed and refreshes it every 15 minutes while the page is open. Date selection uses Helsinki local time and the published menu and lunch schedule for that day.
- **Laurus / Café Civis:** The Main Building restaurant is included in the City Centre campus. The scheduled build collects [Sodexo's official menu](https://www.sodexo.fi/en/restaurants/helsinki-university-main-building), including available recipe components and allergens; [Kanttiinit restaurant 69](https://kanttiinit.fi/restaurant/69) supplies a fallback when needed. The two sources are collected independently of Aalto. Main Building names are translated and cached alongside the other menus.
- **Aalto / Otaniemi:** GitHub Actions collects the Otaniemi restaurant list and menus from Kanttiinit, and looks for more detailed menus at the restaurants' official sources. The resulting snapshot is published alongside the translations. The page shows when it was collected and warns when sources or today's menus are missing. Restaurant names link to their own official sites; see [Aalto sources](AALTO_SOURCES.md).
- **Meat and fish:** Official recipe or ingredient information is used where it is available. Otherwise explicit meat or fish names are identified from the dish title, and the page identifies the evidence used. UniCafe fish is based on official allergen fields. A dish that cannot be classified remains “待确认”; this does not mean it contains no meat or fish. Translation never determines classification.
- For today, restaurants with known ended lunch times and restaurants without relevant dishes are hidden. Tomorrow's published menus are not hidden according to the current clock time. Unknown hours and uncertain dishes remain visible. Some Aalto entries only provide general weekly opening hours, which are marked as a regular reference and may differ from the actual lunch period or exceptional hours.
- Original names and Chinese translations appear together. GitHub Actions translates new relevant menu names with Azure Translator's automatic source-language detection, including Finnish and mixed-language names, and caches them. The local dictionary takes precedence over cached translations, including the corrected shiitake, parmesan and rucola pizza; the Azure key is never exposed to the website. If no usable translation is available, the original name is shown with “中文待更新”. Short or mixed-language names may still be translated incorrectly.

## Updating and publishing

The existing workflow runs once a day at **05:30 UTC** (normally 07:30 in Finland in winter and 08:30 in summer), on pushes to `main`, and when manually started from **Actions → Update translations and publish → Run workflow**. Scheduled runs can start later than their scheduled time.

The workflow uses the existing `AZURE_TRANSLATOR_KEY` repository secret and region `northeurope`. No new secret is needed for Aalto or Laurus. The Aalto and Main Building snapshots are refreshed by the workflow, not by the page's Refresh button; restaurant changes after collection may not appear until the next successful run. UniCafe menus continue to be requested by the browser. If collection of either snapshot fails, the last cached snapshot for that source is retained when available and marked as an unsuccessful update. If only Kanttiinit is available for the Main Building, its fallback may lack recipe details.

The workflow pins `ubuntu-26.04`, matching the last successful deployment image, and uses Node 24-compatible GitHub Actions. The translation cache key and daily schedule are unchanged.

## Checks

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py' -q
```

This independent project is not affiliated with UniCafe, Sodexo, Aalto, Kanttiinit or the restaurant operators. Automatic classification and translation can be wrong; consult the restaurant and its staff for dietary or allergen decisions.
