// 조합ONE 시안 — 앱 설치(홈 화면 추가)와 오프라인 열기를 위한 서비스 워커
// 화면 파일은 네트워크 우선(수정본이 바로 보이도록), 실패 시 저장본 사용
var CACHE = 'johapone-v1';
var SHELL = ['union.html', 'platform.html', 'install.html', 'index.html', 'rebuild.html', 'data.js', 'cases.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(function (res) {
    if (res.ok && new URL(e.request.url).origin === location.origin) {
      var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
    }
    return res;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
});
