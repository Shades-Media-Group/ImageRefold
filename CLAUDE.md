# ImageRefold: working notes for agents

ImageRefold is a Figma plugin that compresses and exports images (WebP, AVIF, JPG, PNG) and brings images into Figma already compressed. It is free, open source and local-only, and it belongs to the Shades product family with PageRecast. Product truth lives in [PRODUCT.md](PRODUCT.md); the rejected patterns every Shades product avoids live in Gradient's [lessons](https://github.com/Shades-Media-Group/gradient/blob/main/docs/lessons.md). Read both before any visual work.

## Commands

```bash
yarn verify        # typecheck, lint, unit tests, plugin build, site build and SEO check: before every commit
yarn dev:plugin    # rebuild the plugin on change
yarn dev:harness   # the plugin window in a browser at /apps/figma-plugin/harness.html, Figma stood in
yarn dev:site      # the website with live reload
yarn deploy:site   # build, check, wrangler deploy to imagerefold.shades.md
yarn brand         # regenerate every logo file from one geometry
yarn assets        # README banners, social card, touch icon (after yarn brand)
yarn release <patch|minor|major>   # then git push --follow-tags
```

Use Node 22: `export PATH=$HOME/.nvm/versions/node/v22.23.1/bin:$PATH`; the shell defaults to an older Node.

## Non-negotiables

- **Free forever:** no payments, plans, limits, accounts, watermarks or upgrade prompts anywhere.
- **Nothing leaves the user's machine.** The plugin manifest allows no network domains. Encoders run in a Web Worker in the plugin window, from WebAssembly embedded by `build.mjs` (`?base64` imports). No analytics, no remote logging.
- **Never make it worse:** a PNG export is never larger than Figma's own PNG; Optimise swaps an image only when the new one is smaller.
- **The UI kit is PageRecast's:** `apps/figma-plugin/src/ui/kit` copies its tokens, components and icons. `src/ui/app.css` layers Gradient's pill controls over it for this panel. Kit changes go to both plugins, or neither.
- **Light by default:** `data-theme` on `<html>` is `light`, `dark` or `auto` (follows Figma's `figma-dark` class), chosen in Settings and saved with the other preferences. Same values and labels as PageRecast.
- **Credits:** in the product and its listing, "Free and open source. Built by Shades Media Group". In the README, "Built by Cristian Brinza | Shades Media Group".
- **Never name or compare against other products in anything public:** README, docs, UI, site, commits, listings. Market research stays in `PLAN.md` and `research/`, both git-ignored. `research/banned.txt` lists names the site's SEO check rejects.
- **Never invent proof:** no made-up savings, user counts, ratings or testimonials. Numbers on the site come from real encodes.
- **One source per value:** the logo geometry in `scripts/brand.mjs`; generated files are never edited by hand.
- **Commits:** conventional, one logical change each, no AI attribution or Co-Authored-By lines.

## Brand

- **Mark:** "Scale", three rounded squares sharing their bottom-left corner (red 80, rose 54, ink 30 on a 96 grid). On dark grounds the ink square turns paper; on red grounds the red square turns paper.
- **Palette:** PageRecast's: red `#F9000A`, rose `#FF8299`, ink `#0A0A0B`, paper `#FDFDFC`. Rose appears only inside the mark.
- **Type:** Space Grotesk 700 for the wordmark, Hanken Grotesk for everything else.

## Design rules

The plugin panel matches PageRecast's: the grammar of Figma's own inspector, full-bleed sections with hairline dividers, 32 px rows, 11–13 px Hanken Grotesk, text tabs, one red primary action per view. The website follows the PageRecast site, in the same eleven languages (`apps/site/i18n/*.json`, one dictionary per language; every key in each): full-bleed chapters alternating paper, ink and one red, a two-column chapter head, pill buttons, lists on hairlines.

Never ship any of these:

- skeleton illustrations, fake browser windows, mock app screens, made-up sample images
- monospace for numbers, sizes or metadata (use tabular figures, `.g-num`); monospace is for code only
- eyebrow labels, tracked small caps above headings, decorative section numbers
- icons on every row, an icon in a circle as the centre of an empty state
- cards inside cards, lists in rounded boxes, tinted callout boxes, coloured side borders
- gradient text, glass, glow, decorative blur, 3D or shadowed logos
- emoji or Unicode glyphs as icons
- italic buttons or links

Before committing UI:

1. Look at the changed pages in light and dark, at 375 and 1440 px.
2. Run `impeccable detect` on the changed templates and CSS.
3. Run `yarn verify`.

## Versions

The root `package.json` version is the only version; `yarn release` bumps every workspace, writes the changelog and tags.
