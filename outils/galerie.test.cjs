// galerie.test.cjs
// Tests of the gallery generator: the files (pmap, collection, sha256.txt) and the pages of the gallery, in French and in English, from a fixture of models. Run from the site root: node --test outils/*.test.cjs

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const here = __dirname;
const galerie = require('./galerie.cjs');
const script = require('../assets/galerie.js');

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'";
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

const DATA = {
  licence: null,
  domains: [
    { folder: 'alpha', slug: 'alpha-fr', names: { fr: 'Alpha FR', en: 'Alpha EN' },
      collection: { fr: { name: 'Collection Alpha', description: 'Description Alpha fr' }, en: { name: 'Alpha collection', description: 'Description Alpha en' } } },
    { folder: 'beta', slug: 'beta-fr', names: { fr: 'Bêta FR', en: 'Beta EN' },
      collection: { fr: { name: 'Collection Bêta', description: 'Description Bêta fr' }, en: { name: 'Beta collection', description: 'Description Beta en' } } },
  ],
};
const MODELS = { alpha: ['one', 'two'], beta: ['three'] };
const PREFIX = { fr: 'Modèle de la galerie : ', en: 'Gallery template: ' };

const model = (name, lang) => `${JSON.stringify({
  format: 'topogenia', version: '1.5',
  project: { name: `Process ${name} <b> & ${lang}`, code: 'ABC', language: lang, description: `${PREFIX[lang]}description of ${name} <i> & "${lang}"` },
  map: { lanes: [{ id: 'l1', name: 'Lane é' }], steps: [{ id: 's1', lane: 'l1', label: 'Step </script>', type: 'start' }], flows: [] },
}, null, 2)}\n`;

/** A folder of models, a site (home page and sitemap) and a folder of images, in a temporary folder. */
function fixture({ images = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'galerie-'));
  const modelsDir = path.join(dir, 'models');
  for (const [folder, names] of Object.entries(MODELS)) {
    fs.mkdirSync(path.join(modelsDir, folder), { recursive: true });
    for (const name of names) for (const lang of ['fr', 'en']) fs.writeFileSync(path.join(modelsDir, folder, `${name}.${lang}.pmap`), model(name, lang));
  }
  const site = path.join(dir, 'site');
  fs.mkdirSync(site);
  fs.writeFileSync(path.join(site, 'index.html'), '<script type="application/ld+json">{ "author": { "@type": "Person", "name": "camille" } }</script>\n');
  fs.writeFileSync(path.join(site, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://topogenia.com/</loc>\n    <lastmod>2026-11-18</lastmod>\n  </url>\n  <url>\n    <loc>https://topogenia.com/blog/</loc>\n    <lastmod>2026-11-10</lastmod>\n  </url>\n</urlset>\n');
  const imagesDir = path.join(dir, 'images');
  if (images) {
    for (const [folder, names] of Object.entries(MODELS)) {
      fs.mkdirSync(path.join(imagesDir, folder), { recursive: true });
      for (const name of names) {
        for (const lang of ['fr', 'en']) {
          fs.writeFileSync(path.join(imagesDir, folder, `${name}.${lang}.png`), PNG);
          // The SHA-256 of the model the image was taken from, written beside it by the series that takes the images.
          fs.writeFileSync(path.join(imagesDir, folder, `${name}.${lang}.png.source.sha256`), `${sha(model(name, lang))}\n`);
        }
      }
    }
  }
  return { dir, modelsDir, site, imagesDir };
}

/** Writes the files of `fichiers` into the fixture site, then builds the pages. */
function everything(f = fixture(), extra = {}) {
  galerie.writeAll(f.site, galerie.buildFiles({ modelsDir: f.modelsDir, data: DATA }));
  const pages = galerie.buildPages({ site: f.site, imagesDir: f.imagesDir, data: DATA, ...extra });
  return { f, pages };
}
const PAGE_DIRS = {
  fr: { alpha: 'modeles/alpha-fr/', beta: 'modeles/beta-fr/', index: 'modeles/' },
  en: { alpha: 'en/templates/alpha/', beta: 'en/templates/beta/', index: 'en/templates/' },
};
const unesc = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- the files ----------

test('files_are_written_where_the_application_opens_the_pages', () => {
  const f = fixture();
  const files = galerie.buildFiles({ modelsDir: f.modelsDir, data: DATA });
  assert.deepEqual(Object.keys(files).sort(), [
    'en/templates/alpha/alpha.en.pmaps', 'en/templates/alpha/one.en.pmap', 'en/templates/alpha/sha256.txt', 'en/templates/alpha/two.en.pmap',
    'en/templates/beta/beta.en.pmaps', 'en/templates/beta/sha256.txt', 'en/templates/beta/three.en.pmap',
    'modeles/alpha-fr/alpha.fr.pmaps', 'modeles/alpha-fr/one.fr.pmap', 'modeles/alpha-fr/sha256.txt', 'modeles/alpha-fr/two.fr.pmap',
    'modeles/beta-fr/beta.fr.pmaps', 'modeles/beta-fr/sha256.txt', 'modeles/beta-fr/three.fr.pmap',
  ]);
});

test('each_collection_holds_the_pmaps_of_its_domain_and_language_unchanged', () => {
  const f = fixture();
  const files = galerie.buildFiles({ modelsDir: f.modelsDir, data: DATA });
  for (const lang of ['fr', 'en']) {
    for (const [folder, names] of Object.entries(MODELS)) {
      const collection = JSON.parse(files[`${PAGE_DIRS[lang][folder]}${folder}.${lang}.pmaps`]);
      assert.equal(collection.processes.length, names.length);
      names.forEach((name, i) => {
        const alone = JSON.parse(fs.readFileSync(path.join(f.modelsDir, folder, `${name}.${lang}.pmap`), 'utf8'));
        assert.deepEqual(collection.processes[i], alone, `${folder}/${name}.${lang}: the order of the file names, each element equal to the file`);
      });
    }
  }
});

test('the_collection_follows_the_shape_of_the_decision', () => {
  const f = fixture();
  const files = galerie.buildFiles({ modelsDir: f.modelsDir, data: DATA });
  const text = files['modeles/alpha-fr/alpha.fr.pmaps'];
  const collection = JSON.parse(text);
  assert.deepEqual(Object.keys(collection), ['format', 'version', 'name', 'description', 'processes']);
  assert.equal(collection.format, 'topogenia-collection');
  assert.equal(collection.version, '1.0');
  assert.equal(collection.name, 'Collection Alpha');
  assert.equal(collection.description, 'Description Alpha fr');
  assert.ok(collection.processes.length >= 1 && collection.processes.length <= 50);
  assert.ok(collection.processes.every((p) => p && typeof p === 'object' && !Array.isArray(p)), 'an element is an object, never an escaped text');
  assert.match(collection.name, /\S/);
  assert.ok(collection.name.length <= 200 && !/<[a-zA-Z!/?]/.test(collection.name));
  assert.equal(text, `${JSON.stringify(collection, null, 2)}\n`, 'indented by two spaces, one final line feed');
  assert.ok(!text.includes('\r'));
  assert.ok(!text.startsWith('﻿'));
});

test('a_collection_over_fifty_processes_or_with_a_bad_name_stops', () => {
  const f = fixture();
  const many = Array.from({ length: 51 }, (_, i) => `m${String(i).padStart(2, '0')}`);
  for (const name of many) for (const lang of ['fr', 'en']) fs.writeFileSync(path.join(f.modelsDir, 'beta', `${name}.${lang}.pmap`), model(name, lang));
  assert.throws(() => galerie.buildFiles({ modelsDir: f.modelsDir, data: DATA }), /50/);
  const g = fixture();
  const bad = structuredClone(DATA);
  bad.domains[0].collection.fr.name = 'Alpha <b>';
  assert.throws(() => galerie.buildFiles({ modelsDir: g.modelsDir, data: bad }), /name/);
});

test('sha256_txt_matches_every_file_served', () => {
  const f = fixture();
  const files = galerie.buildFiles({ modelsDir: f.modelsDir, data: DATA });
  for (const lang of ['fr', 'en']) {
    for (const folder of Object.keys(MODELS)) {
      const dir = PAGE_DIRS[lang][folder];
      const served = Object.keys(files).filter((p) => p.startsWith(dir) && !p.endsWith('sha256.txt')).map((p) => p.slice(dir.length)).sort();
      const lines = files[`${dir}sha256.txt`].split('\n');
      assert.equal(lines.pop(), '', 'ends with a line feed');
      assert.deepEqual(lines.map((l) => l.slice(66)), served, 'every file served, no other');
      for (const line of lines) {
        assert.match(line, /^[0-9a-f]{64} {2}\S+$/, 'the form of sha256sum');
        assert.equal(line.slice(0, 64), sha(Buffer.from(files[`${dir}${line.slice(66)}`])), line);
      }
    }
  }
});

test('the_pmap_served_is_the_model_byte_for_byte', () => {
  const f = fixture();
  const files = galerie.buildFiles({ modelsDir: f.modelsDir, data: DATA });
  assert.ok(Buffer.from(files['modeles/alpha-fr/one.fr.pmap']).equals(fs.readFileSync(path.join(f.modelsDir, 'alpha', 'one.fr.pmap'))));
});

test('a_model_without_its_twin_or_with_crlf_stops_the_files', () => {
  const f = fixture();
  fs.rmSync(path.join(f.modelsDir, 'alpha', 'two.en.pmap'));
  assert.throws(() => galerie.buildFiles({ modelsDir: f.modelsDir, data: DATA }), /two/);
  const g = fixture();
  fs.writeFileSync(path.join(g.modelsDir, 'beta', 'three.fr.pmap'), model('three', 'fr').replace(/\n/g, '\r\n'));
  assert.throws(() => galerie.buildFiles({ modelsDir: g.modelsDir, data: DATA }), /CRLF|LF/);
  const h = fixture();
  fs.rmSync(path.join(h.modelsDir, 'beta'), { recursive: true });
  assert.throws(() => galerie.buildFiles({ modelsDir: h.modelsDir, data: DATA }), /beta/);
});

// ---------- the pages ----------

test('each_page_shows_image_description_file_text_and_hash_of_each_model', () => {
  const { f, pages } = everything();
  for (const lang of ['fr', 'en']) {
    for (const [folder, names] of Object.entries(MODELS)) {
      const html = pages[`${PAGE_DIRS[lang][folder]}index.html`];
      assert.ok(html, `${lang}/${folder} page`);
      const dir = `/${PAGE_DIRS[lang][folder]}`;
      for (const name of names) {
        const base = `${name}.${lang}`;
        const text = fs.readFileSync(path.join(f.site, ...PAGE_DIRS[lang][folder].split('/'), `${base}.pmap`), 'utf8');
        const project = JSON.parse(text).project;
        assert.ok(html.includes(`<img src="${dir}${base}.png" alt="${esc(project.name)}"`), `${base}: image with the name of the process as replacement text`);
        assert.ok(html.includes(esc(`D${project.description.slice(PREFIX[lang].length + 1)}`)), `${base}: description without the prefix, starting with a capital`);
        assert.ok(!html.replace(/<pre[\s\S]*?<\/pre>/g, '').includes(PREFIX[lang]), 'the prefix is never shown outside the text of the file');
        assert.ok(html.includes(`href="${dir}${base}.pmap" download`), `${base}: link to download`);
        assert.ok(html.includes(sha(Buffer.from(text))), `${base}: the hash`);
        const pre = new RegExp(`<pre id="texte-${name}-${lang}"[^>]*><code>([\\s\\S]*?)</code></pre>`).exec(html);
        assert.ok(pre, `${base}: the text in a fold`);
        assert.equal(unesc(pre[1]), text, `${base}: the text to copy is the file`);
        assert.ok(html.includes(`data-copy="texte-${name}-${lang}"`), `${base}: the copy button`);
      }
      const collection = fs.readFileSync(path.join(f.site, ...PAGE_DIRS[lang][folder].split('/'), `${folder}.${lang}.pmaps`));
      assert.ok(html.includes(`href="${dir}${folder}.${lang}.pmaps" download`), 'the collection of the domain');
      assert.ok(html.includes(sha(collection)), 'its hash');
      assert.ok(html.includes(`href="${dir}sha256.txt"`));
      // Audit 3.4, P3-01: where the files are downloaded, what the hash proves and what it does not.
      assert.ok(html.includes(lang === 'fr' ? 'pas un site compromis' : 'not a compromised website'), `${lang}/${folder}: the limit of the hash`);
    }
  }
});

test('the_copy_button_names_its_texts_and_the_script_has_no_inline_code', () => {
  const { pages } = everything();
  const html = pages['modeles/alpha-fr/index.html'];
  assert.match(html, /<button type="button" class="galerie-copy" data-copy="texte-one-fr" data-done="Copié" data-failed="Copie impossible">Copier<\/button>/);
  assert.match(pages['en/templates/alpha/index.html'], /data-done="Copied" data-failed="Copy failed">Copy<\/button>/);
  assert.ok(html.includes('<script src="/assets/galerie.js" defer></script>'));
  assert.ok(html.includes('<link rel="stylesheet" href="/assets/galerie.css">'));
});

test('the_pages_carry_connect_src_none_and_no_external_resource', () => {
  const { pages } = everything();
  const names = Object.keys(pages).filter((p) => p.endsWith('index.html'));
  assert.equal(names.length, 6, 'two indexes and four domain pages');
  for (const name of names) {
    const html = pages[name];
    assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${CSP}">`), name);
    assert.ok(html.includes('<meta name="referrer" content="no-referrer">'), name);
    assert.ok(!/<style[\s>]/i.test(html) && !/\sstyle=/i.test(html), `${name}: no style written in the page`);
    assert.ok(!/\son[a-z]+=/i.test(html), `${name}: no event attribute`);
    for (const tag of html.matchAll(/<script\b([^>]*)>/g)) assert.match(tag[1], /src="\/assets\/galerie\.js"|type="application\/json"/, `${name}: only the file script`);
    for (const m of html.matchAll(/\s(?:src|href)="([^"]*)"/g)) {
      assert.ok(!/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(m[1]) || m[1].startsWith('https://topogenia.com/'), `${name}: ${m[1]} is not external`);
    }
    assert.ok(!/<(?:iframe|object|embed|form|base)\b/i.test(html), name);
  }
});

test('missing_images_stop_pages', () => {
  const f = fixture({ images: false });
  galerie.writeAll(f.site, galerie.buildFiles({ modelsDir: f.modelsDir, data: DATA }));
  assert.throws(() => galerie.buildPages({ site: f.site, imagesDir: f.imagesDir, data: DATA }), (error) => /one\.fr\.png/.test(error.message) && /three\.en\.png/.test(error.message));
  fs.mkdirSync(path.join(f.imagesDir, 'alpha'), { recursive: true });
  fs.writeFileSync(path.join(f.imagesDir, 'alpha', 'one.fr.png'), 'not a png');
  assert.throws(() => galerie.buildPages({ site: f.site, imagesDir: f.imagesDir, data: DATA }), /PNG|png/);
});

test('an_image_taken_from_another_state_of_its_model_or_without_its_hash_stops_pages', () => {
  const f = fixture();
  galerie.writeAll(f.site, galerie.buildFiles({ modelsDir: f.modelsDir, data: DATA }));
  galerie.buildPages({ site: f.site, imagesDir: f.imagesDir, data: DATA });
  fs.writeFileSync(path.join(f.imagesDir, 'alpha', 'one.fr.png.source.sha256'), `${sha('an older model')}\n`);
  fs.rmSync(path.join(f.imagesDir, 'beta', 'three.en.png.source.sha256'));
  assert.throws(() => galerie.buildPages({ site: f.site, imagesDir: f.imagesDir, data: DATA }),
    (error) => /alpha\/one\.fr\.png prise d'un autre état de son modèle/.test(error.message) && /beta\/three\.en\.png sans l'empreinte du modèle photographié/.test(error.message));
});

test('pages_stop_when_the_files_were_not_made_first', () => {
  const f = fixture();
  assert.throws(() => galerie.buildPages({ site: f.site, imagesDir: f.imagesDir, data: DATA }), /fichiers/);
});

test('images_are_copied_next_to_the_page_under_their_name', () => {
  const { pages } = everything();
  for (const lang of ['fr', 'en']) {
    for (const [folder, names] of Object.entries(MODELS)) {
      for (const name of names) assert.ok(Buffer.from(pages[`${PAGE_DIRS[lang][folder]}${name}.${lang}.png`]).equals(PNG));
    }
  }
});

test('the_index_lists_every_domain_and_each_page_points_to_its_twin', () => {
  const { pages } = everything();
  for (const lang of ['fr', 'en']) {
    const html = pages[`${PAGE_DIRS[lang].index}index.html`];
    for (const folder of Object.keys(MODELS)) {
      assert.ok(html.includes(`href="/${PAGE_DIRS[lang][folder]}"`), `${lang}: link to ${folder}`);
      assert.ok(html.includes(`Process ${MODELS[folder][0]} &lt;b&gt; &amp; ${lang}`), 'the models of the domain are named');
    }
    assert.ok(html.includes('<link rel="alternate" hreflang="fr" href="https://topogenia.com/modeles/">'));
    assert.ok(html.includes('<link rel="alternate" hreflang="en" href="https://topogenia.com/en/templates/">'));
    assert.ok(html.includes(`<html lang="${lang}">`));
  }
  const alpha = pages['modeles/alpha-fr/index.html'];
  assert.ok(alpha.includes('<link rel="alternate" hreflang="en" href="https://topogenia.com/en/templates/alpha/">'));
  assert.ok(alpha.includes('<link rel="canonical" href="https://topogenia.com/modeles/alpha-fr/">'));
  assert.ok(pages['en/templates/beta/index.html'].includes('<link rel="alternate" hreflang="fr" href="https://topogenia.com/modeles/beta-fr/">'));
  assert.ok(alpha.includes('Alpha FR') && pages['en/templates/alpha/index.html'].includes('Alpha EN'));
});

test('the_licence_line_is_a_place_to_fill', () => {
  const { pages } = everything();
  assert.ok(pages['modeles/alpha-fr/index.html'].includes('<!-- licence : à remplir (outils/galerie-domaines.json, "licence") -->'));
  assert.ok(!pages['modeles/alpha-fr/index.html'].includes('galerie-licence'));
  const f = fixture();
  const licensed = { ...DATA, licence: 'Test <1.0>' };
  galerie.writeAll(f.site, galerie.buildFiles({ modelsDir: f.modelsDir, data: licensed }));
  const pages2 = galerie.buildPages({ site: f.site, imagesDir: f.imagesDir, data: licensed });
  assert.ok(pages2['modeles/alpha-fr/index.html'].includes('galerie-licence">Les fichiers .pmap et .pmaps et les images PNG de cette galerie sont publiés sous licence Test &lt;1.0&gt;.'));
  assert.ok(pages2['en/templates/alpha/index.html'].includes('galerie-licence">The .pmap and .pmaps files and the PNG images of this gallery are released under the Test &lt;1.0&gt; licence.'));
});

test('the_index_page_shows_the_guide_when_there_is_one', () => {
  const guide = { fr: [{ title: 'Titre <un>', paragraphs: ['Texte un & deux'] }], en: [{ title: 'Title one', paragraphs: ['Text one'] }] };
  const { pages } = everything(fixture(), { guide });
  assert.ok(pages['modeles/index.html'].includes('<h2>Titre &lt;un&gt;</h2>'));
  assert.ok(pages['modeles/index.html'].includes('<p>Texte un &amp; deux</p>'));
  assert.ok(pages['en/templates/index.html'].includes('<h2>Title one</h2>'));
  const without = everything().pages;
  assert.ok(!without['modeles/index.html'].includes('galerie-guide'));
});

test('no_path_of_the_machine_is_written', () => {
  const { f, pages } = everything();
  const all = [...Object.values(pages), ...Object.values(galerie.buildFiles({ modelsDir: f.modelsDir, data: DATA })), fs.readFileSync(path.join(here, 'galerie.cjs'), 'utf8'), fs.readFileSync(path.join(here, 'galerie-domaines.json'), 'utf8'), fs.readFileSync(path.join(here, '..', 'assets', 'galerie.js'), 'utf8')];
  for (const content of all) {
    if (Buffer.isBuffer(content) && content.subarray(0, 4).toString('hex') === '89504e47') continue;
    const text = String(content);
    assert.doesNotMatch(text, /[A-Za-z]:\\|[A-Za-z]:\/(?:Users|Temp)|\\Users\\|\/Users\/|\/home\//, 'no drive, no profile');
    assert.ok(!text.includes(f.dir), 'not the temporary folder either');
  }
});

test('sitemap_keeps_its_other_lines', () => {
  const { f, pages } = everything();
  const before = fs.readFileSync(path.join(f.site, 'sitemap.xml'), 'utf8');
  const after = pages['sitemap.xml'];
  for (const entry of before.match(/ {2}<url>\n[\s\S]*?<\/url>\n/g)) assert.ok(after.includes(entry), `kept: ${entry.trim().split('\n')[1]}`);
  const locs = [...after.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const url of ['https://topogenia.com/modeles/', 'https://topogenia.com/en/templates/', 'https://topogenia.com/modeles/alpha-fr/', 'https://topogenia.com/modeles/beta-fr/', 'https://topogenia.com/en/templates/alpha/', 'https://topogenia.com/en/templates/beta/']) {
    assert.equal(locs.filter((l) => l === url).length, 1, url);
  }
  assert.equal(locs.length, 2 + 6);
  assert.ok(after.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'));
  assert.ok(after.endsWith('</urlset>\n'));
  assert.ok(!after.includes('.pmap') && !after.includes('.png'), 'pages only');
  // run again over its own result: nothing doubles
  fs.writeFileSync(path.join(f.site, 'sitemap.xml'), after);
  const again = galerie.buildPages({ site: f.site, imagesDir: f.imagesDir, data: DATA });
  assert.equal(again['sitemap.xml'], after);
});

test('the_files_of_the_other_tools_are_never_touched', () => {
  const { pages } = everything();
  for (const name of Object.keys(pages)) assert.ok(/^(?:modeles|en\/templates)\/|^sitemap\.xml$/.test(name), name);
});

test('the_domains_file_lists_the_sixteen_domains_once_each', () => {
  const data = JSON.parse(fs.readFileSync(path.join(here, 'galerie-domaines.json'), 'utf8'));
  assert.equal(data.licence, 'CC0 1.0', 'the licence is the holder\'s answer (23/11/2026: CC0 1.0)');
  assert.deepEqual(data.domains.map((d) => d.folder), ['purchasing', 'inbound-logistics', 'logistics', 'finance', 'sales', 'planning', 'production', 'maintenance', 'quality', 'engineering', 'customer-service', 'health-safety-environment', 'human-resources', 'information-technology', 'legal', 'investments']);
  assert.deepEqual(data.domains.map((d) => d.slug), ['achats', 'logistique-entrante', 'logistique', 'finance', 'commandes-clients', 'planification', 'production', 'maintenance', 'qualite', 'bureau-d-etudes', 'service-client', 'hygiene-securite-environnement', 'ressources-humaines', 'informatique', 'juridique', 'investissements']);
  for (const d of data.domains) {
    assert.deepEqual(Object.keys(d), ['folder', 'slug', 'names', 'collection']);
    for (const lang of ['fr', 'en']) {
      assert.match(d.names[lang], /\S/);
      assert.match(d.collection[lang].name, /\S/);
      assert.match(d.collection[lang].description, /\S/);
    }
  }
  galerie.checkData(data);
});

test('pages_without_image_show_the_models_without_figure_only_when_asked', () => {
  const f = fixture({ images: false });
  galerie.writeAll(f.site, galerie.buildFiles({ modelsDir: f.modelsDir, data: DATA }));
  assert.throws(() => galerie.buildPages({ site: f.site, imagesDir: f.imagesDir, data: DATA }), /\.png/);
  const pages = galerie.buildPages({ site: f.site, imagesDir: f.imagesDir, data: DATA, skipMissingImages: true });
  assert.ok(Object.keys(pages).some((name) => name.endsWith('index.html')));
  for (const [name, html] of Object.entries(pages)) if (name.endsWith('index.html')) assert.ok(!html.includes('<img'), name);
});

// ---------- the copy button in the browser ----------

function fakeButton(attributes) {
  const button = { attributes: { ...attributes }, textContent: 'Copier', handlers: {} };
  button.getAttribute = (name) => (name in button.attributes ? button.attributes[name] : null);
  button.addEventListener = (type, handler) => { button.handlers[type] = handler; };
  return button;
}

test('the_copy_button_copies_the_text_and_says_so', async () => {
  const button = fakeButton({ 'data-copy': 'texte', 'data-done': 'Copié', 'data-failed': 'Copie impossible' });
  const doc = { getElementById: (id) => (id === 'texte' ? { textContent: 'a < b & "c"\n' } : null) };
  const written = [];
  const timers = [];
  const ok = await script.copy(button, doc, { writeText: async (t) => { written.push(t); } }, (fn) => timers.push(fn));
  assert.equal(ok, true);
  assert.deepEqual(written, ['a < b & "c"\n']);
  assert.equal(button.textContent, 'Copié');
  timers[0]();
  assert.equal(button.textContent, 'Copier', 'the label comes back');
});

test('the_copy_button_says_when_it_cannot', async () => {
  const doc = { getElementById: () => ({ textContent: 'x' }) };
  for (const clipboard of [undefined, null, {}, { writeText: async () => { throw new Error('refused'); } }]) {
    const button = fakeButton({ 'data-copy': 'texte', 'data-done': 'Copié', 'data-failed': 'Copie impossible' });
    assert.equal(await script.copy(button, doc, clipboard, () => {}), false);
    assert.equal(button.textContent, 'Copie impossible');
  }
  const missing = fakeButton({ 'data-copy': 'absent', 'data-done': 'Copié', 'data-failed': 'Copie impossible' });
  assert.equal(await script.copy(missing, { getElementById: () => null }, { writeText: async () => {} }, () => {}), false);
});

test('the_script_attaches_one_handler_per_button_and_sends_nothing', () => {
  const a = fakeButton({ 'data-copy': 'a' });
  const b = fakeButton({ 'data-copy': 'b' });
  script.attach({ querySelectorAll: (selector) => (selector === 'button[data-copy]' ? [a, b] : []), getElementById: () => null }, undefined, () => {});
  assert.equal(typeof a.handlers.click, 'function');
  assert.equal(typeof b.handlers.click, 'function');
  const source = fs.readFileSync(path.join(here, '..', 'assets', 'galerie.js'), 'utf8');
  assert.doesNotMatch(source, /fetch|XMLHttpRequest|sendBeacon|WebSocket|innerHTML|eval\(|localStorage|sessionStorage|document\.cookie/);
});

// ---------- the form of the files ----------

test('the_files_are_written_with_line_feeds_only', () => {
  const { pages } = everything();
  for (const [name, content] of Object.entries(pages)) if (!name.endsWith('.png')) assert.ok(!String(content).includes('\r'), name);
  for (const name of ['galerie.cjs', 'galerie-domaines.json', 'galerie.test.cjs', '../assets/galerie.js', '../assets/galerie.css']) {
    const file = path.join(here, name);
    if (fs.existsSync(file)) assert.ok(!fs.readFileSync(file, 'utf8').includes('\r'), name);
  }
});

test('the_index_page_carries_the_guide_in_both_languages', () => {
  const guide = JSON.parse(fs.readFileSync(path.join(here, 'galerie-mode-d-emploi.json'), 'utf8'));
  assert.deepEqual(Object.keys(guide).sort(), ['en', 'fr']);
  assert.ok(guide.fr.length >= 6);
  assert.equal(guide.fr.length, guide.en.length);
  for (const lang of ['fr', 'en']) {
    for (const section of guide[lang]) {
      assert.ok(section.title.length > 0 && section.paragraphs.length > 0);
      // No figure in the guide, but the two versions that open a template and a collection.
      for (const text of [section.title, ...section.paragraphs]) assert.ok(!/\d/.test(text.replace(/sha-?256/gi, '').replace(/\b3\.[34]\b/g, '')), text);
    }
  }
  const { pages } = everything(fixture(), { guide });
  for (const [lang, file] of [['fr', 'modeles/index.html'], ['en', 'en/templates/index.html']]) {
    for (const section of guide[lang]) assert.ok(pages[file].includes(`<h2>${section.title.replace(/'/g, '&#39;')}</h2>`) || pages[file].includes(`<h2>${section.title}</h2>`), section.title);
    assert.ok(pages[file].includes('Get-FileHash'));
    assert.ok(!pages[file].includes('certutil'));
  }
});

test('the_footer_of_every_gallery_page_links_to_the_versions', () => {
  const { pages } = everything();
  const expected = { fr: ['/versions/', 'Versions'], en: ['/en/versions/', 'Versions'] };
  for (const [name, html] of Object.entries(pages)) {
    if (!name.endsWith('index.html')) continue;
    const lang = name.startsWith('en/') ? 'en' : 'fr';
    const foot = /<footer[\s\S]*?<\/footer>/.exec(html)[0];
    assert.ok(foot.includes(`<a href="${expected[lang][0]}">${expected[lang][1]}</a>`), `${name}: link to the versions in the footer`);
  }
});

test('the_guide_promises_copy_only_for_a_single_template_and_the_versions_that_open_each', () => {
  const guide = JSON.parse(fs.readFileSync(path.join(here, 'galerie-mode-d-emploi.json'), 'utf8'));
  const all = (lang) => guide[lang].flatMap((s) => s.paragraphs).join(' ');
  assert.ok(!/de chaque modèle et de chaque collection/.test(all('fr')) && !/each template and each collection/.test(all('en')), 'no Copy button promised for a collection');
  assert.ok(/3\.3/.test(all('fr')) && /3\.4/.test(all('fr')), 'fr: 3.3 for a template, 3.4 for a collection');
  assert.ok(/3\.3/.test(all('en')) && /3\.4/.test(all('en')), 'en: 3.3 for a template, 3.4 for a collection');
  assert.ok(!/ la page des versions indique laquelle|the versions page tells you which/.test(all('fr') + all('en')), 'no vague version left');
});

test('the_copyright_is_the_websites_and_the_hash_limit_is_said', () => {
  const { pages } = everything();
  for (const [name, html] of Object.entries(pages)) {
    if (!name.endsWith('index.html')) continue;
    const foot = html.slice(html.indexOf('<footer'));
    assert.match(foot, /(Site|Website) © 2026/, `${name}: the © is the website's`);
    assert.doesNotMatch(html.replace(/(Site|Website) © 2026/g, ''), /©(?! du pied| in the footer)/, `${name}: no other ©`);
    assert.doesNotMatch(html, /de tous les fichiers|of all the files/, `${name}: sha256.txt does not cover the images`);
  }
  const guide = JSON.parse(fs.readFileSync(path.join(here, 'galerie-mode-d-emploi.json'), 'utf8'));
  assert.match(JSON.stringify(guide.fr), /ne dit pas qui l'a écrit/);
  assert.match(JSON.stringify(guide.en), /does not say who wrote it/);
  assert.doesNotMatch(JSON.stringify(guide), /enregistrez d'abord le texte copié|first save the copied text/);
});
