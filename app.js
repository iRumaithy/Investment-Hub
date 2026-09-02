(() => {
  'use strict';
  const AED_RATE=3.6725,STORAGE_KEY='investmentHub_v1',APP_VERSION='2.5.0';
  const DEFAULT_API_BASE=/^https?:$/.test(location.protocol)?location.origin:'';
  const OLD_DEMO_IDS=new Set(['s1','s2','s3','c1','c2','c3','w1','w2']);
  const POLL_MS=30000;
  const defaultState={
    dataVersion:APP_VERSION,
    settings:{apiBase:DEFAULT_API_BASE,accessToken:'',baseCurrency:'AED'},
    holdings:[],watchlist:[],investmentTrades:[],range:'1D',
    lastUpdated:null,xtbImportedAt:null,okxSyncedAt:null,marketSyncedAt:null,
    okxAccountTotalUsd:0,okxTotalPnl:null,okxTotalPnlRatio:null,
    okxDiagnostics:{officialTotalUsd:0,computedTotalUsd:0,differenceUsd:0,differencePct:0,tradingUsd:0,fundingUsd:0,earnUsd:0,status:'unknown',lastSync:null}
  };
  const $=id=>document.getElementById(id),$$=s=>Array.from(document.querySelectorAll(s)),clone=v=>JSON.parse(JSON.stringify(v));
  function load(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return clone(defaultState);
      const p=JSON.parse(raw),s={...clone(defaultState),...p,settings:{...defaultState.settings,...(p.settings||{})}};
      if(s.dataVersion!==APP_VERSION){
        s.holdings=(s.holdings||[]).filter(x=>!OLD_DEMO_IDS.has(x.id));
        s.watchlist=(s.watchlist||[]).filter(x=>!OLD_DEMO_IDS.has(x.id));
        s.investmentTrades=Array.isArray(s.investmentTrades)?s.investmentTrades:[];
        s.okxDiagnostics={...defaultState.okxDiagnostics,...(s.okxDiagnostics||{})};
        s.range=s.range||'1D';s.dataVersion=APP_VERSION;
      }
      s.investmentTrades=Array.isArray(s.investmentTrades)?s.investmentTrades:[];
      s.okxDiagnostics={...defaultState.okxDiagnostics,...(s.okxDiagnostics||{})};
      return s;
    }catch{return clone(defaultState)}
  }
  let state=load(),pollTimer=null,deferredInstallPrompt=null,currentChartAsset=null,currentAssetRange='1D',mainChartRequest=0,marketWs=null,wsRetry=null;
  const save=()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  const num=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const moneyUsd=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(v||0);
  const signedMoneyUsd=v=>v===null||v===undefined?'—':`${num(v)>=0?'+':'-'}${moneyUsd(Math.abs(num(v)))}`;
  const money=(v,c=state.settings.baseCurrency)=>{const a=c==='AED'?v*AED_RATE:v;return new Intl.NumberFormat('en-US',{style:'currency',currency:c,maximumFractionDigits:Math.abs(a)>=1000?0:2}).format(a||0)};
  const pct=v=>v===null||v===undefined?'—':`${num(v)>=0?'+':''}${num(v).toFixed(2)}%`;
  const valueOf=h=>num(h.usdValue)>0?num(h.usdValue):num(h.qty)*num(h.price);
  const costOf=h=>num(h.qty)*num(h.cost);

  function totals(){
    const computed=state.holdings.reduce((a,h)=>a+valueOf(h),0);
    const crypto=state.holdings.filter(h=>h.type==='crypto').reduce((a,h)=>a+valueOf(h),0);
    const stocks=state.holdings.filter(h=>h.type==='stock').reduce((a,h)=>a+valueOf(h),0);
    const total=state.okxAccountTotalUsd>0?state.okxAccountTotalUsd+stocks:computed;
    return{total,crypto,stocks}
  }
  function toast(m){const e=$('toast');e.textContent=m;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2800)}
  function setPill(id,t,g){const e=$(id);if(!e)return;e.textContent=t;e.className=`pill ${g?'good':'warn'}`}
  function loading(id,on){const e=$(id);if(!e)return;e.disabled=on;e.classList.toggle('loading',on)}

  function assetHtml(h,removable=false){
    const pnlKnown=h.pnl!==null&&h.pnl!==undefined;
    const pnlRatioKnown=h.pnlRatio!==null&&h.pnlRatio!==undefined;
    const pnlUsd=pnlKnown?num(h.pnl):null;
    return `<article class="asset-item" data-id="${esc(h.id)}">
      <div class="asset-main"><div class="asset-icon">${esc((h.symbol||'?').slice(0,4))}</div><div class="asset-title"><strong>${esc(h.name||h.symbol)}</strong><span>${esc(h.symbol)} · ${esc(h.source||h.type)}</span></div></div>
      <div class="asset-value"><strong>${money(valueOf(h))}</strong><small class="${(pnlKnown||pnlRatioKnown)?((pnlKnown?num(h.pnl):num(h.pnlRatio))>=0?'positive':'negative'):''}">${pnlKnown&&pnlRatioKnown?`${signedMoneyUsd(pnlUsd)} (${pct(h.pnlRatio)})`:pnlKnown?signedMoneyUsd(pnlUsd):pnlRatioKnown?pct(h.pnlRatio):'—'}</small></div>
      <div class="asset-meta">${num(h.qty).toLocaleString('en-US',{maximumFractionDigits:8})} × ${moneyUsd(h.price)}</div>
      <div class="asset-actions"><button class="asset-action" type="button" data-action="chart">الرسم البياني</button>${removable?'<button class="asset-action" type="button" data-action="remove">حذف</button>':''}</div>
    </article>`;
  }

  function render(){
    const t=totals();
    $('totalValue').textContent=money(t.total);$('totalUsd').textContent=state.settings.baseCurrency==='AED'?moneyUsd(t.total):money(t.total,'AED');
    const knownPnl=state.okxTotalPnl!==null&&state.okxTotalPnl!==undefined;
    $('totalPnl').textContent=knownPnl?`${state.settings.baseCurrency==='AED'?(num(state.okxTotalPnl)>=0?'+':'-')+money(Math.abs(state.okxTotalPnl)):signedMoneyUsd(state.okxTotalPnl)} (${pct(state.okxTotalPnlRatio)})`:'—';
    $('totalPnl').className=knownPnl?(num(state.okxTotalPnl)>=0?'positive':'negative'):'';
    $('todayPnl').textContent='—';$('todayPnl').className='';
    $('stocksValue').textContent=money(t.stocks);$('stocksPct').textContent=`${t.total?t.stocks/t.total*100:0}% من المحفظة`;
    $('cryptoValue').textContent=money(state.okxAccountTotalUsd||t.crypto);$('cryptoPct').textContent=`${t.total?((state.okxAccountTotalUsd||t.crypto)/t.total*100).toFixed(1):0}% من المحفظة`;
    $('assetCount').textContent=state.holdings.length;$('lastUpdate').textContent=state.lastUpdated?new Date(state.lastUpdated).toLocaleTimeString('ar-AE',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
    $('marketState').textContent=state.marketSyncedAt?'أسعار سوق محدثة':'بانتظار المزامنة';$('currencyBtn').textContent=state.settings.baseCurrency;
    $('baseCurrency').value=state.settings.baseCurrency;$('apiBase').value=state.settings.apiBase||'';$('accessToken').value=state.settings.accessToken||'';
    renderTop();renderPortfolio();renderAllocation();renderWatch();renderAnalytics();renderConnections();renderStatus();renderInvestmentLog();renderOkxDiagnostics();save();
  }

  function renderTop(){const a=[...state.holdings].sort((x,y)=>valueOf(y)-valueOf(x)).slice(0,5);$('topHoldings').innerHTML=a.length?a.map(h=>assetHtml(h)).join(''):'<div class="empty">لا توجد بيانات وهمية. اربط OKX أو استورد XTB.</div>'}
  function renderPortfolio(){const f=document.querySelector('.filter.active')?.dataset.filter||'all',a=state.holdings.filter(h=>f==='all'||h.type===f).sort((x,y)=>valueOf(y)-valueOf(x));$('portfolioList').innerHTML=a.length?a.map(h=>assetHtml(h,true)).join(''):'<div class="empty">لا توجد أصول فعلية في هذا التصنيف.</div>'}
  function renderWatch(){$('watchList').innerHTML=state.watchlist.length?state.watchlist.map(w=>assetHtml({...w,qty:1,usdValue:w.price,source:'Watchlist'})).join(''):'<div class="empty">قائمة المراقبة فارغة.</div>'}
  function renderAllocation(){const t=totals(),s=t.total?t.stocks/t.total*100:0,c=t.total?(state.okxAccountTotalUsd||t.crypto)/t.total*100:0;$('allocationDonut').style.background=t.total?`conic-gradient(var(--gold) 0 ${s}%,#8b8b88 ${s}% ${Math.min(100,s+c)}%,#ebe7dd ${Math.min(100,s+c)}% 100%)`:'#eeeae2';$('allocationLegend').innerHTML=`<div class="legend-row"><i class="legend-dot" style="background:var(--gold)"></i><span>أسهم XTB</span><span>${s.toFixed(1)}%</span></div><div class="legend-row"><i class="legend-dot" style="background:#8b8b88"></i><span>Crypto OKX</span><span>${c.toFixed(1)}%</span></div>`}
  function renderAnalytics(){const sorted=[...state.holdings].sort((a,b)=>valueOf(b)-valueOf(a));$('analyticsCards').innerHTML=`<article class="metric-card"><span>إجمالي PnL من OKX</span><strong class="${num(state.okxTotalPnl)>=0?'positive':'negative'}">${state.okxTotalPnl===null?'—':money(state.okxTotalPnl)}</strong></article><article class="metric-card"><span>نسبة PnL</span><strong>${pct(state.okxTotalPnlRatio)}</strong></article><article class="metric-card"><span>قيمة المحفظة</span><strong>${money(totals().total)}</strong></article><article class="metric-card"><span>أكبر أصل</span><strong>${esc(sorted[0]?.symbol||'—')}</strong></article>`;const max=Math.max(1,...sorted.map(valueOf));$('largestPositions').innerHTML=sorted.length?sorted.slice(0,6).map(h=>`<div class="bar-row"><strong>${esc(h.symbol)}</strong><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2,valueOf(h)/max*100)}%"></div></div><span>${money(valueOf(h))}</span></div>`).join(''):'<div class="empty">لا توجد بيانات.</div>';$('performanceList').innerHTML=state.holdings.length?state.holdings.slice(0,6).map(h=>`<div class="bar-row"><strong>${esc(h.symbol)}</strong><div class="bar-track"><div class="bar-fill ${h.pnlRatio!==null&&num(h.pnlRatio)>=0?'gain':'loss'}" style="width:${h.pnlRatio===null?0:Math.min(100,Math.max(3,Math.abs(num(h.pnlRatio))*3))}%"></div></div><span class="${h.pnlRatio!==null&&num(h.pnlRatio)>=0?'positive':'negative'}">${h.pnl!==null&&h.pnl!==undefined?`${signedMoneyUsd(h.pnl)} (${pct(h.pnlRatio)})`:pct(h.pnlRatio)}</span></div>`).join(''):'<div class="empty">لا توجد بيانات.</div>'}
  function renderConnections(){const ok=!!state.okxSyncedAt,xtb=!!state.xtbImportedAt,mkt=!!state.marketSyncedAt;setPill('okxStatus',ok?'متصل ومزامن':'غير متصل',ok);setPill('xtbStatus',xtb?'مستورد':'لم يُستورد',xtb);setPill('priceStatus',mkt?'محدثة':'بانتظار الربط',mkt);setPill('okxConnectionPill',ok?'متصل':'غير مربوط',ok);setPill('xtbConnectionPill',xtb?'مستورد':'استيراد يدوي',xtb);setPill('marketConnectionPill',mkt?'Twelve Data Live':'بانتظار TWELVE_DATA_KEY',mkt);$('xtbImportInfo').textContent=xtb?`آخر استيراد: ${new Date(state.xtbImportedAt).toLocaleString('ar-AE')}`:'لم يتم استيراد ملف بعد.'}
  function renderStatus(){const d=state.okxDiagnostics||{};const mismatch=state.okxSyncedAt&&d.status==='difference';$('statusStrip').innerHTML=`<span class="dot ${state.okxSyncedAt&&!mismatch?'live':''}"></span><span>${state.okxSyncedAt?(mismatch?'OKX متصل، لكن يوجد فرق بين الإجمالي الرسمي ومجموع الأصول — راجع تشخيص OKX في تبويب الربط.':'OKX متصل — القيمة والكميات وPnL من المزامنة الخاصة، والسعر اللحظي للعرض فقط.'):'لا توجد بيانات تجريبية — اربط حسابك لإظهار بياناتك.'}</span>`}

  function renderOkxDiagnostics(){
    const box=$('okxAccuracyBox');if(!box)return;
    const d=state.okxDiagnostics||defaultState.okxDiagnostics;
    const synced=!!state.okxSyncedAt;
    if(!synced){
      box.innerHTML='<div class="empty compact-empty">تظهر تفاصيل دقة OKX بعد أول مزامنة.</div>';
      return;
    }
    const diff=num(d.differenceUsd),diffPct=num(d.differencePct);
    const good=d.status==='matched';
    const fmt=v=>moneyUsd(num(v));
    box.innerHTML=`
      <div class="accuracy-head"><strong>${good?'✓ متطابق':'⚠ يوجد فرق مزامنة'}</strong><span class="pill ${good?'good':'warn'}">${good?'دقيق':'راجع التفاصيل'}</span></div>
      <div class="accuracy-grid">
        <div><span>إجمالي OKX الرسمي</span><strong>${fmt(d.officialTotalUsd)}</strong></div>
        <div><span>مجموع الأصول</span><strong>${fmt(d.computedTotalUsd)}</strong></div>
        <div><span>Trading</span><strong>${fmt(d.tradingUsd)}</strong></div>
        <div><span>Funding</span><strong>${fmt(d.fundingUsd)}</strong></div>
        <div><span>Earn</span><strong>${fmt(d.earnUsd)}</strong></div>
        <div><span>الفرق</span><strong class="${Math.abs(diffPct)<=0.5?'positive':'negative'}">${diff>=0?'+':''}${fmt(diff)} · ${diffPct.toFixed(2)}%</strong></div>
      </div>
      <small>آخر مزامنة كاملة: ${d.lastSync?new Date(d.lastSync).toLocaleTimeString('ar-AE',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—'} · يتم التحديث تلقائيًا كل 30 ثانية أثناء فتح التطبيق.</small>`;
  }

  function ledgerData(){
    const trades=[...(state.investmentTrades||[])].sort((a,b)=>{
      const da=String(a.date||''),db=String(b.date||'');
      if(da!==db)return da.localeCompare(db);
      return num(a.createdAt)-num(b.createdAt);
    });
    const positions=new Map(),rows=[],sellRows=[];
    for(const t of trades){
      const key=`${t.type}|${String(t.symbol||'').toUpperCase()}`;
      const p=positions.get(key)||{key,type:t.type,symbol:String(t.symbol||'').toUpperCase(),name:t.name||t.symbol,qty:0,cost:0,avgCost:0,targetPct:null,platform:t.platform||'يدوي'};
      const qty=num(t.qty),price=num(t.price),fees=num(t.fees);
      if(t.side==='BUY'){
        const total=qty*price+fees;
        p.cost+=total;p.qty+=qty;p.avgCost=p.qty>0?p.cost/p.qty:0;
        if(t.targetPct!==null&&t.targetPct!==undefined&&String(t.targetPct)!=='')p.targetPct=num(t.targetPct);
        rows.push({...t,realized:null,realizedPct:null,total});
      }else{
        const sellQty=Math.min(qty,p.qty),basis=p.avgCost*sellQty,proceeds=sellQty*price-fees;
        const realized=proceeds-basis,realizedPct=basis>0?realized/basis*100:null;
        p.qty=Math.max(0,p.qty-sellQty);p.cost=Math.max(0,p.cost-basis);p.avgCost=p.qty>0?p.cost/p.qty:0;
        const row={...t,realized,realizedPct,total:proceeds,basis,sellQty};
        rows.push(row);sellRows.push(row);
      }
      positions.set(key,p);
    }
    const open=[...positions.values()].filter(p=>p.qty>1e-12).map(p=>{
      const h=state.holdings.find(x=>x.type===p.type&&String(x.symbol).toUpperCase()===p.symbol);
      const live=h?num(h.marketPrice||h.price):0;
      const value=live>0?p.qty*live:null;
      const unrealized=value!==null?value-p.cost:null;
      const unrealizedPct=unrealized!==null&&p.cost>0?unrealized/p.cost*100:null;
      return{...p,live,value,unrealized,unrealizedPct};
    });
    return{trades,rows,positions:[...positions.values()],open,sellRows};
  }

  function renderInvestmentLog(){
    const list=$('tradeList');if(!list)return;
    const {rows,open,sellRows}=ledgerData();
    const buyTotal=rows.filter(r=>r.side==='BUY').reduce((a,r)=>a+num(r.total),0);
    const realized=sellRows.reduce((a,r)=>a+num(r.realized),0);
    const openCost=open.reduce((a,p)=>a+num(p.cost),0);
    const unrealizedKnown=open.filter(p=>p.unrealized!==null);
    const unrealized=unrealizedKnown.reduce((a,p)=>a+num(p.unrealized),0);
    const wins=sellRows.filter(r=>num(r.realized)>0).length;
    const winRate=sellRows.length?wins/sellRows.length*100:0;
    const set=(id,val,cls='')=>{const e=$(id);if(e){e.textContent=val;e.className=cls}};
    set('logInvested',moneyUsd(buyTotal));
    set('logRealized',`${realized>=0?'+':'-'}${moneyUsd(Math.abs(realized))}`,realized>=0?'positive':'negative');
    set('logUnrealized',unrealizedKnown.length?`${unrealized>=0?'+':'-'}${moneyUsd(Math.abs(unrealized))}`:'—',unrealized>=0?'positive':'negative');
    set('logWinRate',`${winRate.toFixed(1)}%`);

    const openEl=$('openInvestmentPositions');
    if(openEl){
      openEl.innerHTML=open.length?open.sort((a,b)=>b.cost-a.cost).map(p=>`
        <article class="trade-card open-position-card">
          <div class="trade-head"><div><strong>${esc(p.name||p.symbol)}</strong><span>${esc(p.symbol)} · ${esc(p.platform||'')}</span></div><div class="trade-side buy">مفتوح</div></div>
          <div class="trade-grid">
            <div><span>الكمية</span><strong>${p.qty.toLocaleString('en-US',{maximumFractionDigits:8})}</strong></div>
            <div><span>متوسط التكلفة</span><strong>${moneyUsd(p.avgCost)}</strong></div>
            <div><span>رأس المال المتبقي</span><strong>${moneyUsd(p.cost)}</strong></div>
            <div><span>السعر الحالي</span><strong>${p.live>0?moneyUsd(p.live):'—'}</strong></div>
          </div>
          <div class="trade-result ${p.unrealized===null?'':p.unrealized>=0?'positive':'negative'}">
            غير محقق: ${p.unrealized===null?'—':`${p.unrealized>=0?'+':'-'}${moneyUsd(Math.abs(p.unrealized))} (${pct(p.unrealizedPct)})`}
            ${p.targetPct!==null?`<small> · هدفك ${p.targetPct>=0?'+':''}${p.targetPct.toFixed(1)}%</small>`:''}
          </div>
        </article>`).join(''):'<div class="empty">لا توجد استثمارات مفتوحة في السجل.</div>';
    }

    const filter=$('tradeFilter')?.value||'all';
    const visible=rows.filter(r=>filter==='all'||r.type===filter).sort((a,b)=>(String(b.date||'').localeCompare(String(a.date||'')))||num(b.createdAt)-num(a.createdAt));
    list.innerHTML=visible.length?visible.map(r=>`
      <article class="trade-card" data-trade-id="${esc(r.id)}">
        <div class="trade-head">
          <div><strong>${esc(r.name||r.symbol)}</strong><span>${esc(r.symbol)} · ${esc(r.platform||'يدوي')} · ${esc(r.date||'')}</span></div>
          <div class="trade-side ${r.side==='BUY'?'buy':'sell'}">${r.side==='BUY'?'شراء':'بيع'}</div>
        </div>
        <div class="trade-grid">
          <div><span>الكمية</span><strong>${num(r.qty).toLocaleString('en-US',{maximumFractionDigits:8})}</strong></div>
          <div><span>سعر الوحدة</span><strong>${moneyUsd(r.price)}</strong></div>
          <div><span>${r.side==='BUY'?'المدفوع':'صافي البيع'}</span><strong>${moneyUsd(r.total)}</strong></div>
          <div><span>الرسوم</span><strong>${moneyUsd(r.fees)}</strong></div>
        </div>
        ${r.side==='SELL'?`<div class="trade-result ${num(r.realized)>=0?'positive':'negative'}">الربح المحقق: ${num(r.realized)>=0?'+':'-'}${moneyUsd(Math.abs(num(r.realized)))} (${pct(r.realizedPct)})</div>`:''}
        ${r.note?`<p class="trade-note">${esc(r.note)}</p>`:''}
        <button class="trade-delete" data-action="delete-trade" type="button">حذف العملية</button>
      </article>`).join(''):'<div class="empty">لا توجد عمليات مسجلة بعد.</div>';
  }

  function availableQtyForTrade(type,symbol,beforeDate='9999-12-31'){
    const sym=String(symbol||'').toUpperCase();
    const {positions}=ledgerData();
    return num(positions.find(p=>p.type===type&&p.symbol===sym)?.qty);
  }

  function updateTradePreview(){
    const box=$('tradePreview');if(!box)return;
    const side=$('tradeSide')?.value||'BUY',qty=parseN($('tradeQty')?.value),price=parseN($('tradePrice')?.value),fees=parseN($('tradeFees')?.value);
    const total=side==='BUY'?qty*price+fees:Math.max(0,qty*price-fees);
    box.textContent=side==='BUY'?`إجمالي المبلغ المدفوع: ${moneyUsd(total)}`:`صافي مبلغ البيع قبل احتساب تكلفة الشراء: ${moneyUsd(total)}`;
  }


  async function api(path){
    const base=(state.settings.apiBase||DEFAULT_API_BASE).replace(/\/$/,'');if(!base)throw new Error('رابط الخدمة غير متوفر.');
    const headers={Accept:'application/json'};if(state.settings.accessToken)headers.Authorization=`Bearer ${state.settings.accessToken}`;
    const r=await fetch(base+path,{headers,cache:'no-store'}),text=await r.text();let d={};try{d=JSON.parse(text)}catch{throw new Error(text.includes('1015')?'OKX حدّ مؤقتًا من الطلبات (1015). حاول بعد لحظات.':'استجابة الخدمة غير صالحة.')}if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d;
  }

  async function syncOkx(silent=false){
    if(!state.settings.accessToken){if(!silent)toast('احفظ Access Token مرة واحدة في الإعدادات.');return}
    if(!silent)loading('syncOkxBtn',true);
    try{
      const d=await api('/api/okx/balance'),stocks=state.holdings.filter(h=>h.type==='stock');
      const crypto=(d.holdings||[]).map(h=>({id:`okx-${h.symbol}`,type:'crypto',source:'OKX',symbol:h.symbol,name:h.name||h.symbol,qty:num(h.qty),price:num(h.price),usdValue:num(h.usdValue),pnl:h.pnl===null?null:num(h.pnl),pnlRatio:h.pnlRatio===null?null:num(h.pnlRatio),spotUpl:h.spotUpl===null?null:num(h.spotUpl),spotUplRatio:h.spotUplRatio===null?null:num(h.spotUplRatio),openAvgPx:h.openAvgPx,accAvgPx:h.accAvgPx,accountParts:h.accountParts||{},valueParts:h.valueParts||{},valuationMode:h.valuationMode||'official',marketPrice:num(h.marketPrice||0)}));
      state.holdings=[...stocks,...crypto];state.okxAccountTotalUsd=num(d.totalUsd);state.okxTotalPnl=d.totalPnl===null?null:num(d.totalPnl);state.okxTotalPnlRatio=d.totalPnlRatio===null?null:num(d.totalPnlRatio);state.okxSyncedAt=Date.now();state.lastUpdated=Date.now();state.okxDiagnostics={...defaultState.okxDiagnostics,...(d.diagnostics||{}),officialTotalUsd:num(d.totalUsd),computedTotalUsd:num(d.computedTotalUsd),lastSync:Date.now()};render();startMarketSocket();
      loadMainChart(state.range,true).catch(()=>{});
      if(!silent)toast(`تمت مزامنة OKX: ${crypto.length} أصل.`);
    }catch(e){if(!silent)toast(e.message||'تعذر مزامنة OKX.');throw e}
    finally{if(!silent)loading('syncOkxBtn',false)}
  }

  async function syncMarket(silent=false){
    if(!silent){loading('syncMarketBtn',true);loading('refreshBtn',true)}
    try{
      const stocks=[...new Set([...state.holdings.filter(h=>h.type==='stock').map(h=>h.symbol),...state.watchlist.filter(w=>w.type==='stock').map(w=>w.symbol)])].join(',');
      if(!stocks){state.marketSyncedAt=Date.now();render();return}
      const d=await api(`/api/market/prices?stocks=${encodeURIComponent(stocks)}`);
      state.holdings=state.holdings.map(h=>{if(h.type!=='stock')return h;const i=d.stocks?.[h.symbol.toUpperCase()];if(!i)return h;const price=num(i.price),qty=num(h.qty),cost=num(h.cost),side=String(h.side||'BUY').toUpperCase();let pnl=h.pnl,pnlRatio=h.pnlRatio;if(qty>0&&cost>0&&price>0){pnl=(side==='SELL'?(cost-price):(price-cost))*qty;pnlRatio=(side==='SELL'?((cost-price)/cost):((price-cost)/cost))*100}return{...h,price,usdValue:qty*price,changePct:num(i.changePct),pnl,pnlRatio};});
      state.marketSyncedAt=Date.now();state.lastUpdated=Date.now();render();if(!silent)toast('تم تحديث أسعار الأسهم.');
    }catch(e){if(!silent)toast(e.message==='TWELVE_DATA_KEY_REQUIRED'?'أضف TWELVE_DATA_KEY في Cloudflare.':e.message);throw e}
    finally{if(!silent){loading('syncMarketBtn',false);loading('refreshBtn',false)}}
  }

  async function syncAll(silent=false){try{await syncOkx(silent)}catch{}try{await syncMarket(silent)}catch{}}

  async function cryptoHistory(symbol,range){
    if(['USDT','USDC','USD'].includes(symbol)){
      const now=Date.now(),cfg={'1D':[288,300000],'1W':[168,3600000],'1M':[180,14400000],'3M':[90,86400000],'1Y':[300,86400000],'ALL':[300,604800000]}[range]||[180,14400000];
      return {source:'Stable USD',points:Array.from({length:cfg[0]},(_,i)=>({ts:now-(cfg[0]-1-i)*cfg[1],close:1}))};
    }
    return await api(`/api/market/history?type=crypto&symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`);
  }

  async function loadMainChart(range,quiet=false){
    state.range=range;save();const req=++mainChartRequest;
    const assets=state.holdings.filter(h=>h.type==='crypto'&&num(h.qty)>0&&h.symbol!=='AED');
    if(!assets.length){$('portfolioChart').innerHTML='';$('portfolioChartEmpty').style.display='grid';$('portfolioChartEmpty').textContent='يظهر الرسم بعد مزامنة أصول OKX.';return}
    $('portfolioChartEmpty').style.display='grid';$('portfolioChartEmpty').textContent='جاري تحميل الرسم عبر Twelve Data…';
    try{
      const series=[];
      for(const h of assets.slice(0,12)){
        try{
          const d=await cryptoHistory(h.symbol,range);
          const pts=(d.points||[]).map(x=>({ts:num(x.ts),close:num(x.close)})).filter(x=>x.ts&&x.close>0);
          if(pts.length)series.push({qty:num(h.qty),points:pts});
        }catch{}
      }
      if(req!==mainChartRequest)return;
      if(!series.length)throw new Error('تعذر تحميل تاريخ أسعار الكريبتو من Twelve Data.');
      const maxLen=Math.max(...series.map(s=>s.points.length)),pts=[];
      for(let i=0;i<maxLen;i++){
        let value=0,ts=0,used=0;
        for(const s of series){
          const p=s.points[Math.max(0,s.points.length-maxLen+i)];
          if(p){value+=num(p.close)*s.qty;ts=Math.max(ts,p.ts);used++}
        }
        if(used&&ts)pts.push({ts,value});
      }
      if(pts.length<2)throw new Error('لا تتوفر نقاط تاريخية كافية.');
      $('portfolioChartEmpty').style.display='none';drawSeries($('portfolioChart'),pts,$('portfolioTooltip'),170);
      $('portfolioChartSource').textContent='Twelve Data · تقييم تاريخي للكميات الحالية. القيمة الحالية وPnL من حساب OKX.';
      const first=pts[0].value,last=pts.at(-1).value,move=last-first,movePct=first?move/first*100:0;
      $('todayPnl').textContent=`${move>=0?'+':'-'}${money(Math.abs(move))} · ${pct(movePct)}`;$('todayPnl').className=move>=0?'positive':'negative';
    }catch(e){
      if(req!==mainChartRequest)return;
      $('portfolioChart').innerHTML='';$('portfolioChartEmpty').style.display='grid';$('portfolioChartEmpty').textContent=e.message||'تعذر تحميل الرسم.';
      if(!quiet)toast(e.message);
    }
  }

  function drawSeries(svg,points,tooltip,height){
    const w=640,h=height,p=12,vals=points.map(x=>x.value),min=Math.min(...vals),max=Math.max(...vals),span=max-min||Math.max(1,max*.005);
    const c=points.map((q,i)=>({x:p+i*(w-2*p)/Math.max(1,points.length-1),y:h-p-(q.value-min)/span*(h-2*p),...q}));
    const d=c.map((q,i)=>`${i?'L':'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
    const gid=`g${svg.id}`;
    svg.innerHTML=`<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c59a3a" stop-opacity=".28"/><stop offset="1" stop-color="#c59a3a" stop-opacity="0"/></linearGradient></defs><path d="${d} L${c.at(-1).x},${h-p} L${c[0].x},${h-p} Z" fill="url(#${gid})"/><path d="${d}" fill="none" stroke="#b88727" stroke-width="3" stroke-linecap="round"/><line x1="0" x2="0" y1="${p}" y2="${h-p}" stroke="#8b7a54" opacity="0"/>`;
    const locate=e=>{const r=svg.getBoundingClientRect(),cx=e.touches?.[0]?.clientX??e.clientX,px=(cx-r.left)/r.width*w,idx=Math.max(0,Math.min(c.length-1,Math.round((px-p)/(w-2*p)*(c.length-1)))),q=c[idx],line=svg.querySelector('line');line.setAttribute('x1',q.x);line.setAttribute('x2',q.x);line.setAttribute('opacity','1');tooltip.hidden=false;tooltip.textContent=`${new Date(q.ts).toLocaleString('ar-AE',{dateStyle:'medium',timeStyle:'short'})} · ${moneyUsd(q.value)}`};svg.onpointermove=locate;svg.onpointerdown=locate;svg.onpointerleave=()=>{tooltip.hidden=true;svg.querySelector('line')?.setAttribute('opacity','0')};
  }

  async function openAssetChart(h,range='1D'){
    currentChartAsset=h;currentAssetRange=range;$('assetChartTitle').textContent=`${h.symbol} · ${h.name||h.symbol}`;$('assetChartPrice').textContent=moneyUsd(h.price);$('assetChartChange').textContent=h.pnlRatio===null?'—':pct(h.pnlRatio);$('assetChartChange').className=h.pnlRatio!==null&&num(h.pnlRatio)>=0?'positive':'negative';$('assetChart').innerHTML='';$('assetChartEmpty').style.display='grid';$('assetChartEmpty').textContent='جاري تحميل بيانات السوق…';$('chartDialog').showModal();$$('.asset-range').forEach(b=>b.classList.toggle('active',b.dataset.assetRange===range));
    try{
      let pts=[],source='';
      if(h.type==='crypto'){
        const d=await cryptoHistory(h.symbol,range);pts=(d.points||[]).map(x=>({ts:num(x.ts),value:num(x.close)}));source=d.source||'Twelve Data';
      }else{
        const d=await api(`/api/market/history?type=stock&symbol=${encodeURIComponent(h.symbol)}&range=${encodeURIComponent(range)}`);pts=(d.points||[]).map(x=>({ts:num(x.ts),value:num(x.close)}));source=d.source||'Twelve Data';
      }
      pts=pts.filter(x=>x.ts&&x.value>0);
      if(pts.length<2){$('assetChartEmpty').textContent='لا تتوفر نقاط تاريخية كافية.';return}
      $('assetChartEmpty').style.display='none';drawSeries($('assetChart'),pts,$('assetTooltip'),250);$('assetChartSource').textContent=`المصدر: ${source} · ${pts.length} نقطة`;const first=pts[0].value,last=pts.at(-1).value,change=first?(last-first)/first*100:0;$('assetChartPrice').textContent=moneyUsd(last);$('assetChartChange').textContent=pct(change);$('assetChartChange').className=change>=0?'positive':'negative';
    }catch(e){$('assetChart').innerHTML='';$('assetChartEmpty').style.display='grid';$('assetChartEmpty').textContent=e.message||'تعذر تحميل الرسم.';$('assetChartSource').textContent=''}
  }

  function startMarketSocket(){
    clearTimeout(wsRetry);try{marketWs?.close()}catch{}
    const symbols=state.holdings.filter(h=>h.type==='crypto'&&num(h.qty)>0&&!['USDT','USDC','USD','AED'].includes(h.symbol)).map(h=>h.symbol);
    if(!symbols.length)return;
    try{
      marketWs=new WebSocket('wss://ws.okx.com:8443/ws/v5/public');
      marketWs.onopen=()=>marketWs.send(JSON.stringify({op:'subscribe',args:symbols.map(s=>({channel:'tickers',instId:`${s}-USDT`}))}));
      marketWs.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}const d=m.data?.[0];if(!d?.instId||!d.last)return;const symbol=d.instId.replace(/-USDT$/,'');const h=state.holdings.find(x=>x.type==='crypto'&&x.symbol===symbol);if(!h)return;h.marketPrice=num(d.last);state.marketSyncedAt=Date.now();renderInvestmentLog()};
      marketWs.onclose=()=>{wsRetry=setTimeout(startMarketSocket,5000)};
      marketWs.onerror=()=>{try{marketWs.close()}catch{}};
    }catch{}
  }
  function nested(o,p){return num(o?.valueParts?.[p.split('.').pop()]||0)}

  function startPoll(){clearInterval(pollTimer);if(!state.settings.accessToken)return;pollTimer=setInterval(()=>{if(!document.hidden)syncOkx(true)},POLL_MS)}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.settings.accessToken){syncOkx(true);startMarketSocket()}});

  function setView(name){$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));document.querySelector('.app-shell')?.scrollTo({top:0,behavior:'smooth'})}
  async function runDiagnostics(){loading('diagnosticsBtn',true);try{const d=await api('/api/diagnostics'),s=d.secrets||{};$('diagnosticsResult').innerHTML=Object.entries(s).map(([k,v])=>`<div class="diag-row"><span>${esc(k)}</span><strong class="${v?'positive':'negative'}">${v?'✓ موجود':'✕ غير موجود'}</strong></div>`).join('')}catch(e){$('diagnosticsResult').textContent=e.message}finally{loading('diagnosticsBtn',false)}}

  async function importXtb(file){
    try{
      const positions=await parseXtbFile(file);
      if(!positions.length)throw new Error('لم أتعرف على مراكز XTB المفتوحة في الملف.');
      state.holdings=[...positions,...state.holdings.filter(h=>h.type==='crypto')];
      state.xtbImportedAt=Date.now();state.lastUpdated=Date.now();render();
      toast(`تم استيراد ${positions.length} مركز فعلي من XTB.`);
      try{await syncMarket(true)}catch{}
    }catch(e){toast(e.message||'تعذر قراءة ملف XTB.')}
    finally{$('xtbFile').value=''}
  }

  async function parseXtbFile(file){
    const lower=file.name.toLowerCase();
    if(lower.endsWith('.csv')){
      const rows=csv(await file.text());
      return normalizeXtbRows(rows);
    }
    if(typeof XLSX==='undefined')throw new Error('تعذر تحميل قارئ XLSX. تأكد من اتصال الإنترنت ثم أعد المحاولة.');
    const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    const sheetName=book.SheetNames.find(n=>String(n).trim().toLowerCase()==='open positions')
      ||book.SheetNames.find(n=>/open\s*positions/i.test(n));
    if(!sheetName)throw new Error('لم أجد ورقة Open Positions داخل تقرير XTB.');
    const matrix=XLSX.utils.sheet_to_json(book.Sheets[sheetName],{header:1,defval:'',raw:true});
    const headerIndex=matrix.findIndex(r=>Array.isArray(r)&&r.some(c=>String(c).trim()==='Instrument/Position')&&r.some(c=>String(c).trim()==='Ticker'));
    if(headerIndex<0)throw new Error('صيغة تقرير XTB غير معروفة: لم أجد جدول Open Positions.');
    const headers=matrix[headerIndex].map(x=>String(x).trim());
    const rows=matrix.slice(headerIndex+1).filter(r=>Array.isArray(r)&&r.some(v=>String(v).trim()!=='')).map(r=>{
      const o={};headers.forEach((h,i)=>o[h]=r[i]??'');return o;
    });
    return normalizeXtbRows(rows);
  }

  function normalizeXtbRows(rows){
    const summaryByTicker={};
    for(const r of rows){
      const ticker=String(r.Ticker||r.ticker||'').trim().toUpperCase();
      const inst=String(r['Instrument/Position']||r.Instrument||'').trim();
      const category=String(r.Category||'').trim().toUpperCase();
      if(ticker&&inst&&category==='STOCK')summaryByTicker[ticker]={
        name:inst,
        pnl:parseNullableN(r['Net Profit']),
        pnlRatio:parseNullableN(r['Net Profit %'])
      };
    }

    const grouped=new Map();
    for(const r of rows){
      const tickerRaw=String(r.Ticker||r.ticker||'').trim().toUpperCase();
      const side=String(r.Type||'').trim().toUpperCase();
      if(!tickerRaw||!['BUY','SELL'].includes(side))continue;
      const symbol=tickerRaw.replace(/\.US$/i,'').split('.')[0];
      const qty=parseN(r.Volume),price=parseN(r['Current price']),cost=parseN(r['Open price']),value=parseN(r.Value);
      const rowPnl=parseNullableN(r['Net Profit']);
      if(!symbol||qty<=0||price<=0)continue;
      const key=`${tickerRaw}|${side}`;
      const g=grouped.get(key)||{ticker:tickerRaw,symbol,side,qty:0,value:0,costValue:0,price,pnl:0,pnlKnown:false};
      g.qty+=qty;g.value+=value>0?value:qty*price;g.costValue+=qty*cost;g.price=price;
      if(rowPnl!==null){g.pnl+=rowPnl;g.pnlKnown=true}
      grouped.set(key,g);
    }

    const out=[];
    for(const g of grouped.values()){
      const summary=summaryByTicker[g.ticker]||{};
      const cost=g.qty>0?g.costValue/g.qty:0;
      const pnl=summary.pnl!==null&&summary.pnl!==undefined?summary.pnl:(g.pnlKnown?g.pnl:null);
      const pnlRatio=summary.pnlRatio!==null&&summary.pnlRatio!==undefined
        ?summary.pnlRatio
        :(pnl!==null&&cost>0&&g.qty>0?pnl/(cost*g.qty)*100:null);
      out.push({
        id:`xtb-${g.symbol}-${g.side}`,
        type:'stock',source:'XTB',verifiedXtb:true,
        symbol:g.symbol,name:summary.name||g.symbol,ticker:g.ticker,side:g.side,
        qty:g.qty,cost,price:g.price,usdValue:g.value,
        pnl,pnlRatio,xtbImportedPnl:pnl,xtbImportedPnlRatio:pnlRatio
      });
    }
    return out;
  }

  function csv(text){
    const l=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);if(l.length<2)return[];
    const sep=(l[0].match(/;/g)||[]).length>(l[0].match(/,/g)||[]).length?';':',',h=split(l[0],sep);
    return l.slice(1).map(x=>{const v=split(x,sep),o={};h.forEach((k,i)=>o[k]=v[i]??'');return o})
  }
  function split(line,sep){let o=[],c='',q=false;for(let i=0;i<line.length;i++){const x=line[i];if(x==='"'){if(q&&line[i+1]==='"'){c+='"';i++}else q=!q}else if(x===sep&&!q){o.push(c.trim());c=''}else c+=x}o.push(c.trim());return o}
  function parseN(v){if(typeof v==='number')return Number.isFinite(v)?v:0;const s=String(v??'').replace(/[^0-9,.\-+]/g,'').replace(/,(?=\d{3}(\D|$))/g,'').replace(',','.');const n=parseFloat(s);return Number.isFinite(n)?n:0}
  function parseNullableN(v){if(v===null||v===undefined||String(v).trim()==='')return null;const n=parseN(v);return Number.isFinite(n)?n:null}

  function exportBackup(){
    const copy=clone(state);
    if(copy.settings)copy.settings.accessToken='';
    const blob=new Blob([JSON.stringify({app:'Investment Hub',version:APP_VERSION,exportedAt:new Date().toISOString(),state:copy},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`investment-hub-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
    toast('تم إنشاء النسخة الاحتياطية.');
  }

  async function importBackup(file){
    try{
      const raw=JSON.parse(await file.text()),incoming=raw?.state||raw;
      if(!incoming||!Array.isArray(incoming.holdings)||!Array.isArray(incoming.watchlist))throw new Error('ملف النسخة الاحتياطية غير صالح.');
      const token=state.settings.accessToken;
      state={...clone(defaultState),...incoming,settings:{...defaultState.settings,...(incoming.settings||{}),accessToken:token}};
      state.investmentTrades=Array.isArray(incoming.investmentTrades)?incoming.investmentTrades:[];
      state.okxDiagnostics={...defaultState.okxDiagnostics,...(incoming.okxDiagnostics||{})};
      state.dataVersion=APP_VERSION;save();render();startPoll();toast('تمت استعادة النسخة الاحتياطية.');
    }catch(e){toast(e.message||'تعذر استعادة النسخة الاحتياطية.')}
    finally{if($('backupFile'))$('backupFile').value=''}
  }

  // Events
  $$('.tab').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));$$('[data-go]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.go)));
  $('openTradeDialog')?.addEventListener('click',()=>{const d=new Date();$('tradeDate').value=d.toISOString().slice(0,10);$('tradeDialog').showModal();updateTradePreview()});
  $('closeTradeDialog')?.addEventListener('click',()=>$('tradeDialog').close());
  ['tradeSide','tradeQty','tradePrice','tradeFees'].forEach(id=>$(id)?.addEventListener('input',updateTradePreview));
  $('tradeFilter')?.addEventListener('change',renderInvestmentLog);
  $('tradeForm')?.addEventListener('submit',e=>{
    e.preventDefault();
    const side=$('tradeSide').value,type=$('tradeType').value,symbol=$('tradeSymbol').value.trim().toUpperCase(),qty=parseN($('tradeQty').value),price=parseN($('tradePrice').value),fees=parseN($('tradeFees').value);
    if(!symbol||qty<=0||price<=0){toast('أدخل الرمز والكمية والسعر بشكل صحيح.');return}
    if(side==='SELL'){
      const available=availableQtyForTrade(type,symbol);
      if(qty>available+1e-10){toast(`الكمية المتاحة في السجل ${available.toLocaleString('en-US',{maximumFractionDigits:8})} فقط.`);return}
    }
    state.investmentTrades.push({
      id:`trade-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,createdAt:Date.now(),
      side,type,symbol,name:$('tradeName').value.trim()||symbol,platform:$('tradePlatform').value,
      date:$('tradeDate').value,qty,price,fees,
      targetPct:$('tradeTarget').value.trim()===''?null:parseN($('tradeTarget').value),
      note:$('tradeNote').value.trim()
    });
    $('tradeForm').reset();$('tradeDialog').close();render();toast(side==='BUY'?'تم تسجيل عملية الشراء.':'تم تسجيل البيع وحساب الربح المحقق.');
  });
  $('tradeList')?.addEventListener('click',e=>{
    const card=e.target.closest('[data-trade-id]');if(!card||e.target.dataset.action!=='delete-trade')return;
    if(confirm('حذف هذه العملية من سجل الاستثمار؟')){state.investmentTrades=state.investmentTrades.filter(t=>t.id!==card.dataset.tradeId);render()}
  });
  $$('.range').forEach(b=>b.addEventListener('click',()=>{$$('.range').forEach(x=>x.classList.remove('active'));b.classList.add('active');loadMainChart(b.dataset.range)}));
  $$('.filter').forEach(b=>b.addEventListener('click',()=>{$$('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderPortfolio()}));
  $$('.asset-range').forEach(b=>b.addEventListener('click',()=>currentChartAsset&&openAssetChart(currentChartAsset,b.dataset.assetRange)));
  $('closeChartDialog').addEventListener('click',()=>$('chartDialog').close());$('currencyBtn').addEventListener('click',()=>{state.settings.baseCurrency=state.settings.baseCurrency==='AED'?'USD':'AED';render()});$('refreshBtn').addEventListener('click',()=>syncAll(false));$('syncMarketBtn').addEventListener('click',()=>syncMarket(false));$('syncOkxBtn').addEventListener('click',()=>syncOkx(false));$('diagnosticsBtn')?.addEventListener('click',runDiagnostics);$('xtbFile').addEventListener('change',e=>e.target.files[0]&&importXtb(e.target.files[0]));
  $('settingsForm').addEventListener('submit',e=>{e.preventDefault();state.settings.apiBase=$('apiBase').value.trim().replace(/\/$/,'')||DEFAULT_API_BASE;state.settings.accessToken=$('accessToken').value.trim();state.settings.baseCurrency=$('baseCurrency').value;save();render();startPoll();if(state.settings.accessToken)syncAll(true);toast('تم حفظ الإعدادات.')});
  $('exportBtn')?.addEventListener('click',exportBackup);
  $('backupFile')?.addEventListener('change',e=>e.target.files?.[0]&&importBackup(e.target.files[0]));
  $('watchForm').addEventListener('submit',e=>{e.preventDefault();const s=$('watchSymbol').value.trim().toUpperCase(),t=$('watchType').value;if(!s)return;state.watchlist.push({id:`watch-${t}-${s}`,type:t,symbol:s,name:s,price:0,pnl:null,pnlRatio:null});$('watchSymbol').value='';render()});
  function clickAsset(e){const item=e.target.closest('.asset-item');if(!item)return;const h=state.holdings.find(x=>x.id===item.dataset.id)||state.watchlist.find(x=>x.id===item.dataset.id);if(e.target.dataset.action==='chart'&&h){openAssetChart(h);return}if(e.target.dataset.action==='remove'){state.holdings=state.holdings.filter(x=>x.id!==item.dataset.id);render();return}item.classList.toggle('expanded')}
  $('portfolioList').addEventListener('click',clickAsset);$('topHoldings').addEventListener('click',clickAsset);$('watchList').addEventListener('click',clickAsset);
  $('openAddAsset').addEventListener('click',()=>$('assetDialog').showModal());$('closeAssetDialog').addEventListener('click',()=>$('assetDialog').close());$('assetForm').addEventListener('submit',e=>{e.preventDefault();const type=$('assetType').value,symbol=$('assetSymbol').value.trim().toUpperCase(),qty=parseN($('assetQty').value),cost=parseN($('assetCost').value),price=parseN($('assetPrice').value);state.holdings.push({id:`manual-${Date.now()}`,type,source:'Manual',symbol,name:$('assetName').value.trim(),qty,cost,price,usdValue:qty*price,pnl:null,pnlRatio:null});$('assetForm').reset();$('assetDialog').close();render()});
  $('resetBtn').addEventListener('click',()=>{if(confirm('هل تريد مسح البيانات المحلية؟')){localStorage.removeItem(STORAGE_KEY);state=clone(defaultState);render()}});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('installBtn').disabled=false});$('installBtn').addEventListener('click',async()=>{if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice}else toast('على iPhone: مشاركة ← إضافة إلى الشاشة الرئيسية.')});
  document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});document.addEventListener('gesturechange',e=>e.preventDefault(),{passive:false});document.addEventListener('touchmove',e=>{if(e.touches?.length>1)e.preventDefault()},{passive:false});
  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  render();startPoll();window.addEventListener('load',()=>{if(state.settings.accessToken)setTimeout(()=>syncOkx(true),500);else loadMainChart(state.range,true)});
})();