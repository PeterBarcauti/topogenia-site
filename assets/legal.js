// legal.js
// Langue des pages des mentions légales et de la confidentialité : ?lang= dans l'adresse, sinon celle de la vitrine d'où vient le visiteur, sinon le français (ou, pour une page marquée data-lang-default="browser", la langue du navigateur : la confidentialité, ouverte depuis le Microsoft Store)

(() => {
  'use strict';

  const store = {
    get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
    set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* private window */ } }
  };
  const root = document.documentElement;
  const blocks = [...document.querySelectorAll('[data-lang-block]')];
  const buttons = [...document.querySelectorAll('.lang button')];
  const titles = { fr: document.title, en: root.dataset.titleEn ?? 'Legal notice · Topogenia' };
  const back = document.getElementById('back-link');

  const apply = (lang) => {
    root.lang = lang;
    document.title = titles[lang];
    back.href = lang === 'en' ? 'en/' : './';
    for (const block of blocks) block.hidden = block.dataset.langBlock !== lang;
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
  };

  const asked = new URLSearchParams(location.search).get('lang');
  const kept = store.get('topogenia.lang');
  const browser = (navigator.language || '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  const first = asked === 'fr' || asked === 'en' ? asked
    : kept === 'fr' || kept === 'en' ? kept
    : root.dataset.langDefault === 'browser' ? browser : 'fr';

  for (const button of buttons) {
    button.addEventListener('click', () => {
      store.set('topogenia.lang', button.dataset.lang);
      apply(button.dataset.lang);
    });
  }
  apply(first);
})();
