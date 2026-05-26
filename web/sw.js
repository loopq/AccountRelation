// 账号图谱 Service Worker —— 只缓存静态应用壳，绝不碰 Supabase / 任何外部请求。
// 安全红线：解密后的明文只在页面内存，本就不走网络；密文/凭证由「非本站请求直接放行」兜底，永不入缓存。
const CACHE = 'ag-shell-v1';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon-180.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // 路由 1：非 GET，或非本站 host（Supabase / CDN / 任何外部）→ 完全不介入。
  // 这一条同时保证 Supabase 密文/凭证永不被缓存或篡改，客户端加密安全模型不变。
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // 路由 2：导航请求（打开 index.html）→ 网络优先，失败回退缓存壳。
  // 保住「推 commit → 下次打开自动新版」；离线时回退缓存。
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // 路由 3：本站静态资源（icons / manifest）→ 缓存优先，未命中再网络并写回。
  e.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
    )
  );
});
