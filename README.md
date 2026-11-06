# Campus Lunch Guide

A simple, independent guide to today's meat and fish options at UniCafe restaurants across Helsinki campuses, with Chinese translations.

## How it works

- Fetches official UniCafe menu information when the page opens, uses the current date in Helsinki, and refreshes every 15 minutes while the page is open.
- Starts with a collapsed summary for each campus, showing how many restaurants have identified meat or official fish/shellfish allergen markers, as well as how many have menu items requiring review. Counts can overlap.
- Excludes official vegetarian/vegan flags and examines the Finnish dish name and full ingredient text for specific meat terms. Displays the matching source and term; ambiguous lunch items remain available under “待确认”. It removes several common false matches, including carrots, eggs, country names, warnings about traces, and stock/flavourings.
- Fish, crustaceans and molluscs use UniCafe's official allergen fields. This indicates that such an ingredient was declared, not necessarily that it is the main course.
- Uses MyMemory machine translation and preserves Finnish names. Translations and ingredient recognition can be wrong or unavailable. Menu descriptions may cover multiple alternatives, and a match may refer to a minor ingredient. Unrecognized does not mean meat-free.

This is an independent project and is not affiliated with UniCafe. For allergens and dietary requirements, consult [UniCafe's official information](https://menu.unicafe.fi/) and restaurant staff.

## Publish with GitHub Pages

Put all files in this archive at the root of a public GitHub repository. In **Settings → Pages**, choose **Deploy from a branch**, select **main** and **/(root)**, and save.

For a local preview, run `python -m http.server 8000` in this folder and visit `http://localhost:8000/`. No backend or API key is required. Public menu names are sent to MyMemory for translation; its quota and availability may vary.
