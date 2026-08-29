const CACHE='investment-hub-v2.4.0';
const CORE=['./','./index.html','./styles.css','./app.js','./v2.4.js','./manifest.json','./assets/icon-192.png','./assets/icon-512.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

async function injectEnhancer(response){
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html')) return response;
  let html=await response.text();
  if(!html.includes('v2.4.js')){
    html=html.replace('</body>','<script src="./v2.4.js?v=240"></script></body>');
  }
  const headers=new Headers(response.headers);
  headers.set('content-type','text/html; charset=utf-8');
  headers.set('cache-control','no-cache, no-store, must-revalidate');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin || u.pathname.startsWith('/api/')) return;

  if(e.request.mode==='navigate' || u.pathname==='/' || u.pathname.endsWith('/index.html')){
    e.respondWith(
      fetch(e.request,{cache:'no-store'})
        .then(injectEnhancer)
        .catch(()=>caches.match('./index.html').then(r=>r?injectEnhancer(r):r))
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(r=>{
        const copy=r.clone();
        caches.open(CACHE).then(c=>c.put(e.request,copy));
        return r;
      })
      .catch(()=>caches.match(e.request))
  );
});
