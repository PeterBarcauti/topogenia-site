// galerie.js
// The gallery pages, in the browser: the "Copy" button of a template copies the text shown in the page to the clipboard and says so. It reads nothing from the address, sends nothing anywhere and keeps nothing.

(function (factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.start(window, document);
}(function () {
  'use strict';

  const RESET_MS = 2500;

  /** Copies the text of the element the button names; the button says whether it worked, then gets its label back. */
  async function copy(button, doc, clipboard, later) {
    const label = button.textContent;
    const target = doc.getElementById(button.getAttribute('data-copy'));
    let copied = false;
    if (target && clipboard && typeof clipboard.writeText === 'function') {
      try {
        await clipboard.writeText(target.textContent);
        copied = true;
      } catch (error) {
        copied = false;
      }
    }
    button.textContent = button.getAttribute(copied ? 'data-done' : 'data-failed') || label;
    later(() => { button.textContent = label; }, RESET_MS);
    return copied;
  }

  /** One click handler per copy button of the page. */
  function attach(doc, clipboard, later) {
    for (const button of doc.querySelectorAll('button[data-copy]')) {
      button.addEventListener('click', () => { copy(button, doc, clipboard, later); });
    }
  }

  function start(win, doc) {
    attach(doc, win.navigator && win.navigator.clipboard, (fn, ms) => win.setTimeout(fn, ms));
  }

  return { copy, attach, start };
}));
