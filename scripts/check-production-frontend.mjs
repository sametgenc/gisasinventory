import assert from 'node:assert/strict'
import { setTimeout } from 'node:timers/promises'

const origin = new URL(process.argv[2] || 'http://127.0.0.1:5295')
let available = false
for (let attempt = 0; attempt < 20; attempt++) {
    try {
        await fetch(new URL('/login', origin), { redirect: 'manual' })
        available = true
        break
    } catch {
        await setTimeout(100)
    }
}
assert.ok(available, 'The production frontend did not become available.')

for (const path of ['/login', '/help?task=inspect&step=0', '/assets', '/assets/types', '/assets/', '/shared-equipment', '/shared-usage']) {
    const response = await fetch(new URL(path, origin), { redirect: 'manual' })
    assert.equal(response.status, 200, `${path} must serve the app without redirecting.`)
    assert.match(response.headers.get('content-type') || '', /text\/html/, path)
    assert.match(response.headers.get('cache-control') || '', /no-store/, path)
    assert.match(await response.text(), /id="root"/, path)
}

const html = await (await fetch(new URL('/login', origin))).text()
const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1]
assert.ok(asset, 'The built JavaScript asset is missing from the app HTML.')
const script = await fetch(new URL(asset, origin), { redirect: 'manual' })
assert.equal(script.status, 200)
assert.match(script.headers.get('cache-control') || '', /max-age=31536000/)
assert.equal((await fetch(new URL('/assets/nonexistent.js', origin), { redirect: 'manual' })).status, 404)
console.log('Production HTTP checks passed: seven app URLs, cached built JavaScript, missing asset 404.')
