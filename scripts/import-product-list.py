#!/usr/bin/env python3
"""Import approved SheaBliss spreadsheet labels as non-purchasable catalog previews.

Requires openpyxl. Usage:
  python3 scripts/import-product-list.py /path/to/SHEABLISS-PRODUCTLIST.xlsx
The generated JS data is committed; Python is not required by the website runtime.
Sizes/prices remain source metadata, never automatically approved sale variants.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import re
import openpyxl

NAMES = {
    1: 'Moisturising Shea Butter', 2: 'Water-Based Shea Butter Lotion',
    3: 'Papaya Body Cream', 4: 'Avocado Face & Body Cream',
    5: 'Shea & Lemon Hand Cream', 6: 'Shea & Cocoa Intensive Hand Cream',
    7: 'Shea & Coffee Reviving Hand Cream', 8: 'Pure Cocoa Butter',
    9: 'Pure Unrefined Shea Butter', 10: 'Shea Hand Cream',
    11: 'Papaya Soap', 12: 'Avocado Soap', 13: 'Moringa Soap',
    14: 'Cocoa Butter Soap', 15: 'Coffee Oil Soap',
    16: 'Pure Unrefined Shea Butter', 17: 'Pure Moringa Oil',
    18: 'Pure Papaya Oil', 19: 'Pure Avocado Oil', 20: 'Pure Coffee Oil',
    21: 'Pure Palm Kernel Oil', 22: 'Pure Castor Oil',
    23: 'Shea & Lemon Face & Body Cream', 24: 'Avocado Face & Body Cream',
    25: 'Pure Castor Oil', 26: 'Shea & Cocoa Lip Balm',
    27: 'Shea & Lemon Lip Balm', 28: 'Shea & Coffee Lip Balm',
    29: 'Shea Lip Balm', 30: 'Shea & Citronella Hair Cream',
    31: 'Avocado Hair Cream', 32: 'Pure Avocado Oil',
}
MULTI_USE = {
    4: ['Body', 'Skin'], 19: ['Body', 'Hair'], 22: ['Body', 'Skin'],
    23: ['Skin', 'Body'], 24: ['Skin', 'Body'],
    25: ['Skin', 'Body'], 32: ['Hair', 'Body'],
}
POSSIBLE_DUPLICATES = {4: 24, 24: 4, 19: 32, 32: 19, 22: 25, 25: 22, 9: 16, 16: 9}


def clean(value):
    return re.sub(r'\s+', ' ', str(value)).strip() if value is not None else ''


def classification(item, category, original_range):
    if item == 16:
        return 'Awaiting confirmation', 'To be confirmed'
    if item == 21:
        return 'Soap-making Ingredients', 'Soap-making Oil'
    if item in {8, 9}:
        return 'Body Butters', 'Body Butter'
    if item in {5, 6, 7, 10}:
        return 'Hand Creams', 'Hand Cream'
    if category == 'Hair':
        return ('Hair Oils', 'Hair Oil') if original_range == 'Oils' else ('Hair Creams', 'Hair Cream')
    if category == 'Skin':
        return {'Cream': ('Face Creams', 'Face & Body Cream'), 'Balm': ('Lip Balms', 'Lip Balm'), 'Oils': ('Oils', 'Oil')}[original_range]
    return {'Cream': ('Creams & Lotions', 'Lotion' if item == 2 else 'Cream'), 'Soap': ('Soaps', 'Soap'), 'Oils': ('Oils', 'Body Oil')}[original_range]


def import_rows(workbook_path):
    workbook = openpyxl.load_workbook(workbook_path, data_only=True)
    sheet = workbook['Sheet1']
    records = []
    source_codes = {}
    for row in sheet.iter_rows(min_row=3, values_only=True):
        if len(row) < 11 or not row[3]:
            continue
        item = int(row[7])
        if item not in NAMES:
            raise ValueError(f'Item {item} has no approved classification mapping; review it before importing.')
        source_category = clean(row[1]).upper()
        category = {'BODY': 'Body', 'FACE': 'Skin', 'HAIR': 'Hair'}[source_category]
        original_range = clean(row[2]).title()
        subcategory, product_type = classification(item, category, original_range)
        source_code = clean(row[10])
        code = 'FAC-BAL-0026' if item == 26 else source_code
        if not re.fullmatch(r'[A-Z]{2,3}-[A-Z]{3}-[0-9]{4}', code):
            raise ValueError(f'Invalid product code for item {item}: {code!r}')
        source_codes[item] = code
        function = clean(row[4])
        suitable_for = function.removeprefix('For ').removeprefix('for ')
        if suitable_for:
            suitable_for = suitable_for[0].upper() + suitable_for[1:].lower()
        benefits = clean(row[6])
        notes = []
        if item == 16:
            notes.append('Confirm whether this is unrefined shea butter or shea butter soap; the source range is Soap.')
        if item == 21:
            notes.append('Listed for soap making, not presented as a ready-to-use body oil.')
        if item in {22, 25}:
            notes.append('The listed use is body and lips; no facial-use claim has been added. Confirm application instructions.')
        if item == 2:
            notes.append('The source benefit mentions face and body, but its body-part column says Body. Facial use has not been assumed.')
        if item == 26:
            notes.append('Corrected the Balm product code from FAC-OIL-0026 to FAC-BAL-0026; original source code retained.')
        if item in {6, 31}:
            notes.append('Confirm the supplied repairing benefit before adding stronger product claims.')
        display_benefits = benefits
        if item == 2:
            display_benefits = 'Moisturising'
        elif benefits == 'Repairing':
            display_benefits = ''
        elif benefits == 'Repairing & Conditioning':
            display_benefits = 'Conditioning'
        description_parts = [function.rstrip('.'), display_benefits.rstrip('.')]
        description = '. '.join(part for part in description_parts if part)
        if description:
            description += '.'
        categories = MULTI_USE.get(item, [category])
        category_ranges = {category: subcategory}
        if item in {4, 23, 24}:
            category_ranges = {'Body': 'Creams & Lotions', 'Skin': 'Face Creams'}
        elif item in {19, 32}:
            category_ranges = {'Body': 'Oils', 'Hair': 'Hair Oils'}
        elif item in {22, 25}:
            category_ranges = {'Body': 'Oils', 'Skin': 'Oils'}
        records.append({
            'id': code.lower(), 'product': code, 'code': code, 'name': NAMES[item],
            'category': category, 'categories': categories, 'categoryRanges': category_ranges,
            'subcategory': subcategory, 'productType': product_type,
            'suitableFor': suitable_for, 'bodyPart': clean(row[5]),
            'benefits': display_benefits, 'description': description,
            'variants': [], 'status': 'pending-details',
            'needsReview': item in POSSIBLE_DUPLICATES or item in {2, 6, 16, 22, 25, 31},
            'reviewNotes': notes, 'possibleDuplicateOf': [],
            'sourceItem': item, 'sourceCode': source_code, 'sourceCategory': source_category,
            'sourceRange': original_range, 'sourceName': clean(row[3]),
            'sourceBenefits': benefits, 'sourceSize': clean(row[8]) or None,
            'sourcePrice': clean(row[9]) or None,
            'sourceWorkbook': workbook_path.name,
        })
    if sorted(record['sourceItem'] for record in records) != list(range(1, 33)):
        raise ValueError('The approved workbook must contain each item from 1 through 32 exactly once.')
    for record in records:
        other_item = POSSIBLE_DUPLICATES.get(record['sourceItem'])
        if other_item:
            other_code = source_codes[other_item]
            record['possibleDuplicateOf'] = [other_code]
            record['reviewNotes'].append(f'Possible duplicate of {other_code}; do not merge formulations, variants or stock before confirmation.')
    if len({record['product'] for record in records}) != len(records):
        raise ValueError('Each imported row must have a distinct SKU identifier.')
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'shared/product-list.mjs')
    args = parser.parse_args()
    records = import_rows(args.workbook)
    content = '// Generated from the approved product workbook by scripts/import-product-list.py.\n'
    content += '// Entries are previews only: no approved purchasing variants or fabricated prices.\n'
    content += 'export const SPREADSHEET_PRODUCTS = ' + json.dumps(records, ensure_ascii=False, indent=2) + ';\n'
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(content, encoding='utf-8')
    print(f'Imported {len(records)} source rows into {args.output}')
    print('Primary categories:', dict(Counter(record['category'] for record in records)))
    print('All imported entries remain non-purchasable pending confirmed sizes and prices.')


if __name__ == '__main__':
    main()
