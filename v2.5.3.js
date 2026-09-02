(() => {
  const VERSION='2.5.3';
  function apply(){
    if(!document.querySelector('link[data-ih-253]')){
      const l=document.createElement('link');
      l.rel='stylesheet'; l.href='./v2.5.3.css?v=253'; l.dataset.ih253='1';
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
