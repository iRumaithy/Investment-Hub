(() => {
  const VERSION='2.5.2';
  function apply(){
    if(!document.querySelector('link[data-ih-252]')){
      const l=document.createElement('link');
      l.rel='stylesheet'; l.href='./v2.5.2.css?v=252'; l.dataset.ih252='1';
      document.head.appendChild(l);
    }
    document.querySelectorAll('footer span').forEach(el=>{
      if(/^v\d/i.test((el.textContent||'').trim())) el.textContent='v'+VERSION;
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',apply);
  else apply();
  window.addEventListener('load',apply);
})();
