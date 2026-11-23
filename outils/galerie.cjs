// galerie.cjs
// Builds the template gallery of the site, in French and in English: the .pmap files, the collection .pmaps of each domain, sha256.txt, then the index page and one page per domain, and the pages in sitemap.xml. No library. Usage, from the site root: node outils/galerie.cjs fichiers <folder of the models> ; node outils/galerie.cjs pages <folder of the images> (images/<domain folder>/<model>.<language>.png). The folders are arguments: no path of the machine is written.

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CSP, ORIGIN } = require('./versions.cjs');

const PREFIX = { fr: 'Modèle de la galerie : ', en: 'Gallery template: ' };
const COLLECTION = { format: 'topogenia-collection', version: '1.0' };
const PROCESSES_MAX = 50;
const NAME_MAX = 200;
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** The text with its first letter in capital: the prefix removed, a description starts a sentence. */
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const attr = (value) => esc(value).replace(/"/g, '&quot;');

/** What each language says, and where its pages live. */
const LANGS = {
  fr: {
    locale: 'fr_FR', root: 'modeles/', other: 'en', langLabel: 'Langue / Language', home: '/', back: 'Retour au site',
    legal: 'Mentions légales', legalHref: '/mentions-legales.html', versionsHref: '/versions/',
    head: 'Modèles de processus · Topogenia', title: 'Modèles de processus',
    description: 'Des processus prêts à ouvrir dans Topogenia, classés par domaine, à adapter à votre organisation.',
    lead: 'Des cartes en couloirs prêtes à ouvrir dans Topogenia, classées par domaine. Une base standard pour ne pas partir d\'une page blanche.',
    domains: 'Les domaines', all: 'Tous les modèles', collectionH: 'La collection du domaine', modelsH: 'Les modèles',
    collectionNote: 'Tous les modèles du domaine en un seul fichier. S\'ouvre dans Topogenia 3.4 et suivantes, par Fichier > Ouvrir un fichier…',
    collectionLink: 'Télécharger la collection (.pmaps)', modelLink: 'Télécharger le modèle (.pmap)',
    modelNote: 'S\'ouvre dans Topogenia 3.3 et suivantes, par Fichier > Ouvrir un fichier…',
    textSummary: 'Texte du modèle, à copier', copy: 'Copier', done: 'Copié', failed: 'Copie impossible',
    hashes: 'Empreintes des modèles et de la collection (sha256.txt)',
    hashLimit: 'Publiée sur ce même site, l\'empreinte détecte un fichier abîmé en route, pas un site compromis, et ne dit pas qui a écrit le fichier.',
    licence: (name) => `Les fichiers .pmap et .pmaps et les images PNG de cette galerie sont publiés sous licence ${name}. Le © du pied de page ne concerne que le site, pas ces fichiers.`,
    siteRights: 'Site ©', sha: 'Empreinte SHA-256 : ', size: (n) => `${(n / 1024).toFixed(1).replace('.', ',')} Ko`,
    count: (n) => `${n} modèle${n > 1 ? 's' : ''}`,
  },
  en: {
    locale: 'en_US', root: 'en/templates/', other: 'fr', langLabel: 'Language / Langue', home: '/en/', back: 'Back to the site',
    legal: 'Legal notice', legalHref: '/mentions-legales.html?lang=en', versionsHref: '/en/versions/',
    head: 'Process templates · Topogenia', title: 'Process templates',
    description: 'Processes ready to open in Topogenia, by domain, to adapt to your organisation.',
    lead: 'Swimlane maps ready to open in Topogenia, sorted by domain. A standard base, so you never start from a blank page.',
    domains: 'Domains', all: 'All templates', collectionH: 'The domain collection', modelsH: 'The templates',
    collectionNote: 'All the templates of the domain in one file. Opens in Topogenia 3.4 and later, with File > Open a file…',
    collectionLink: 'Download the collection (.pmaps)', modelLink: 'Download the template (.pmap)',
    modelNote: 'Opens in Topogenia 3.3 and later, with File > Open a file…',
    textSummary: 'Text of the template, to copy', copy: 'Copy', done: 'Copied', failed: 'Copy failed',
    hashes: 'Hashes of the templates and of the collection (sha256.txt)',
    hashLimit: 'Published on this same website, the hash detects a file damaged on the way, not a compromised website, and does not say who wrote the file.',
    licence: (name) => `The .pmap and .pmaps files and the PNG images of this gallery are released under the ${name} licence. The © in the footer applies to the website only, not to these files.`,
    siteRights: 'Website ©', sha: 'SHA-256 hash: ', size: (n) => `${(n / 1024).toFixed(1)} KB`,
    count: (n) => `${n} template${n > 1 ? 's' : ''}`,
  },
};
const LANG_KEYS = Object.keys(LANGS);

// The same mark as the other pages of the site (versions.cjs).
const BRAND = '<svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><rect x=".5" y=".5" width="23" height="23" rx="6.5" fill="#5B5BD6"/><rect x=".5" y=".5" width="23" height="11.5" rx="6.5" fill="#4343B8" opacity=".35"/><path d="M6 8h4.5a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2H18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="6" cy="8" r="1.8" fill="#fff"/><circle cx="18" cy="16" r="1.8" fill="#fff"/></svg>';

// ---------- where things live ----------

/** The folder of the page of a domain, relative to the site root, with its final slash. */
const domainDir = (lang, domain) => `${LANGS[lang].root}${lang === 'fr' ? domain.slug : domain.folder}/`;

const baseName = (name, lang) => `${name}.${lang}`;

// ---------- the data ----------

/** Checks the domains file; an error says what is wrong and where. */
function checkData(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.domains) || data.domains.length === 0) throw new Error('galerie-domaines.json : domains attendu');
  const seen = new Set();
  for (const d of data.domains) {
    for (const key of ['folder', 'slug']) {
      if (typeof d[key] !== 'string' || !/^[a-z]+(?:-[a-z]+)*$/.test(d[key])) throw new Error(`domaine ${d.folder} : ${key} attendu en minuscules et tirets`);
      if (seen.has(`${key}:${d[key]}`)) throw new Error(`domaine ${d[key]} en double`);
      seen.add(`${key}:${d[key]}`);
    }
    for (const lang of LANG_KEYS) {
      const where = `domaine ${d.folder}, ${lang}`;
      if (!d.names || typeof d.names[lang] !== 'string' || d.names[lang].trim() === '') throw new Error(`${where} : names vide`);
      const c = d.collection && d.collection[lang];
      if (!c || typeof c.name !== 'string' || c.name.trim() === '') throw new Error(`${where} : collection.name vide`);
      if (c.name.length > NAME_MAX || /<[a-zA-Z!/?]/.test(c.name)) throw new Error(`${where} : collection.name de ${NAME_MAX} caractères au plus, sans balise`);
      if (typeof c.description !== 'string' || c.description.length > 4000) throw new Error(`${where} : collection.description attendue (4 000 caractères au plus)`);
    }
  }
  const licence = data.licence;
  // One setting fills the licence line of every page, in both languages: the name of the licence ("CC0 1.0"), or null until the release
  if (licence !== null && !(typeof licence === 'string' && licence.trim() !== '' && licence.length <= 40 && !/<[a-zA-Z!/?]/.test(licence))) {
    throw new Error('licence : null, ou le nom de la licence (40 caractères au plus, sans balise)');
  }
}

/** The models of a domain in a language, in the order of their file names: { name, file, bytes, text, project }. */
function readModels(dir, folder, lang, where) {
  if (!fs.existsSync(dir)) throw new Error(`${where} : dossier ${folder} absent`);
  const suffix = `.${lang}.pmap`;
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(suffix)).sort();
  return files.map((file) => {
    const bytes = fs.readFileSync(path.join(dir, file));
    const text = bytes.toString('utf8');
    if (text.includes('\r')) throw new Error(`${folder}/${file} : fins de ligne CRLF, LF attendu`);
    const project = JSON.parse(text).project;
    if (!project || typeof project.name !== 'string') throw new Error(`${folder}/${file} : project.name attendu`);
    return { name: file.slice(0, -suffix.length), file, bytes, text, project };
  });
}

function sha256Lines(files) {
  return `${Object.keys(files).sort().map((name) => `${sha256(files[name])}  ${name}`).join('\n')}\n`;
}

// ---------- the files ----------

function collectionOf(domain, lang, models) {
  const c = domain.collection[lang];
  const processes = models.map((m) => JSON.parse(m.text));
  return `${JSON.stringify({ ...COLLECTION, name: c.name, description: c.description, processes }, null, 2)}\n`;
}

/** Every file to serve, as { path relative to the site: content }; nothing is written here. */
function buildFiles({ modelsDir, data }) {
  checkData(data);
  const out = {};
  for (const domain of data.domains) {
    const byLang = {};
    for (const lang of LANG_KEYS) byLang[lang] = readModels(path.join(modelsDir, domain.folder), domain.folder, lang, 'modèles');
    const names = (lang) => byLang[lang].map((m) => m.name).join(',');
    if (byLang.fr.length === 0) throw new Error(`domaine ${domain.folder} : aucun modèle`);
    if (names('fr') !== names('en')) throw new Error(`domaine ${domain.folder} : les modèles français (${names('fr')}) et anglais (${names('en')}) ne vont pas par paires`);
    if (byLang.fr.length > PROCESSES_MAX) throw new Error(`domaine ${domain.folder} : plus de ${PROCESSES_MAX} modèles`);
    for (const lang of LANG_KEYS) {
      const dir = domainDir(lang, domain);
      const served = {};
      for (const m of byLang[lang]) served[m.file] = m.bytes;
      served[`${domain.folder}.${lang}.pmaps`] = collectionOf(domain, lang, byLang[lang]);
      for (const [name, content] of Object.entries(served)) out[`${dir}${name}`] = content;
      out[`${dir}sha256.txt`] = sha256Lines(Object.fromEntries(Object.entries(served).map(([n, c]) => [n, Buffer.from(c)])));
    }
  }
  return out;
}

/** Removes from the served folders of the domains the .pmap, .pmaps and sha256.txt that the models no longer give (a renamed or dropped model). */
function removeStale(site, files, data) {
  for (const domain of data.domains) {
    for (const lang of LANG_KEYS) {
      const rel = domainDir(lang, domain);
      const dir = path.join(site, ...rel.split('/'));
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        if (/\.(pmap|pmaps)$/.test(name) || name === 'sha256.txt') {
          if (!(`${rel}${name}` in files)) fs.rmSync(path.join(dir, name));
        }
      }
    }
  }
}

function writeAll(site, files) {
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(site, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

// ---------- the pages ----------

/** The files of a domain as the site serves them now, read back for the pages: models, collection, hashes. */
function readServed(site, domain, lang) {
  const dir = path.join(site, ...domainDir(lang, domain).split('/'));
  const models = readModels(dir, domainDir(lang, domain), lang, 'fichiers servis (lancer d\'abord « fichiers »)');
  const collectionFile = `${domain.folder}.${lang}.pmaps`;
  if (models.length === 0 || !fs.existsSync(path.join(dir, collectionFile))) throw new Error(`${domainDir(lang, domain)} : fichiers absents, lancer d'abord « fichiers »`);
  const served = Object.fromEntries(models.map((m) => [m.file, m.bytes]));
  served[collectionFile] = fs.readFileSync(path.join(dir, collectionFile));
  const sums = path.join(dir, 'sha256.txt');
  if (!fs.existsSync(sums) || fs.readFileSync(sums, 'utf8') !== sha256Lines(served)) throw new Error(`${domainDir(lang, domain)}sha256.txt périmé, relancer « fichiers »`);
  return { models, collection: { file: collectionFile, bytes: served[collectionFile], sha: sha256(served[collectionFile]) } };
}

function holderOf(site) {
  const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  const m = /"author"\s*:\s*\{\s*"@type"\s*:\s*"Person"\s*,\s*"name"\s*:\s*"([^"]+)"/.exec(html);
  if (!m) throw new Error('index.html : auteur (JSON-LD « author ») introuvable');
  return m[1];
}

/** The twin of a page: the French and English addresses of the same page, relative to the site root. */
function address(lang, domain) {
  return domain ? `/${domainDir(lang, domain)}` : `/${LANGS[lang].root}`;
}

function head(lang, domain, title, description) {
  const t = LANGS[lang];
  const url = ORIGIN + address(lang, domain);
  return `<!doctype html>
<!-- ${address(lang, domain).slice(1)}index.html -->
<!-- Page fabriquée par outils/galerie.cjs à partir des modèles : ne pas la modifier à la main -->
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${CSP}">
  <meta name="referrer" content="no-referrer">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${attr(description)}">
  <meta name="theme-color" content="#5B5BD6">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${attr(title)}">
  <meta property="og:description" content="${attr(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${ORIGIN}/og-image.png">
  <meta property="og:locale" content="${t.locale}">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="fr" href="${ORIGIN}${address('fr', domain)}">
  <link rel="alternate" hreflang="en" href="${ORIGIN}${address('en', domain)}">
  <link rel="alternate" hreflang="x-default" href="${ORIGIN}${address('en', domain)}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="/assets/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/assets/site.css">
  <link rel="stylesheet" href="/assets/galerie.css">
  <script src="/assets/galerie.js" defer></script>
</head>`;
}

function header(lang, domain) {
  const t = LANGS[lang];
  const current = (l) => (l === lang ? ' aria-current="page"' : '');
  return `  <header class="nav">
    <a class="brand" href="${t.home}" aria-label="Topogenia">
      ${BRAND}
      <span>Topogenia</span>
    </a>
    <div class="nav-end">
      <div class="lang" role="group" aria-label="${t.langLabel}">
        <a href="${address('fr', domain)}" hreflang="fr"${current('fr')}>FR</a>
        <a href="${address('en', domain)}" hreflang="en"${current('en')}>EN</a>
      </div>
      <a class="btn btn-ghost btn-small" href="${t.home}">${t.back}</a>
    </div>
  </header>`;
}

function shell(lang, domain, title, description, body, holder) {
  const t = LANGS[lang];
  return `${head(lang, domain, title, description)}
<body class="legal-page galerie-page">
${header(lang, domain)}

  <main id="main" class="legal">
    <article>
${body}
    </article>
  </main>

  <footer class="footer legal-foot">
    <p class="foot-copy">${t.siteRights} 2026 ${esc(holder)} · <a href="${t.legalHref}">${t.legal}</a> · <a href="${t.versionsHref}">Versions</a></p>
  </footer>
</body>
</html>
`;
}

function licenceLine(lang, licence) {
  return licence === null
    ? '      <!-- licence : à remplir (outils/galerie-domaines.json, "licence") -->'
    : `      <p class="galerie-licence">${esc(LANGS[lang].licence(licence))}</p>`;
}

function guideHtml(lang, guide) {
  const items = (guide && guide[lang]) || [];
  if (items.length === 0) return '';
  const sections = items.map((item) => `      <section class="galerie-guide">
        <h2>${esc(item.title)}</h2>
${item.paragraphs.map((p) => `        <p>${esc(p)}</p>`).join('\n')}
      </section>`);
  return `${sections.join('\n')}\n`;
}

function indexPage(lang, data, served, guide, holder) {
  const t = LANGS[lang];
  const items = data.domains.map((domain) => {
    const models = served[domain.folder][lang].models;
    return `          <li>
            <a href="${address(lang, domain)}">${esc(domain.names[lang])}</a>
            <span class="galerie-count">${t.count(models.length)}</span>
            <span class="galerie-names">${models.map((m) => esc(m.project.name)).join(' · ')}</span>
          </li>`;
  });
  const body = `      <p class="kicker">Topogenia</p>
      <h1>${esc(t.title)}</h1>
      <p class="lead">${esc(t.lead)}</p>
${licenceLine(lang, data.licence)}
${guideHtml(lang, guide)}      <section>
        <h2>${esc(t.domains)}</h2>
        <ul class="galerie-domains">
${items.join('\n')}
        </ul>
      </section>`;
  return shell(lang, null, t.head, t.description, body, holder);
}

function modelHtml(lang, domain, model, images) {
  const t = LANGS[lang];
  const base = baseName(model.name, lang);
  const dir = address(lang, domain);
  const id = `texte-${model.name}-${lang}`;
  const prefix = PREFIX[lang];
  const description = model.project.description || '';
  return `      <section class="galerie-model" aria-labelledby="titre-${model.name}-${lang}">
        <h3 id="titre-${model.name}-${lang}">${esc(model.project.name)}</h3>
${images.has(`${dir.slice(1)}${base}.png`) ? `        <figure class="galerie-figure">
          <img src="${dir}${base}.png" alt="${attr(model.project.name)}" loading="lazy" decoding="async">
        </figure>
` : ''}        <p>${esc(capitalize(description.startsWith(prefix) ? description.slice(prefix.length) : description))}</p>
        <p><a href="${dir}${base}.pmap" download>${t.modelLink}</a> · ${t.size(model.bytes.length)}<br>
        <span class="galerie-sha">${t.sha}<code>${sha256(model.bytes)}</code></span></p>
        <p class="galerie-note">${esc(t.modelNote)}</p>
        <details class="galerie-details">
          <summary>${t.textSummary}</summary>
          <button type="button" class="galerie-copy" data-copy="${id}" data-done="${t.done}" data-failed="${t.failed}">${t.copy}</button>
          <pre id="${id}" class="galerie-text" tabindex="0"><code>${esc(model.text)}</code></pre>
        </details>
      </section>`;
}

function domainPage(lang, data, domain, served, holder, images) {
  const t = LANGS[lang];
  const { models, collection } = served;
  const c = domain.collection[lang];
  const dir = address(lang, domain);
  const body = `      <p class="galerie-back"><a href="${address(lang, null)}">${t.all}</a></p>
      <h1>${esc(domain.names[lang])}</h1>
      <p class="lead">${esc(c.description)}</p>
${licenceLine(lang, data.licence)}
      <section aria-labelledby="collection">
        <h2 id="collection">${t.collectionH}</h2>
        <p><a href="${dir}${collection.file}" download>${t.collectionLink}</a> · ${t.size(collection.bytes.length)} · ${t.count(models.length)}<br>
        <span class="galerie-sha">${t.sha}<code>${collection.sha}</code></span></p>
        <p class="galerie-note">${esc(t.collectionNote)}</p>
        <p><a href="${dir}sha256.txt">${t.hashes}</a></p>
        <p class="galerie-note">${esc(t.hashLimit)}</p>
      </section>

      <h2 class="galerie-models-title">${t.modelsH}</h2>
${models.map((m) => modelHtml(lang, domain, m, images)).join('\n\n')}`;
  return shell(lang, domain, `${domain.names[lang]} · ${t.title} · Topogenia`, c.description, body, holder);
}

// ---------- the images ----------

/** The images of the models, as { path in the site: bytes }; one missing or not a PNG stops everything, all named. */
function readImages(imagesDir, data, served, skipMissing = false) {
  const out = {};
  const problems = [];
  for (const domain of data.domains) {
    for (const lang of LANG_KEYS) {
      for (const m of served[domain.folder][lang].models) {
        const name = `${baseName(m.name, lang)}.png`;
        const file = path.join(imagesDir, domain.folder, name);
        if (!fs.existsSync(file)) { if (!skipMissing) problems.push(`${domain.folder}/${name} absente`); continue; }
        const bytes = fs.readFileSync(file);
        if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) { problems.push(`${domain.folder}/${name} n'est pas un PNG`); continue; }
        // The image shows the model served, not an older state of it: the series that takes it writes beside it the SHA-256 of the model it opened (contre-visite 68, CV-P2-01).
        const source = `${file}.source.sha256`;
        if (!fs.existsSync(source)) { problems.push(`${domain.folder}/${name} sans l'empreinte du modèle photographié`); continue; }
        if (fs.readFileSync(source, 'utf8').trim() !== sha256(m.bytes)) { problems.push(`${domain.folder}/${name} prise d'un autre état de son modèle`); continue; }
        out[`${domainDir(lang, domain)}${name}`] = bytes;
      }
    }
  }
  if (problems.length > 0) throw new Error(`images : ${problems.join(', ')}`);
  return out;
}

// ---------- the sitemap and the whole ----------

/** The sitemap with the pages of the gallery; every other entry is kept as it was. */
function sitemap(xml, urls) {
  const text = xml.replace(/\r\n/g, '\n');
  const ours = (entry) => LANG_KEYS.some((lang) => entry.includes(`<loc>${ORIGIN}/${LANGS[lang].root}`));
  const kept = [...text.matchAll(/ {2}<url>\n[\s\S]*?<\/url>\n/g)].map((m) => m[0]).filter((entry) => !ours(entry));
  const added = urls.map((url) => `  <url>\n    <loc>${ORIGIN}${url}</loc>\n  </url>\n`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${kept.join('')}${added.join('')}</urlset>\n`;
}

/** Every file of the pages (pages, images, sitemap.xml), as { path relative to the site: content }; nothing is written here. */
/** skipMissingImages: a model without image is shown without figure (the others are still checked); for a build before the images are taken. */
function buildPages({ site, imagesDir, data, guide, skipMissingImages = false }) {
  checkData(data);
  const served = {};
  for (const domain of data.domains) {
    served[domain.folder] = {};
    for (const lang of LANG_KEYS) served[domain.folder][lang] = readServed(site, domain, lang);
  }
  const images = readImages(imagesDir, data, served, skipMissingImages);
  const have = new Set(Object.keys(images));
  const holder = holderOf(site);
  const out = { ...images };
  const urls = [];
  for (const lang of LANG_KEYS) {
    out[`${LANGS[lang].root}index.html`] = indexPage(lang, data, served, guide, holder);
    urls.push(address(lang, null));
  }
  for (const lang of LANG_KEYS) {
    for (const domain of data.domains) {
      out[`${domainDir(lang, domain)}index.html`] = domainPage(lang, data, domain, served[domain.folder][lang], holder, have);
      urls.push(address(lang, domain));
    }
  }
  out['sitemap.xml'] = sitemap(fs.readFileSync(path.join(site, 'sitemap.xml'), 'utf8'), urls);
  return out;
}

function main(argv) {
  const site = path.resolve(__dirname, '..');
  const skip = argv.includes('--sans-image');
  const [command, folder, ...rest] = argv.filter((arg) => arg !== '--sans-image');
  if (!['fichiers', 'pages'].includes(command) || !folder || rest.length > 0 || (skip && command !== 'pages')) throw new Error('usage : node outils/galerie.cjs fichiers <dossier des modèles> | pages <dossier des images> [--sans-image]');
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'galerie-domaines.json'), 'utf8'));
  if (command === 'fichiers') {
    const files = buildFiles({ modelsDir: path.resolve(folder), data });
    removeStale(site, files, data);
    writeAll(site, files);
    const count = (suffix) => Object.keys(files).filter((name) => name.endsWith(suffix)).length;
    console.log(`${count('.pmap')} .pmap, ${count('.pmaps')} .pmaps, ${count('sha256.txt')} sha256.txt écrits`);
    return;
  }
  const guideFile = path.join(__dirname, 'galerie-mode-d-emploi.json');
  const guide = fs.existsSync(guideFile) ? JSON.parse(fs.readFileSync(guideFile, 'utf8')) : undefined;
  const files = buildPages({ site, imagesDir: path.resolve(folder), data, guide, skipMissingImages: skip });
  writeAll(site, files);
  if (skip) {
    const expected = data.domains.flatMap((d) => LANG_KEYS.flatMap((lang) => fs.readdirSync(path.join(site, ...domainDir(lang, d).split('/'))).filter((n) => n.endsWith(`.${lang}.pmap`)).map((n) => `${domainDir(lang, d)}${n.slice(0, -5)}.png`)));
    const missing = expected.filter((name) => !(name in files));
    if (missing.length > 0) console.log(`ATTENTION : ${missing.length} image(s) absente(s), modèles montrés sans image : ${missing.join(', ')}`);
  }
  console.log(`${Object.keys(files).filter((name) => name.endsWith('index.html')).length} pages, ${Object.keys(files).filter((name) => name.endsWith('.png')).length} images, sitemap.xml écrits`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`ERREUR : ${error.message}`);
    process.exit(1);
  }
}

module.exports = { buildFiles, buildPages, writeAll, checkData, LANGS };
