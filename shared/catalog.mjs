export const CATALOG = [
  {
    product: 'Organic Sheabutter',
    category: 'Skin',
    collection: 'Body',
    description: 'Unrefined shea butter, raw shea butter with citronelle.',
    variants: [
      { size: '100g', amountZar: 100 },
      { size: '200g', amountZar: 180 },
      { size: '500g', amountZar: 380 },
      { size: '1kg', amountZar: 700 },
      { size: '5kg', amountZar: 3000 },
    ],
  },
  {
    product: 'Hair Butter',
    category: 'Hair',
    description: 'Organic shea butter, avocado oil and cocoa butter blend.',
    variants: [{ size: '250g', amountZar: 200 }],
  },
  {
    product: 'Mucuna Puriens (Beans)',
    category: 'Health',
    description: 'Organically grown nootropic beans.',
    variants: [
      { size: '100g', amountZar: 250 },
      { size: '200g', amountZar: 150 },
    ],
  },
];

export function findVariant(productName, size) {
  const product = CATALOG.find((entry) => entry.product === productName);
  const variant = product?.variants.find((entry) => entry.size === size);
  return product && variant ? { ...product, ...variant } : null;
}
