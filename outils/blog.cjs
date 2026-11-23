// blog.cjs
// Fabrique le blog du site à partir des articles en Markdown de outils/articles/<langue>/ : la liste des articles, une page par article (sommaire, texte, encart « Essayer »), le flux RSS de chaque langue, llms.txt (avec les liens de outils/llms-liens.json : galerie et versions) et les adresses du blog dans sitemap.xml. Aucune bibliothèque.
// Usage, depuis la racine du site : node outils/blog.cjs ; à relancer après toute modification d'un article ou de ce fichier

'use strict';

const fs = require('fs');
const path = require('path');

const site = path.resolve(__dirname, '..');
const ORIGIN = 'https://topogenia.com';
const AUTHOR = 'Peter Barcauti';
const WORDS_PER_MINUTE = 200;

const fail = (message) => { console.error(`ERREUR : ${message}`); process.exit(1); };
const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (value) => esc(value).replace(/"/g, '&quot;');

const MONTHS = {
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

/** What each language says around the articles, and where its pages live. */
const LANGS = {
  fr: {
    locale: 'fr-FR', home: '/', blog: '/blog/', other: 'en',
    title: 'Le blog', head: 'Le blog · Topogenia',
    lead: 'Où se perd le temps dans les bureaux, comment le voir, et ce qu\'on peut y faire.',
    description: 'Le blog de Topogenia : cartographier les processus de bureau, la méthode Makigami, les relais, le travail sans valeur et les ruptures de support, en mots simples.',
    back: 'Retour au site', toc: 'Sommaire', more: 'À lire aussi', rss: 'Flux RSS', legal: 'Mentions légales',
    legalHref: '/mentions-legales.html', langLabel: 'Langue / Language', read: 'Lire',
    gallery: 'Modèles', galleryHref: '/modeles/', versions: 'Versions', versionsHref: '/versions/',
    minutes: (n) => `${n} min de lecture`,
    date: (d) => `${Number(d.slice(8, 10))} ${MONTHS.fr[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`,
    ctaTitle: 'Essayer sur votre poste', ctaText: 'Gratuit, sans compte, y compris en entreprise. Vos données restent sur votre ordinateur.',
    ctaButton: 'Télécharger Topogenia', ctaHref: '/#telecharger',
    rssTitle: 'Topogenia · le blog',
  },
  en: {
    locale: 'en-US', home: '/en/', blog: '/en/blog/', other: 'fr',
    title: 'The blog', head: 'The blog · Topogenia',
    lead: 'Where time gets lost in offices, how to see it, and what to do about it.',
    description: 'The Topogenia blog: mapping office processes, the Makigami method, handoffs, work without value and media breaks, in plain words.',
    back: 'Back to the site', toc: 'Contents', more: 'Read also', rss: 'RSS feed', legal: 'Legal notice',
    legalHref: '/mentions-legales.html?lang=en', langLabel: 'Language / Langue', read: 'Read',
    gallery: 'Templates', galleryHref: '/en/templates/', versions: 'Versions', versionsHref: '/en/versions/',
    minutes: (n) => `${n} min read`,
    date: (d) => `${MONTHS.en[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}`,
    ctaTitle: 'Try it on your computer', ctaText: 'Free, no account, including at work. Your data stays on your computer.',
    ctaButton: 'Download Topogenia', ctaHref: '/en/#telecharger',
    rssTitle: 'Topogenia · the blog',
  },
};

const BRAND = '<svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><rect x=".5" y=".5" width="23" height="23" rx="6.5" fill="#5B5BD6"/><rect x=".5" y=".5" width="23" height="11.5" rx="6.5" fill="#4343B8" opacity=".35"/><path d="M6 8h4.5a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2H18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="6" cy="8" r="1.8" fill="#fff"/><circle cx="18" cy="16" r="1.8" fill="#fff"/></svg>';

// ---------- Markdown, the small part the articles use ----------

/** An identifier for a heading: lower case, without accents, words joined by dashes. */
function slugOf(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’]/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Bold, italic, code and links inside a line; everything else escaped. */
function inline(source) {
  let out = esc(source);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, text, url) => `<a href="${url}"${/^https?:/.test(url.replace(/&amp;/g, '&')) ? ' rel="noopener"' : ''}>${text}</a>`);
  return out;
}

/** The width and height of a WebP image, read from its header, so that the page does not jump while it loads. */
function webpSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') fail(`pas une image WebP : ${file}`);
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  return fail(`WebP non lu : ${file}`);
}

/** The blocks of an article: headings (the second level makes the contents), paragraphs, lists, tables, images, notes. */
function blocks(markdown, context) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  const startsBlock = (line) => /^(#{2,3} |> ?|\||- |\d+\. |!\[)/.test(line);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i += 1; continue; }
    let m = /^(#{2,3}) (.+)$/.exec(line);
    if (m) {
      const level = m[1].length;
      const id = slugOf(m[2]);
      if (level === 2 && context.toc) context.toc.push({ id, text: m[2] });
      html.push(`<h${level} id="${id}">${inline(m[2])}</h${level}>`);
      i += 1;
      continue;
    }
    m = /^!\[([^\]]+)\]\(([^)\s]+)\)$/.exec(line.trim());
    if (m) {
      const file = path.join(site, context.images, m[2]);
      if (!fs.existsSync(file)) fail(`image absente : ${file}`);
      const { width, height } = webpSize(file);
      context.used.add(m[2]);
      const src = `/${context.images.replace(/\\/g, '/')}/${m[2]}`;
      html.push(`<figure><a class="blog-zoom" href="${src}"><img src="${src}" alt="${attr(m[1])}" width="${width}" height="${height}" loading="lazy" decoding="async"></a><figcaption>${inline(m[1])}</figcaption></figure>`);
      i += 1;
      continue;
    }
    if (/^> ?/.test(line)) {
      const inner = [];
      while (i < lines.length && /^> ?/.test(lines[i])) { inner.push(lines[i].replace(/^> ?/, '')); i += 1; }
      html.push(`<aside class="blog-note">${blocks(inner.join('\n'), { ...context, toc: null })}</aside>`);
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i += 1; }
      const cells = (row) => row.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
      if (rows.length < 2 || !/^\|[\s:|-]+\|$/.test(rows[1])) fail(`tableau sans ligne de séparation : ${rows[0]}`);
      const head = cells(rows[0]).map((cell) => `<th scope="col">${inline(cell)}</th>`).join('');
      const body = rows.slice(2).map((row) => `<tr>${cells(row).map((cell, index) => (index === 0 ? `<th scope="row">${inline(cell)}</th>` : `<td>${inline(cell)}</td>`)).join('')}</tr>`).join('');
      html.push(`<div class="blog-table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`);
      continue;
    }
    if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items = [];
      while (i < lines.length && (/^(- |\d+\. )/.test(lines[i]) || (/^ {2,}\S/.test(lines[i]) && items.length > 0))) {
        if (/^ {2,}\S/.test(lines[i])) items[items.length - 1] += ` ${lines[i].trim()}`;
        else items.push(lines[i].replace(/^(- |\d+\. )/, ''));
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      html.push(`<${tag}>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</${tag}>`);
      continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() !== '' && (paragraph.length === 0 || !startsBlock(lines[i]))) { paragraph.push(lines[i].trim()); i += 1; }
    html.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }
  return html.join('\n');
}

/** An article: its head (between two lines `---`, `key: value`), its text, its contents and its reading time. */
function readArticle(lang, file) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) fail(`en-tête absent : ${file}`);
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) fail(`en-tête non fermé : ${file}`);
  const meta = {};
  for (const line of text.slice(4, end).split('\n')) {
    const m = /^(\w+):\s*(.*)$/.exec(line);
    if (m) meta[m[1]] = m[2].trim();
  }
  for (const key of ['title', 'description', 'date', 'slug', 'order', 'image', 'imageAlt']) if (!meta[key]) fail(`${key} absent : ${file}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) fail(`date au format AAAA-MM-JJ : ${file}`);
  if (!/^[a-z0-9-]+$/.test(meta.slug)) fail(`adresse en minuscules, chiffres et tirets : ${file}`);
  const body = text.slice(end + 5);
  const images = path.join(...LANGS[lang].blog.split('/').filter(Boolean), 'images');
  const context = { toc: [], images, used: new Set([meta.image]) };
  const html = blocks(body, context);
  const words = body.replace(/[#>|*`![\]()-]/g, ' ').split(/\s+/).filter(Boolean).length;
  const heroFile = path.join(site, images, meta.image);
  if (!fs.existsSync(heroFile)) fail(`image absente : ${heroFile}`);
  return {
    ...meta, lang, order: Number(meta.order), html, toc: context.toc, used: context.used,
    minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)), hero: { file: meta.image, ...webpSize(heroFile) },
    url: `${LANGS[lang].blog}${meta.slug}/`,
  };
}

// ---------- the pages ----------

function header(lang, current, counterpart) {
  const t = LANGS[lang];
  const otherUrl = counterpart ?? LANGS[t.other].blog;
  const fr = lang === 'fr' ? current : otherUrl;
  const en = lang === 'en' ? current : otherUrl;
  return `  <header class="nav">
    <a class="brand" href="${t.home}" aria-label="Topogenia">
      ${BRAND}
      <span>Topogenia</span>
    </a>
    <a class="blog-nav-link" href="${t.blog}">${t.title}</a>
    <div class="nav-end">
      <div class="lang" role="group" aria-label="${t.langLabel}">
        <a href="${fr}" hreflang="fr"${lang === 'fr' ? ' aria-current="page"' : ''}>FR</a>
        <a href="${en}" hreflang="en"${lang === 'en' ? ' aria-current="page"' : ''}>EN</a>
      </div>
      <a class="btn btn-ghost btn-small" href="${t.home}">${t.back}</a>
    </div>
  </header>`;
}

function footer(lang) {
  const t = LANGS[lang];
  return `  <footer class="footer legal-foot">
    <p class="foot-copy">© 2026 ${AUTHOR} · <a href="${t.legalHref}">${t.legal}</a> · <a href="${t.galleryHref}">${t.gallery}</a> · <a href="${t.versionsHref}">${t.versions}</a> · <a href="${t.blog}rss.xml">${t.rss}</a></p>
  </footer>`;
}

/** The part of its image a card shows: `focus` (a point, as CSS `transform-origin`) enlarged `zoom` times; the whole image without them. */
const cardStyle = (article) => {
  if (!article.focus) return '';
  if (!/^\d{1,3}% \d{1,3}%$/.test(article.focus) || !(Number(article.zoom) >= 1 && Number(article.zoom) <= 4)) fail(`focus « x% y% » et zoom de 1 à 4 : ${article.slug}`);
  return ` style="--focus: ${article.focus}; --zoom: ${Number(article.zoom)}"`;
};

const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function head(lang, { title, description, url, image, type, alternates, extra }) {
  const t = LANGS[lang];
  const links = alternates.map((alt) => `  <link rel="alternate" hreflang="${alt.lang}" href="${ORIGIN}${alt.url}">`).join('\n');
  return `<!doctype html>
<!-- Page fabriquée par outils/blog.cjs à partir de outils/articles : ne pas la modifier à la main -->
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${attr(description)}">
  <meta name="author" content="${AUTHOR}">
  <meta name="theme-color" content="#5B5BD6">
  <link rel="canonical" href="${ORIGIN}${url}">
${links}
  <link rel="alternate" type="application/rss+xml" title="${attr(t.rssTitle)}" href="${ORIGIN}${t.blog}rss.xml">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="/assets/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/assets/site.css">
  <link rel="stylesheet" href="/assets/blog.css">
  <meta property="og:type" content="${type}">
  <meta property="og:site_name" content="Topogenia">
  <meta property="og:title" content="${attr(title)}">
  <meta property="og:description" content="${attr(description)}">
  <meta property="og:url" content="${ORIGIN}${url}">
  <meta property="og:image" content="${ORIGIN}${image}">
  <meta property="og:locale" content="${t.locale.replace('-', '_')}">
  <meta name="twitter:card" content="summary_large_image">
  ${extra}
</head>`;
}

function articlePage(article, all, counterpart) {
  const t = LANGS[article.lang];
  const heroUrl = `${t.blog}images/${article.hero.file}`;
  const alternates = [{ lang: article.lang, url: article.url }, ...(counterpart ? [{ lang: counterpart.lang, url: counterpart.url }] : [])];
  const others = all.filter((other) => other.slug !== article.slug).slice(0, 3);
  const data = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: article.title, description: article.description,
    datePublished: article.date, dateModified: article.date, inLanguage: t.locale, url: `${ORIGIN}${article.url}`,
    mainEntityOfPage: `${ORIGIN}${article.url}`, image: `${ORIGIN}${heroUrl}`,
    author: { '@type': 'Person', name: AUTHOR }, publisher: { '@type': 'Person', name: AUTHOR },
    isPartOf: { '@type': 'Blog', name: t.rssTitle, url: `${ORIGIN}${t.blog}` },
    about: { '@type': 'SoftwareApplication', name: 'Topogenia', operatingSystem: 'Windows', applicationCategory: 'BusinessApplication', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, url: `${ORIGIN}${t.home}` },
  };
  const toc = article.toc.map((entry) => `<li><a href="#${entry.id}">${inline(entry.text)}</a></li>`).join('');
  const more = others.map((other) => `<li><a href="${other.url}">${esc(other.title)}</a></li>`).join('');
  return `${head(article.lang, { title: `${article.title} · Topogenia`, description: article.description, url: article.url, image: heroUrl, type: 'article', alternates, extra: jsonLd(data) })}
<body class="legal-page blog-page">
${header(article.lang, article.url, counterpart?.url)}

  <main id="main" class="blog-article">
    <aside class="blog-toc" aria-label="${t.toc}">
      <p class="blog-side-title">${t.toc}</p>
      <ol>${toc}</ol>
    </aside>

    <article class="blog-prose">
      <p class="kicker">${t.date(article.date)} · ${t.minutes(article.minutes)}</p>
      <h1>${esc(article.title)}</h1>
      <p class="lead">${inline(article.description)}</p>
      <figure class="blog-hero"><a class="blog-zoom" href="${heroUrl}"><img src="${heroUrl}" alt="${attr(article.imageAlt)}" width="${article.hero.width}" height="${article.hero.height}" fetchpriority="high"></a><figcaption>${inline(article.imageAlt)}</figcaption></figure>
${article.html}
      <p class="blog-byline">${AUTHOR}</p>
    </article>

    <aside class="blog-cta" aria-label="${t.ctaTitle}">
      <div class="blog-cta-card">
        <p class="blog-side-title">${t.ctaTitle}</p>
        <p>${t.ctaText}</p>
        <a class="btn btn-primary btn-small" href="${t.ctaHref}">${t.ctaButton}</a>
      </div>
      ${more ? `<p class="blog-side-title">${t.more}</p><ul class="blog-more">${more}</ul>` : ''}
    </aside>
  </main>

${footer(article.lang)}
</body>
</html>
`;
}

function indexPage(lang, articles, hasOther) {
  const t = LANGS[lang];
  const first = articles[0];
  const alternates = [{ lang, url: t.blog }, ...(hasOther ? [{ lang: t.other, url: LANGS[t.other].blog }] : [])];
  const data = {
    '@context': 'https://schema.org', '@type': 'Blog', name: t.rssTitle, description: t.description, inLanguage: t.locale, url: `${ORIGIN}${t.blog}`,
    author: { '@type': 'Person', name: AUTHOR },
    blogPost: articles.map((article) => ({ '@type': 'BlogPosting', headline: article.title, url: `${ORIGIN}${article.url}`, datePublished: article.date })),
  };
  const cards = articles.map((article) => `      <li>
        <a class="blog-card" href="${article.url}">
          <span class="blog-card-media"><img src="${t.blog}images/${article.hero.file}" alt="" width="${article.hero.width}" height="${article.hero.height}" loading="lazy" decoding="async"${cardStyle(article)}></span>
          <span class="blog-card-text">
            <span class="blog-card-meta">${t.date(article.date)} · ${t.minutes(article.minutes)}</span>
            <span class="blog-card-title">${esc(article.title)}</span>
            <span class="blog-card-lead">${inline(article.description)}</span>
          </span>
        </a>
      </li>`).join('\n');
  return `${head(lang, { title: t.head, description: t.description, url: t.blog, image: `${t.blog}images/${first.hero.file}`, type: 'website', alternates, extra: jsonLd(data) })}
<body class="legal-page blog-page">
${header(lang, t.blog, hasOther ? LANGS[t.other].blog : null)}

  <main id="main" class="blog-index">
    <p class="kicker">Topogenia</p>
    <h1>${t.title}</h1>
    <p class="lead">${t.lead}</p>
    <ul class="blog-cards">
${cards}
    </ul>
  </main>

${footer(lang)}
</body>
</html>
`;
}

function rss(lang, articles) {
  const t = LANGS[lang];
  const rfc822 = (d) => new Date(`${d}T08:00:00Z`).toUTCString();
  const items = articles.map((article) => `    <item>
      <title>${esc(article.title)}</title>
      <link>${ORIGIN}${article.url}</link>
      <guid isPermaLink="true">${ORIGIN}${article.url}</guid>
      <pubDate>${rfc822(article.date)}</pubDate>
      <description>${esc(article.description)}</description>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(t.rssTitle)}</title>
    <link>${ORIGIN}${t.blog}</link>
    <atom:link href="${ORIGIN}${t.blog}rss.xml" rel="self" type="application/rss+xml"/>
    <description>${esc(t.description)}</description>
    <language>${t.locale.toLowerCase()}</language>
${items}
  </channel>
</rss>
`;
}

/** The lines of llms.txt: the site, the articles of the blog, then the links of outils/llms-liens.json (gallery, versions), each written once. */
function llms(byLang, links = {}) {
  const extra = (lang) => (!links[lang] || links[lang].liens.length === 0 ? '' : `\n## ${links[lang].titre}\n\n${links[lang].liens.map((l) => `- [${l.titre}](${l.url}): ${l.description}`).join('\n')}\n`);
  const section = (lang, title) => (byLang[lang].length === 0 ? '' : `\n## ${title}\n\n${byLang[lang].map((a) => `- [${a.title}](${ORIGIN}${a.url}): ${a.description}`).join('\n')}\n`);
  return `# Topogenia

> Topogenia cartographie les processus de travail en carte à couloirs (un couloir par acteur) et montre où un dossier perd son temps, à la manière d'un Makigami : relais, travail sans valeur, ruptures de support. Application Windows gratuite, y compris en entreprise, sans compte ; les données restent sur l'ordinateur ; un assistant IA facultatif, en copier-coller avec l'IA de son choix, avec un modèle installé sur l'ordinateur (Ollama, LM Studio) ou avec son propre compte chez un fournisseur (Anthropic, OpenAI, Google, Mistral AI, AWS Bedrock et d'autres). Auteur : ${AUTHOR}.

- [Site, en français](${ORIGIN}/): présentation et téléchargement
- [Site, in English](${ORIGIN}/en/): presentation and download
- [Code source](https://github.com/PeterBarcauti/topogenia): Apache-2.0, à l'exception du cœur
${section('fr', 'Blog, en français')}${section('en', 'Blog, in English')}${extra('fr')}${extra('en')}`;
}

function sitemap(byLang) {
  const file = path.join(site, 'sitemap.xml');
  const xml = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const kept = [...xml.matchAll(/  <url>\n[\s\S]*?<\/url>\n/g)].map((m) => m[0]).filter((entry) => !/\/blog\//.test(entry));
  const entry = (url, date) => `  <url>\n    <loc>${ORIGIN}${url}</loc>\n    <lastmod>${date}</lastmod>\n  </url>\n`;
  const blog = [];
  for (const lang of Object.keys(LANGS)) {
    const articles = byLang[lang];
    if (articles.length === 0) continue;
    blog.push(entry(LANGS[lang].blog, articles.map((a) => a.date).sort().at(-1)));
    for (const article of articles) blog.push(entry(article.url, article.date));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${kept.join('')}${blog.join('')}</urlset>\n`;
}

// ---------- the whole blog ----------

const write = (relative, content) => {
  const file = path.join(site, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

/** The settings of the site (outils/reglages-site.json): "blog": false leaves the blog out of llms.txt and sitemap.xml and writes none of its pages. */
function settings() {
  const file = path.join(__dirname, 'reglages-site.json');
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  return { blog: data.blog !== false };
}

function main() {
  const byLang = {};
  const blogOn = settings().blog;
  for (const lang of Object.keys(LANGS)) {
    byLang[lang] = [];
    if (!blogOn) continue;
    const folder = path.join(__dirname, 'articles', lang);
    const files = fs.existsSync(folder) ? fs.readdirSync(folder).filter((name) => name.endsWith('.md')) : [];
    byLang[lang] = files.map((name) => readArticle(lang, path.join(folder, name))).sort((a, b) => a.order - b.order || b.date.localeCompare(a.date));
    const slugs = new Set();
    for (const article of byLang[lang]) {
      if (slugs.has(article.slug)) fail(`adresse en double : ${article.slug}`);
      slugs.add(article.slug);
    }
  }

  // Blog off: its folders (blog/, en/blog/) are neither written nor removed.
  for (const lang of blogOn ? Object.keys(LANGS) : []) {
    const t = LANGS[lang];
    const articles = byLang[lang];
    const blogFolder = path.join(...t.blog.split('/').filter(Boolean));
    // The pages of a slug no longer written are removed; the images stay.
    if (fs.existsSync(path.join(site, blogFolder))) {
      for (const name of fs.readdirSync(path.join(site, blogFolder))) {
        const entry = path.join(site, blogFolder, name);
        if (name !== 'images' && fs.statSync(entry).isDirectory() && !articles.some((a) => a.slug === name)) fs.rmSync(entry, { recursive: true });
      }
    }
    if (articles.length === 0) continue;
    for (const article of articles) {
      const counterpart = article.counterpart ? byLang[t.other].find((other) => other.slug === article.counterpart) : undefined;
      if (article.counterpart && !counterpart) console.log(`  (${article.slug} : pas encore de version ${t.other})`);
      write(path.join(blogFolder, article.slug, 'index.html'), articlePage(article, articles, counterpart));
    }
    write(path.join(blogFolder, 'index.html'), indexPage(lang, articles, byLang[t.other].length > 0));
    write(path.join(blogFolder, 'rss.xml'), rss(lang, articles));
    const used = new Set(articles.flatMap((a) => [...a.used]));
    const unused = fs.readdirSync(path.join(site, blogFolder, 'images')).filter((name) => !used.has(name));
    if (unused.length > 0) console.log(`  images non utilisées (${lang}) : ${unused.join(', ')}`);
    console.log(`${lang} : ${articles.length} article(s) ; ${articles.map((a) => `${a.slug} (${a.minutes} min)`).join(', ')}`);
  }
  write('llms.txt', llms(byLang, JSON.parse(fs.readFileSync(path.join(__dirname, 'llms-liens.json'), 'utf8'))));
  write('sitemap.xml', sitemap(byLang));
  console.log(blogOn ? 'llms.txt et sitemap.xml écrits' : 'blog exclu (outils/reglages-site.json) : llms.txt et sitemap.xml écrits sans le blog, aucune page de blog écrite');
}

if (require.main === module) main();
module.exports = { llms, sitemap, settings };
