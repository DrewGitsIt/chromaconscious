/**
 * Cloudflare Worker entry. Bind a KV namespace as THEMES.
 *
 * The warm-up runs at module load, outside any request: on a fresh isolate
 * the first request cost ~20 ms of CPU against ~1.3 ms warm, almost all of it
 * compiling the request path, and a request should not pay for that. Whether
 * start-up CPU counts against a request's limit is Cloudflare's rule to
 * confirm before relying on it — see docs/remote-api-spec.md.
 */
import type { Env } from './handler'
import { handle, warmUp } from './handler'

warmUp()

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
}
