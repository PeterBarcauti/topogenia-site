// versions.cjs
// Builds the versions page of the site, in French and in English, and its Atom feed, from outils/versions.json alone (the list of versions, newest first, starting at 3.4.0), and puts the two pages in sitemap.xml. No library. It also stamps the home page (index.html and the English texts of assets/i18n.js) with the latest version, its ZIP and its hash link, then runs outils/page-en.cjs. Usage, from the site root: node outils/versions.cjs [--brouillon]; --brouillon accepts a date or an empty SHA-256 (written "à la publication").

'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const { compareVersions, parseVersion } = require('../assets/versions.js');

const ORIGIN = 'https://topogenia.com';
const FIRST = '3.4.0';
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'";
const DISTS = ['portable', 'server'];
// The portable ZIP is always offered; the server ZIP only when a file is listed for the version (none is built for 3.4.0).
const REQUIRED = ['portable'];
const offered = (v) => DISTS.filter((dist) => v[dist] !== undefined);

const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (value) => esc(value).replace(/"/g, '&quot;');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** What each language says, and where its pages live. */
const LANGS = {
  fr: {
    locale: 'fr_FR', page: '/versions/', other: 'en', langLabel: 'Langue / Language', back: 'Retour au site', home: '/',
    head: 'Les versions · Topogenia', title: 'Les versions',
    description: 'Les versions publiées de Topogenia : la dernière, ses téléchargements et leur empreinte SHA-256, l\'historique et le flux Atom.',
    lead: 'La dernière version de Topogenia, ses téléchargements et leur empreinte SHA-256.',
    history: 'Historique', feed: 'Flux Atom des versions', feedTitle: 'Topogenia · les versions',
    privacy: 'Ouverte depuis Topogenia, cette page lit la version installée dans l\'adresse, sur votre poste : le navigateur ne transmet pas cette partie de l\'adresse, et la page n\'envoie rien. L\'historique du navigateur la garde, comme toute adresse visitée.',
    privacyLink: 'Confidentialité', privacyHref: '/confidentialite.html',
    legal: 'Mentions légales', legalHref: '/mentions-legales.html',
    gallery: 'Modèles', galleryHref: '/modeles/',
    files: { portable: 'Version portable (ZIP)', server: 'ZIP du serveur' },
    dated: (d) => (d === null ? '(date de publication à venir)' : `du ${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`),
    day: (d) => (d === null ? 'à la publication' : `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`),
    texts: {
      latest: 'Vous avez la dernière version : {version} {dated}.',
      update: 'La version {version} {dated} est disponible.',
      yours: 'Votre version : {read}.',
      newer: 'Votre version ({read}) est plus récente que la dernière publiée : {version} {dated}.',
      none: 'Dernière version : {version} {dated}.',
      portable: 'Télécharger la version portable (ZIP)', server: 'Télécharger le ZIP du serveur',
      noServer: 'Aucun ZIP du serveur n\'est proposé sur ce site pour cette version.',
      sha: 'Empreinte SHA-256 : ', pending: 'à la publication', store: 'Installer depuis le Microsoft Store',
    },
  },
  en: {
    locale: 'en_US', page: '/en/versions/', other: 'fr', langLabel: 'Language / Langue', back: 'Back to the site', home: '/en/',
    head: 'Versions · Topogenia', title: 'Versions',
    description: 'The published versions of Topogenia: the latest one, its downloads and their SHA-256 hash, the history and the Atom feed.',
    lead: 'The latest version of Topogenia, its downloads and their SHA-256 hash.',
    history: 'History', feed: 'Atom feed of the versions', feedTitle: 'Topogenia · versions',
    privacy: 'Opened from Topogenia, this page reads the installed version in the address, on your computer: the browser does not send that part of the address, and the page sends nothing. The browser history keeps it, like any address visited.',
    privacyLink: 'Privacy', privacyHref: '/confidentialite.html?lang=en',
    legal: 'Legal notice', legalHref: '/mentions-legales.html?lang=en',
    gallery: 'Templates', galleryHref: '/en/templates/',
    files: { portable: 'Portable version (ZIP)', server: 'Server ZIP' },
    dated: (d) => (d === null ? 'release date to come' : `released ${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}`),
    day: (d) => (d === null ? 'at release' : `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}`),
    texts: {
      latest: 'You have the latest version: {version}, {dated}.',
      update: 'Version {version}, {dated}, is available.',
      yours: 'Your version: {read}.',
      newer: 'Your version ({read}) is newer than the latest one published: {version}, {dated}.',
      none: 'Latest version: {version}, {dated}.',
      portable: 'Download the portable version (ZIP)', server: 'Download the server ZIP',
      noServer: 'No server ZIP is offered on this website for this version.',
      sha: 'SHA-256 hash: ', pending: 'at release', store: 'Install from the Microsoft Store',
    },
  },
};

const BRAND = '<svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><rect x=".5" y=".5" width="23" height="23" rx="6.5" fill="#5B5BD6"/><rect x=".5" y=".5" width="23" height="11.5" rx="6.5" fill="#4343B8" opacity=".35"/><path d="M6 8h4.5a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2H18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="6" cy="8" r="1.8" fill="#fff"/><circle cx="18" cy="16" r="1.8" fill="#fff"/></svg>';

// ---------- the data ----------

const isDay = (d) => {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const day = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === d;
};
const isHttps = (url) => typeof url === 'string' && /^https:\/\/[^\s"<>]+$/.test(url);
const onlyKeys = (object, keys, where) => {
  for (const key of Object.keys(object)) if (!keys.includes(key)) throw new Error(`${where} : propriété inconnue « ${key} »`);
};

function checkEntry(v, draft) {
  const where = `version ${v && v.version}`;
  if (!v || typeof v !== 'object') throw new Error('version : objet attendu');
  onlyKeys(v, ['version', 'date', 'notes', ...DISTS], where);
  if (!parseVersion(v.version)) throw new Error(`${where} : numéro attendu sous la forme 3.4.0`);
  if (compareVersions(v.version, FIRST) < 0) throw new Error(`${where} : la liste commence à ${FIRST}`);
  if (v.date === null ? !draft : !isDay(v.date)) throw new Error(`${where} : date AAAA-MM-JJ, un jour seul${draft ? '' : ' (null admis par --brouillon seulement)'}`);
  if (!v.notes || typeof v.notes !== 'object') throw new Error(`${where} : notes fr et en attendues`);
  onlyKeys(v.notes, Object.keys(LANGS), `${where}, notes`);
  for (const lang of Object.keys(LANGS)) if (typeof v.notes[lang] !== 'string' || v.notes[lang].trim() === '') throw new Error(`${where} : notes ${lang} vides`);
  for (const dist of DISTS) {
    const file = v[dist];
    if (file === undefined && !REQUIRED.includes(dist)) continue;
    if (!file || typeof file !== 'object') throw new Error(`${where} : ${dist} attendu`);
    onlyKeys(file, ['url', 'sha256'], `${where}, ${dist}`);
    if (!isHttps(file.url)) throw new Error(`${where} : ${dist}.url en https attendue`);
    if (file.sha256 === null ? !draft : !(typeof file.sha256 === 'string' && /^[0-9a-f]{64}$/.test(file.sha256))) {
      throw new Error(`${where} : ${dist}.sha256, 64 chiffres hexadécimaux en minuscules${draft ? '' : ' (null admis par --brouillon seulement)'}`);
    }
  }
}

/** The list, checked and sorted newest first; an error says what is wrong and where. */
function check(data, { draft = false } = {}) {
  if (!data || typeof data !== 'object') throw new Error('versions.json : objet attendu');
  onlyKeys(data, ['store', 'versions'], 'versions.json');
  if (!isHttps(data.store)) throw new Error('store : adresse https de la fiche du Store attendue');
  if (!Array.isArray(data.versions) || data.versions.length === 0) throw new Error('versions : au moins une version attendue');
  const seen = new Set();
  for (const v of data.versions) {
    checkEntry(v, draft);
    if (seen.has(v.version)) throw new Error(`version ${v.version} en double`);
    seen.add(v.version);
  }
  return [...data.versions].sort((a, b) => compareVersions(b.version, a.version));
}

/** The holder of the rights, as the home page names him: the footer of the pages is the one of the other pages. */
function holderOf(site) {
  const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  const m = /"author"\s*:\s*\{\s*"@type"\s*:\s*"Person"\s*,\s*"name"\s*:\s*"([^"]+)"/.exec(html);
  if (!m) throw new Error('index.html : auteur (JSON-LD « author ») introuvable');
  return m[1];
}

// ---------- the pages ----------

/** What the script of the page needs, in a JSON block the browser does not run. */
function pageData(lang, list, store) {
  const t = LANGS[lang];
  const versions = list.map((v) => ({ version: v.version, dated: t.dated(v.date), portable: v.portable, server: v.server }));
  return JSON.stringify({ store, texts: t.texts, versions }).replace(/</g, '\\u003c');
}

function head(lang, list, store) {
  const t = LANGS[lang];
  return `<!doctype html>
<!-- ${t.page.slice(1)}index.html -->
<!-- Page fabriquée par outils/versions.cjs à partir de outils/versions.json : ne pas la modifier à la main -->
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="referrer" content="no-referrer">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(t.head)}</title>
  <meta name="description" content="${attr(t.description)}">
  <meta name="theme-color" content="#5B5BD6">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${attr(t.head)}">
  <meta property="og:description" content="${attr(t.description)}">
  <meta property="og:url" content="${ORIGIN}${t.page}">
  <meta property="og:image" content="${ORIGIN}/og-image.png">
  <meta property="og:locale" content="${t.locale}">
  <link rel="canonical" href="${ORIGIN}${t.page}">
  <link rel="alternate" hreflang="fr" href="${ORIGIN}${LANGS.fr.page}">
  <link rel="alternate" hreflang="en" href="${ORIGIN}${LANGS.en.page}">
  <link rel="alternate" hreflang="x-default" href="${ORIGIN}${LANGS.en.page}">
  <link rel="alternate" type="application/atom+xml" title="${attr(t.feedTitle)}" href="${ORIGIN}${t.page}feed.xml">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="/assets/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/assets/site.css">
  <link rel="stylesheet" href="/assets/versions.css">
  <script type="application/json" id="versions-data">${pageData(lang, list, store)}</script>
  <script src="/assets/versions.js" defer></script>
</head>`;
}

function header(lang) {
  const t = LANGS[lang];
  return `  <header class="nav">
    <a class="brand" href="${t.home}" aria-label="Topogenia">
      ${BRAND}
      <span>Topogenia</span>
    </a>
    <div class="nav-end">
      <div class="lang" role="group" aria-label="${t.langLabel}">
        <a href="${LANGS.fr.page}" hreflang="fr"${lang === 'fr' ? ' aria-current="page"' : ''}>FR</a>
        <a href="${LANGS.en.page}" hreflang="en"${lang === 'en' ? ' aria-current="page"' : ''}>EN</a>
      </div>
      <a class="btn btn-ghost btn-small" href="${t.home}">${t.back}</a>
    </div>
  </header>`;
}

function historyItem(lang, v) {
  const t = LANGS[lang];
  const files = offered(v).map((dist) => `            <li><a href="${attr(v[dist].url)}">${t.files[dist]}</a><br><span class="versions-sha">SHA-256 <code>${v[dist].sha256 === null ? t.texts.pending : v[dist].sha256}</code></span></li>`).join('\n');
  return `        <li id="version-${v.version}">
          <h3>${v.version} · ${t.day(v.date)}</h3>
          <p>${esc(v.notes[lang])}</p>
          <ul class="versions-files">
${files}
          </ul>
        </li>`;
}

function page(lang, list, store, holder) {
  const t = LANGS[lang];
  return `${head(lang, list, store)}
<body class="legal-page versions-page">
${header(lang)}

  <main id="main" class="legal">
    <article>
      <p class="kicker">Topogenia</p>
      <h1>${t.title}</h1>
      <p class="lead">${t.lead}</p>
      <div id="versions-verdict" class="versions-verdict" aria-live="polite"></div>

      <section aria-labelledby="historique">
        <h2 id="historique">${t.history}</h2>
        <ol class="versions-list">
${list.map((v) => historyItem(lang, v)).join('\n')}
        </ol>
        <p><a href="${t.page}feed.xml">${t.feed}</a></p>
      </section>

      <section>
        <p>${t.privacy} <a href="${t.privacyHref}">${t.privacyLink}</a></p>
      </section>
    </article>
  </main>

  <footer class="footer legal-foot">
    <p class="foot-copy">© 2026 ${esc(holder)} · <a href="${t.legalHref}">${t.legal}</a> · <a href="${t.galleryHref}">${t.gallery}</a> · <a href="${t.page}feed.xml">${t.feed}</a></p>
  </footer>
</body>
</html>
`;
}

// ---------- the Atom feed ----------

/** A day as Atom wants it: the day alone, at midnight UTC; no hour of a build ever enters. */
const stamp = (day) => `${day}T00:00:00Z`;

function feedEntry(lang, v) {
  const t = LANGS[lang];
  const link = `${ORIGIN}${t.page}#version-${v.version}`;
  const files = offered(v).map((dist) => `${t.files[dist]} : ${v[dist].url}\nSHA-256 : ${v[dist].sha256 === null ? t.texts.pending : v[dist].sha256}`).join('\n');
  const dates = v.date === null ? '' : `\n    <published>${stamp(v.date)}</published>\n    <updated>${stamp(v.date)}</updated>`;
  return `  <entry>
    <title>Topogenia ${v.version}</title>
    <id>${link}</id>
    <link rel="alternate" type="text/html" href="${link}"/>${dates}
    <summary>${esc(v.notes[lang])}</summary>
    <content type="text">${esc(`${v.notes[lang]}\n\n${files}`)}</content>
  </entry>`;
}

function feed(lang, list, draft) {
  const t = LANGS[lang];
  const days = list.map((v) => v.date).filter((d) => d !== null).sort();
  const updated = days.length > 0 ? `\n  <updated>${stamp(days.at(-1))}</updated>` : '';
  const note = draft ? '\n  <!-- Brouillon : les dates manquantes s\'écrivent à la publication (node outils/versions.cjs sans --brouillon) -->' : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${lang}">${note}
  <title>${esc(t.feedTitle)}</title>${updated}
  <id>${ORIGIN}${t.page}</id>
  <link rel="self" type="application/atom+xml" href="${ORIGIN}${t.page}feed.xml"/>
  <link rel="alternate" type="text/html" href="${ORIGIN}${t.page}"/>
  <author><name>Topogenia</name></author>
${list.map((v) => feedEntry(lang, v)).join('\n')}
</feed>
`;
}

// ---------- the home page: its version, its download and its hash all come from the latest version ----------

/** Replaces the one passage that matches; a missing or doubled one is an error (the home page changed shape). */
function stampOnce(text, pattern, replacement, what) {
  const matches = text.match(new RegExp(pattern.source, 'g')) || [];
  if (matches.length !== 1) throw new Error(`accueil : ${what} trouvé ${matches.length} fois au lieu d'une`);
  return text.replace(pattern, replacement);
}

/**
 * The home page (index.html) and its English texts (assets/i18n.js) with the number of the latest version, the link of its
 * portable ZIP, its release notes and the link of its hash, all read from versions.json. Idempotent: the page already
 * stamped comes back unchanged. The English page is then made by outils/page-en.cjs.
 */
function stampHome(html, i18n, latest) {
  const version = latest.version;
  const short = version.split('.').slice(0, 2).join('.');
  const zip = latest.portable.url;
  const tag = zip.replace(/\/releases\/download\/([^/]+)\/[^/]*$/, '/releases/tag/$1');
  if (tag === zip) throw new Error('accueil : adresse du ZIP portable attendue sous la forme …/releases/download/vX/fichier.zip');
  let h = html;
  h = stampOnce(h, /("softwareVersion": ")[^"]*(")/, `$1${version}$2`, 'softwareVersion');
  h = stampOnce(h, /("downloadUrl": ")[^"]*(")/, `$1${zip}$2`, 'downloadUrl');
  h = stampOnce(h, /("releaseNotes": ")[^"]*(")/, `$1${tag}$2`, 'releaseNotes');
  h = stampOnce(h, /(id="download-link" href=")[^"]*(")/, `$1${zip}$2`, 'bouton de téléchargement');
  h = stampOnce(h, /(data-i18n="dl\.button">Télécharger Topogenia&nbsp;)[\d.]+(<)/, `$1${short}$2`, 'texte du bouton');
  h = stampOnce(h, /(<a href=")[^"]*(" data-i18n="dl\.f4">)/, `$1${zip}.sha256$2`, 'lien de l\'empreinte');
  h = stampOnce(h, /(data-i18n="hero\.eyebrow">Topogenia )[\d.]+( ·)/, `$1${short}$2`, 'bandeau');
  let t = i18n;
  t = stampOnce(t, /('hero\.eyebrow': 'Topogenia )[\d.]+( ·)/, `$1${short}$2`, 'bandeau anglais');
  t = stampOnce(t, /('dl\.button': 'Download Topogenia[  ])[\d.]+(')/, `$1${short}$2`, 'bouton anglais');
  return { html: h, i18n: t };
}

/** The two files of the home page, stamped from the latest version of the list; nothing is written here. */
function homeFiles({ site, data, draft = false }) {
  const latest = check(data, { draft })[0];
  const read = (relative) => fs.readFileSync(path.join(site, ...relative.split('/')), 'utf8').replace(/\r\n/g, '\n');
  const { html, i18n } = stampHome(read('index.html'), read('assets/i18n.js'), latest);
  return { 'index.html': html, 'assets/i18n.js': i18n };
}

// ---------- the sitemap and the whole ----------

/** The sitemap with the two pages of the versions; every other entry is kept as it was. */
function sitemap(xml, list) {
  const text = xml.replace(/\r\n/g, '\n');
  const pages = Object.values(LANGS).map((t) => `${ORIGIN}${t.page}`);
  const kept = [...text.matchAll(/ {2}<url>\n[\s\S]*?<\/url>\n/g)].map((m) => m[0]).filter((entry) => !pages.some((url) => entry.includes(`<loc>${url}</loc>`)));
  const day = list.find((v) => v.date !== null)?.date ?? null;
  const ours = pages.map((url) => `  <url>\n    <loc>${url}</loc>\n${day === null ? '' : `    <lastmod>${day}</lastmod>\n`}  </url>\n`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${kept.join('')}${ours.join('')}</urlset>\n`;
}

/** Every file of the versions, as { path relative to the site: content }; nothing is written here. */
function build({ site, data, draft = false }) {
  const list = check(data, { draft });
  const holder = holderOf(site);
  const files = {};
  for (const lang of Object.keys(LANGS)) {
    const folder = LANGS[lang].page.slice(1);
    files[`${folder}index.html`] = page(lang, list, data.store, holder);
    files[`${folder}feed.xml`] = feed(lang, list, draft);
  }
  files['sitemap.xml'] = sitemap(fs.readFileSync(path.join(site, 'sitemap.xml'), 'utf8'), list);
  return files;
}

function main(argv) {
  const site = path.resolve(__dirname, '..');
  const draft = argv.includes('--brouillon');
  const unknown = argv.filter((arg) => arg !== '--brouillon');
  if (unknown.length > 0) throw new Error(`argument inconnu : ${unknown.join(' ')}`);
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'versions.json'), 'utf8'));
  const files = { ...build({ site, data, draft }), ...homeFiles({ site, data, draft }) };
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(site, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  // The English home page follows the French one
  execFileSync(process.execPath, [path.join(__dirname, 'page-en.cjs')], { stdio: 'inherit' });
  console.log(`${Object.keys(files).join(', ')} écrits${draft ? ' (brouillon)' : ''}`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`ERREUR : ${error.message}`);
    process.exit(1);
  }
}

module.exports = { build, homeFiles, stampHome, check, LANGS, CSP, ORIGIN, FIRST };
