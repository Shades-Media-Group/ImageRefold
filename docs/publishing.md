# Publishing to the Figma Community

The first release, with the Shades Media Group account. Every field below is copy you can paste.

## Before you start

- A Figma account for Shades Media Group with **two-factor authentication** on (the Community requires it to publish), and the **Figma desktop app**.
- A fresh build: `yarn build`. The Community upload takes `apps/figma-plugin/dist`.
- Store images: `yarn build && yarn store-assets` renders `assets/store/figma-cover.png` from real screenshots of the plugin.

## 1. Get the plugin's ID (once)

The manifest carries the permanent Community ID `1691223547839147813`. For a fresh fork, Figma issues a new one:

1. In Figma desktop, **Plugins → Development → New plugin…**, choose **Figma design**, name it **ImageRefold**, and save it anywhere.
2. Copy the `id` from the generated `manifest.json`.
3. Put it in `apps/figma-plugin/manifest.json`, commit (`chore(figma-plugin): set the Community plugin id`), and run `yarn build`.
4. **Plugins → Development → Import plugin from manifest…** and pick `apps/figma-plugin/manifest.json`.
5. Try it on a real file: export a frame in each format, run Optimise on a page with photos, import a WebP.

## 2. Publish

1. **Plugins → Development → Manage plugins in development**, then **Publish** next to ImageRefold.
2. Fill in:

| Field                   | Value                                                                             |
| ----------------------- | --------------------------------------------------------------------------------- |
| Name                    | ImageRefold — Compress & Export WebP, AVIF, JPG, PNG                              |
| Tagline                 | Export smaller WebP, AVIF, JPG and PNG, see each size first, and slim your files. |
| Icon (128 × 128)        | `assets/brand/png/app-icon-128.png`                                               |
| Cover art (1920 × 1080) | `assets/store/figma-cover.png`                                                    |
| Tags                    | compress, export, webp, avif, optimize                                            |
| Support contact         | support@shades.md                                                                 |
| Publisher               | Shades Media Group                                                                |

**Description**

```
Export any layer as a smaller WebP, AVIF, JPG or PNG, see every file's size before you save, make the images in your file lighter, and bring new images in already compressed. Free, with no limits and no account.

EXPORT
• WebP, AVIF, JPG and PNG, lossy or lossless, with one quality slider
• Any size: 0.5×, 0.75×, 1×, 1.5×, 2×, 3×, 4× or an exact width, several at once
• Each file's size and saving before you download, and the result at 100% with hold-to-compare
• One file downloads as it is; several go into one ZIP named after what's inside, or as separate files
• Names from the layer, with a pattern you can change; a slash in a layer name makes a folder in the ZIP
• A PNG is never larger than Figma's own export

OPTIMISE
Finds images far larger than they are shown, shrinks them to twice their shown size, compresses them and swaps them in place. Images that would not get smaller stay as they are. One undo step.

IMPORT
Drop PNG, JPG, GIF, WebP or AVIF files: each is compressed and fitted to Figma's 4096 px limit, then placed or used as the fill of the selected layers.

PRIVATE BY DESIGN
Images are encoded on your computer with built-in encoders (MozJPEG, libwebp, libavif, OxiPNG). The plugin has no network access at all.

Free and open source, built by Shades Media Group.
https://github.com/Shades-Media-Group/ImageRefold
https://imagerefold.shades.md
```

3. Answer the data question: the plugin collects no data. Network access: none (the manifest says `"allowedDomains": ["none"]`).
4. **Submit for review.** Figma reviews new plugins in about a week.

## After it's live

1. Put the Community URL in `apps/site/src/links.ts` (`FIGMA`) and in the README's links, then `yarn deploy:site`.
2. Change the site's hero note and install section from "in development" to the release.
3. Cut a release: `yarn release minor`, then `git push --follow-tags`.
