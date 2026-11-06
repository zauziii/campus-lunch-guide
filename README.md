# Campus Lunch Guide

A simple, independent guide to today's meat and fish options at UniCafe restaurants across Helsinki campuses, with Chinese translations.

## How it works

- Fetches official UniCafe menu information when the page opens, uses the current date in Helsinki, and refreshes every 15 minutes while the page is open.
- Starts with a collapsed summary for each campus, showing how many visible restaurants have identified meat or official fish/shellfish allergen markers, as well as how many have menu items requiring review. Counts can overlap. Restaurants are hidden after their stated lunch period or when no relevant dishes were found; restaurants with unknown hours or dishes requiring review remain visible. Empty campuses are hidden.
- Shows each restaurant's official lunch hours inside the expanded campus, distinguishing regular schedules from dated exceptions. A time indicator compares the schedule with the current Helsinki time; it does not indicate whether a dish is in stock. Missing or unclear hours are not guessed.
- Selecting a restaurant name shows that restaurant's address from UniCafe data. UniCafe's old per-restaurant URLs currently redirect to the homepage, so the global UniCafe link opens the official homepage and users must select a restaurant there.
- Excludes official vegetarian/vegan flags and examines the Finnish dish name and full ingredient text for specific meat terms. The page distinguishes meat named in the dish from meat only found in the ingredients; ambiguous lunch items remain available under “待确认”. It removes several common false matches, including carrots, eggs, country names, warnings about traces, and stock/flavourings.
- Fish, crustaceans and molluscs use UniCafe's official allergen fields. This indicates that such an ingredient was declared, not necessarily that it is the main course.
- Uses a small exact-match dictionary for common dishes, browser-local translation caching and MyMemory machine translation for other dish names. Requests are made one dish at a time and stop when the service reports a quota limit or repeated connection failure. Finnish names remain available. Translations and ingredient recognition can be wrong or unavailable. Menu descriptions may cover multiple alternatives, and a match may refer to a minor ingredient. Unrecognized does not mean meat-free.

This is an independent project and is not affiliated with UniCafe. For allergens and dietary requirements, consult [UniCafe's official information](https://unicafe.fi/) and restaurant staff.
