const STABLE=new Set(['USDT','USDC','USD']);
export default {
  async fetch(request,env){
    const url=new URL(request.url),cors={'Access-Control-Allow-Origin':env.ALLOWED_ORIGIN||'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Cache-Control':'no-store'};
    if(request.method==='OPTIONS')return new Response(null,{headers:cors});
    try{
      if(url.pathname==='/api/health')return json({ok:true,service:'investment-hub-worker',version:'2.1.0'},200,cors);
      const authError=authorize(request,env);if(authError)return json({error:authError},401,cors);
      if(url.pathname==='/api/diagnostics')return json({ok:true,version:'2.1.0',secrets:{DASHBOARD_ACCESS_TOKEN:!!env.DASHBOARD_ACCESS_TOKEN,OKX_API_KEY:!!env.OKX_API_KEY,OKX_API_SECRET:!!env.OKX_API_SECRET,OKX_PASSPHRASE:!!env.OKX_PASSPHRASE,TWELVE_DATA_KEY:!!env.TWELVE_DATA_KEY}},200,cors);
      if(url.pathname==='/api/okx/balance')return await okxBalance(env,cors);
      if(url.pathname==='/api/market/prices')return await marketPrices(url,env,cors);
      if(url.pathname==='/api/market/history')return await marketHistory(url,env,cors);
      return env.ASSETS?env.ASSETS.fetch(request):json({error:'Not found'},404,cors);
    }catch(e){return json({error:e?.message||'Server error'},500,cors)}
  }
};

async function okxBalance(env,cors){
  requireOkx(env);
  const [trading,funding]=await Promise.all([
    signedOkx(env,'/api/v5/account/balance'),
    signedOkx(env,'/api/v5/asset/balances')
  ]);
  const map=new Map();
  const t=trading.data?.[0]||{};
  for(const d of t.details||[]){
    const ccy=String(d.ccy||'').toUpperCase(),qty=n(d.eq||d.cashBal),usd=n(d.eqUsd||d.disEq);
    if(!ccy||qty<=0)continue;
    map.set(ccy,{symbol:ccy,name:ccy,qty,price:usd>0?usd/qty:0,usdValue:Math.max(0,usd),changePct:0,accountParts:{trading:qty,funding:0}});
  }
  for(const d of funding.data||[]){
    const ccy=String(d.ccy||'').toUpperCase(),qty=n(d.bal);if(!ccy||qty<=0)continue;
    const old=map.get(ccy)||{symbol:ccy,name:ccy,qty:0,price:0,usdValue:0,changePct:0,accountParts:{trading:0,funding:0}};
    old.qty+=qty;old.accountParts.funding+=qty;map.set(ccy,old);
  }
  const holdings=[...map.values()];
  await Promise.all(holdings.map(async h=>{
    const ticker=await cryptoQuote(h.symbol,env).catch(()=>null);
    if(ticker&&ticker.price>0){
      h.price=ticker.price;h.changePct=ticker.changePct;
      // Funding value is priced with current market; trading eqUsd remains OKX account valuation where available.
      const tradingQty=n(h.accountParts.trading),fundingQty=n(h.accountParts.funding);
      const tradingValue=(tradingQty>0&&h.usdValue>0)?h.usdValue:tradingQty*h.price;
      h.usdValue=tradingValue+fundingQty*h.price;
    }else if(STABLE.has(h.symbol)){
      h.price=1;h.usdValue=h.qty;h.changePct=0;
    }else if(h.price>0){
      h.usdValue=h.qty*h.price;
    }
  }));
  const totalUsd=holdings.reduce((a,h)=>a+n(h.usdValue),0);
  return json({holdings,totalUsd,tradingTotalEq:n(t.totalEq),ts:Date.now()},200,cors);
}

async function marketPrices(url,env,cors){
  const stocks=(url.searchParams.get('stocks')||'').split(',').map(s=>cleanStock(s)).filter(Boolean).slice(0,30);
  const cryptoSymbols=(url.searchParams.get('crypto')||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean).slice(0,50);
  const out={stocks:{},crypto:{},sources:{stocks:env.TWELVE_DATA_KEY?'Twelve Data + fallback':'Stooq fallback',crypto:'OKX'}};
  await Promise.all(cryptoSymbols.map(async s=>{const q=await cryptoQuote(s,env).catch(()=>null);if(q)out.crypto[s]=q}));
  if(stocks.length){
    let remaining=[...stocks];
    if(env.TWELVE_DATA_KEY){
      try{
        const q=new URL('https://api.twelvedata.com/quote');q.searchParams.set('symbol',stocks.join(','));q.searchParams.set('apikey',env.TWELVE_DATA_KEY);
        const r=await fetch(q),data=await r.json();if(r.ok&&data.status!=='error'){
          for(const s of stocks){const item=stocks.length===1?data:data[s];if(item&&!item.code&&n(item.close)>0){out.stocks[s]={price:n(item.close),changePct:n(item.percent_change),source:'Twelve Data'}}}
          remaining=stocks.filter(s=>!out.stocks[s]);
        }
      }catch{}
    }
    await Promise.all(remaining.map(async s=>{const q=await stooqQuote(s).catch(()=>null);if(q)out.stocks[s]=q}));
  }
  return json({...out,ts:Date.now()},200,cors);
}

async function marketHistory(url,env,cors){
  const type=url.searchParams.get('type'),symbol=String(url.searchParams.get('symbol')||'').toUpperCase(),range=url.searchParams.get('range')||'1M';
  if(!symbol)return json({error:'Missing symbol'},400,cors);
  if(type==='crypto')return json(await cryptoHistory(symbol,range,env),200,cors);
  if(type==='stock')return json(await stockHistory(cleanStock(symbol),range,env),200,cors);
  return json({error:'Unsupported asset type'},400,cors);
}

async function cryptoQuote(symbol,env){
  if(STABLE.has(symbol))return{price:1,changePct:0,source:'OKX'};
  const instId=`${symbol}-USDT`,host=env.OKX_API_BASE||'https://www.okx.com',r=await fetch(`${host}/api/v5/market/ticker?instId=${encodeURIComponent(instId)}`);
  const d=await r.json(),x=d.data?.[0];if(!r.ok||d.code!=='0'||!x)throw new Error('OKX ticker unavailable');
  const last=n(x.last),open=n(x.open24h),changePct=open?(last-open)/open*100:0;return{price:last,changePct,source:'OKX'}
}
async function cryptoHistory(symbol,range,env){
  if(STABLE.has(symbol))return{source:'OKX',points:[{ts:Date.now()-864e5,close:1},{ts:Date.now(),close:1}]};
  const cfg={1D:['5m',288],1W:['1H',168],1M:['4H',180],3M:['1D',90],1Y:['1D',300],ALL:['1W',300]}[range]||['4H',180],host=env.OKX_API_BASE||'https://www.okx.com';
  const u=new URL(host+'/api/v5/market/candles');u.searchParams.set('instId',`${symbol}-USDT`);u.searchParams.set('bar',cfg[0]);u.searchParams.set('limit',String(cfg[1]));
  const r=await fetch(u),d=await r.json();if(!r.ok||d.code!=='0')throw new Error(d.msg||'تعذر تحميل تاريخ OKX');
  return{source:'OKX',points:(d.data||[]).map(x=>({ts:n(x[0]),close:n(x[4])})).filter(x=>x.close>0).sort((a,b)=>a.ts-b.ts)}
}
async function stooqQuote(symbol){
  const u=`https://stooq.com/q/l/?s=${encodeURIComponent(symbol.toLowerCase()+'.us')}&f=sd2t2ohlcv&h&e=csv`,r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'}});
  const text=await r.text(),lines=text.trim().split(/\r?\n/);if(lines.length<2)throw new Error('No stock quote');const h=lines[0].split(','),v=lines[1].split(','),o={};h.forEach((k,i)=>o[k]=v[i]);
  const close=n(o.Close),open=n(o.Open);if(close<=0)throw new Error('No stock quote');return{price:close,changePct:open?(close-open)/open*100:0,source:'Stooq'}
}
async function stockHistory(symbol,range,env){
  if(env.TWELVE_DATA_KEY){
    try{
      const cfg={1D:['5min',78],1W:['30min',100],1M:['1h',180],3M:['1day',90],1Y:['1day',365],ALL:['1week',520]}[range]||['1day',90],u=new URL('https://api.twelvedata.com/time_series');
      u.searchParams.set('symbol',symbol);u.searchParams.set('interval',cfg[0]);u.searchParams.set('outputsize',String(cfg[1]));u.searchParams.set('apikey',env.TWELVE_DATA_KEY);
      const r=await fetch(u),d=await r.json();if(r.ok&&d.status!=='error'&&Array.isArray(d.values)){return{source:'Twelve Data',points:d.values.map(x=>({ts:Date.parse(x.datetime),close:n(x.close)})).filter(x=>x.ts&&x.close>0).sort((a,b)=>a.ts-b.ts)}}
    }catch{}
  }
  const now=new Date(),days={1D:7,1W:14,1M:40,3M:110,1Y:380,ALL:3650}[range]||40,start=new Date(now.getTime()-days*864e5),fmt=d=>`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;
  const u=`https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol.toLowerCase()+'.us')}&d1=${fmt(start)}&d2=${fmt(now)}&i=d`,r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0'}});
  const text=await r.text(),lines=text.trim().split(/\r?\n/);if(lines.length<2)return{source:'Stooq',points:[]};const h=lines[0].split(',');
  const pts=lines.slice(1).map(line=>{const v=line.split(','),o={};h.forEach((k,i)=>o[k]=v[i]);return{ts:Date.parse(o.Date+'T00:00:00Z'),close:n(o.Close)}}).filter(x=>x.ts&&x.close>0);
  return{source:'Stooq',points:pts}
}
function cleanStock(s){return String(s||'').trim().toUpperCase().replace(/\.US$/,'')}
function requireOkx(env){for(const k of['OKX_API_KEY','OKX_API_SECRET','OKX_PASSPHRASE'])if(!env[k])throw new Error(`Missing ${k}`)}
async function signedOkx(env,path){
  const ts=new Date().toISOString(),sign=await hmacBase64(env.OKX_API_SECRET,ts+'GET'+path),host=env.OKX_API_BASE||'https://www.okx.com',r=await fetch(host+path,{headers:{'OK-ACCESS-KEY':env.OKX_API_KEY,'OK-ACCESS-SIGN':sign,'OK-ACCESS-TIMESTAMP':ts,'OK-ACCESS-PASSPHRASE':env.OKX_PASSPHRASE,'Content-Type':'application/json'}});
  const d=await r.json();if(!r.ok||d.code!=='0')throw new Error(d.msg||`OKX HTTP ${r.status}`);return d
}
async function hmacBase64(secret,text){const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']),sig=await crypto.subtle.sign('HMAC',key,enc.encode(text));let s='';for(const b of new Uint8Array(sig))s+=String.fromCharCode(b);return btoa(s)}
function authorize(request,env){if(!env.DASHBOARD_ACCESS_TOKEN)return'Missing DASHBOARD_ACCESS_TOKEN';return(request.headers.get('Authorization')||'')===`Bearer ${env.DASHBOARD_ACCESS_TOKEN}`?'':'Unauthorized'}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}})}
