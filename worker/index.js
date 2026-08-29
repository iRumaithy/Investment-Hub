const STABLE=new Set(['USDT','USDC','USD','AED']);
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    const cors={
      'Access-Control-Allow-Origin':env.ALLOWED_ORIGIN||'*',
      'Access-Control-Allow-Methods':'GET,OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type,Authorization',
      'Cache-Control':'no-store'
    };
    if(request.method==='OPTIONS')return new Response(null,{headers:cors});
    try{
      if(url.pathname==='/api/health')return json({ok:true,service:'investment-hub-worker',version:'2.3.0'},200,cors);
      const authError=authorize(request,env);if(authError)return json({error:authError},401,cors);
      if(url.pathname==='/api/diagnostics')return json({
        ok:true,version:'2.3.0',
        secrets:{
          DASHBOARD_ACCESS_TOKEN:!!env.DASHBOARD_ACCESS_TOKEN,
          OKX_API_KEY:!!env.OKX_API_KEY,
          OKX_API_SECRET:!!env.OKX_API_SECRET,
          OKX_PASSPHRASE:!!env.OKX_PASSPHRASE,
          TWELVE_DATA_KEY:!!env.TWELVE_DATA_KEY
        }
      },200,cors);
      if(url.pathname==='/api/okx/balance')return await okxBalance(env,cors);
      if(url.pathname==='/api/market/prices')return await marketPrices(url,env,cors);
      if(url.pathname==='/api/market/history')return await marketHistory(url,env,cors);
      if(url.pathname==='/api/portfolio/history')return await portfolioHistory(url,env,cors);
      return env.ASSETS?env.ASSETS.fetch(request):json({error:'Not found'},404,cors);
    }catch(e){return json({error:e?.message||'Server error'},500,cors)}
  }
};

async function okxBalance(env,cors){
  requireOkx(env);

  // OKX's own total account valuation includes Funding + Trading + Earn.
  let valuation={data:[]};
  try{valuation=await signedOkx(env,'/api/v5/asset/asset-valuation?ccy=USD')}catch{}

  const trading=await signedOkx(env,'/api/v5/account/balance');
  await sleep(220);
  const funding=await signedOkx(env,'/api/v5/asset/balances');

  // Earn/Savings is optional depending on account/region/product.
  let savings={data:[]};
  await sleep(220);
  try{savings=await signedOkx(env,'/api/v5/finance/savings/balance')}catch{}

  const map=new Map();
  const t=trading.data?.[0]||{};

  for(const d of t.details||[]){
    const ccy=String(d.ccy||'').toUpperCase();
    const qty=n(d.eq||d.cashBal);
    const eqUsd=n(d.eqUsd||d.disEq);
    const spotBal=n(d.spotBal);
    const totalPnl=parseNullable(d.totalPnl);
    const totalPnlRatio=parseNullable(d.totalPnlRatio);
    const spotUpl=parseNullable(d.spotUpl);
    const spotUplRatio=parseNullable(d.spotUplRatio);
    if(!ccy || (qty<=0 && eqUsd<=0))continue;

    map.set(ccy,{
      symbol:ccy,name:ccy,qty:Math.max(0,qty),
      price:qty>0&&eqUsd>0?eqUsd/qty:0,
      usdValue:Math.max(0,eqUsd),
      pnl:totalPnl,
      pnlRatio:ratioToPercent(totalPnlRatio),
      spotUpl,
      spotUplRatio:ratioToPercent(spotUplRatio),
      openAvgPx:parseNullable(d.openAvgPx),
      accAvgPx:parseNullable(d.accAvgPx),
      spotBal,
      accountParts:{trading:Math.max(0,qty),funding:0,savings:0},
      valueParts:{tradingUsd:Math.max(0,eqUsd),fundingUsd:0,savingsUsd:0}
    });
  }

  for(const d of funding.data||[]){
    const ccy=String(d.ccy||'').toUpperCase();
    const qty=n(d.bal||d.availBal);
    if(!ccy||qty<=0)continue;
    const old=map.get(ccy)||emptyHolding(ccy);
    old.qty+=qty;old.accountParts.funding+=qty;map.set(ccy,old);
  }

  for(const d of savings.data||[]){
    const ccy=String(d.ccy||'').toUpperCase();
    const qty=n(d.amt||d.totalAmt||d.bal||d.amount);
    if(!ccy||qty<=0)continue;
    const old=map.get(ccy)||emptyHolding(ccy);
    old.qty+=qty;old.accountParts.savings+=qty;map.set(ccy,old);
  }

  const holdings=[...map.values()];
  for(const h of holdings){
    const q=await cryptoQuote(h.symbol,env).catch(()=>null);
    if(q&&q.price>0)h.price=q.price;
    else if(STABLE.has(h.symbol)&&h.symbol!=='AED')h.price=1;

    const tradingUsd=n(h.valueParts.tradingUsd)>0?n(h.valueParts.tradingUsd):n(h.accountParts.trading)*n(h.price);
    const fundingUsd=n(h.accountParts.funding)*n(h.price);
    const savingsUsd=n(h.accountParts.savings)*n(h.price);
    h.valueParts={tradingUsd,fundingUsd,savingsUsd};
    h.usdValue=tradingUsd+fundingUsd+savingsUsd;
  }

  // Remove dust/zero entries that OKX may return as bookkeeping rows.
  const visible=holdings.filter(h=>n(h.qty)>0 && n(h.usdValue)>=0.01);

  const v=valuation.data?.[0]||{};
  const valuationTotalUsd=n(v.totalBal);
  const computedTotalUsd=visible.reduce((a,h)=>a+n(h.usdValue),0);
  const totalUsd=valuationTotalUsd>0?valuationTotalUsd:computedTotalUsd;

  const knownPnl=visible.filter(h=>h.pnl!==null);
  const totalPnl=knownPnl.reduce((a,h)=>a+n(h.pnl),0);
  const knownBasis=knownPnl.reduce((a,h)=>{
    const value=n(h.usdValue),p=n(h.pnl);
    const basis=value-p;
    return a+(basis>0?basis:0);
  },0);
  const totalPnlRatio=knownBasis>0?(totalPnl/knownBasis*100):null;

  return json({
    holdings:visible,
    totalUsd,
    computedTotalUsd,
    totalPnl,
    totalPnlRatio,
    valuationDetails:v.details||{},
    okxTradingTotalEq:n(t.totalEq),
    ts:Date.now()
  },200,cors);
}

function emptyHolding(ccy){
  return{
    symbol:ccy,name:ccy,qty:0,price:0,usdValue:0,
    pnl:null,pnlRatio:null,spotUpl:null,spotUplRatio:null,
    openAvgPx:null,accAvgPx:null,spotBal:0,
    accountParts:{trading:0,funding:0,savings:0},
    valueParts:{tradingUsd:0,fundingUsd:0,savingsUsd:0}
  };
}

async function marketPrices(url,env,cors){
  const stocks=(url.searchParams.get('stocks')||'').split(',').map(cleanStock).filter(Boolean).slice(0,30);
  const cryptoSymbols=(url.searchParams.get('crypto')||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean).slice(0,50);
  const out={stocks:{},crypto:{},sources:{stocks:'Twelve Data',crypto:'OKX'}};

  for(const s of cryptoSymbols){
    const q=await cryptoQuote(s,env).catch(()=>null);
    if(q)out.crypto[s]=q;
    await sleep(80);
  }

  if(stocks.length){
    if(!env.TWELVE_DATA_KEY)return json({error:'TWELVE_DATA_KEY_REQUIRED'},503,cors);
    const q=new URL('https://api.twelvedata.com/quote');
    q.searchParams.set('symbol',stocks.join(','));
    q.searchParams.set('apikey',env.TWELVE_DATA_KEY);
    const r=await fetch(q);
    const data=await safeJsonResponse(r,'Twelve Data');
    if(!r.ok||data.status==='error')return json({error:data.message||'Twelve Data request failed'},502,cors);
    for(const s of stocks){
      const item=stocks.length===1?data:data[s];
      if(item&&!item.code&&n(item.close)>0)out.stocks[s]={price:n(item.close),changePct:n(item.percent_change),source:'Twelve Data'};
    }
  }
  return json({...out,ts:Date.now()},200,cors);
}

async function marketHistory(url,env,cors){
  const type=url.searchParams.get('type');
  const symbol=String(url.searchParams.get('symbol')||'').toUpperCase();
  const range=url.searchParams.get('range')||'1M';
  if(!symbol)return json({error:'Missing symbol'},400,cors);
  if(type==='crypto')return json(await cryptoHistory(symbol,range,env),200,cors);
  if(type==='stock')return json(await stockHistory(cleanStock(symbol),range,env),200,cors);
  return json({error:'Unsupported asset type'},400,cors);
}

async function portfolioHistory(url,env,cors){
  const range=url.searchParams.get('range')||'1D';
  const raw=(url.searchParams.get('crypto')||'').split(',').map(x=>x.trim()).filter(Boolean);
  const items=[];
  for(const part of raw){
    const idx=part.lastIndexOf(':');
    if(idx<=0)continue;
    const symbol=part.slice(0,idx).toUpperCase();
    const qty=n(part.slice(idx+1));
    if(symbol&&qty>0)items.push({symbol,qty});
  }
  if(!items.length)return json({source:'OKX',points:[]},200,cors);

  const series=[];
  for(const item of items.slice(0,12)){
    if(STABLE.has(item.symbol)){
      if(item.symbol==='AED')continue;
      series.push({symbol:item.symbol,qty:item.qty,points:flatStable(range)});
      continue;
    }
    try{
      const h=await cryptoHistory(item.symbol,range,env);
      if(h.points?.length)series.push({symbol:item.symbol,qty:item.qty,points:h.points});
    }catch{}
    await sleep(160);
  }
  if(!series.length)return json({source:'OKX',points:[]},200,cors);

  const maxLen=Math.max(...series.map(s=>s.points.length));
  const points=[];
  for(let i=0;i<maxLen;i++){
    let value=0,ts=0,used=0;
    for(const s of series){
      const p=s.points[Math.max(0,s.points.length-maxLen+i)];
      if(p&&p.close>0){value+=p.close*s.qty;ts=Math.max(ts,p.ts);used++}
    }
    if(used&&ts)points.push({ts,close:value});
  }
  return json({source:'OKX · current holdings valuation',points},200,cors);
}

function flatStable(range){
  const now=Date.now(),cfg={'1D':[288,5*60e3],'1W':[168,3600e3],'1M':[180,4*3600e3],'3M':[90,86400e3],'1Y':[300,86400e3],'ALL':[300,7*86400e3]}[range]||[180,4*3600e3];
  return Array.from({length:cfg[0]},(_,i)=>({ts:now-(cfg[0]-1-i)*cfg[1],close:1}));
}

async function cryptoQuote(symbol,env){
  if(STABLE.has(symbol)){
    if(symbol==='AED')return null;
    return{price:1,changePct:0,source:'OKX'};
  }
  const d=await publicOkxJson(env,`/api/v5/market/ticker?instId=${encodeURIComponent(symbol+'-USDT')}`);
  const x=d.data?.[0];
  if(!x)throw new Error('OKX ticker unavailable');
  const last=n(x.last),open=n(x.open24h);
  return{price:last,changePct:open?(last-open)/open*100:0,source:'OKX'};
}

async function cryptoHistory(symbol,range,env){
  if(STABLE.has(symbol)){
    if(symbol==='AED')return{source:'OKX',points:[]};
    return{source:'OKX',points:flatStable(range)};
  }
  const cfg={
    '1D':['5m',288],
    '1W':['1H',168],
    '1M':['4H',180],
    '3M':['1D',90],
    '1Y':['1D',300],
    'ALL':['1W',300]
  }[range]||['4H',180];

  const path=`/api/v5/market/history-candles?instId=${encodeURIComponent(symbol+'-USDT')}&bar=${encodeURIComponent(cfg[0])}&limit=${cfg[1]}`;
  const d=await publicOkxJson(env,path);
  const points=(d.data||[]).map(x=>({ts:n(x[0]),close:n(x[4])})).filter(x=>x.ts&&x.close>0).sort((a,b)=>a.ts-b.ts);
  return{source:'OKX',points};
}

async function stockHistory(symbol,range,env){
  if(!env.TWELVE_DATA_KEY)throw new Error('TWELVE_DATA_KEY_REQUIRED');
  const cfg={
    '1D':['5min',78],
    '1W':['30min',100],
    '1M':['1h',180],
    '3M':['1day',90],
    '1Y':['1day',365],
    'ALL':['1week',520]
  }[range]||['1day',90];
  const u=new URL('https://api.twelvedata.com/time_series');
  u.searchParams.set('symbol',symbol);
  u.searchParams.set('interval',cfg[0]);
  u.searchParams.set('outputsize',String(cfg[1]));
  u.searchParams.set('apikey',env.TWELVE_DATA_KEY);
  const r=await fetch(u);
  const d=await safeJsonResponse(r,'Twelve Data');
  if(!r.ok||d.status==='error'||!Array.isArray(d.values))throw new Error(d.message||'Twelve Data history failed');
  return{
    source:'Twelve Data',
    points:d.values.map(x=>({ts:Date.parse(x.datetime),close:n(x.close)})).filter(x=>x.ts&&x.close>0).sort((a,b)=>a.ts-b.ts)
  };
}

async function publicOkxJson(env,path){
  const hosts=[env.OKX_API_BASE,'https://openapi.okx.com','https://www.okx.com'].filter(Boolean);
  let last='تعذر تحميل بيانات OKX';
  for(const host of [...new Set(hosts)]){
    for(let attempt=0;attempt<2;attempt++){
      if(attempt)await sleep(900);
      let r;
      try{r=await fetch(host+path,{headers:{'Accept':'application/json'},cf:{cacheTtl:20,cacheEverything:true}})}
      catch{last=`تعذر الاتصال بـ OKX عبر ${host}`;continue}
      const text=await r.text();
      let d=null;
      try{d=JSON.parse(text)}catch{}
      if(d&&r.ok&&d.code==='0')return d;
      if(d){last=d.msg||`OKX HTTP ${r.status}`;if(r.status===429||String(d.code)==='50011')continue;throw new Error(last)}
      const compact=text.replace(/\s+/g,' ').trim().slice(0,180);
      if(r.status===429||/1015|rate limit|temporarily/i.test(compact)){last='OKX حدّ مؤقتًا من بيانات الرسم (1015). أعد المحاولة بعد لحظات.';continue}
      last=`OKX أعاد استجابة غير متوقعة (${r.status})`;
    }
  }
  throw new Error(last);
}

async function signedOkx(env,path){
  const hosts=[env.OKX_API_BASE,'https://openapi.okx.com','https://www.okx.com'].filter(Boolean);
  let lastError='OKX request failed';
  for(const host of [...new Set(hosts)]){
    for(let attempt=0;attempt<2;attempt++){
      if(attempt)await sleep(1000);
      const ts=new Date().toISOString();
      const sign=await hmacBase64(env.OKX_API_SECRET,ts+'GET'+path);
      let r;
      try{
        r=await fetch(host+path,{headers:{
          'OK-ACCESS-KEY':env.OKX_API_KEY,
          'OK-ACCESS-SIGN':sign,
          'OK-ACCESS-TIMESTAMP':ts,
          'OK-ACCESS-PASSPHRASE':env.OKX_PASSPHRASE,
          'Content-Type':'application/json',
          'Accept':'application/json'
        }});
      }catch{lastError=`تعذر الاتصال بـ OKX عبر ${host}`;continue}

      const text=await r.text();
      let d=null;try{d=JSON.parse(text)}catch{}
      if(d&&r.ok&&d.code==='0')return d;
      if(d){
        lastError=d.msg||`OKX HTTP ${r.status}`;
        if(r.status===429||String(d.code)==='50011'||String(d.code)==='50061')continue;
        throw new Error(lastError);
      }
      const compact=text.replace(/\s+/g,' ').trim().slice(0,180);
      if(r.status===429||/1015|rate limit|temporarily/i.test(compact)){lastError='OKX حدّ مؤقتًا من عدد الطلبات (1015). سيتم إعادة المحاولة تلقائيًا.';continue}
      lastError=`OKX أعاد استجابة غير متوقعة (${r.status})`;
    }
  }
  throw new Error(lastError);
}

async function safeJsonResponse(r,label){
  const text=await r.text();
  try{return JSON.parse(text)}
  catch{throw new Error(`${label} أعاد استجابة غير صالحة`)}
}
function ratioToPercent(v){
  if(v===null||v===undefined||v==='')return null;
  const x=Number(v);return Number.isFinite(x)?x*100:null;
}
function parseNullable(v){
  if(v===null||v===undefined||v==='')return null;
  const x=Number(v);return Number.isFinite(x)?x:null;
}
function cleanStock(s){return String(s||'').trim().toUpperCase().replace(/\.US$/,'')}
function requireOkx(env){for(const k of['OKX_API_KEY','OKX_API_SECRET','OKX_PASSPHRASE'])if(!env[k])throw new Error(`Missing ${k}`)}
async function hmacBase64(secret,text){
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',key,enc.encode(text));
  let s='';for(const b of new Uint8Array(sig))s+=String.fromCharCode(b);return btoa(s)
}
function authorize(request,env){
  if(!env.DASHBOARD_ACCESS_TOKEN)return'Missing DASHBOARD_ACCESS_TOKEN';
  return(request.headers.get('Authorization')||'')===`Bearer ${env.DASHBOARD_ACCESS_TOKEN}`?'':'Unauthorized'
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}})}
