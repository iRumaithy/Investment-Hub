(() => {
  const VERSION='2.5.3';

  function applyVersion(){
    document.documentElement.dataset.appVersion=VERSION;
    document.querySelectorAll('footer span').forEach(el=>{
      if(/^v\d/i.test((el.textContent||'').trim())) el.textContent='v'+VERSION;
    });
  }

  async function forceWorkerUpdate(){
    if(!('serviceWorker' in navigator)) return;
    try{
      const reg=await navigator.serviceWorker.register('./sw.js?v=2531');
      await reg.update();
    }catch{}
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',applyVersion,{once:true});
  }else{
    applyVersion();
  }

  window.addEventListener('load',()=>{
    applyVersion();
    forceWorkerUpdate();
  });
})();
