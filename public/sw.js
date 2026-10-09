/*
 * Offline service worker (plans/phase-3.md §2). Hand-written, no dependencies.
 *
 * This file is a template: after `next build`, scripts/sw-manifest.ts replaces
 * the BUILD line below in out/sw.js with this build's version and precache
 * list (also written to out/sw-precache.json). The version changes with every
 * build, so every deploy is a byte-different sw.js and the browser installs it.
 * Unprocessed (BUILD = null) the worker caches nothing and unregisters itself.
 *
 * - Install: precache every exported page, RSC payload, /_next/static file and
 *   icon. Hashed /_next/static files already held by an older version are
 *   copied instead of downloaded again.
 * - Pages (navigations): network first; offline, or when the host has no file
 *   at that URL, the page precached by this version (not updated from the
 *   network, so it always matches this version's /_next/static files). /today, /today/, /today.html and
 *   /practice?type=… all map to /today.html or /practice.html (query ignored),
 *   since Cloudflare Pages serves /today for today.html and plain static servers
 *   only serve /today.html.
 * - /_next/static: cache first (file names are content hashes).
 * - Other same-origin GETs (RSC payloads, icons, manifest): network first,
 *   cache fallback, query ignored.
 * - TTS Worker audio (base URL passed as ?tts= when registering): cache on
 *   first play, successful audio only, least recently played dropped past 300
 *   clips. Byte-range requests are answered from the cached clip.
 * - No skipWaiting: a new version waits until every tab of the app is closed
 *   and takes over on the next visit, never mid-session. Activation deletes
 *   older shell caches; the audio cache is kept across versions.
 */

const BUILD = null; // replaced by scripts/sw-manifest.ts

const PREFIX = "polish-";
const AUDIO_CACHE = `${PREFIX}audio-v1`;
const AUDIO_MAX = 300;
const TTS_BASE = (new URL(self.location.href).searchParams.get("tts") || "").replace(/\/+$/, "");

if (!BUILD) {
  // not a processed build (or deliberately disabled): get out of the way
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX)).map((k) => caches.delete(k))))
        .then(() => self.registration.unregister()),
    );
  });
} else {
  const SHELL_CACHE = `${PREFIX}shell-${BUILD.version}`;

  /** The cache key of the page a URL shows: "/" → "/index.html", "/today/" → "/today.html". */
  const pageKey = (url) => {
    let path = url.pathname.replace(/\/+$/, "");
    if (path === "") return "/index.html";
    if (path.endsWith("/index.html")) path = path.slice(0, -"/index.html".length) || "/index";
    return path.endsWith(".html") ? path : `${path}.html`;
  };

  /** A storable copy: drops the "redirected" flag, which a navigation must not be answered with. */
  const plain = async (res) =>
    res.redirected
      ? new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers })
      : res;

  self.addEventListener("install", (event) => {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const queue = [...BUILD.files];
        const worker = async () => {
          for (let file = queue.shift(); file; file = queue.shift()) {
            if (file.startsWith("/_next/static/")) {
              const old = await caches.match(file);
              if (old) {
                await cache.put(file, old);
                continue;
              }
            }
            const res = await fetch(file, { cache: "no-cache" });
            if (!res.ok) throw new Error(`precache ${file}: ${res.status}`);
            await cache.put(file, await plain(res));
          }
        };
        await Promise.all(Array.from({ length: 6 }, worker));
      })(),
    );
  });

  self.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => k.startsWith(`${PREFIX}shell-`) && k !== SHELL_CACHE)
            .map((k) => caches.delete(k)),
        );
        // first install only in practice: an update activates once no tab is open
        await self.clients.claim();
      })(),
    );
  });

  const page = async (request) => {
    const key = pageKey(new URL(request.url));
    const cache = await caches.open(SHELL_CACHE);
    try {
      const res = await fetch(request);
      if (res.type === "opaqueredirect") return res; // e.g. /today.html → /today on Pages
      if (res.ok) return res;
      // the host has no file at this URL (a plain static server asked for /today)
      return (await cache.match(key)) || res;
    } catch {
      return (await cache.match(key)) || (await cache.match("/404.html")) || Response.error();
    }
  };

  const cacheFirst = async (request) => {
    const cache = await caches.open(SHELL_CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    const res = await fetch(request);
    if (res.ok && res.type === "basic") cache.put(request, res.clone()).catch(() => {});
    return res;
  };

  const networkFirst = async (request) => {
    try {
      return await fetch(request);
    } catch (error) {
      const cache = await caches.open(SHELL_CACHE);
      const hit = (await cache.match(request)) || (await cache.match(request, { ignoreSearch: true }));
      if (hit) return hit;
      throw error;
    }
  };

  self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin === self.location.origin) {
      if (request.mode === "navigate") event.respondWith(page(request));
      else if (url.pathname.startsWith("/_next/static/")) event.respondWith(cacheFirst(request));
      else if (url.pathname !== "/sw.js") event.respondWith(networkFirst(request));
    } else if (TTS_BASE && url.href.startsWith(`${TTS_BASE}/tts?`)) {
      event.respondWith(audio(request));
    }
  });
}

/** A TTS clip: from the audio cache (refreshing its place in the LRU order), else fetched whole and cached. */
async function audio(request) {
  const cache = await caches.open(AUDIO_CACHE);
  const key = request.url;
  let res = await cache.match(key);
  if (res) {
    // most recently played goes last; trimming drops from the front
    await cache.delete(key);
    await cache.put(key, res.clone());
  } else {
    // without the Range header, so the whole clip comes back and can be stored
    res = await fetch(key, { mode: "cors", credentials: "omit" });
    const type = res.headers.get("content-type") || "";
    if (res.status !== 200 || !type.startsWith("audio/")) return res;
    await cache.put(key, res.clone());
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - AUDIO_MAX)).map((k) => cache.delete(k)));
  }
  return ranged(request, res);
}

/** Answers a byte-range request (media elements send them) from a whole cached clip. */
async function ranged(request, res) {
  const range = request.headers.get("range");
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (!match || (match[1] === "" && match[2] === "")) return res;
  const body = await res.arrayBuffer();
  const size = body.byteLength;
  let start;
  let end;
  if (match[1] === "") {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  const headers = new Headers(res.headers);
  if (start > end || start >= size) {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, statusText: "Range Not Satisfiable", headers });
  }
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, statusText: "Partial Content", headers });
}
