import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
function worker() {
  const handlers: Record<string, Function> = {};
  const cache = { match: vi.fn(), put: vi.fn(async () => undefined) };
  const caches = { open: vi.fn(async () => cache), keys: async () => ['menu-builder-v5', 'unrelated-app'], delete: vi.fn(async () => true) };
  const fetcher = vi.fn(async () => new Response('fresh', { headers: { 'content-type': 'text/javascript' } }));
  vm.runInNewContext(readFileSync('public/sw.js','utf8'), { self: { location: { origin: 'https://a.test' }, addEventListener: (name: string, fn: Function) => handlers[name] = fn, skipWaiting: async () => {}, clients: { claim: async () => {} } }, URL, Response, caches, fetch: fetcher, console });
  function request(path: string, mode = 'cors', destination = '', headers = {}, method = 'GET') {
    let response: Promise<Response> | undefined;
    handlers.fetch({ request: { method, url: 'https://a.test' + path, mode, destination, headers: new Headers(headers) }, respondWith: (r: Promise<Response>) => response = r, waitUntil: () => {} });
    return response;
  }
  return { handlers, cache, caches, fetcher, request };
}
describe('P0 service worker boundaries', () => {
  it('deletes only obsolete own caches on upgrade', async () => {
    const w = worker(); let ready: Promise<void> | undefined;
    w.handlers.activate({ waitUntil: (p: Promise<void>) => ready = p }); await ready;
    expect(w.caches.delete).toHaveBeenCalledExactlyOnceWith('menu-builder-v5');
  });
  it('does not intercept API, quote, checkout, RSC or mutable images', () => {
    const w = worker();
    for (const path of ['/api/public/menus/a', '/menu?_rsc=abc', '/uploads/a.jpg']) expect(w.request(path)).toBeUndefined();
    expect(w.request('/menu', 'navigate', '', { RSC:'1' })).toBeUndefined();
    expect(w.request('/api/quote', 'cors', '', {}, 'POST')).toBeUndefined();
  });
  it('never caches documents and falls back only for offline documents', async () => {
    const w = worker(); await w.request('/menu', 'navigate'); expect(w.caches.open).not.toHaveBeenCalled();
    w.fetcher.mockRejectedValue(new Error('offline'));
    const response = await w.request('/product/p', 'navigate');
    expect(response?.status).toBe(503); expect(response?.headers.get('content-type')).toContain('text/html');
  });
  it('caches static assets but rejects HTML responses', async () => {
    const w = worker(); await w.request('/_next/static/chunks/hashed.js','cors','script'); expect(w.cache.put).toHaveBeenCalledOnce();
    w.cache.put.mockClear(); w.fetcher.mockResolvedValue(new Response('login', {headers:{'content-type':'text/html'}}));
    await w.request('/_next/static/chunks/other.js','cors','script'); expect(w.cache.put).not.toHaveBeenCalled();
  });
});
