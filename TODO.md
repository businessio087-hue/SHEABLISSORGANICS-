

## Shop ritual catalog and price selection
- Replace the current shop ritual items with exactly these products and prices: Skin — Organic Sheabutter — info: "unrefined shea butter, Raw shea butter with citronelle" — 100g R100, 200g R180, 500g R380, 1kg R700, 5kg R3,000; Hair — hair butter — info: "Organic shea butter, Avocado oil and cocoa butter blend" — 250g R200; Health — Mucuna Puriens (Beans) — info: "Organically grown Nootropic" — 100g R250 and 200g R150.
- Product information appears as the user browses/hover-focuses over a product card.
- Price options are hidden by default and appear only when the product is chosen; selecting a price option adds the chosen product/size to the ritual bag.
- Preserve the existing editorial storefront style, responsive layout, and accessible keyboard/touch interaction.

## Yoco sandbox paywall and payment confirmation
- The existing Bag checkout portal sends the selected product variants, quantities, customer name, email, and delivery address to a server-side checkout endpoint; the browser does not receive or expose the Yoco secret key.
- The server validates each product/size combination against the SHEABLISS catalog, calculates the payable amount from the server-side catalog in South African rand cents, and creates a Yoco hosted Checkout API session with ZAR currency, an idempotency key, line items, and success/cancel/failure return URLs.
- On successful checkout creation, the customer is redirected to the Yoco hosted checkout URL; when the checkout cannot be created, the portal shows a clear error and does not claim that payment was made.
- A Yoco webhook endpoint verifies the raw request body, webhook ID, timestamp, and webhook signature before processing payment events; successful and failed payment states are recorded without storing card numbers, CVVs, expiry dates, raw webhook payloads, or API keys.
- Payment records are persisted idempotently in the managed database with the order ID, Yoco checkout/payment identifiers, amount, currency, status, customer details, and selected items; duplicate webhook deliveries do not duplicate or regress fulfillment state.
- Return-page messaging distinguishes a customer returning from Yoco from verified payment confirmation; only a verified successful webhook marks an order paid.
- The integration runs with Yoco test credentials in Development and is structured so live credentials can be supplied separately for Production after domain verification.
- A Yoco Development webhook subscription must be registered to `https://8328-izt9cluo42ornv57otv37-f9474ca2.us4.manus.computer/api/yoco/webhook` (and the published site URL after launch); its one-time `whsec_...` signing secret must match the protected `YOCO_WEBHOOK_SECRET` value before test payment callbacks can mark orders paid.
