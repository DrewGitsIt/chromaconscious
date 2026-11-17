// Calls the real API handler in-process (bundled by esbuild), so no key or network is needed.
// usage: node api.mjs <bundle> <path?query> [authorized=1]
const [bundle, path] = process.argv.slice(2)
const { handle } = await import(bundle)
const store = new Map()
const env = { THEMES: { get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) }, CHROMACONSCIOUS_API_KEYS: 'local' }
const go = async (p) => (await handle(new Request(`https://x.test/api/chromaconscious/v1/${p}`, { headers: { Authorization: 'Bearer local' } }), env)).text()
const summary = await go(path)
const id = summary.match(/t_[A-Za-z0-9_-]+/)[0]
console.log(summary)
console.log('=====CSS=====')
console.log(await go(`export?theme=${id}&format=css`))
