// legal.js
// Langue de la page des mentions légales : celle de la vitrine d'où vient le visiteur, sinon le français

(() => {
  'use strict';

  const store = {
    get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
    set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* private window */ } }
  };
  const blocks = [...document.querySelectorAll('[data-lang-block]')];
  const buttons = [...document.querySelectorAll('.lang button')];
  const titles = { fr: document.title, en: 'Legal notice · Topogenia' };
  const back = document.getElementById('back-link');

  const apply = (lang) => {
    document.documentElement.lang = lang;
    document.title = titles[lang];
    back.href = lang === 'en' ? 'en/' : './';
    for (const block of blocks) block.hidden = block.dataset.langBlock !== lang;
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      store.set('topogenia.lang', button.dataset.lang);
      apply(button.dataset.lang);
    });
  }
  apply(store.get('topogenia.lang') === 'en' ? 'en' : 'fr');
})();
