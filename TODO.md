

## Cookies Policy page
- Add a dedicated Cookies Policy page linked from the storefront footer and declared in the managed route manifest.
- Explain essential cookies/local storage, analytics, checkout/payment-provider behavior, cookie choices, third-party services, retention, policy updates, and the SHEABLISS contact email in the existing editorial visual style.

## Compact product carousel
- [x] Short visual panels with product name, size, price, ingredient note and Add to bag outside and below each panel; preserve carousel dragging and existing purchasing data.
- [x] On desktop, reveal details on panel hover or keyboard focus; conceal inactive purchasing controls and keep details readable on the sand background.
- [x] On mobile and non-hover devices, display details below each panel immediately with readable contrast.
- [ ] Replace the panel artwork with the user's supplied product images once provided; retain the current artwork until then.

## Header pages and cream fade
- [x] Remove Home from the header menus and display Shop, Body, Hair, Skin, Health, About Us in exactly that order on desktop and in the mobile dropdown. Keep the logo as the home link and preserve centered navigation and hover lift.
- [x] Every header item opens its corresponding page: Shop shows the complete catalog; Body retains the existing sheabutter product; Hair and Health retain their current products; Skin is a separate face/lip care collection populated from the approved product list. Preserve clickable breadcrumbs and purchasing data.
- [x] Add a soft warm-cream fade between pages, respect reduced motion, preserve modified clicks/external links/anchors, and restore a visible usable page after browser Back/Forward.

## Customer accounts and wishlist
- [x] Menu navigator items open their designated Shop, Body, Hair, Skin, Health and About Us pages; preserve Skin as a separate new category, current hover/fade behavior and mobile dropdown.
- [x] Add a login/account section with real secure sign-in and explicit customer account creation. Persist each customer's name, verified email, optional phone and structured delivery details in the database; allow profile editing and logout; do not store credentials or customer profile details in browser storage.
- [x] Add an accessible heart button to every existing product on Home, Shop, and category pages, including future catalog products when rendered by the shared template. Signed-in registered customers can save and remove products and their wishlist persists privately per account.
- [x] The wishlist link, section and saved products appear only after a user creates a SheaBliss account and signs in. Guests see hearts but clicking one prompts account creation; unauthenticated/unregistered wishlist API access cannot reveal saved data.
- [x] Retain the existing bag, Yoco payment integration and Gmail order emails. Include profile/wishlist/session handling in privacy/cookie notices and migration notes; verify real session behavior and protected API responses without creating fake live users or writing test customer records into the shared production database.
- [ ] First actual customer completes provider sign-in and explicit SheaBliss registration, then checks profile saving, wishlist persistence and sign-out in the public site. Secure initiation reached the live branded provider sign-in page; credentials were not entered and no live customer was created during automated verification.

## Shop category navigation
- [x] Show a visible Skin category link within the Shop page content, alongside Body, Hair and Health; open the dedicated Skin page and preserve Skin as a separate category without reassigning existing Body products.

## Approved product-list catalog
- [x] Import all 32 spreadsheet entries with clear display names, source codes/item numbers, product types, suitable-for labels and supplied benefits; retain the three current priced products without merging them with unconfirmed spreadsheet formulations.
- [x] Use Body, Skin, Hair and Health as separate categories; map FACE to Skin, add product-type subcategories, support explicit multi-use category memberships, and keep potential duplicate rows separate until their formulations are confirmed.
- [x] Flag the ambiguous shea-butter/soap row, label Palm Kernel Oil as a soap-making ingredient, distinguish butters from creams where clear, and correct the lip balm's inconsistent product code while preserving its source reference.
- [x] Show new products on Shop and relevant category pages with functional category/product-type navigation and heart buttons; render names and availability safely in private wishlists without Infinity or invented prices.
- [x] Leave all imported products non-purchasable until sizes and prices are approved; reject unavailable/unpriced products in canonical checkout lookup and saved-bag hydration. Preserve existing prices, cart persistence, Yoco validation, customer accounts and Gmail order confirmations.

## About Us preview edits — 87f720c8-28f6-4aa3-92ea-73375e945534
- [x] In the People and Their Culture paragraph, change the opening Tooro to Toro and Batooro to Batoro; keep Rutooro and all other text unchanged. In the Ecosystem paragraph, change only the opening Tooro to Toro. Preserve section IDs, images, headings, adjacent paragraphs, layout and existing navigation/customer behavior.

## Raw Shea Butter product rename
- [x] Rename spreadsheet item 1 / BO-CRE-0001 from Moisturised (displayed as Moisturising) Shea Butter to Raw Shea Butter in the catalog and importer; preserve its SKU, category, other details, availability and existing saved wishlist references.

## Dynamic raw-material showcase
- [x] Replace the existing The Raw Material section with seven editable array-driven slides: Raw Shea Butter, Papaya, Lemon, Cocoa, Moringa Leaf, Roasted Coffee and Avocado, using the supplied descriptions and seven matching AI-generated warm earthy editorial still lifes with no text, logos or hands.
- [x] Desktop: left 55% portrait 4:5 image and right 45% vertically centered text with counter, material name, description, Used in button, underline-hover Shop products link and numbered manual selectors. Mobile: image above text with the same transition. Retain the established warm palette, serif/sans-serif fonts, deep-brown copy, generous padding and no heavy borders/shadows.
- [x] Ceramic fade: three vertical image blocks with 6px gutters; each fades opacity 1 to 0 over 700ms with cubic-bezier(0.22,1,0.36,1), staggered at 0/150/300ms to reveal the next image below. Copy fades out for 300ms, swaps and fades in for 500ms from +12px. Reduced motion uses a simple crossfade without translation or stagger.
- [x] Autoplay every six seconds, looping; pause on hover and resume on leave. Numbered selectors jump using the same transition. Include accessible pause/focus handling, reliable latest-input transitions and safe image loading so interaction cannot leave mismatched text or blank imagery.
- [x] Used in reveals matching catalog products and Shop products opens Shop filtered by that material. Match only supported ingredient families, retain category/type filters and account-only hearts/wishlists, preserve all existing product identifiers, prices, unpriced safeguards, checkout, Gmail/Yoco and unrelated sections.
