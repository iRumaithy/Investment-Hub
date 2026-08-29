(() => {
  'use strict';

  const VERSION = '2.4.0';

  function enhanceAssetCards() {
    document.querySelectorAll('.asset-item').forEach(card => {
      const meta = card.querySelector('.asset-meta');
      const small = card.querySelector('.asset-value small');
      if (!meta || !small || card.dataset.v240 === '1') return;

      const text = meta.textContent || '';
      // Existing v2.3.1 markup contains: "... × $price · PnL -$607.46"
      const match = text.match(/(?:·\s*)?PnL\s*([+-]?\$[\d,.]+)/i);
      if (match) {
        const pnlAmount = match[1];
        const ratio = (small.textContent || '').trim();
        if (ratio && ratio !== '—') {
          small.textContent = `${pnlAmount} (${ratio})`;
        } else {
          small.textContent = pnlAmount;
        }

        // Keep quantity × price on the secondary line, remove duplicate PnL amount.
        meta.textContent = text
          .replace(/\s*·?\s*PnL\s*[+-]?\$[\d,.]+/i, '')
          .trim();
      }
      card.dataset.v240 = '1';
    });
  }

  function enhanceXtbCard() {
    const cards = [...document.querySelectorAll('.connection-card')];
    const xtb = cards.find(c => /\bXTB\b/i.test(c.textContent || ''));
    if (!xtb || xtb.querySelector('.xtb-v240-guide')) return;

    const guide = document.createElement('div');
    guide.className = 'xtb-v240-guide';
    guide.innerHTML = `
      <strong>ربط XTB الحقيقي</strong>
      <span>1. من XTB Web صدّر تقرير Open Positions بصيغة CSV/XLSX.</span>
      <span>2. ارفعه من زر استيراد ملف XTB.</span>
      <span>3. لن يظهر أي سهم إلا إذا كان موجودًا في التقرير.</span>
      <span>4. السعر الحالي والرسم البياني يتم تحديثهما عبر Twelve Data.</span>
    `;
    const btn = xtb.querySelector('label.file-btn, .file-btn, button');
    if (btn) btn.insertAdjacentElement('beforebegin', guide);
    else xtb.appendChild(guide);
  }

  function updateVersion() {
    document.querySelectorAll('footer span').forEach(el => {
      if (/^v\d/i.test((el.textContent || '').trim())) el.textContent = `v${VERSION}`;
    });
  }

  function run() {
    enhanceAssetCards();
    enhanceXtbCard();
    updateVersion();
  }

  const observer = new MutationObserver(() => run());
  observer.observe(document.documentElement, {subtree:true, childList:true, characterData:true});
  document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
  setInterval(enhanceAssetCards, 1500);
})();
