/**
 * Serves the static site. Other names for it, such as imagereframe.shades.md,
 * redirect permanently to the one address, so search engines see one site.
 */
interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

const HOST = 'imagerefold.shades.md'

export default {
  fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    if (url.hostname !== HOST && url.hostname.endsWith('.shades.md')) {
      url.hostname = HOST
      return Response.redirect(url.toString(), 301)
    }
    return env.ASSETS.fetch(request)
  },
}
