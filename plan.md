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
- `index.html` contains semantic sections and data attributes; `src/styles.css` contains all styling, responsive rules, texture patterns, and reduced-motion handling; `src/main.js` contains small interaction helpers and cart/newsletter feedback states.
- `public/assets/` stores the supplied video and generated editorial imagery. `public/manus-routes.json` declares `/`.
- No backend, login, or database is needed for this static editorial storefront.
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
- `src/styles.css` — design tokens, layout, responsive behavior, animation.
- `src/main.js` — scroll reveal, hero parallax, cart notice, newsletter form behavior, nav toggle.
- `public/assets/` — generated stills and supplied video.
- `public/manus-routes.json` — route manifest for the managed preview.
- `package.json`, `vite.config.js`, `app.config.ts` — tooling and project metadata.
