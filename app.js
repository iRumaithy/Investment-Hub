(() => {
  'use strict';
  const AED_RATE = 3.6725;
  const STORAGE_KEY = 'investmentHub_v1';
  const demoHoldings = [
    {id:'s1',type:'stock',source:'XTB',symbol:'NVDA',name:'NVIDIA',qty:18,cost:146.2,price:181.4,changePct:2.84},
    {id:'s2',type:'stock',source:'XTB',symbol:'AAPL',name:'Apple',qty:22,cost:208.5,price:229.9,changePct:1.12},
    {id:'s3',type:'stock',source:'XTB',symbol:'MSFT',name:'Microsoft',qty:12,cost:438.1,price:512.2,changePct:-0.46},
    {id:'c1',type:'crypto',source:'OKX',symbol:'BTC',name:'Bitcoin',coinId:'bitcoin',qty:0.184,cost:83300,price:108420,changePct:1.96},
    {id:'c2',type:'crypto',source:'OKX',symbol:'ETH',name:'Ethereum',coinId:'ethereum',qty:4.6,cost:3220,price:4480,changePct:3.12},
    {id:'c3',type:'crypto',source:'OKX',symbol:'SOL',name:'Solana',coinId:'solana',qty:31,cost:156,price:198,changePct:-1.28}
  ];
  const defaultState = {
    settings:{apiBase:'',accessToken:'',baseCurrency:'AED',demoMode:true},
    holdings:demoHoldings,
    watchlist:[
      {id:'w1',type:'stock',symbol:'TSLA',name:'Tesla',price:329.5,changePct:1.3},
      {id:'w2',type:'crypto',symbol:'XRP',name:'XRP',coinId:'ripple',price:3.05,changePct:-0.8}
    ],
    range:'1M',lastUpdated:null,xtbImportedAt:null,okxSyncedAt:null,marketSyncedAt:null
  };
  let state = load();
  let deferredInstallPrompt = null;

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function deepClone(v){ return JSON.parse(JSON.stringify(v)); }
  function load(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw) return deepClone(defaultState);
      const parsed=JSON.parse(raw);
      return {...deepClone(defaultState),...parsed,settings:{...defaultState.settings,...parsed.settings}};
    }catch{return deepClone(defaultState);}
  }
  function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}
  function moneyUsd(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:v>=1000?0:2}).format(v||0)}
  function money(v,currency=state.settings.baseCurrency){
    const amount=currency==='AED'?v*AED_RATE:v;
    return new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:amount>=1000?0:2}).format(amount||0);
  }
  function pct(v){const n=Number(v||0);return `${n>=0?'+':''}${n.toFixed(2)}%`}
  function valueOf(h){return Number(h.qty||0)*Number(h.price||0)}
  function costOf(h){return Number(h.qty||0)*Number(h.cost||0)}
  function pnlOf(h){return valueOf(h)-costOf(h)}
  function totals(){
    const total=state.holdings.reduce((a,h)=>a+valueOf(h),0);
    const cost=state.holdings.reduce((a,h)=>a+costOf(h),0);
    const stocks=state.holdings.filter(h=>h.type==='stock').reduce((a,h)=>a+valueOf(h),0);
    const crypto=state.holdings.filter(h=>h.type==='crypto').reduce((a,h)=>a+valueOf(h),0);
    const today=state.holdings.reduce((a,h)=>a+valueOf(h)*(Number(h.changePct||0)/100),0);
    return {total,cost,stocks,crypto,pnl:total-cost,today};
  }
  function showToast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>el.classList.remove('show'),2600)}
  function assetIcon(h){return (h.symbol||'?').slice(0,3).toUpperCase()}
  function assetHtml(h,removable=false){
    const v=valueOf(h),p=pnlOf(h),pPct=costOf(h)?p/costOf(h)*100:0;
    return `<article class="asset-item" data-id="${escapeHtml(h.id)}">
      <div class="asset-main"><div class="asset-icon">${escapeHtml(assetIcon(h))}</div><div class="asset-title"><strong>${escapeHtml(h.name||h.symbol)}</strong><span>${escapeHtml(h.symbol)} · ${escapeHtml(h.source||h.type)}</span></div></div>
      <div class="asset-value"><strong>${money(v)}</strong><small class="${p>=0?'positive':'negative'}">${pct(pPct)}</small></div>
      <div class="asset-meta">${Number(h.qty||0).toLocaleString('en-US',{maximumFractionDigits:6})} × ${moneyUsd(h.price)}</div>
      <div class="asset-actions"><button class="asset-action" type="button" data-action="edit">تعديل</button>${removable?'<button class="asset-action" type="button" data-action="remove">حذف</button>':''}</div>
    </article>`;
  }
  function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

  function render(){
    const t=totals();
    $('totalValue').textContent=money(t.total);
    $('totalUsd').textContent=state.settings.baseCurrency==='AED'?moneyUsd(t.total):money(t.total,'AED');
    const totalPct=t.cost?t.pnl/t.cost*100:0;
    $('todayPnl').textContent=`${money(Math.abs(t.today))} · ${pct(t.total?t.today/t.total*100:0)}`;
    $('todayPnl').className=t.today>=0?'positive':'negative';
    $('totalPnl').textContent=`${money(Math.abs(t.pnl))} · ${pct(totalPct)}`;
    $('totalPnl').className=t.pnl>=0?'positive':'negative';
    $('stocksValue').textContent=money(t.stocks); $('stocksPct').textContent=`${t.total?(t.stocks/t.total*100).toFixed(1):0}% من المحفظة`;
    $('cryptoValue').textContent=money(t.crypto); $('cryptoPct').textContent=`${t.total?(t.crypto/t.total*100).toFixed(1):0}% من المحفظة`;
    $('assetCount').textContent=state.holdings.length;
    $('lastUpdate').textContent=state.lastUpdated?new Date(state.lastUpdated).toLocaleTimeString('ar-AE',{hour:'2-digit',minute:'2-digit'}):'الآن';
    $('marketState').textContent=state.marketSyncedAt?'أسعار سوق محدثة':'الأسعار التجريبية';
    $('currencyBtn').textContent=state.settings.baseCurrency;
    $('baseCurrency').value=state.settings.baseCurrency;
    $('apiBase').value=state.settings.apiBase||''; $('accessToken').value=state.settings.accessToken||''; $('demoMode').checked=!!state.settings.demoMode;
    renderChart(); renderTopHoldings(); renderPortfolio(); renderAllocation(); renderWatchlist(); renderAnalytics(); renderConnections(); renderStatus();
    save();
  }

  function renderChart(){
    const svg=$('portfolioChart');const t=totals();const seed=t.total||1;const ranges={"1M":22,"3M":36,"6M":46,"1Y":58,"ALL":70};const count=ranges[state.range]||22;
    const pts=[];for(let i=0;i<count;i++){const trend=.78+(i/(count-1))*.22;const wave=Math.sin(i*.75)*.018+Math.cos(i*.31)*.012;pts.push(seed*(trend+wave));}
    const min=Math.min(...pts)*.985,max=Math.max(...pts)*1.01,w=640,h=170,p=8;
    const coords=pts.map((v,i)=>[p+i*(w-2*p)/(pts.length-1),h-p-(v-min)/(max-min||1)*(h-2*p)]);
    const d=coords.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const area=`${d} L${coords.at(-1)[0]},${h-p} L${coords[0][0]},${h-p} Z`;
    svg.innerHTML=`<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6b76a" stop-opacity=".28"/><stop offset="1" stop-color="#d6b76a" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#g)"/><path d="${d}" fill="none" stroke="#d6b76a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  function renderTopHoldings(){const list=[...state.holdings].sort((a,b)=>valueOf(b)-valueOf(a)).slice(0,5);$('topHoldings').innerHTML=list.length?list.map(h=>assetHtml(h)).join(''):'<div class="empty">لا توجد أصول.</div>'}
  function renderPortfolio(){
    const f=document.querySelector('.filter.active')?.dataset.filter||'all';const list=state.holdings.filter(h=>f==='all'||h.type===f).sort((a,b)=>valueOf(b)-valueOf(a));
    $('portfolioList').innerHTML=list.length?list.map(h=>assetHtml(h,true)).join(''):'<div class="empty">لا توجد أصول في هذا التصنيف.</div>';
  }
  function renderAllocation(){
    const t=totals();const s=t.total?t.stocks/t.total*100:0,c=t.total?t.crypto/t.total*100:0;
    $('allocationDonut').style.background=`conic-gradient(var(--blue) 0 ${s}%, var(--cyan) ${s}% ${s+c}%, #213748 ${s+c}% 100%)`;
    $('allocationLegend').innerHTML=`<div class="legend-row"><i class="legend-dot" style="background:var(--blue)"></i><span>أسهم XTB</span><span>${s.toFixed(1)}%</span></div><div class="legend-row"><i class="legend-dot" style="background:var(--cyan)"></i><span>Crypto OKX</span><span>${c.toFixed(1)}%</span></div>`;
  }
  function renderWatchlist(){
    $('watchList').innerHTML=state.watchlist.length?state.watchlist.map(w=>`<article class="asset-item"><div class="asset-main"><div class="asset-icon">${escapeHtml(w.symbol)}</div><div class="asset-title"><strong>${escapeHtml(w.name||w.symbol)}</strong><span>${w.type==='stock'?'سهم':'Crypto'}</span></div></div><div class="asset-value"><strong>${moneyUsd(w.price||0)}</strong><small class="${Number(w.changePct)>=0?'positive':'negative'}">${pct(w.changePct)}</small></div><button class="remove-watch" data-watch-remove="${escapeHtml(w.id)}" type="button">حذف</button></article>`).join(''):'<div class="empty">قائمة المراقبة فارغة.</div>';
  }
  function renderAnalytics(){
    const t=totals();const best=[...state.holdings].sort((a,b)=>(b.changePct||0)-(a.changePct||0))[0];const worst=[...state.holdings].sort((a,b)=>(a.changePct||0)-(b.changePct||0))[0];
    $('analyticsCards').innerHTML=`<article class="metric-card"><span>أفضل أداء اليوم</span><strong class="positive">${escapeHtml(best?.symbol||'—')} ${best?pct(best.changePct):''}</strong><small>${escapeHtml(best?.name||'')}</small></article><article class="metric-card"><span>أضعف أداء اليوم</span><strong class="negative">${escapeHtml(worst?.symbol||'—')} ${worst?pct(worst.changePct):''}</strong><small>${escapeHtml(worst?.name||'')}</small></article><article class="metric-card"><span>العائد الكلي</span><strong class="${t.pnl>=0?'positive':'negative'}">${pct(t.cost?t.pnl/t.cost*100:0)}</strong><small>${money(t.pnl)}</small></article><article class="metric-card"><span>أكبر أصل</span><strong>${escapeHtml([...state.holdings].sort((a,b)=>valueOf(b)-valueOf(a))[0]?.symbol||'—')}</strong><small>حسب القيمة الحالية</small></article>`;
    const sorted=[...state.holdings].sort((a,b)=>valueOf(b)-valueOf(a));const max=Math.max(1,...sorted.map(valueOf));
    $('largestPositions').innerHTML=sorted.slice(0,6).map(h=>`<div class="bar-row"><strong>${escapeHtml(h.symbol)}</strong><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3,valueOf(h)/max*100)}%"></div></div><span>${money(valueOf(h))}</span></div>`).join('');
    const perf=[...state.holdings].sort((a,b)=>pnlOf(b)-pnlOf(a));const maxP=Math.max(1,...perf.map(h=>Math.abs(pnlOf(h))));
    $('performanceList').innerHTML=perf.slice(0,6).map(h=>{const p=pnlOf(h);return `<div class="bar-row"><strong>${escapeHtml(h.symbol)}</strong><div class="bar-track"><div class="bar-fill ${p>=0?'gain':'loss'}" style="width:${Math.max(3,Math.abs(p)/maxP*100)}%"></div></div><span class="${p>=0?'positive':'negative'}">${money(p)}</span></div>`}).join('');
  }
  function renderConnections(){
    const ok=!!state.okxSyncedAt,xtb=!!state.xtbImportedAt,mkt=!!state.marketSyncedAt;
    setPill('okxStatus',ok?'مربوط':'تجريبي',ok);setPill('xtbStatus',xtb?'مستورد':'بيانات تجريبية',xtb);setPill('priceStatus',mkt?'محدثة':'تجريبية',mkt);
    setPill('okxConnectionPill',ok?'متصل':'غير مربوط',ok);setPill('xtbConnectionPill',xtb?'مستورد':'استيراد يدوي',xtb);setPill('marketConnectionPill',mkt?'Live':'Demo',mkt);
    $('xtbImportInfo').textContent=xtb?`آخر استيراد: ${new Date(state.xtbImportedAt).toLocaleString('ar-AE')}`:'لم يتم استيراد ملف بعد.';
  }
  function setPill(id,text,good){const el=$(id);el.textContent=text;el.className=`pill ${good?'good':'warn'}`}
  function renderStatus(){
    const live=!!state.settings.apiBase && (state.marketSyncedAt||state.okxSyncedAt);const strip=$('statusStrip');
    strip.innerHTML=`<span class="dot ${live?'live':'demo'}"></span><span>${live?'الاتصال فعّال — البيانات المحدثة تظهر عند نجاح المزامنة.':'الوضع التجريبي مفعّل — أضف رابط Worker من الإعدادات للبيانات الحقيقية.'}</span>`;
  }

  function setView(name){$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));window.scrollTo({top:0,behavior:'smooth'})}

  async function api(path){
    const base=(state.settings.apiBase||'').replace(/\/$/,'');if(!base)throw new Error('أدخل رابط Cloudflare Worker أولًا.');
    const headers={'Accept':'application/json'};if(state.settings.accessToken)headers['Authorization']=`Bearer ${state.settings.accessToken}`;const r=await fetch(base+path,{headers});let data={};try{data=await r.json()}catch{}if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);return data;
  }
  async function syncOkx(){
    toggleLoading('syncOkxBtn',true);try{
      const data=await api('/api/okx/balance');
      if(!Array.isArray(data.holdings)) throw new Error('استجابة OKX غير متوقعة.');
      const existingStocks=state.holdings.filter(h=>h.type==='stock');
      const existingCrypto=new Map(state.holdings.filter(h=>h.type==='crypto').map(h=>[String(h.symbol).toUpperCase(),h]));
      const crypto=data.holdings.filter(h=>Number(h.qty)>0).map((h,i)=>{const prev=existingCrypto.get(String(h.symbol).toUpperCase());return {id:`okx-${h.symbol}-${i}`,type:'crypto',source:'OKX',symbol:h.symbol,name:h.name||h.symbol,coinId:h.coinId||'',qty:Number(h.qty),cost:Number(prev?.cost||h.cost||h.price||0),price:Number(h.price||prev?.price||0),changePct:Number(h.changePct||prev?.changePct||0)}});
      state.holdings=[...existingStocks,...crypto];state.okxSyncedAt=Date.now();state.lastUpdated=Date.now();render();showToast(`تمت مزامنة OKX: ${crypto.length} أصل.`);
    }catch(e){showToast(e.message||'تعذر مزامنة OKX.')}finally{toggleLoading('syncOkxBtn',false)}
  }
  async function syncMarket(){
    toggleLoading('syncMarketBtn',true);toggleLoading('refreshBtn',true);try{
      const stocks=state.holdings.filter(h=>h.type==='stock').map(h=>h.symbol).join(',');
      const crypto=state.holdings.filter(h=>h.type==='crypto').map(h=>h.coinId||cryptoId(h.symbol)).filter(Boolean).join(',');
      const data=await api(`/api/market/prices?stocks=${encodeURIComponent(stocks)}&crypto=${encodeURIComponent(crypto)}`);
      state.holdings=state.holdings.map(h=>{
        const item=h.type==='stock'?data.stocks?.[h.symbol.toUpperCase()]:data.crypto?.[h.coinId||cryptoId(h.symbol)];
        return item?{...h,price:Number(item.price??h.price),changePct:Number(item.changePct??h.changePct)}:h;
      });
      state.watchlist=state.watchlist.map(w=>{
        const item=w.type==='stock'?data.stocks?.[w.symbol.toUpperCase()]:data.crypto?.[w.coinId||cryptoId(w.symbol)];
        return item?{...w,price:Number(item.price??w.price),changePct:Number(item.changePct??w.changePct)}:w;
      });
      state.marketSyncedAt=Date.now();state.lastUpdated=Date.now();render();showToast('تم تحديث أسعار السوق.');
    }catch(e){showToast(e.message||'تعذر تحديث السوق.')}finally{toggleLoading('syncMarketBtn',false);toggleLoading('refreshBtn',false)}
  }
  function cryptoId(symbol){return ({BTC:'bitcoin',ETH:'ethereum',SOL:'solana',XRP:'ripple',ADA:'cardano',DOGE:'dogecoin',AVAX:'avalanche-2',LINK:'chainlink',DOT:'polkadot'})[String(symbol).toUpperCase()]||''}
  function toggleLoading(id,on){const el=$(id);if(!el)return;el.disabled=on;el.classList.toggle('loading',on)}

  async function importXtb(file){
    try{
      const rows=await parseSpreadsheet(file);if(!rows.length)throw new Error('الملف فارغ أو لم أتعرف على جدوله.');
      const holdings=rows.map((row,i)=>normalizeXtbRow(row,i)).filter(Boolean);
      if(!holdings.length)throw new Error('لم أجد أعمدة الرمز والكمية وسعر الشراء. جرّب تقرير Open Positions من XTB أو CSV.');
      const crypto=state.holdings.filter(h=>h.type==='crypto');state.holdings=[...holdings,...crypto];state.xtbImportedAt=Date.now();state.lastUpdated=Date.now();render();showToast(`تم استيراد ${holdings.length} مركز من XTB.`);
      if(state.settings.apiBase) syncMarket();
    }catch(e){showToast(e.message||'تعذر قراءة ملف XTB.')}finally{$('xtbFile').value=''}
  }
  async function parseSpreadsheet(file){
    const name=file.name.toLowerCase();
    if(name.endsWith('.csv')){const text=await file.text();return csvToObjects(text)}
    if(typeof XLSX==='undefined') throw new Error('مكتبة XLSX لم تُحمّل. افتح التطبيق مع اتصال إنترنت أو صدّر الملف كـ CSV.');
    const ab=await file.arrayBuffer();const wb=XLSX.read(ab,{type:'array'});let best=[];
    for(const sn of wb.SheetNames){const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{defval:''});if(rows.length>best.length)best=rows}
    return best;
  }
  function csvToObjects(text){
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim());if(lines.length<2)return[];const sep=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?';':',';const headers=splitCsvLine(lines[0],sep);
    return lines.slice(1).map(line=>{const vals=splitCsvLine(line,sep);const o={};headers.forEach((h,i)=>o[h]=vals[i]??'');return o});
  }
  function splitCsvLine(line,sep){let out=[],cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(c===sep&&!q){out.push(cur.trim());cur=''}else cur+=c}out.push(cur.trim());return out}
  function normalizeXtbRow(row,i){
    const entries=Object.entries(row);const get=(patterns)=>{for(const [k,v] of entries){const key=String(k).toLowerCase().replace(/[_\-]/g,' ');if(patterns.some(p=>key.includes(p)))return v}return ''};
    let symbol=String(get(['symbol','ticker','instrument','market','name','رمز','الأداة'])).trim();
    symbol=symbol.replace(/\.US$/i,'').split(/\s+/)[0].toUpperCase();
    const qty=num(get(['volume','quantity','qty','shares','amount','الكمية','الحجم']));
    const cost=num(get(['open price','opening price','average price','avg price','purchase price','price open','سعر الفتح','سعر الشراء']));
    let current=num(get(['current price','market price','close price','السعر الحالي']));
    if(!symbol||!qty||qty<0||!cost)return null;if(!current)current=cost;
    return {id:`xtb-${symbol}-${i}-${Date.now()}`,type:'stock',source:'XTB',symbol,name:symbol,qty,cost,price:current,changePct:0};
  }
  function num(v){if(typeof v==='number')return v;const s=String(v??'').replace(/[^0-9,.-]/g,'').replace(/,(?=\d{3}(\D|$))/g,'').replace(',','.');const n=parseFloat(s);return Number.isFinite(n)?n:0}

  function exportBackup(){const safe=deepClone(state);if(safe.settings)safe.settings.accessToken='';const blob=new Blob([JSON.stringify(safe,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`investment-hub-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);showToast('تم إنشاء النسخة الاحتياطية.')}
  async function restoreBackup(file){try{const data=JSON.parse(await file.text());if(!Array.isArray(data.holdings)||!data.settings)throw new Error();state={...deepClone(defaultState),...data,settings:{...defaultState.settings,...data.settings}};render();showToast('تمت استعادة النسخة بنجاح.')}catch{showToast('ملف النسخة الاحتياطية غير صالح.')}}

  $$('.tab').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $$('[data-go]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.go)));
  $$('.range').forEach(b=>b.addEventListener('click',()=>{$$('.range').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.range=b.dataset.range;renderChart();save()}));
  $$('.filter').forEach(b=>b.addEventListener('click',()=>{$$('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderPortfolio()}));
  $('currencyBtn').addEventListener('click',()=>{state.settings.baseCurrency=state.settings.baseCurrency==='AED'?'USD':'AED';render()});
  $('refreshBtn').addEventListener('click',()=>state.settings.apiBase?syncMarket():showToast('الأسعار الحالية تجريبية. أضف رابط Worker لتفعيل السوق.'));
  $('syncMarketBtn').addEventListener('click',syncMarket);$('syncOkxBtn').addEventListener('click',syncOkx);
  $('xtbFile').addEventListener('change',e=>e.target.files[0]&&importXtb(e.target.files[0]));
  $('settingsForm').addEventListener('submit',e=>{e.preventDefault();state.settings.apiBase=$('apiBase').value.trim().replace(/\/$/,'');state.settings.accessToken=$('accessToken').value.trim();state.settings.baseCurrency=$('baseCurrency').value;state.settings.demoMode=$('demoMode').checked;render();showToast('تم حفظ الإعدادات.');});
  $('watchForm').addEventListener('submit',e=>{e.preventDefault();const symbol=$('watchSymbol').value.trim().toUpperCase();const type=$('watchType').value;if(!symbol)return;state.watchlist.push({id:`w-${Date.now()}`,type,symbol,name:symbol,coinId:type==='crypto'?cryptoId(symbol):'',price:0,changePct:0});$('watchSymbol').value='';render();showToast('تمت الإضافة لقائمة المراقبة.');if(state.settings.apiBase)syncMarket()});
  $('watchList').addEventListener('click',e=>{const id=e.target.dataset.watchRemove;if(id){state.watchlist=state.watchlist.filter(w=>w.id!==id);render()}});
  $('portfolioList').addEventListener('click',e=>{const item=e.target.closest('.asset-item');if(!item)return;if(e.target.dataset.action==='remove'){state.holdings=state.holdings.filter(h=>h.id!==item.dataset.id);render();showToast('تم حذف الأصل.')}else item.classList.toggle('expanded')});
  $('openAddAsset').addEventListener('click',()=>$('assetDialog').showModal());$('closeAssetDialog').addEventListener('click',()=>$('assetDialog').close());
  $('assetForm').addEventListener('submit',e=>{e.preventDefault();const type=$('assetType').value,symbol=$('assetSymbol').value.trim().toUpperCase();state.holdings.push({id:`manual-${Date.now()}`,type,source:'Manual',symbol,name:$('assetName').value.trim(),coinId:type==='crypto'?cryptoId(symbol):'',qty:num($('assetQty').value),cost:num($('assetCost').value),price:num($('assetPrice').value),changePct:0});$('assetForm').reset();$('assetDialog').close();render();showToast('تمت إضافة الأصل.');});
  $('exportBtn').addEventListener('click',exportBackup);$('backupFile').addEventListener('change',e=>e.target.files[0]&&restoreBackup(e.target.files[0]));
  $('resetBtn').addEventListener('click',()=>{if(confirm('هل تريد إعادة ضبط كل البيانات المحلية؟')){state=deepClone(defaultState);render();showToast('تمت إعادة الضبط.')}});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('installBtn').disabled=false;});
  $('installBtn').addEventListener('click',async()=>{if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null}else showToast('على iPhone: مشاركة ← إضافة إلى الشاشة الرئيسية.');});
  if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  render();
})();
