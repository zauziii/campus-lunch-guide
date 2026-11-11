import importlib.util
import json
from datetime import date
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('collector', Path(__file__).parents[1] / 'scripts/collect-aalto.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

HTML = '''<!doctype html><html><body>
<a href="#tabs-7">Mon 09.11</a><div id="tabs-7">
  <div class="open-hours-col-1"><p>Lunchtime <span>10.30 - 18.00</span></p></div>
  <div class="mealrow"><div class="meal-wrapper"><span class="meal-type">Lounas</span>
    <p class="meal-name">Sweet &amp; Sour Pork with Rice</p>
    <button data-dialog-target="dialog-28">Ravinneinfo</button></div></div>
</div>
<div id="dialog-28"><span class="allergens">Fish</span>
 <div class="recipe-wrapper"><p class="recipe-name">Porsaanlihasuikaleita</p>
 <p class="recipe-ingredients">porsaanliha, vesi</p></div>
</div></body></html>'''


class CollectorTests(unittest.TestCase):
    def test_sodexo_associates_date_title_and_ingredients(self):
        menu = collector.parse_sodexo(HTML, date(2026, 11, 7))['2026-11-09']
        self.assertEqual(menu['lunchHours']['end'], 18 * 60)
        self.assertEqual(menu['dishes'][0]['name'], 'Sweet & Sour Pork with Rice')
        self.assertEqual(menu['dishes'][0]['components'], ['Porsaanlihasuikaleita'])
        self.assertEqual(menu['dishes'][0]['ingredients'], ['porsaanliha, vesi'])
        self.assertEqual(menu['dishes'][0]['allergens'], ['Fish'])

    def test_compass_preserves_diet_flags_and_explicit_source(self):
        sample = {'MenusForDays': [{'Date': '2026-11-07T00:00:00+00:00', 'LunchTime': '11:00–16:00',
                                    'SetMenus': [{'Name': 'Lunch', 'Components': ['Crispy fish (A, G, L)', 'Rice (G, Veg)']}]}]}
        menu = collector.parse_compass(sample)['2026-11-07']
        self.assertEqual(menu['lunchHours']['end'], 960)
        self.assertEqual(menu['dishes'][0]['name'], 'Crispy fish')
        self.assertEqual(menu['dishes'][1]['properties'], ['G', 'Veg'])
        self.assertEqual(menu['source'], 'compass')

    def test_official_menus_override_aggregator_and_preserve_correct_urls(self):
        def fetch_json(url):
            if '/areas?' in url:
                return [{'id': 1, 'restaurants': [2, 52, 84]}]
            if '/restaurants?' in url:
                return [{'id': i, 'name': str(i), 'url': 'https://example.com/', 'openingHours': []} for i in [2, 52, 84]]
            if '/menus?' in url:
                return {'2': {'2026-11-09': [{'title': 'Old title', 'properties': []}]},
                        '84': {'2026-11-09': [{'title': 'Soup', 'properties': []}]}}
            if 'compass-group.fi' in url:
                return {'MenusForDays': [{'Date': '2026-11-09', 'LunchTime': '11:00–15:00',
                                          'SetMenus': [{'Name': 'Lunch', 'Components': ['Fish (G)']}]}]}
            raise AssertionError(url)
        result = collector.collect(today=date(2026, 11, 7), json_fetch=fetch_json, html_fetch=lambda _: HTML)
        records = {r['id']: r for r in result['restaurants']}
        self.assertEqual(records[2]['menus']['2026-11-09']['dishes'][0]['name'], 'Sweet & Sour Pork with Rice')
        self.assertTrue(records[2]['url'].endswith('/restaurant-aalto-tietotekniikantalo'))
        self.assertEqual(records[52]['menus']['2026-11-09']['dishes'][0]['source'], 'compass')
        self.assertEqual(records[84]['menus']['2026-11-09']['dishes'][0]['source'], 'kanttiinit')
        self.assertFalse(result['partial'])

    def test_missing_official_source_falls_back_without_inventing_ingredients(self):
        def fetch_json(url):
            if '/areas?' in url:
                return [{'id': 1, 'restaurants': [2]}]
            if '/restaurants?' in url:
                return [{'id': 2, 'name': 'Computer Science Building', 'openingHours': []}]
            if '/menus?' in url:
                return {'2': {'2026-11-09': [{'title': 'Chicken', 'properties': []}]}}
            raise OSError('unavailable')
        def fail_html(_):
            raise OSError('unavailable')
        result = collector.collect(today=date(2026, 11, 7), json_fetch=fetch_json, html_fetch=fail_html)
        dish = result['restaurants'][0]['menus']['2026-11-09']['dishes'][0]
        self.assertEqual(dish['source'], 'kanttiinit')
        self.assertEqual(dish['ingredients'], [])

    def test_empty_official_tab_does_not_erase_an_aggregator_menu(self):
        def fetch_json(url):
            if '/areas?' in url:
                return [{'id': 1, 'restaurants': [2]}]
            if '/restaurants?' in url:
                return [{'id': 2, 'name': 'Computer Science Building', 'openingHours': []}]
            if '/menus?' in url:
                return {'2': {'2026-11-09': [{'title': 'Chicken soup', 'properties': []}]}}
            raise OSError('unavailable')
        empty_tab = '<a href="#tabs-1">Mon 09.11</a><div id="tabs-1"></div>'
        result = collector.collect(today=date(2026, 11, 7), json_fetch=fetch_json, html_fetch=lambda _: empty_tab)
        menu = result['restaurants'][0]['menus']['2026-11-09']
        self.assertEqual(menu['source'], 'kanttiinit')
        self.assertEqual(menu['dishes'][0]['name'], 'Chicken soup')

    def test_missing_date_or_year_does_not_misassign(self):
        self.assertIsNone(collector.day_from_label('Previous Week', date(2026, 11, 7)))
        self.assertEqual(collector.day_from_label('Fri 01.01', date(2026, 12, 31)), '2027-01-01')

    def test_main_building_uses_sodexo_and_its_own_metadata(self):
        def fetch_json(url):
            if '/restaurants?' in url:
                return [{'id': 69, 'openingHours': ['10:30 - 15:00'] * 5 + [None, None]}]
            if '/menus?' in url:
                return {'69': {'2026-11-09': [{'title': 'Older fallback dish', 'properties': []}],
                               '2026-11-10': [{'title': 'Seitä', 'properties': []}]}}
            raise AssertionError(url)
        result = collector.collect_laurus(today=date(2026, 11, 9), json_fetch=fetch_json, html_fetch=lambda _: HTML)
        restaurant = result['restaurants'][0]
        self.assertTrue(result['officialAvailable'])
        self.assertEqual(restaurant['id'], 69)
        self.assertEqual(restaurant['name'], 'Laurus / Café Civis')
        self.assertEqual(restaurant['url'], collector.LAURUS_URL)
        self.assertEqual(restaurant['menus']['2026-11-09']['dishes'][0]['source'], 'sodexo')
        self.assertEqual(restaurant['menus']['2026-11-10']['dishes'][0]['source'], 'kanttiinit')
        self.assertEqual(restaurant['menus']['2026-11-09']['lunchHours']['end'], 18 * 60)

    def test_main_building_uses_kanttiinit_when_sodexo_fails(self):
        def fetch_json(url):
            if '/restaurants?' in url:
                return [{'id': 69, 'openingHours': ['10:30 - 15:00'] * 5 + [None, None]}]
            if '/menus?' in url:
                return {'69': {'2026-11-11': [{'title': 'Paistettua seitiä', 'properties': ['G']}]}}
            raise AssertionError(url)
        def fail_html(_):
            raise OSError('official source unavailable')
        result = collector.collect_laurus(today=date(2026, 11, 11), json_fetch=fetch_json, html_fetch=fail_html)
        dish = result['restaurants'][0]['menus']['2026-11-11']['dishes'][0]
        self.assertFalse(result['officialAvailable'])
        self.assertEqual(dish['source'], 'kanttiinit')
        self.assertEqual(dish['ingredients'], [])

    def test_main_building_uses_official_source_without_kanttiinit(self):
        def fail_json(_):
            raise OSError('aggregator unavailable')
        result = collector.collect_laurus(today=date(2026, 11, 9), json_fetch=fail_json, html_fetch=lambda _: HTML)
        self.assertTrue(result['officialAvailable'])
        self.assertEqual(result['restaurants'][0]['menus']['2026-11-09']['source'], 'sodexo')

    def test_main_building_reports_when_both_sources_fail(self):
        def fail(_):
            raise OSError('unavailable')
        with self.assertRaisesRegex(ValueError, 'Neither Main Building menu source'):
            collector.collect_laurus(today=date(2026, 11, 11), json_fetch=fail, html_fetch=fail)


if __name__ == '__main__':
    unittest.main()
