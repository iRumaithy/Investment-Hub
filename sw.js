const CACHE='investment-hub-v2.5.3';
const CORE=[
  './','./index.html','./styles.css','./app.js','./manifest.json',
  './v2.5.3.css','./v2.5.3.js',
  './assets/icon-192.png?v=253','./assets/icon-512.png?v=253'
];

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

async function inject253(response){
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html')) return response;

  let html=await response.text();

  if(!html.includes('v2.5.3.css')){
    html=html.replace(
      '</head>',
      '<link rel="stylesheet" href="./v2.5.3.css?v=253" data-ih-253="1">' +
      '<link rel="apple-touch-icon" href="./assets/icon-192.png?v=253">' +
      '</head>'
    );
  }

  if(!html.includes('v2.5.3.js')){
    html=html.replace('</body>','<script src="./v2.5.3.js?v=253"></script></body>');
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
        .then(inject253)
        .catch(()=>caches.match('./index.html').then(r=>r?inject253(r):r))
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
