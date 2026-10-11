export const REPO = 'https://github.com/Shades-Media-Group/ImageRefold'
// The Community listing goes here once the plugin is published; until then, the repository.
export const FIGMA = REPO
export const SHADES = 'https://shades.md'

/** Every `data-link` in the page templates, resolved when the pages are built. */
export const LINKS: Record<string, string> = {
  figma: FIGMA,
  repo: REPO,
  shades: SHADES,
  changelog: `${REPO}/blob/main/CHANGELOG.md`,
  releases: `${REPO}/releases`,
  issues: `${REPO}/issues/new/choose`,
  security: `${REPO}/blob/main/SECURITY.md`,
  license: `${REPO}/blob/main/LICENSE`,
  preferred: 'https://www.google.com/preferences/source?q=imagerefold.shades.md',
}
