// page-en.cjs
// Fabrique en/index.html, la page anglaise de la vitrine, à partir de index.html et des textes anglais de assets/i18n.js
// Usage, depuis la racine du site : node outils/page-en.cjs ; à relancer après toute modification de ces deux fichiers

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const site = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(site, 'assets', 'i18n.js'), 'utf8'), context);
const en = context.window.TOPO.en;

const fail = (message) => { console.error(`ERREUR : ${message}`); process.exit(1); };
const text = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attribute = (value) => text(value).replace(/"/g, '&quot;');
const word = (key) => (en[key] === undefined ? fail(`texte anglais absent : ${key}`) : en[key]);

let html = source;

/** Replaces one exact passage, which must occur once. */
const once = (from, to) => {
  const parts = html.split(from);
  if (parts.length !== 2) fail(`passage trouvé ${parts.length - 1} fois au lieu d'une : ${from.slice(0, 70)}`);
  html = parts.join(to);
};

// Texts: every element carrying data-i18n receives its English text, as the page used to do in the browser
let texts = 0;
html = html.replace(/<([a-z0-9]+)((?:\s[^>]*?)?\sdata-i18n="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g, (all, tag, attributes, key, inner) => {
  if (inner.includes(`<${tag}`) || inner.includes('data-i18n')) fail(`élément imbriqué sous ${key}`);
  texts += 1;
  return `<${tag}${attributes}>${text(word(key))}</${tag}>`;
});
const expected = (source.match(/\sdata-i18n="/g) || []).length;
if (texts !== expected) fail(`${texts} textes remplacés pour ${expected} attributs data-i18n`);

// Accessible names
let labels = 0;
html = html.replace(/<[^>]*\sdata-i18n-aria="([^"]+)"[^>]*>/g, (tag, key) => {
  labels += 1;
  return tag.replace(/aria-label="[^"]*"/, `aria-label="${attribute(word(key))}"`);
});

// Header, language, title, description, sharing, addresses
once('<!-- index.html -->', '<!-- en/index.html -->');
once('<!-- Page vitrine de topogenia.com : du récit aux diagrammes, en français et en anglais -->',
  '<!-- Page anglaise de topogenia.com, fabriquée par outils/page-en.cjs à partir de index.html et assets/i18n.js : ne pas modifier à la main -->');
once('<html lang="fr">', '<html lang="en">');
html = html.replace(/<title>[^<]*<\/title>/, `<title>${text(word('meta.title'))}</title>`);
html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${attribute(word('meta.desc'))}$2`);
html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${attribute(word('meta.title'))}$2`);
html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${attribute(word('meta.og'))}$2`);
html = html.replace(/(<meta property="og:image:alt" content=")[^"]*(")/, `$1${attribute(word('meta.ogalt'))}$2`);
once('<meta property="og:url" content="https://topogenia.com/">', '<meta property="og:url" content="https://topogenia.com/en/">');
once('<meta property="og:locale" content="fr_FR">', '<meta property="og:locale" content="en_US">');
once('<meta property="og:locale:alternate" content="en_US">', '<meta property="og:locale:alternate" content="fr_FR">');
once('<link rel="canonical" href="https://topogenia.com/">', '<link rel="canonical" href="https://topogenia.com/en/">');

// The software's card: the English description and this page's address
once('"url": "https://topogenia.com/",', '"url": "https://topogenia.com/en/",');
html = html.replace(/("description": ")[^"]*(",)/, `$1${word('meta.desc').replace(/"/g, '\\"')}$2`);

// The demonstration's first story, as the page shows it before its script runs
const story = context.window.TOPO.stories.en[0];
html = html.replace(/(<span id="demo-project">)[^<]*(<\/span>)/, `$1${text(story.project)}$2`);
html = html.replace(/(<span class="chip-code" id="demo-code">)[^<]*(<\/span>)/, `$1${text(story.code)}$2`);

// Language switch: French one level up, English here
once('<a href="./" data-lang="fr" aria-current="page">FR</a>', '<a href="../" data-lang="fr" hreflang="fr" lang="fr">FR</a>');
once('<a href="en/" data-lang="en" hreflang="en" lang="en">EN</a>', '<a href="./" data-lang="en" aria-current="page">EN</a>');

// Files of the site, one level up
html = html.replace(/(href|src)="(assets\/|favicon\.svg|mentions-legales\.html)/g, '$1="../$2');

fs.mkdirSync(path.join(site, 'en'), { recursive: true });
fs.writeFileSync(path.join(site, 'en', 'index.html'), html);
console.log(`en/index.html : ${texts} textes et ${labels} noms accessibles en anglais`);
