

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
- [x] Every header item opens its corresponding page: Shop shows the complete existing catalog; Body retains the existing sheabutter product; Hair and Health retain their current products; Skin has its own page awaiting a separate product assignment. Preserve clickable breadcrumbs and purchasing data.
- [x] Add a soft warm-cream fade between pages, respect reduced motion, preserve modified clicks/external links/anchors, and restore a visible usable page after browser Back/Forward.

## Customer accounts and wishlist
- [x] Menu navigator items open their designated Shop, Body, Hair, Skin, Health and About Us pages; preserve Skin as a separate new category, current hover/fade behavior and mobile dropdown.
- [x] Add a login/account section with real secure sign-in and explicit customer account creation. Persist each customer's name, verified email, optional phone and structured delivery details in the database; allow profile editing and logout; do not store credentials or customer profile details in browser storage.
- [x] Add an accessible heart button to every existing product on Home, Shop, and category pages, including future catalog products when rendered by the shared template. Signed-in registered customers can save and remove products and their wishlist persists privately per account.
- [x] The wishlist link, section and saved products appear only after a user creates a SheaBliss account and signs in. Guests see hearts but clicking one prompts account creation; unauthenticated/unregistered wishlist API access cannot reveal saved data.
- [x] Retain the existing bag, Yoco payment integration and Gmail order emails. Include profile/wishlist/session handling in privacy/cookie notices and migration notes; verify real session behavior and protected API responses without creating fake live users or writing test customer records into the shared production database.
- [ ] First actual customer completes provider sign-in and explicit SheaBliss registration, then checks profile saving, wishlist persistence and sign-out in the public site. Secure initiation reached the live branded provider sign-in page; credentials were not entered and no live customer was created during automated verification.
