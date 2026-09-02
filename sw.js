const CACHE='investment-hub-v2.5.3-corefix-1';
const VERSION='2.5.3';
const CORE=[
  './','./index.html','./styles.css','./app.js','./manifest.json',
  './v2.5.3.css','./v2.5.3.js',
  './assets/icon-192.png?v=2531','./assets/icon-512.png?v=2531'
];

self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE)
      .then(c=>c.addAll(CORE))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

function noCacheHeaders(headers,type){
  const h=new Headers(headers);
  if(type) h.set('content-type',type);
  h.set('cache-control','no-cache, no-store, must-revalidate');
  h.set('pragma','no-cache');
  h.set('expires','0');
  return h;
}

async function patchHtml(response){
  let html=await response.text();

  // Static repository index.html is still v2.5.1 — correct it for every PWA navigation.
  html=html.replace(/v2\.5\.1/g,'v2.5.3');

  // Force the real current icon on iOS.
  html=html.replace(
    /<link\s+rel=["']apple-touch-icon["'][^>]*>/i,
    '<link rel="apple-touch-icon" href="./assets/icon-192.png?v=2531">'
  );

  if(!/rel=["']apple-touch-icon["']/i.test(html)){
    html=html.replace(
      '</head>',
      '<link rel="apple-touch-icon" href="./assets/icon-192.png?v=2531"></head>'
    );
  }

  // Load visual hotfix directly rather than depending on a previous cached HTML copy.
  if(!html.includes('v2.5.3.css')){
    html=html.replace(
      '</head>',
      '<link rel="stylesheet" href="./v2.5.3.css?v=2531" data-ih-253="1"></head>'
    );
  }
  if(!html.includes('v2.5.3.js')){
    html=html.replace(
      '</body>',
      '<script src="./v2.5.3.js?v=2531"></script></body>'
    );
  }

  return new Response(html,{
    status:response.status,
    statusText:response.statusText,
    headers:noCacheHeaders(response.headers,'text/html; charset=utf-8')
  });
}

async function patchApp(response){
  let js=await response.text();

  // The GitHub app.js is still hard-coded as APP_VERSION='2.5.1'.
  // Patch the actual runtime version, not only the footer.
  js=js
    .replace(/APP_VERSION='2\.5\.1'/g,"APP_VERSION='2.5.3'")
    .replace(/APP_VERSION="2\.5\.1"/g,'APP_VERSION="2.5.3"');

  return new Response(js,{
    status:response.status,
    statusText:response.statusText,
    headers:noCacheHeaders(response.headers,'application/javascript; charset=utf-8')
  });
}

async function patchManifest(response){
  let text=await response.text();
  try{
    const m=JSON.parse(text);
    m.icons=[
      {src:'assets/icon-192.png?v=2531',sizes:'192x192',type:'image/png',purpose:'any maskable'},
      {src:'assets/icon-512.png?v=2531',sizes:'512x512',type:'image/png',purpose:'any maskable'}
    ];
    text=JSON.stringify(m);
  }catch{}
  return new Response(text,{
    status:response.status,
    statusText:response.statusText,
    headers:noCacheHeaders(response.headers,'application/manifest+json; charset=utf-8')
  });
}

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;

  const u=new URL(e.request.url);
  if(u.origin!==location.origin || u.pathname.startsWith('/api/')) return;

  // Always network-first for app shell so standalone PWA cannot stay on 2.5.1.
  if(e.request.mode==='navigate' || u.pathname==='/' || u.pathname.endsWith('/index.html')){
    e.respondWith(
      fetch(e.request,{cache:'no-store'})
        .then(patchHtml)
        .catch(()=>caches.match('./index.html').then(r=>r?patchHtml(r):r))
    );
    return;
  }

  if(u.pathname.endsWith('/app.js') || u.pathname.endsWith('app.js')){
    e.respondWith(
      fetch(e.request,{cache:'no-store'})
        .then(patchApp)
        .catch(()=>caches.match('./app.js').then(r=>r?patchApp(r):r))
    );
    return;
  }

  if(u.pathname.endsWith('/manifest.json') || u.pathname.endsWith('manifest.json')){
    e.respondWith(
      fetch(e.request,{cache:'no-store'})
        .then(patchManifest)
        .catch(()=>caches.match('./manifest.json').then(r=>r?patchManifest(r):r))
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
