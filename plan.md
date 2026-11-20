# SHEABLISS ORGANICS — Implementation & Design Plan

## Product scope
A single-page editorial storefront for SHEABLISS ORGANICS, an East African-inspired body care and self-care brand. The page includes: full-bleed hero, brand story, featured products, ingredient spotlight, lookbook/lifestyle gallery, testimonials, and newsletter/footer. The supplied hand-and-ice video is used as a muted visual interlude in the brand story area.

## Design direction
- **Design movement:** Heritage editorial / retro-modern beauty magazine — old-world print composition translated into a calm, contemporary storefront.
- **Core principles:** 1) typography is a visual object, 2) warmth before gloss, 3) craft and provenance without cliché, 4) retail clarity kept quiet and secondary.
- **Color philosophy:** warm cream and sand keep the canvas tactile rather than clinical; burnt terracotta carries the brand's ownable warmth; saffron/mustard adds sun and energy; espresso grounds the experience; muted teal gives the natural-world counterpoint.
- **Layout paradigm:** asymmetric editorial bands with offset columns, oversized type, horizontal rules, pull quotes, and image blocks that break the edge of the main content rail. Desktop uses a 12-column feel without a centered card wall; mobile collapses to a single rhythm while preserving offsets.
- **Signature elements:** raffia fringe separators, fine hairline rules, and small all-caps catalog labels. Product cards use a quiet wood/basket texture vocabulary rather than glossy ecommerce UI.
- **Interaction philosophy:** calm, tactile, and deliberate. Buttons are text-led. Product cards lift slightly on hover; anchors scroll smoothly; the hero video/image has gentle movement only.
- **Animation:** use IntersectionObserver for fade/slide-up reveals, a slow image translate on hero scroll, and no looping novelty effects. Respect `prefers-reduced-motion`.
- **Typography system:** Fraunces (loaded from Google Fonts) for display serif; DM Sans for body and labels. Headlines are large, tight, and slightly irregular through line breaks; labels use uppercase with 0.18em tracking.
- **Brand essence:** heritage-rooted self-care for modern rituals, made with warm natural ingredients and an East African point of view. Personality: grounded, sensorial, assured.
- **Brand voice:** sparse, warm, proud, never tourist-brochure. Example lines: “Made for the ritual you return to.” / “Care with roots.”
- **Wordmark & logo:** a text-led wordmark lockup with a small sun-disc / seed mark and a hairline underline, rendered as a CSS mark rather than a generic icon.
- **Signature brand color:** burnt terracotta `#B9573E`.

## Implementation approach
- Plain Vite + React + TypeScript-style JSX avoided in favor of a lightweight single-file vanilla app to keep the site dependency-light and easy to preview.
- `index.html` contains semantic sections and data attributes; `src/styles.css` contains all styling, responsive rules, texture patterns, and reduced-motion handling; `src/main.js` contains small interaction helpers and cart/newsletter feedback states. The raw-material section is scoped to `src/raw-materials.css` and initialized by `src/raw-materials.js` from `shared/raw-materials.mjs`.
- `public/assets/` stores the supplied video and existing editorial imagery. `shared/raw-materials.mjs` stores the seven editable ingredient slides and managed image URLs; `public/manus-routes.json` declares the page and material-filter routes.
- The storefront keeps the existing lightweight Vite frontend, while Yoco checkout is handled by a small Node server adapter. The browser sends the selected cart and delivery details to `/api/yoco/create-checkout`; the server validates product/price combinations against a shared catalog, calculates the amount in ZAR cents, creates a hosted Yoco Checkout session, and redirects the customer to the returned Yoco URL. The server never exposes the Yoco secret key.
- Yoco payment notifications are received at `/api/yoco/webhook`, verified against the raw request body, webhook ID, timestamp, and signed header, then persisted idempotently in the managed MySQL database. The payment return page is informational only; order status is granted from the verified webhook, not from query parameters.
- Yoco webhook subscriptions are provider-account configuration. The Development endpoint is ready, but the owner must register it in Yoco and save the one-time `whsec_...` signing secret through the protected environment input; Production requires the same step against the published domain.
- `server/yoco.mjs` owns provider calls, request validation, webhook verification, and order persistence. `shared/catalog.mjs` is the server/client-safe source of product variants and prices. `server.mjs` serves the built frontend and API in production; `vite.config.js` mounts the same API handler in Preview. A committed Dockerfile and deploy declaration make the server-backed site publishable.
- The dev server serves on port 3000; `npm run dev -- --host 0.0.0.0` is the preview command. The production build uses Vite and outputs `dist/`.

## Information architecture
1. Hero: brand name, heritage-rooted tagline, shop CTA, editorial hero image.
2. Story: short narrative + hands/product image, then muted video interlude.
3. Products: four quiet retail cards with sand/wood visual texture.
4. Ingredients: four icon-led natural ingredient callouts.
5. Lookbook: four-image offset gallery and a pull quote.
6. Testimonials: three warm-toned quote cards.
7. Newsletter/footer: espresso panel with woven divider and compact navigation.

## Project structure
- `index.html` — semantic page shell, metadata, page sections.
- `src/styles.css` — design tokens, layout, responsive behavior, animation; `src/raw-materials.css` is scoped to the dynamic material showcase.
- `src/main.js` — scroll reveal, hero parallax, cart notice, newsletter form behavior, nav toggle.
- `src/raw-materials.js` — array-driven material carousel, pause reasons, bounded image loading and ceramic fade.
- `shared/catalog.mjs` — canonical product variants and ZAR prices used to validate checkout totals, plus category/material filtering helpers.
- `shared/raw-materials.mjs` — editable material copy, image sources and explicit catalog memberships.
- `server/yoco.mjs` — Yoco Checkout API, signed webhook verification, and managed-database order updates.
- `server.mjs` — production HTTP server for the built Vite frontend and Yoco API routes.
- `Dockerfile` — production install, build, and server entrypoint contract.
- `public/assets/` — existing editorial imagery and supplied video; generated material stills remain in managed storage until localization.
- `public/manus-routes.json` — route manifest for the managed preview.
- `package.json`, `vite.config.js`, `app.config.ts` — tooling and project metadata.

## Customer accounts and saved rituals — November 2026
The six primary menu links retain their designated pages (Shop, Body, Hair, Skin, Health, About Us). Skin is an independent new range and is not a duplicate of Body. Add a separate account area using real Manus OAuth and registered SheaBliss customer records, rather than browser-only accounts or passwords stored in the app. OAuth verifies identity; an explicit customer registration with acceptance of the account terms creates the SheaBliss profile. Customers can edit their name, phone number, and optional structured delivery address. Customer records and per-customer wishlist rows live in the existing managed MySQL database, with validated sessions, CSRF protection and ownership checks. Keep orders, Yoco and Gmail behavior unchanged.

`account.html` and `src/account.js` present sign-in, account creation and profile editing. `wishlist.html` and `src/wishlist-page.js` display the saved collection only to registered signed-in customers; guests see only an account invitation. `src/customer-session.js` shares the real session state with header controls and `src/wishlist.js` manages product heart buttons across Home, Shop, category and saved-product views. Guests can see hearts, but selecting one directs them to account creation; no wishlist collection or link is shown until registration succeeds. `server/accounts.mjs` owns OAuth, secure application cookies, profiles and wishlist APIs; an additive migration script creates only account-related tables. Source and production server adapters mount the same handler.

Maintain the existing warm-cream editorial design, fine outlined hearts, quiet terracotta selected states, generous forms, and reduced-motion behavior. Account information never enters localStorage; only product choices may be stored there. Privacy and cookie notices describe account identity, saved delivery details, wishlist storage and session cookies. Migration to GoDaddy must separately verify OAuth redirect acceptance and managed authentication availability before customer sign-in is described as portable.

## Approved spreadsheet catalog — 15 November 2026
Import all 32 rows from SHEABLISS-PRODUCTLIST.xlsx as separate SKU-backed catalog records while retaining the three existing, priced products. Map FACE to the public Skin category; Body covers body/hand care, Skin covers face/lip care, Hair covers hair care, and Health retains existing wellness products. Store primary category, multiple category memberships where the workbook explicitly supports multiple uses, subcategory/product type, suitable-for wording, source item number/code, and review notes separately from the display name. Keep possible duplicate formulas as distinct records until confirmed; no automatic shared-stock merging. Flag the ambiguous shea-butter/soap row and distinguish palm kernel oil as a soap-making ingredient. Correct the lip balm's inconsistent OIL code while retaining its source code for traceability.

`shared/product-list.mjs` contains reproducibly imported workbook records; `scripts/import-product-list.py` reads the supplied real workbook and applies the approved deterministic naming/category mapping. `shared/catalog.mjs` owns category definitions, display-name and membership helpers, purchase eligibility, and canonical variant lookup. Existing checkout identifiers and confirmed variants remain compatible. Every imported product initially has no approved variants and cannot enter the bag or Yoco; never turn blank prices into zero or Infinity. Shop/category templates offer category and product-type navigation, render unpriced products transparently, and preserve hearts and account-only wishlists. Multi-category products retain one record per SKU; separate suspected duplicate rows stay distinct. No new photographs or benefit claims are invented.

## Dynamic raw-material showcase — 17 November 2026
Replace only the homepage section at #ingredients. Preserve its anchor, existing page palette, Fraunces / DM Sans typography, navigation, product carousel, checkout and account behavior. A seven-entry editable array in `shared/raw-materials.mjs` owns IDs, exact supplied names/descriptions, image sources/alt text and Shop links. The entries are Raw Shea Butter, Papaya, Lemon, Cocoa, Moringa Leaf, Roasted Coffee and Avocado. Generate seven independent original portrait 4:5 ingredient still lifes: warm earthy editorial luxury, muted cream/sand/terracotta/wood tones, subjects toward the left with negative space to the right, no text/logos/hands. These are ingredient illustrations, not fabricated photographs of branded products.

The desktop section uses a 55% portrait image / 45% vertically centered copy split; mobile stacks image above copy. Keep the counter, elegant title, exact description, Used in control, quiet Shop products underline link, and numbered manual selectors. Used in expands a current-material list of catalog names and links; Shop products opens `/shop.html?material=<id>`. Ingredient-family mapping is explicit and uses only names and descriptions supplied in the catalog: shea, papaya, lemon, cocoa, moringa, coffee, avocado. Family labels do not fabricate a full formulation or claim leaf/ground/oil interchangeability. Preserve category and product-type filters alongside material filtering and avoid narrowing a category with an incompatible previous range.

`src/raw-materials.js` owns the local carousel controller; scoped CSS in `src/raw-materials.css` avoids leaking changes to other storefront sections. Motion prevents abrupt editorial changes: outgoing image is split into three vertical blocks with 6px gutters, fading 1 to 0 for 700ms at 0/150/300ms using cubic-bezier(0.22,1,0.36,1), with the next image underneath. Copy exits over 300ms, swaps, then enters over 500ms from +12px. Only opacity/transform animate. Autoplay runs every six seconds, loops and pauses on hover, focus, an explicit pause control, hidden/offscreen state and expanded Used in details. Resume appropriately without stacking timers. Manual actions follow the same transition; latest requested slide wins during rapid input. Reduced motion uses a short uniform opacity crossfade, no stagger or translation. Decode/preload the next image before changing so failed/slow assets cannot flash blank. Explicit content controls remain keyboard/touch accessible; no new motion dependency is needed.
