// 간단한 서비스 워커: 앱을 홈 화면에 설치할 수 있게 해주고,
// 오프라인일 때 마지막으로 열었던 화면을 보여줍니다.
// (신청 데이터 자체의 오프라인 저장/동기화는 처리하지 않습니다 -
//  네트워크가 있어야 신청 내용을 정확히 확인/저장할 수 있습니다.)

const CACHE_NAME = "ticket-desk-shell-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
