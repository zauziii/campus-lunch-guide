#!/usr/bin/env python3
"""Collect public Otaniemi or Helsinki Main Building menus for the Pages build.

The aggregator supplies restaurant metadata and a fallback menu. Compass and
Sodexo official sources replace the corresponding fallback when available.
No translation keys or other credentials are needed by this collector.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
import json
import re
import sys

KITCHEN = 'https://kitchen.kanttiinit.fi'
USER_AGENT = 'CampusLunchGuide/1.0 (public student menu aggregation)'
LAURUS_ID = 69
LAURUS_URL = 'https://www.sodexo.fi/en/restaurants/helsinki-university-main-building'

# These links were checked against the restaurant websites and Aalto's campus
# directory. New Otaniemi entries use the HTTPS link from Kanttiinit metadata.
OFFICIAL_URLS = {
    1: 'https://www.sodexo.fi/en/restaurants/restaurant-aalto-kvarkki',
    2: 'https://www.sodexo.fi/en/restaurants/restaurant-aalto-tietotekniikantalo',
    3: 'https://lunch.tf.fi/',
    5: 'https://www.compass-group.fi/ravintolat-ja-ruokalistat/foodco/kaupungit/espoo/alvari/',
    7: 'https://www.compass-group.fi/ravintolat-ja-ruokalistat/foodco/kaupungit/espoo/tuas-aalto-yliopisto/',
    41: 'https://www.mau-kas.fi/maukas',
    45: 'https://www.compass-group.fi/ravintolat-ja-ruokalistat/foodco/kaupungit/espoo/dipoli-ravintolat/',
    50: 'https://www.kipsari.com/',
    52: 'https://www.compass-group.fi/ravintolat-ja-ruokalistat/foodco/kaupungit/espoo/a-bloc/',
    59: 'https://www.sodexo.fi/en/restaurants/restaurant-arvo',
    73: 'https://www.mau-kas.fi/nova',
    84: 'https://menssa.fi/lounas/',
}
SODEXO = {key: OFFICIAL_URLS[key] for key in (1, 2, 59)}
COMPASS = {5: '0190', 7: '0199', 45: '3101', 52: '3087'}


def download(url):
    request = Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json,text/html;q=0.9,*/*;q=0.5'})
    with urlopen(request, timeout=16) as response:
        raw = response.read(6_000_001)
    if len(raw) > 6_000_000:
        raise ValueError('Source response is too large')
    return raw.decode('utf-8', errors='replace')


def load_json(url):
    return json.loads(download(url))


class Element:
    def __init__(self, tag, attrs):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []

    def has_class(self, name):
        return name in (self.attrs.get('class') or '').split()

    def text(self):
        pieces = []
        for child in self.children:
            if isinstance(child, Element):
                if child.tag not in ('script', 'style'):
                    pieces.append(child.text())
            else:
                pieces.append(child)
        return ' '.join(' '.join(pieces).split())

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Element):
                yield from child.walk()


class HTMLTree(HTMLParser):
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Element('root', [])
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        element = Element(tag, attrs)
        self.stack[-1].children.append(element)
        if tag not in self.VOID:
            self.stack.append(element)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Element(tag, attrs))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def find_class(root, name):
    return [element for element in root.walk() if element.has_class(name)]


def first_text(root, class_name):
    return next((element.text() for element in find_class(root, class_name) if element.text()), '')


def day_from_label(label, today):
    if label.strip().lower() in ('today', 'tänään'):
        return today.isoformat()
    match = re.search(r'\b(\d{1,2})\.(\d{1,2})\.?', label)
    if not match:
        return None
    day, month = map(int, match.groups())
    choices = []
    for year in (today.year - 1, today.year, today.year + 1):
        try:
            choices.append(date(year, month, day))
        except ValueError:
            pass
    if not choices:
        return None
    found = min(choices, key=lambda value: abs((value - today).days))
    return found.isoformat() if abs((found - today).days) <= 31 else None


def lunch_hours(text):
    match = re.search(r'(?:lunchtime|lounas)\s*(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})', text, re.I)
    if not match:
        return None
    a, b, c, d = map(int, match.groups())
    if a > 23 or c > 23 or b > 59 or d > 59 or a * 60 + b >= c * 60 + d:
        return None
    return {'start': a * 60 + b, 'end': c * 60 + d, 'text': f'{a:02}:{b:02}–{c:02}:{d:02}'}


def parse_sodexo(html, today):
    tree = HTMLTree()
    tree.feed(html)
    root = tree.root
    by_id = {node.attrs.get('id'): node for node in root.walk() if node.attrs.get('id')}
    tabs = {}
    for node in root.walk():
        href = node.attrs.get('href', '')
        if node.tag == 'a' and re.fullmatch(r'#tabs-\d+', href):
            day = day_from_label(node.text(), today)
            if day:
                tabs[href[1:]] = day
    if not tabs:
        raise ValueError('Sodexo menu dates were not found')
    output = {}
    for panel_id, day in tabs.items():
        panel = by_id.get(panel_id)
        if not panel:
            continue
        meals = []
        for row in find_class(panel, 'mealrow'):
            name = first_text(row, 'meal-name')
            category = first_text(row, 'meal-type')
            button = next((n for n in row.walk() if n.attrs.get('data-dialog-target')), None)
            dialog = by_id.get(button.attrs.get('data-dialog-target')) if button else None
            components, ingredients, allergens = [], [], []
            if dialog:
                components = [n.text() for n in find_class(dialog, 'recipe-name') if n.text()]
                ingredients = [n.text() for n in find_class(dialog, 'recipe-ingredients') if n.text()]
                allergens = [n.text() for n in find_class(dialog, 'allergens') if n.text()]
                allergens.extend(n.text() for n in find_class(dialog, 'recipe-allergens') if n.text())
            if not name:
                names = [n.text() for n in find_class(row, 'recipe-name') if n.text()]
                name = ' / '.join(names)
            if not name:
                continue
            vegan = bool(find_class(row, 'vegan')) or bool(re.search(r'vegan|vegetarian|kasvis|vegaani', category, re.I))
            meals.append({'name': name, 'category': category, 'properties': ['VV'] if vegan else [],
                          'components': components, 'ingredients': ingredients, 'allergens': allergens,
                          'source': 'sodexo'})
        hours = None
        for item in find_class(panel, 'open-hours-col-1'):
            hours = lunch_hours(item.text())
            if hours:
                break
        output[day] = {'dishes': meals, 'lunchHours': hours, 'source': 'sodexo'}
    if not output:
        raise ValueError('Sodexo menu panels were not found')
    return output


def parse_compass(data):
    entries = data.get('MenusForDays') if isinstance(data, dict) else None
    if not isinstance(entries, list):
        raise ValueError('Compass menu format changed')
    output = {}
    for day in entries:
        date_text = str(day.get('Date', ''))[:10]
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date_text):
            continue
        meals = []
        for group in day.get('SetMenus') or []:
            category = str(group.get('Name') or '').strip()
            for component in group.get('Components') or []:
                if not isinstance(component, str) or not component.strip():
                    continue
                value = ' '.join(component.split())
                match = re.search(r'\s*\(([A-Za-zÄÖÅäöå+,*\s]+)\)\s*$', value)
                flags = [x.strip() for x in match.group(1).split(',') if x.strip()] if match else []
                name = value[:match.start()].strip() if match else value
                meals.append({'name': name, 'category': category, 'properties': flags,
                              'components': [], 'ingredients': [], 'allergens': [], 'source': 'compass'})
        hours = lunch_hours('Lunchtime ' + str(day.get('LunchTime') or ''))
        output[date_text] = {'dishes': meals, 'lunchHours': hours, 'source': 'compass'}
    return output


def parse_kanttiinit(courses):
    if not isinstance(courses, list):
        return []
    result = []
    for item in courses:
        if not isinstance(item, dict) or not isinstance(item.get('title'), str) or not item['title'].strip():
            continue
        result.append({'name': item['title'].strip(), 'category': '',
                       'properties': item.get('properties') if isinstance(item.get('properties'), list) else [],
                       'components': [], 'ingredients': [], 'allergens': [], 'source': 'kanttiinit'})
    return result


def collect(today=None, json_fetch=load_json, html_fetch=download):
    today = today or datetime.now(ZoneInfo('Europe/Helsinki')).date()
    areas = json_fetch(f'{KITCHEN}/areas?idsOnly=1&lang=en')
    area = next((item for item in areas if item.get('id') == 1), None)
    if not area or not isinstance(area.get('restaurants'), list):
        raise ValueError('Otaniemi restaurant list is unavailable')
    ids = [int(i) for i in area['restaurants'] if isinstance(i, int)]
    if not ids or len(ids) > 100:
        raise ValueError('Unexpected Otaniemi restaurant list')
    meta = json_fetch(f'{KITCHEN}/restaurants?' + urlencode({'lang': 'en', 'ids': ','.join(map(str, ids))}))
    if not isinstance(meta, list):
        raise ValueError('Restaurant metadata is unavailable')
    days = [(today + timedelta(days=i)).isoformat() for i in range(8)]
    menu_error = False
    try:
        menus = json_fetch(f'{KITCHEN}/menus?' + urlencode({'lang': 'en', 'restaurants': ','.join(map(str, ids)), 'days': ','.join(days)}))
        if not isinstance(menus, dict):
            raise ValueError('Unexpected menu data')
    except Exception:
        menus, menu_error = {}, True
    records = {}
    for restaurant in meta:
        rid = restaurant.get('id')
        if rid not in ids:
            continue
        url = OFFICIAL_URLS.get(rid) or str(restaurant.get('url') or '')
        if not url.startswith('https://'):
            url = ''
        stored = menus.get(str(rid), {}) if isinstance(menus.get(str(rid), {}), dict) else {}
        fallback = {day: {'dishes': parse_kanttiinit(courses), 'lunchHours': None, 'source': 'kanttiinit'}
                    for day, courses in stored.items() if day in days}
        hours = restaurant.get('openingHours') if isinstance(restaurant.get('openingHours'), list) else []
        records[rid] = {'id': rid, 'name': str(restaurant.get('name') or ''), 'url': url,
                        'address': str(restaurant.get('address') or ''), 'weeklyHours': hours,
                        'sourceAvailable': not menu_error, 'menus': fallback}
    def official_job(kind, value):
        if kind == 'sodexo':
            return parse_sodexo(html_fetch(value), today)
        endpoint = 'https://www.compass-group.fi/menuapi/feed/json?' + urlencode({'costNumber': value, 'language': 'en'})
        return parse_compass(json_fetch(endpoint))
    jobs = [(rid, 'sodexo', url) for rid, url in SODEXO.items() if rid in records]
    jobs += [(rid, 'compass', number) for rid, number in COMPASS.items() if rid in records]
    with ThreadPoolExecutor(max_workers=4) as pool:
        pending = {pool.submit(official_job, kind, value): rid for rid, kind, value in jobs}
        for future in as_completed(pending):
            rid = pending[future]
            try:
                official = future.result()
                # Some official pages expose a dated tab before its dishes are
                # published. Do not replace a usable aggregator menu with an
                # empty tab; that would silently hide an existing menu.
                for day, value in official.items():
                    if day in days and (value.get('dishes') or not records[rid]['menus'].get(day, {}).get('dishes')):
                        records[rid]['menus'][day] = value
                records[rid]['sourceAvailable'] = True
            except Exception:
                # The aggregator remains a fallback. Never manufacture a menu.
                pass
    return {'version': 1, 'collectedAt': datetime.now(timezone.utc).isoformat(),
            'area': 'Otaniemi', 'restaurants': list(records.values()),
            'partial': menu_error or len(records) != len(ids)}


def collect_laurus(today=None, json_fetch=load_json, html_fetch=download):
    """Collect the Main Building's Laurus and Civis menu independently of Aalto."""
    today = today or datetime.now(ZoneInfo('Europe/Helsinki')).date()
    days = [(today + timedelta(days=i)).isoformat() for i in range(8)]
    metadata = {}
    try:
        items = json_fetch(f'{KITCHEN}/restaurants?' + urlencode({'lang': 'en', 'ids': str(LAURUS_ID)}))
        if isinstance(items, list):
            metadata = next((item for item in items if isinstance(item, dict) and item.get('id') == LAURUS_ID), {})
    except Exception:
        pass

    fallback, fallback_ok = {}, False
    try:
        menus = json_fetch(f'{KITCHEN}/menus?' + urlencode({'lang': 'en', 'restaurants': str(LAURUS_ID), 'days': ','.join(days)}))
        if not isinstance(menus, dict):
            raise ValueError('Unexpected Kanttiinit menu data')
        stored = menus.get(str(LAURUS_ID), {})
        if not isinstance(stored, dict):
            raise ValueError('Unexpected Main Building menu data')
        fallback = {day: {'dishes': parse_kanttiinit(courses), 'lunchHours': None, 'source': 'kanttiinit'}
                    for day, courses in stored.items() if day in days}
        fallback_ok = True
    except Exception:
        pass

    official, official_ok = {}, False
    try:
        official = parse_sodexo(html_fetch(LAURUS_URL), today)
        official_ok = True
    except Exception:
        pass
    if not official_ok and not fallback_ok:
        raise ValueError('Neither Main Building menu source was available')

    for day, value in official.items():
        if day in days and (value.get('dishes') or not fallback.get(day, {}).get('dishes')):
            fallback[day] = value
    hours = metadata.get('openingHours') if isinstance(metadata.get('openingHours'), list) else []
    record = {'id': LAURUS_ID, 'name': 'Laurus / Café Civis', 'url': LAURUS_URL,
              'address': 'Fabianinkatu 33, 00170 Helsinki', 'weeklyHours': hours,
              'sourceAvailable': True, 'menus': fallback}
    return {'version': 1, 'collectedAt': datetime.now(timezone.utc).isoformat(),
            'officialAvailable': official_ok, 'restaurants': [record]}


if __name__ == '__main__':
    try:
        print(json.dumps(collect_laurus() if sys.argv[1:] == ['--laurus'] else collect(), ensure_ascii=False))
    except Exception as error:
        print(f'Menu collection failed: {type(error).__name__}', file=sys.stderr)
        sys.exit(1)
