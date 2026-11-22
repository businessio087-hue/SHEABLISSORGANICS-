// Editable search language for the SheaBliss product finder.
// Keep product keys aligned with shared/catalog.mjs IDs. Add everyday wording here,
// rather than changing the search algorithm, whenever a new product is approved.
export const SEARCH_KEYWORDS = {
  'organic-sheabutter': [
    'shea', 'butter', 'body butter', 'moisturiser', 'moisturizer', 'lotion', 'cream',
    'dry skin', 'dry hands', 'elbows', 'knees', 'heels', 'cracked', 'rough',
    'sensitive skin', 'soften', 'soothe', 'raw', 'unrefined', 'natural', 'organic',
    'skin care', 'skincare', 'citronella', 'body', 'skin', 'gift'
  ],
  'hair-butter': [
    'hair', 'scalp', 'curls', 'curly', 'coily', 'natural hair', 'afro', 'braids',
    'twists', 'locs', 'frizz', 'frizzy', 'dry hair', 'edges', 'ends', 'styling',
    'avocado', 'cocoa', 'sealant', 'gift'
  ],
  'mucuna-puriens-beans': [
    'mucuna', 'velvet bean', 'beans', 'supplement', 'wellness', 'health', 'focus',
    'mood', 'mind', 'nootropic', 'energy', 'tea', 'powder', 'gift'
  ]
};

export const SEARCH_SYNONYMS = {
  moisturizer: 'moisturiser',
  moisturizers: 'moisturiser',
  moisturisers: 'moisturiser',
  shea: 'shea',
  shia: 'shea',
  moisturize: 'moisturiser',
  moisturise: 'moisturiser',
  presents: 'gift',
  present: 'gift',
  cheap: 'low price'
};

export const SEARCH_CHIPS = [
  { label: 'Dry skin', query: 'dry skin' },
  { label: 'Curly hair', query: 'curly hair' },
  { label: 'Gift', query: 'gift' },
  { label: 'Under R150', query: 'under R150' }
];
