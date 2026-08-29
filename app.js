(() => {
  'use strict';

  const AED_RATE = 3.6725;
  const STORAGE_KEY = 'investmentHub_v1';
  const APP_VERSION = '2.2.1';
  const DEFAULT_API_BASE = /^https?:$/.test(location.protocol) ? location.origin : '';
  const OLD_DEMO_IDS = new Set(['s1','s2','s3','c1','c2','c3','w1','w2']);
  const POLL_MS = 30000;
  const HISTORY_SNAPSHOT_MS = 60000;

  const defaultState = {
    dataVersion: APP_VERSION,
    settings:{apiBase:DEFAULT_API_BASE,accessToken:'',baseCurrency:'AED'},
    holdings:[],
    watchlist:[],
    range:'1M',
    portfolioHistory:[],
    lastUpdated:null,
    xtbImportedAt:null,
    okxSyncedAt:null,
    marketSyncedAt:null,
    okxAccountTotalUsd:0
  };

  const $ = id => document.getElementById(id);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const deepClone = v => JSON.parse(JSON.stringify(v));

  function load(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw)return deepClone(defaultState);
      const parsed=JSON.parse(raw);
      const state={...deepClone(defaultState),...parsed,settings:{...defaultState.settings,...(parsed.settings||{})}};
      // One-time migration: purge only the sample records shipped by old demo builds.
      if(state.dataVersion!==APP_VERSION){
        // v2.2 migration: never keep historical sample/stale stock positions.
        // Real XTB positions must be imported again from the user's Open Positions report.
        state.holdings=(state.holdings||[]).filter(x=>x.type!=='stock' && !OLD_DEMO_IDS.has(x.id));
        state.watchlist=(state.watchlist||[]).filter(x=>!OLD_DEMO_IDS.has(x.id));
        state.xtbImportedAt=null;
        state.dataVersion=APP_VERSION;
      }
      if(!Array.isArray(state.portfolioHistory))state.portfolioHistory=[];
      return state;
    }catch{return deepClone(defaultState)}
  }
  let state=load(), deferredInstallPrompt=null, pollTimer=null, currentChartAsset=null, currentAssetRange='1M';

  function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
  function moneyUsd(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:Math.abs(v)>=1000?0:2}).format(v||0)}
  function money(v,currency=state.settings.baseCurrency){const a=currency==='AED'?v*AED_RATE:v;return new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:Math.abs(a)>=1000?0:2}).format(a||0)}
  function pct(v){const n=num(v);return `${n>=0?'+':''}${n.toFixed(2)}%`}
  function valueOf(h){return num(h.usdValue)>0?num(h.usdValue):num(h.qty)*num(h.price)}
  function costOf(h){return num(h.qty)*num(h.cost)}
  function pnlOf(h){return costOf(h)>0?valueOf(h)-costOf(h):0}
  function totals(){
    const total=state.holdings.reduce((a,h)=>a+valueOf(h),0);
    const cost=state.holdings.reduce((a,h)=>a+costOf(h),0);
    const stocks=state.holdings.filter(h=>h.type==='stock').reduce((a,h)=>a+valueOf(h),0);
    const crypto=state.holdings.filter(h=>h.type==='crypto').reduce((a,h)=>a+valueOf(h),0);
    const today=state.holdings.reduce((a,h)=>a+valueOf(h)*(num(h.changePct)/100),0);
    return {total,cost,stocks,crypto,pnl:cost?total-cost:0,today}
  }
  function toast(msg){const el=$('toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2800)}
  function setPill(id,text,good){const el=$(id);if(!el)return;el.textContent=text;el.className=`pill ${good?'good':'warn'}`}
  function toggleLoading(id,on){const el=$(id);if(!el)return;el.disabled=on;el.classList.toggle('loading',on)}

  function assetHtml(h,removable=false){
    const v=valueOf(h), p=pnlOf(h), pPct=costOf(h)?p/costOf(h)*100:0;
    return `<article class="asset-item" data-id="${esc(h.id)}">
      <div class="asset-main"><div class="asset-icon">${esc((h.symbol||'?').slice(0,4))}</div><div class="asset-title"><strong>${esc(h.name||h.symbol)}</strong><span>${esc(h.symbol)} · ${esc(h.source||h.type)}</span></div></div>
      <div class="asset-value"><strong>${money(v)}</strong><small class="${num(h.changePct)>=0?'positive':'negative'}">${pct(h.changePct)}</small></div>
      <div class="asset-meta">${num(h.qty).toLocaleString('en-US',{maximumFractionDigits:8})} × ${moneyUsd(h.price)}</div>
      <div class="asset-actions"><button class="asset-action" type="button" data-action="chart">الرسم البياني</button>${removable?'<button class="asset-action" type="button" data-action="remove">حذف</button>':''}</div>
    </article>`;
  }

  function render(){
    const t=totals();
    $('totalValue').textContent=money(t.total);
    $('totalUsd').textContent=state.settings.baseCurrency==='AED'?moneyUsd(t.total):money(t.total,'AED');
    $('todayPnl').textContent=`${money(Math.abs(t.today))} · ${pct(t.total?t.today/t.total*100:0)}`;
    $('todayPnl').className=t.today>=0?'positive':'negative';
    $('totalPnl').textContent=costOfPortfolio()?`${money(Math.abs(t.pnl))} · ${pct(t.cost?t.pnl/t.cost*100:0)}`:'—';
    $('totalPnl').className=t.pnl>=0?'positive':'negative';
    $('stocksValue').textContent=money(t.stocks); $('stocksPct').textContent=`${t.total?(t.stocks/t.total*100).toFixed(1):0}% من المحفظة`;
    $('cryptoValue').textContent=money(t.crypto); $('cryptoPct').textContent=`${t.total?(t.crypto/t.total*100).toFixed(1):0}% من المحفظة`;
    $('assetCount').textContent=state.holdings.length;
    $('lastUpdate').textContent=state.lastUpdated?new Date(state.lastUpdated).toLocaleTimeString('ar-AE',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
    $('marketState').textContent=state.marketSyncedAt?'أسعار سوق محدثة':'بانتظار المزامنة';
    $('currencyBtn').textContent=state.settings.baseCurrency;
    $('baseCurrency').value=state.settings.baseCurrency;
    $('apiBase').value=state.settings.apiBase||'';
    $('accessToken').value=state.settings.accessToken||'';
    renderPortfolioChart();renderTopHoldings();renderPortfolio();renderAllocation();renderWatchlist();renderAnalytics();renderConnections();renderStatus();
    save();
  }
  function costOfPortfolio(){return state.holdings.some(h=>num(h.cost)>0)}

  function renderTopHoldings(){const a=[...state.holdings].sort((x,y)=>valueOf(y)-valueOf(x)).slice(0,5);$('topHoldings').innerHTML=a.length?a.map(h=>assetHtml(h)).join(''):'<div class="empty">لا توجد بيانات وهمية. اربط OKX أو استورد ملف XTB لإظهار أصولك الفعلية.</div>'}
  function renderPortfolio(){const f=document.querySelector('.filter.active')?.dataset.filter||'all';const a=state.holdings.filter(h=>f==='all'||h.type===f).sort((x,y)=>valueOf(y)-valueOf(x));$('portfolioList').innerHTML=a.length?a.map(h=>assetHtml(h,true)).join(''):'<div class="empty">لا توجد أصول فعلية في هذا التصنيف.</div>'}
  function renderWatchlist(){$('watchList').innerHTML=state.watchlist.length?state.watchlist.map(w=>assetHtml({...w,id:w.id,qty:1,usdValue:w.price,source:'Watchlist'})).join(''):'<div class="empty">قائمة المراقبة فارغة.</div>'}
  function renderAllocation(){const t=totals(),s=t.total?t.stocks/t.total*100:0,c=t.total?t.crypto/t.total*100:0;$('allocationDonut').style.background=t.total?`conic-gradient(var(--gold) 0 ${s}%, #8b8b88 ${s}% ${s+c}%, #ebe7dd ${s+c}% 100%)`:'#eeeae2';$('allocationLegend').innerHTML=`<div class="legend-row"><i class="legend-dot" style="background:var(--gold)"></i><span>أسهم XTB</span><span>${s.toFixed(1)}%</span></div><div class="legend-row"><i class="legend-dot" style="background:#8b8b88"></i><span>Crypto OKX</span><span>${c.toFixed(1)}%</span></div>`}
  function renderAnalytics(){const t=totals(),sorted=[...state.holdings].sort((a,b)=>valueOf(b)-valueOf(a)),best=[...state.holdings].sort((a,b)=>num(b.changePct)-num(a.changePct))[0],worst=[...state.holdings].sort((a,b)=>num(a.changePct)-num(b.changePct))[0];$('analyticsCards').innerHTML=`<article class="metric-card"><span>أفضل أداء اليوم</span><strong class="positive">${best?`${esc(best.symbol)} ${pct(best.changePct)}`:'—'}</strong></article><article class="metric-card"><span>أضعف أداء اليوم</span><strong class="negative">${worst?`${esc(worst.symbol)} ${pct(worst.changePct)}`:'—'}</strong></article><article class="metric-card"><span>قيمة المحفظة</span><strong>${money(t.total)}</strong></article><article class="metric-card"><span>أكبر أصل</span><strong>${esc(sorted[0]?.symbol||'—')}</strong></article>`;const max=Math.max(1,...sorted.map(valueOf));$('largestPositions').innerHTML=sorted.length?sorted.slice(0,6).map(h=>`<div class="bar-row"><strong>${esc(h.symbol)}</strong><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2,valueOf(h)/max*100)}%"></div></div><span>${money(valueOf(h))}</span></div>`).join(''):'<div class="empty">لا توجد بيانات.</div>';$('performanceList').innerHTML=state.holdings.length?state.holdings.slice(0,6).map(h=>`<div class="bar-row"><strong>${esc(h.symbol)}</strong><div class="bar-track"><div class="bar-fill ${num(h.changePct)>=0?'gain':'loss'}" style="width:${Math.min(100,Math.max(3,Math.abs(num(h.changePct))*8))}%"></div></div><span class="${num(h.changePct)>=0?'positive':'negative'}">${pct(h.changePct)}</span></div>`).join(''):'<div class="empty">لا توجد بيانات.</div>'}
  function renderConnections(){const ok=!!state.okxSyncedAt,xtb=!!state.xtbImportedAt,mkt=!!state.marketSyncedAt;setPill('okxStatus',ok?'متصل ومزامن':'غير متصل',ok);setPill('xtbStatus',xtb?'مستورد':'لم يُستورد',xtb);setPill('priceStatus',mkt?'محدثة':'بانتظار الربط',mkt);setPill('okxConnectionPill',ok?'متصل':'غير مربوط',ok);setPill('xtbConnectionPill',xtb?'مستورد':'استيراد يدوي',xtb);setPill('marketConnectionPill',mkt?'Twelve Data Live':'بانتظار TWELVE_DATA_KEY',mkt);$('xtbImportInfo').textContent=xtb?`آخر استيراد: ${new Date(state.xtbImportedAt).toLocaleString('ar-AE')}`:'لم يتم استيراد ملف بعد.'}
  function renderStatus(){const live=!!state.settings.accessToken&&!!state.okxSyncedAt;$('statusStrip').innerHTML=`<span class="dot ${live?'live':''}"></span><span>${live?'OKX متصل — المزامنة التلقائية فعالة أثناء استخدام التطبيق.':'لا توجد بيانات تجريبية — اربط حسابك لإظهار بياناتك الفعلية.'}</span>`}

  function filteredPortfolioHistory(){
    const now=Date.now(),ms={ '1M':30*864e5,'3M':90*864e5,'6M':180*864e5,'1Y':365*864e5,'ALL':Infinity }[state.range]||30*864e5;
    return (state.portfolioHistory||[]).filter(x=>ms===Infinity||x.ts>=now-ms);
  }
  function renderPortfolioChart(){
    const data=filteredPortfolioHistory(), empty=$('portfolioChartEmpty');
    if(data.length<2){$('portfolioChart').innerHTML='';empty.style.display='grid';return}
    empty.style.display='none';drawSeries($('portfolioChart'),data.map(x=>({ts:x.ts,value:x.usdValue})),$('portfolioTooltip'),170);
  }
  function drawSeries(svg,points,tooltip,height=250){
    if(!points.length){svg.innerHTML='';return}
    const w=640,h=height,p=12,vals=points.map(x=>x.value),min=Math.min(...vals),max=Math.max(...vals),span=max-min||Math.max(1,max*.01);
    const coords=points.map((x,i)=>({x:p+i*(w-2*p)/Math.max(1,points.length-1),y:h-p-(x.value-min)/span*(h-2*p),...x}));
    const d=coords.map((q,i)=>`${i?'L':'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
    svg.innerHTML=`<defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c59a3a" stop-opacity=".28"/><stop offset="1" stop-color="#c59a3a" stop-opacity="0"/></linearGradient></defs><path d="${d} L${coords.at(-1).x},${h-p} L${coords[0].x},${h-p} Z" fill="url(#chartFill)"/><path d="${d}" fill="none" stroke="#b88727" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><line id="${svg.id}Cursor" x1="0" x2="0" y1="${p}" y2="${h-p}" stroke="#8b7a54" stroke-width="1" opacity="0"/>`;
    const locate=e=>{const r=svg.getBoundingClientRect(),clientX=e.touches?.[0]?.clientX??e.clientX,px=(clientX-r.left)/r.width*w,idx=Math.max(0,Math.min(coords.length-1,Math.round((px-p)/(w-2*p)*(coords.length-1)))),q=coords[idx],line=svg.querySelector('line');line.setAttribute('x1',q.x);line.setAttribute('x2',q.x);line.setAttribute('opacity','1');tooltip.hidden=false;tooltip.textContent=`${new Date(q.ts).toLocaleString('ar-AE',{dateStyle:'medium',timeStyle:'short'})} · ${moneyUsd(q.value)}`};
    svg.onpointermove=locate;svg.onpointerdown=locate;svg.onpointerleave=()=>{tooltip.hidden=true;svg.querySelector('line')?.setAttribute('opacity','0')};
  }

  async function api(path){
    const base=(state.settings.apiBase||DEFAULT_API_BASE).replace(/\/$/,'');if(!base)throw new Error('رابط الخدمة غير متوفر.');
    const headers={'Accept':'application/json'};if(state.settings.accessToken)headers.Authorization=`Bearer ${state.settings.accessToken}`;
    const r=await fetch(base+path,{headers,cache:'no-store'});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d
  }

  async function syncOkx(silent=false){
    if(!state.settings.accessToken){if(!silent)toast('احفظ Access Token مرة واحدة في الإعدادات.');return}
    if(!silent)toggleLoading('syncOkxBtn',true);
    try{
      const data=await api('/api/okx/balance');
      const stocks=state.holdings.filter(h=>h.type==='stock');
      const prev=new Map(state.holdings.filter(h=>h.type==='crypto').map(h=>[String(h.symbol).toUpperCase(),h]));
      const crypto=(data.holdings||[]).filter(h=>num(h.qty)>0).map((h,i)=>{const old=prev.get(String(h.symbol).toUpperCase());return {id:`okx-${h.symbol}`,type:'crypto',source:'OKX',symbol:h.symbol,name:h.name||h.symbol,qty:num(h.qty),cost:num(old?.cost),price:num(h.price),usdValue:num(h.usdValue),changePct:num(h.changePct),accountParts:h.accountParts||{}}});
      state.holdings=[...stocks,...crypto];
      state.okxAccountTotalUsd=num(data.totalUsd)||crypto.reduce((a,h)=>a+valueOf(h),0);
      state.okxSyncedAt=Date.now();state.lastUpdated=Date.now();
      recordPortfolioSnapshot();render();
      if(!silent)toast(`تمت مزامنة OKX: ${crypto.length} أصل فعلي.`);
    }catch(e){if(!silent)toast(e.message||'تعذر مزامنة OKX.');throw e}
    finally{if(!silent)toggleLoading('syncOkxBtn',false)}
  }

  async function syncMarket(silent=false){
    if(!silent){toggleLoading('syncMarketBtn',true);toggleLoading('refreshBtn',true)}
    try{
      const stocks=[...new Set([...state.holdings.filter(h=>h.type==='stock').map(h=>h.symbol),...state.watchlist.filter(w=>w.type==='stock').map(w=>w.symbol)])].join(',');
      const crypto=[...new Set([...state.holdings.filter(h=>h.type==='crypto').map(h=>h.symbol),...state.watchlist.filter(w=>w.type==='crypto').map(w=>w.symbol)])].join(',');
      if(!stocks&&!crypto){if(!silent)toast('لا توجد أصول لتحديث أسعارها.');return}
      const d=await api(`/api/market/prices?stocks=${encodeURIComponent(stocks)}&crypto=${encodeURIComponent(crypto)}`);
      state.holdings=state.holdings.map(h=>{const item=h.type==='stock'?d.stocks?.[h.symbol.toUpperCase()]:d.crypto?.[h.symbol.toUpperCase()];return item?{...h,price:num(item.price)||h.price,usdValue:h.type==='stock'?num(h.qty)*(num(item.price)||h.price):h.usdValue,changePct:num(item.changePct)}:h});
      state.watchlist=state.watchlist.map(w=>{const item=w.type==='stock'?d.stocks?.[w.symbol.toUpperCase()]:d.crypto?.[w.symbol.toUpperCase()];return item?{...w,price:num(item.price),changePct:num(item.changePct)}:w});
      state.marketSyncedAt=Date.now();state.lastUpdated=Date.now();recordPortfolioSnapshot();render();
      if(!silent)toast('تم تحديث أسعار السوق.');
    }catch(e){if(!silent)toast((e.message==='TWELVE_DATA_KEY_REQUIRED'?'أضف TWELVE_DATA_KEY في Cloudflare لتفعيل أسعار الأسهم الدقيقة.':e.message)||'تعذر تحديث السوق.');throw e}
    finally{if(!silent){toggleLoading('syncMarketBtn',false);toggleLoading('refreshBtn',false)}}
  }
  async function syncAll(silent=false){try{await syncOkx(silent)}catch{}try{await syncMarket(silent)}catch{}}
  function recordPortfolioSnapshot(){const t=totals(),now=Date.now();if(t.total<=0)return;const a=state.portfolioHistory||(state.portfolioHistory=[]),last=a.at(-1);if(!last||now-last.ts>=HISTORY_SNAPSHOT_MS)a.push({ts:now,usdValue:t.total});else a[a.length-1]={ts:now,usdValue:t.total};const cutoff=now-2*365*864e5;state.portfolioHistory=a.filter(x=>x.ts>=cutoff).slice(-5000)}
  function startLiveSync(){clearInterval(pollTimer);if(!state.settings.accessToken)return;pollTimer=setInterval(()=>{if(!document.hidden)syncAll(true)},POLL_MS)}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.settings.accessToken)syncAll(true)});

  async function openAssetChart(h,range='1M'){
    currentChartAsset=h;currentAssetRange=range;$('assetChartTitle').textContent=`${h.symbol} · ${h.name||h.symbol}`;$('assetChartPrice').textContent=h.price?moneyUsd(h.price):'—';$('assetChartChange').textContent=pct(h.changePct);$('assetChartChange').className=num(h.changePct)>=0?'positive':'negative';$('assetChart').innerHTML='';$('assetChartEmpty').style.display='grid';$('assetChartEmpty').textContent='جاري تحميل بيانات السوق…';$('chartDialog').showModal();$$('.asset-range').forEach(b=>b.classList.toggle('active',b.dataset.assetRange===range));
    try{const d=await api(`/api/market/history?type=${encodeURIComponent(h.type)}&symbol=${encodeURIComponent(h.symbol)}&range=${encodeURIComponent(range)}`),points=(d.points||[]).map(x=>({ts:num(x.ts),value:num(x.close)})).filter(x=>x.ts&&x.value);if(points.length<2){$('assetChartEmpty').textContent='لا تتوفر نقاط تاريخية كافية لهذه الفترة.';return}$('assetChartEmpty').style.display='none';drawSeries($('assetChart'),points,$('assetTooltip'),250);$('assetChartSource').textContent=`المصدر: ${d.source||'Market'} · ${points.length} نقطة`;const first=points[0].value,last=points.at(-1).value,change=first?(last-first)/first*100:0;$('assetChartPrice').textContent=moneyUsd(last);$('assetChartChange').textContent=pct(change);$('assetChartChange').className=change>=0?'positive':'negative'}catch(e){$('assetChartEmpty').textContent=e.message||'تعذر تحميل الرسم.'}
  }

  function setView(name){$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));document.querySelector('.app-shell')?.scrollTo({top:0,behavior:'smooth'})}

  async function runDiagnostics(){toggleLoading('diagnosticsBtn',true);try{const d=await api('/api/diagnostics'),s=d.secrets||{};$('diagnosticsResult').innerHTML=Object.entries(s).map(([k,v])=>`<div class="diag-row"><span>${esc(k)}</span><strong class="${v?'positive':'negative'}">${v?'✓ موجود':'✕ غير موجود'}</strong></div>`).join('')}catch(e){$('diagnosticsResult').textContent=e.message}finally{toggleLoading('diagnosticsBtn',false)}}

  async function importXtb(file){try{const rows=await parseSpreadsheet(file);if(!rows.length)throw new Error('الملف فارغ أو غير معروف.');const hs=rows.map((r,i)=>normalizeXtbRow(r,i)).filter(Boolean);if(!hs.length)throw new Error('لم أتعرف على مراكز XTB. استخدم تقرير Open Positions.');const crypto=state.holdings.filter(h=>h.type==='crypto');state.holdings=[...hs,...crypto];state.xtbImportedAt=Date.now();state.lastUpdated=Date.now();render();toast(`تم استيراد ${hs.length} مركز من XTB.`);if(state.settings.accessToken)syncMarket(true)}catch(e){toast(e.message||'تعذر قراءة ملف XTB.')}finally{$('xtbFile').value=''}}
  async function parseSpreadsheet(file){if(file.name.toLowerCase().endsWith('.csv'))return csvToObjects(await file.text());if(typeof XLSX==='undefined')throw new Error('تعذر تحميل قارئ XLSX. صدّر CSV كحل بديل.');const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});let best=[];for(const n of wb.SheetNames){const rows=XLSX.utils.sheet_to_json(wb.Sheets[n],{defval:''});if(rows.length>best.length)best=rows}return best}
  function csvToObjects(text){const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());if(lines.length<2)return[];const sep=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?';':',';const headers=splitCsv(lines[0],sep);return lines.slice(1).map(line=>{const vals=splitCsv(line,sep),o={};headers.forEach((h,i)=>o[h]=vals[i]??'');return o})}
  function splitCsv(line,sep){let o=[],c='',q=false;for(let i=0;i<line.length;i++){const x=line[i];if(x==='"'){if(q&&line[i+1]==='"'){c+='"';i++}else q=!q}else if(x===sep&&!q){o.push(c.trim());c=''}else c+=x}o.push(c.trim());return o}
  function normalizeXtbRow(row,i){const entries=Object.entries(row),get=patterns=>{for(const[k,v]of entries){const key=String(k).toLowerCase().replace(/[_-]/g,' ');if(patterns.some(p=>key.includes(p)))return v}return''};let symbol=String(get(['symbol','ticker','instrument','market','name','رمز','الأداة'])).trim().replace(/\.US$/i,'').split(/\s+/)[0].toUpperCase();const qty=parseNum(get(['volume','quantity','qty','shares','amount','الكمية','الحجم'])),cost=parseNum(get(['open price','opening price','average price','avg price','purchase price','price open','سعر الفتح','سعر الشراء'])),current=parseNum(get(['current price','market price','close price','السعر الحالي']));if(!symbol||qty<=0)return null;return{id:`xtb-${symbol}-${i}`,type:'stock',source:'XTB',verifiedXtb:true,symbol,name:symbol,qty,cost,price:current||0,usdValue:(current||0)*qty,changePct:0}}
  function parseNum(v){if(typeof v==='number')return v;const s=String(v??'').replace(/[^0-9,.-]/g,'').replace(/,(?=\d{3}(\D|$))/g,'').replace(',','.');const n=parseFloat(s);return Number.isFinite(n)?n:0}

  function exportBackup(){const safe=deepClone(state);safe.settings.accessToken='';const b=new Blob([JSON.stringify(safe,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`investment-hub-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  async function restoreBackup(file){try{const d=JSON.parse(await file.text());if(!Array.isArray(d.holdings))throw new Error();state={...deepClone(defaultState),...d,settings:{...defaultState.settings,...d.settings},dataVersion:APP_VERSION};render();startLiveSync();toast('تمت الاستعادة.')}catch{toast('ملف النسخة غير صالح.')}}

  // Navigation & UI
  $$('.tab').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.go)));
  $$('.range').forEach(b=>b.addEventListener('click',()=>{$$('.range').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.range=b.dataset.range;renderPortfolioChart();save()}));
  $$('.filter').forEach(b=>b.addEventListener('click',()=>{$$('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderPortfolio()}));
  $$('.asset-range').forEach(b=>b.addEventListener('click',()=>currentChartAsset&&openAssetChart(currentChartAsset,b.dataset.assetRange)));
  $('closeChartDialog').addEventListener('click',()=>$('chartDialog').close());
  $('currencyBtn').addEventListener('click',()=>{state.settings.baseCurrency=state.settings.baseCurrency==='AED'?'USD':'AED';render()});
  $('refreshBtn').addEventListener('click',()=>syncAll(false));
  $('syncMarketBtn').addEventListener('click',()=>syncMarket(false));
  $('syncOkxBtn').addEventListener('click',()=>syncOkx(false));
  $('diagnosticsBtn')?.addEventListener('click',runDiagnostics);
  $('xtbFile').addEventListener('change',e=>e.target.files[0]&&importXtb(e.target.files[0]));
  $('settingsForm').addEventListener('submit',e=>{e.preventDefault();state.settings.apiBase=$('apiBase').value.trim().replace(/\/$/,'')||DEFAULT_API_BASE;state.settings.accessToken=$('accessToken').value.trim();state.settings.baseCurrency=$('baseCurrency').value;save();render();startLiveSync();toast('تم حفظ الإعدادات وستبقى محفوظة على هذا الجهاز.');if(state.settings.accessToken)syncAll(true)});
  $('watchForm').addEventListener('submit',e=>{e.preventDefault();const symbol=$('watchSymbol').value.trim().toUpperCase(),type=$('watchType').value;if(!symbol)return;state.watchlist.push({id:`watch-${type}-${symbol}`,type,symbol,name:symbol,price:0,changePct:0});$('watchSymbol').value='';render();if(state.settings.accessToken)syncMarket(true)});
  function assetClick(e){const item=e.target.closest('.asset-item');if(!item)return;const h=state.holdings.find(x=>x.id===item.dataset.id)||state.watchlist.find(x=>x.id===item.dataset.id);if(e.target.dataset.action==='chart'&&h){openAssetChart(h);return}if(e.target.dataset.action==='remove'){state.holdings=state.holdings.filter(x=>x.id!==item.dataset.id);render();return}item.classList.toggle('expanded')}
  $('portfolioList').addEventListener('click',assetClick);$('topHoldings').addEventListener('click',assetClick);$('watchList').addEventListener('click',assetClick);
  $('openAddAsset').addEventListener('click',()=>$('assetDialog').showModal());$('closeAssetDialog').addEventListener('click',()=>$('assetDialog').close());
  $('assetForm').addEventListener('submit',e=>{e.preventDefault();const type=$('assetType').value,symbol=$('assetSymbol').value.trim().toUpperCase(),qty=parseNum($('assetQty').value),cost=parseNum($('assetCost').value),price=parseNum($('assetPrice').value);state.holdings.push({id:`manual-${Date.now()}`,type,source:'Manual',symbol,name:$('assetName').value.trim(),qty,cost,price,usdValue:qty*price,changePct:0});$('assetForm').reset();$('assetDialog').close();render()});
  $('exportBtn').addEventListener('click',exportBackup);$('backupFile').addEventListener('change',e=>e.target.files[0]&&restoreBackup(e.target.files[0]));
  $('resetBtn').addEventListener('click',()=>{if(confirm('هل تريد مسح البيانات والإعدادات المحلية من هذا الجهاز؟')){localStorage.removeItem(STORAGE_KEY);state=deepClone(defaultState);clearInterval(pollTimer);render()}});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('installBtn').disabled=false});
  $('installBtn').addEventListener('click',async()=>{if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null}else toast('على iPhone: مشاركة ← إضافة إلى الشاشة الرئيسية.')});

  // iOS: block pinch zoom / page rubber-band without blocking normal in-app vertical scrolling.
  document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
  document.addEventListener('gesturechange',e=>e.preventDefault(),{passive:false});
  document.addEventListener('touchmove',e=>{if(e.touches&&e.touches.length>1)e.preventDefault()},{passive:false});

  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  render();startLiveSync();
  window.addEventListener('load',()=>{if(state.settings.accessToken)setTimeout(()=>syncAll(true),500)});
})();