// Edit each material's name, description or image here. Products are stable catalog
// identifiers, mapped from supplied names/recipes, not guessed full formulations.
// Moringa / coffee / avocado etc. represent ingredient families, not proof that a
// particular plant part or processing form is present in every mapped product.
export const RAW_MATERIALS = [
  {
    id: 'shea', name: 'Raw Shea Butter',
    description: 'Gathered from the shea trees of northern Uganda, our raw shea butter is unrefined, creamy and rich. It melts on contact, wrapping skin in deep comfort. The heart of our creams, it leaves dry hands feeling velvety, smooth and soft.',
    image: '/assets/manus/L0thT0dRY1dyYjRLdjh2Ym5QRzNtZDQvaW1hZ2UtMS53ZWJw.webp',
    alt: 'Editorial still life of creamy raw shea butter and shea nuts in a carved wooden bowl.',
    products: ['Organic Sheabutter', 'Hair Butter', 'BO-CRE-0001', 'BO-CRE-0002', 'BO-CRE-0005', 'BO-CRE-0006', 'BO-CRE-0007', 'BO-CRE-0009', 'BO-CRE-0010', 'BO-SOA-0016', 'FAC-CRE-0023', 'FAC-BAL-0026', 'FAC-BAL-0027', 'FAC-BAL-0028', 'FAC-BAL-0029', 'HAI-CRE-0030'],
  },
  {
    id: 'papaya', name: 'Papaya',
    description: 'Sun-ripened Ugandan papaya brings a tropical glow to our soaps and creams. Its natural fruit enzymes help gently buff away dullness, revealing fresher-looking skin. Sweet, juicy and bright, it turns every wash into a small daily ritual of fresh renewal.',
    image: '/assets/manus/L0thT0dRY1dyYjRLdjh2Ym5QRzNtZDQvaW1hZ2UtMi53ZWJw.webp',
    alt: 'Editorial still life of ripe papaya with coral-orange flesh on warm natural ceramics.',
    products: ['BO-CRE-0003', 'BO-SOA-0011', 'BO-OIL-0018'],
  },
  {
    id: 'lemon', name: 'Lemon',
    description: 'Zesty lemons grown under the Ugandan sun add a vibrant burst of brightness to our soaps and hand creams. Their clean, uplifting scent instantly awakens the senses and leaves skin feeling refreshed, light and beautifully clear, wash after lovely wash.',
    image: '/assets/manus/L21xa1JwUndRTFJveTd6b0xiM0Z1cEkvaW1hZ2UtMy53ZWJw.webp',
    alt: 'Editorial still life of golden lemons and a cut lemon half on a handmade ceramic dish.',
    products: ['BO-CRE-0005', 'FAC-CRE-0023', 'FAC-BAL-0027'],
  },
  {
    id: 'cocoa', name: 'Cocoa',
    description: 'Rich, velvety cocoa butter comes from cacao grown in Uganda’s warm, fertile red soil. Comforting and deeply moisturising, it gives our soaps and creams a luxurious, silky glide, leaving skin soft, smooth and wrapped in a gentle hint of chocolate.',
    image: '/assets/manus/L21xa1JwUndRTFJveTd6b0xiM0Z1cEkvaW1hZ2UtNC53ZWJw.webp',
    alt: 'Editorial still life of cacao, cocoa beans and ivory cocoa butter in dark carved wood.',
    products: ['Hair Butter', 'BO-CRE-0006', 'BO-CRE-0008', 'BO-SOA-0014', 'FAC-BAL-0026'],
  },
  {
    id: 'moringa', name: 'Moringa Leaf',
    description: 'Known as the miracle tree, moringa thrives across Uganda’s sunny landscapes. Its nutrient-rich leaves and seeds lend a light, silky feel to our creams and soaps, helping skin feel truly nourished, balanced and refreshed, with a soft, earthy green character.',
    image: '/assets/manus/L21xa1JwUndRTFJveTd6b0xiM0Z1cEkvaW1hZ2UtNS53ZWJw.webp',
    alt: 'Editorial still life of fresh moringa branches and small green leaflets on natural ceramics.',
    products: ['BO-SOA-0013', 'BO-OIL-0017'],
  },
  {
    id: 'coffee', name: 'Roasted Coffee',
    description: 'Freshly roasted Ugandan coffee awakens the senses and the skin alike. Naturally textured and richly aromatic, the grounds gently exfoliate in our soaps, leaving hands feeling wonderfully smooth, energised and renewed, with a warm aroma that lingers long after washing.',
    image: '/assets/manus/LzlZSlpIYUdLd0Z0MjhYYzl2ZWUyNkEvaW1hZ2UtMS53ZWJw.webp',
    alt: 'Editorial still life of roasted coffee beans and ground coffee in a shallow wooden bowl.',
    products: ['BO-CRE-0007', 'BO-SOA-0015', 'BO-OIL-0020', 'FAC-BAL-0028'],
  },
  {
    id: 'avocado', name: 'Avocado',
    description: 'Creamy, nutrient-rich Ugandan avocado is nature’s own gentle moisturiser. Packed with natural oils and essential vitamins, it melts effortlessly into our hand creams and body butters, cushioning dry, thirsty skin in soft, lasting, silky comfort and a smooth, healthy-looking glow.',
    image: '/assets/manus/LzlZSlpIYUdLd0Z0MjhYYzl2ZWUyNkEvaW1hZ2UtMi53ZWJw.webp',
    alt: 'Editorial still life of ripe avocado halves and a whole avocado on a warm ceramic plate.',
    products: ['Hair Butter', 'BO-CRE-0004', 'BO-SOA-0012', 'BO-OIL-0019', 'FAC-CRE-0024', 'HAI-CRE-0031', 'HAI-OIL-0032'],
  },
];

export function getRawMaterial(id) {
  if (typeof id !== 'string') return undefined;
  return RAW_MATERIALS.find((material) => material.id === id.trim().toLowerCase());
}
export function materialShopHref(id) {
  return `/shop.html?material=${encodeURIComponent(id)}`;
}
