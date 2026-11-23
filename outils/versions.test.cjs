// versions.test.cjs
// Tests of the versions page and its Atom feed: the verdict read from the fragment, the page that never sends the version read, the feed, the data rules. Run from the site root: node --test outils/*.test.cjs

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const site = path.resolve(__dirname, '..');
const page = require('../assets/versions.js');
const versions = require('./versions.cjs');

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'";
const STORE = 'https://apps.microsoft.com/detail/9NZ56VV4N6QR';
const P35 = 'https://example.org/dl/v3.5.0/Topogenia-3.5.0-portable.zip';
const S35 = 'https://example.org/dl/v3.5.0/Topogenia-3.5.0-server.zip';

const entry = (version, date, a, b) => ({
  version, date,
  notes: { fr: `Notes <b>${version}</b> & fr`, en: `Notes <b>${version}</b> & en` },
  portable: { url: `https://example.org/dl/v${version}/Topogenia-${version}-portable.zip`, sha256: a.repeat(64) },
  server: { url: `https://example.org/dl/v${version}/Topogenia-${version}-server.zip`, sha256: b.repeat(64) },
});
const data = () => ({ store: STORE, versions: [entry('3.4.0', '2026-11-21', 'c', 'd'), entry('3.5.0', '2027-02-10', 'a', 'b')] });
const LIST = data().versions;

/** A site folder with what the generator reads: the home page (holder of the rights) and the sitemap. */
function fixtureSite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'versions-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<script type="application/ld+json">{ "author": { "@type": "Person", "name": "camille" } }</script>\n');
  fs.writeFileSync(path.join(dir, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://topogenia.com/</loc>\n    <lastmod>2026-11-18</lastmod>\n  </url>\n  <url>\n    <loc>https://topogenia.com/blog/</loc>\n    <lastmod>2026-11-10</lastmod>\n  </url>\n</urlset>\n');
  return dir;
}
const built = (d = data(), draft = false) => versions.build({ site: fixtureSite(), data: d, draft });
const PAGES = ['versions/index.html', 'en/versions/index.html'];
const FEEDS = ['versions/feed.xml', 'en/versions/feed.xml'];

// ---------- the verdict, a pure function of the fragment and the list ----------

test('verdict_on_the_latest_version', () => {
  const result = page.verdict('#v=3.5.0&d=portable', LIST);
  assert.equal(result.kind, 'latest');
  assert.equal(result.read, '3.5.0');
  assert.equal(result.latest.version, '3.5.0');
  assert.deepEqual(result.downloads, []);
});

test('verdict_on_an_older_version_portable_and_server', () => {
  const portable = page.verdict('#v=3.3.0&d=portable', LIST);
  assert.equal(portable.kind, 'update');
  assert.equal(portable.read, '3.3.0');
  assert.deepEqual(portable.downloads, [{ dist: 'portable', url: P35, sha256: 'a'.repeat(64) }]);
  const server = page.verdict('#v=3.4.0&d=server', LIST);
  assert.equal(server.kind, 'update');
  assert.deepEqual(server.downloads, [{ dist: 'server', url: S35, sha256: 'b'.repeat(64) }]);
  assert.equal(page.verdict('#v=3.4.0', LIST).downloads[0].dist, 'portable');
  assert.equal(page.verdict('#d=server&v=3.4.0', LIST).downloads[0].dist, 'server');
});

test('verdict_compares_by_numbers', () => {
  assert.equal(page.verdict('#v=3.10.0', LIST).kind, 'newer');
  assert.equal(page.verdict('#v=3.4.10', LIST).kind, 'update');
  assert.equal(page.verdict('#v=3.5.0', [...LIST].reverse()).kind, 'latest');
});

test('verdict_on_a_newer_version', () => {
  const result = page.verdict('#v=4.0.0&d=server', LIST);
  assert.equal(result.kind, 'newer');
  assert.equal(result.read, '4.0.0');
  assert.deepEqual(result.downloads, []);
});

test('verdict_without_fragment', () => {
  for (const hash of ['', '#', undefined, null, '#version-3.4.0']) {
    const result = page.verdict(hash, LIST);
    assert.equal(result.kind, 'none', String(hash));
    assert.equal(result.read, null);
    assert.equal(result.latest.version, '3.5.0');
    assert.deepEqual(result.downloads.map((file) => [file.dist, file.url]), [['portable', P35], ['server', S35]]);
  }
});

test('verdict_on_v_abc_v_3_4_and_d_other', () => {
  for (const hash of ['#v=abc', '#v=3.4', '#v=3.4.0.1', '#v=', '#v=03.4.0x', '#v= 3.4.0', `#v=${'9'.repeat(20)}.0.0`]) {
    assert.equal(page.verdict(hash, LIST).kind, 'none', hash);
  }
  const other = page.verdict('#v=3.4.0&d=autre', LIST);
  assert.equal(other.kind, 'update');
  assert.equal(other.dist, 'portable');
  assert.equal(other.downloads[0].dist, 'portable');
});

test('verdict_on_a_trapped_fragment', () => {
  const trapped = ['#v=3.4.0<img src=x onerror=alert(1)>&d=portable', '#v=3.4.0%3Cimg%20src%3Dx%3E', '#v=%3Cscript%3E', '#v=3.4.0%0A', '#v=3.4.0"onmouseover="x'];
  for (const hash of trapped) {
    const result = page.verdict(hash, LIST);
    assert.equal(result.kind, 'none', hash);
    assert.equal(result.read, null);
    assert.doesNotMatch(JSON.stringify({ kind: result.kind, read: result.read, dist: result.dist }), /[<>]|img|script|onerror|onmouseover/i);
    assert.deepEqual(result, page.verdict('', LIST), `${hash}: the same as no fragment`);
  }
  const badDist = page.verdict('#v=3.4.0&d=server<img>', LIST);
  assert.equal(badDist.dist, 'portable');
  assert.equal(badDist.read, '3.4.0');
});

// ---------- the page shown in the browser, on a minimal simulated DOM ----------

/** A DOM small enough to watch everything: each property set and each attribute is recorded; innerHTML throws. */
function fakeDocument(nodes = {}) {
  const make = (tag) => {
    const node = { tagName: tag.toUpperCase(), attributes: {}, props: {}, children: [], text: '' };
    node.setAttribute = (name, value) => { node.attributes[name] = String(value); };
    node.getAttribute = (name) => (name in node.attributes ? node.attributes[name] : null);
    node.append = (...items) => { for (const item of items) node.children.push(typeof item === 'string' ? { tagName: '#text', text: item, children: [], attributes: {}, props: {} } : item); };
    node.appendChild = (item) => { node.append(item); return item; };
    node.replaceChildren = (...items) => { node.children = []; node.text = ''; node.append(...items); };
    return new Proxy(node, {
      set(target, prop, value) {
        if (prop === 'innerHTML' || prop === 'outerHTML') throw new Error(`${prop} used`);
        if (prop === 'textContent') { target.children = []; target.text = String(value); return true; }
        target.props[prop] = value;
        target[prop] = value;
        return true;
      },
      get(target, prop) {
        if (prop === 'textContent') return target.text + target.children.map((child) => (child.tagName === '#text' ? child.text : child.textContent)).join('');
        if (prop === 'innerHTML' || prop === 'outerHTML' || prop === 'insertAdjacentHTML') throw new Error(`${String(prop)} used`);
        return target[prop];
      },
    });
  };
  return {
    createElement: make,
    createTextNode: (text) => ({ tagName: '#text', text: String(text), children: [], attributes: {}, props: {} }),
    getElementById: (id) => nodes[id] ?? null,
    make,
  };
}
const walk = (node, visit) => { visit(node); for (const child of node.children) walk(child, visit); };
const pageData = (lang = 'fr') => JSON.parse(/<script type="application\/json" id="versions-data">([\s\S]*?)<\/script>/.exec(built()[lang === 'fr' ? PAGES[0] : PAGES[1]])[1]);

test('the_version_read_enters_no_link_and_is_written_as_text_only', () => {
  for (const [hash, kind] of [['#v=3.3.7&d=server', 'update'], ['#v=3.3.7&d=portable', 'update'], ['#v=3.3.7', 'update'], ['#v=9.3.7', 'newer']]) {
    const doc = fakeDocument();
    const root = doc.make('div');
    const data = pageData();
    page.render(doc, root, data, hash);
    const read = /v=([\d.]+)/.exec(hash)[1];
    assert.match(root.textContent, new RegExp(read.replace(/\./g, '\\.')), `${kind}: the version read is shown as text`);
    const hrefs = [];
    walk(root, (node) => {
      for (const value of [...Object.values(node.attributes), ...Object.values(node.props).filter((v) => typeof v === 'string')]) {
        assert.ok(!value.includes(read), `${hash}: "${value}" carries the version read`);
      }
      if (node.attributes.href) hrefs.push(node.attributes.href);
      assert.notEqual(node.tagName, 'IMG');
    });
    const allowed = new Set([data.store, ...data.versions.flatMap((v) => [v.portable.url, v.server.url])]);
    for (const href of hrefs) assert.ok(allowed.has(href), `${href} comes from the data`);
    if (kind === 'update') assert.ok(hrefs.includes(hash.includes('server') ? S35 : P35) && hrefs.includes(STORE));
  }
});

test('a_trapped_fragment_writes_no_markup', () => {
  const doc = fakeDocument();
  const root = doc.make('div');
  page.render(doc, root, pageData(), '#v=3.4.0%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E');
  assert.doesNotMatch(root.textContent, /<|img|onerror/);
  walk(root, (node) => assert.notEqual(node.tagName, 'IMG'));
});

test('the_page_says_latest_update_newer_and_none_in_both_languages', () => {
  const said = (lang, hash) => { const doc = fakeDocument(); const root = doc.make('div'); page.render(doc, root, pageData(lang), hash); return root.textContent; };
  assert.match(said('fr', '#v=3.5.0'), /Vous avez la dernière version : 3\.5\.0 du 10\/02\/2027\./);
  assert.match(said('fr', '#v=3.4.0'), /La version 3\.5\.0 du 10\/02\/2027 est disponible\./);
  assert.match(said('fr', '#v=4.0.0'), /plus récente que la dernière publiée/);
  assert.match(said('fr', ''), /Dernière version : 3\.5\.0 du 10\/02\/2027\./);
  assert.match(said('en', '#v=3.5.0'), /You have the latest version: 3\.5\.0, released February 10, 2027\./);
  assert.match(said('en', '#v=3.4.0'), /Version 3\.5\.0, released February 10, 2027, is available\./);
  assert.match(said('en', '#v=4.0.0'), /newer than the latest one published/);
  assert.match(said('en', '#v=3.4.0&d=server'), /a{64}|b{64}/);
});

test('start_reads_the_data_of_the_page_and_follows_the_fragment', () => {
  const holder = fakeDocument();
  const nodes = { 'versions-data': holder.make('script'), 'versions-verdict': holder.make('div') };
  nodes['versions-data'].textContent = JSON.stringify(pageData());
  const doc = fakeDocument(nodes);
  const listeners = {};
  const win = { location: { hash: '#v=3.5.0' }, addEventListener: (name, listener) => { listeners[name] = listener; } };
  page.start(win, doc);
  assert.match(nodes['versions-verdict'].textContent, /dernière version : 3\.5\.0/);
  win.location.hash = '#v=3.4.0';
  listeners.hashchange();
  assert.match(nodes['versions-verdict'].textContent, /3\.5\.0 du 10\/02\/2027 est disponible/);
});

test('versions_js_calls_no_network_api', () => {
  const source = fs.readFileSync(path.join(site, 'assets', 'versions.js'), 'utf8');
  const forbidden = ['fetch', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'new Image', 'import(', 'localStorage',
    'sessionStorage', 'indexedDB', 'cookie', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'window.open',
    'location.href', 'location.assign', 'location.replace', 'postMessage', 'Worker', 'navigator', 'history.', '.src', 'srcset', 'eval', 'Function('];
  for (const word of forbidden) assert.ok(!source.includes(word), `assets/versions.js holds "${word}"`);
});

// ---------- the pages written by versions.cjs ----------

test('the_pages_carry_connect_src_none_and_no_referrer', () => {
  const files = built();
  for (const name of PAGES) {
    const html = files[name];
    const csp = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
    assert.ok(html.includes(csp), `${name}: policy`);
    assert.ok(html.includes('<meta name="referrer" content="no-referrer">'), `${name}: referrer`);
    const first = Math.min(...['<link', '<script', '<style'].map((tag) => html.indexOf(tag)).filter((index) => index >= 0));
    assert.ok(html.indexOf(csp) < first, `${name}: the policy comes before any resource`);
  }
});

test('no_script_nor_resource_comes_from_elsewhere', () => {
  const files = built();
  for (const name of PAGES) {
    const html = files[name];
    const local = (url) => url.startsWith('/') && !url.startsWith('//');
    for (const [tag] of html.matchAll(/<script\b[^>]*>/g)) {
      const src = /\bsrc="([^"]*)"/.exec(tag);
      if (src) assert.ok(local(src[1]), `${name}: ${tag}`);
      else assert.match(tag, /type="application\/(json|ld\+json)"/, `${name}: inline script ${tag}`);
    }
    for (const [, value] of html.matchAll(/\b(?:src|srcset|poster|data)="([^"]*)"/g)) assert.ok(local(value), `${name}: ${value}`);
    for (const [tag] of html.matchAll(/<link\b[^>]*>/g)) {
      if (/rel="(stylesheet|icon|preload|modulepreload|prefetch|preconnect|dns-prefetch|manifest)"/.test(tag)) assert.ok(local(/href="([^"]*)"/.exec(tag)[1]), `${name}: ${tag}`);
    }
    assert.doesNotMatch(html, /<(iframe|object|embed|img|audio|video|source|style|form|base)\b/i, name);
    assert.doesNotMatch(html, /\son[a-z]+=|\sstyle=|javascript:/i, name);
  }
  const css = fs.readFileSync(path.join(site, 'assets', 'versions.css'), 'utf8');
  assert.doesNotMatch(css, /@import|url\(/);
});

test('the_page_lists_every_version_with_its_downloads_and_the_feed', () => {
  const files = built();
  const html = files['versions/index.html'];
  for (const v of LIST) {
    assert.ok(html.includes(`id="version-${v.version}"`));
    for (const file of [v.portable, v.server]) assert.ok(html.includes(`href="${file.url}"`) && html.includes(file.sha256));
  }
  assert.ok(html.indexOf('version-3.5.0') < html.indexOf('version-3.4.0'), 'newest first');
  assert.ok(html.includes('Notes &lt;b&gt;3.5.0&lt;/b&gt; &amp; fr'), 'notes escaped');
  assert.ok(html.includes('href="/versions/feed.xml"') && files['en/versions/index.html'].includes('href="/en/versions/feed.xml"'));
  assert.ok(html.includes('© 2026 camille'), 'the footer takes its holder from the home page');
  const json = /<script type="application\/json" id="versions-data">([\s\S]*?)<\/script>/.exec(html)[1];
  assert.doesNotMatch(json, /</, 'the data block holds no "<"');
  assert.deepEqual(JSON.parse(json).versions.map((v) => v.version), ['3.5.0', '3.4.0']);
});

test('the_addresses_are_those_of_lot_3', () => {
  const files = built();
  assert.deepEqual(Object.keys(files).sort(), [...FEEDS, ...PAGES, 'sitemap.xml'].sort());
  assert.ok(files['versions/index.html'].includes('<link rel="canonical" href="https://topogenia.com/versions/">'));
  assert.ok(files['en/versions/index.html'].includes('<link rel="canonical" href="https://topogenia.com/en/versions/">'));
  for (const name of PAGES) {
    assert.ok(files[name].includes('hreflang="fr" href="https://topogenia.com/versions/"') && files[name].includes('hreflang="en" href="https://topogenia.com/en/versions/"'));
    assert.equal(pageData(name.startsWith('en') ? 'en' : 'fr').store, STORE);
  }
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, 'versions.json'), 'utf8'));
  assert.equal(real.store, STORE);
});

// ---------- the Atom feed ----------

test('the_feed_is_atom_with_one_entry_per_version_and_days_without_hour', () => {
  const files = built();
  for (const [name, base] of [[FEEDS[0], 'https://topogenia.com/versions/'], [FEEDS[1], 'https://topogenia.com/en/versions/']]) {
    const xml = files[name];
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"'), name);
    assert.ok(xml.includes(`<link rel="self" type="application/atom+xml" href="${base}feed.xml"/>`));
    assert.ok(xml.includes(`<id>${base}</id>`) && /<author><name>Topogenia<\/name><\/author>/.test(xml));
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
    assert.equal(entries.length, 2);
    assert.match(entries[0], /<title>Topogenia 3\.5\.0<\/title>/);
    assert.match(entries[0], new RegExp(`<id>${base}#version-3\\.5\\.0</id>`));
    assert.match(entries[0], /<published>2027-02-10T00:00:00Z<\/published>\s*<updated>2027-02-10T00:00:00Z<\/updated>/);
    assert.match(entries[1], /<published>2026-11-21T00:00:00Z<\/published>/);
    assert.match(xml, /<\/title>\n  <updated>2027-02-10T00:00:00Z<\/updated>/);
    for (const [stamp] of xml.matchAll(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g)) assert.match(stamp, /T00:00:00Z$/, `${name}: ${stamp}`);
    assert.ok(xml.includes('Notes &lt;b&gt;3.5.0&lt;/b&gt; &amp;'), 'escaped');
    assert.ok(entries[0].includes(P35) && entries[0].includes('a'.repeat(64)));
  }
});

// ---------- the data, one file ----------

test('a_null_date_or_sha_is_refused_without_draft', () => {
  const withNull = (change) => { const d = data(); change(d.versions[1]); return d; };
  assert.throws(() => built(withNull((v) => { v.date = null; })), /date/);
  assert.throws(() => built(withNull((v) => { v.portable.sha256 = null; })), /sha256/);
  assert.throws(() => built(withNull((v) => { v.server.sha256 = null; })), /sha256/);
  const files = built(withNull((v) => { v.date = null; v.portable.sha256 = null; v.server.sha256 = null; }), true);
  assert.match(files['versions/index.html'], /à la publication/);
  assert.match(files['en/versions/index.html'], /at release/);
  const feed = files['versions/feed.xml'];
  assert.match(feed, /<!-- Brouillon/);
  const draftEntry = [...feed.matchAll(/<entry>([\s\S]*?)<\/entry>/g)][0][1];
  assert.doesNotMatch(draftEntry, /<published>|<updated>/, 'no date is made up');
  assert.match(feed, /<\/title>\n  <updated>2026-11-21T00:00:00Z<\/updated>/);
});

test('the_list_starts_at_3_4_0_and_its_dates_are_days', () => {
  const change = (fn) => { const d = data(); fn(d); return d; };
  assert.throws(() => built(change((d) => d.versions.push(entry('3.3.0', '2026-11-20', 'e', 'f')))), /3\.4\.0/);
  assert.throws(() => built(change((d) => { d.versions[0].date = '2026-11-21T10:00:00Z'; })), /date/);
  assert.throws(() => built(change((d) => { d.versions[0].date = '2026-02-30'; })), /date/);
  assert.throws(() => built(change((d) => d.versions.push(entry('3.5.0', '2027-03-01', 'e', 'f')))), /double/);
  assert.throws(() => built(change((d) => { d.versions[0].portable.url = 'http://example.org/a.zip'; })), /https/);
  assert.throws(() => built(change((d) => { d.versions[0].portable.sha256 = 'A'.repeat(64); })), /sha256/);
  assert.throws(() => built(change((d) => { d.versions = []; })), /version/);
  assert.throws(() => built(change((d) => { d.versions[0].notes.en = ''; })), /notes/);
  assert.throws(() => built(change((d) => { d.versions[0].extra = 1; })), /extra/);
});

test('the_sitemap_keeps_its_other_entries', () => {
  const dir = fixtureSite();
  const before = fs.readFileSync(path.join(dir, 'sitemap.xml'), 'utf8');
  const once = versions.build({ site: dir, data: data(), draft: false })['sitemap.xml'];
  for (const loc of ['https://topogenia.com/', 'https://topogenia.com/blog/']) assert.ok(once.includes(`<loc>${loc}</loc>`));
  assert.ok(once.startsWith(before.slice(0, before.indexOf('</urlset>'))), 'the other lines are kept as they were');
  assert.ok(once.includes('  <url>\n    <loc>https://topogenia.com/versions/</loc>\n    <lastmod>2027-02-10</lastmod>\n  </url>\n'));
  assert.ok(once.includes('<loc>https://topogenia.com/en/versions/</loc>'));
  fs.writeFileSync(path.join(dir, 'sitemap.xml'), once);
  assert.equal(versions.build({ site: dir, data: data(), draft: false })['sitemap.xml'], once, 'a second run changes nothing');
  const d = data();
  for (const v of d.versions) v.date = null;
  assert.doesNotMatch(versions.build({ site: fixtureSite(), data: d, draft: true })['sitemap.xml'], /versions\/<\/loc>\n    <lastmod>/);
});

test('the_data_of_the_site_builds_as_a_draft_only_until_it_is_filled', () => {
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, 'versions.json'), 'utf8'));
  assert.equal(real.versions.at(-1).version, '3.4.0');
  const files = versions.build({ site, data: real, draft: true });
  assert.ok(files['versions/index.html'].includes('id="version-3.4.0"'));
  if (real.versions.some((v) => v.date === null || v.portable.sha256 === null || (v.server !== undefined && v.server.sha256 === null))) {
    assert.throws(() => versions.build({ site, data: real, draft: false }));
  }
});

test('no_name_nor_path_of_the_machine_is_written_in_the_scripts', () => {
  const name = ['Bar', 'cauti'].join('');
  for (const file of ['outils/versions.cjs', 'assets/versions.js', 'assets/versions.css']) {
    const source = fs.readFileSync(path.join(site, file), 'utf8');
    assert.ok(!source.includes(name), file);
    assert.doesNotMatch(source, /[A-Z]:\\|\\Users\\|\/Users\//, file);
    assert.ok(!source.includes('\r'), `${file}: LF only`);
  }
});

test('the_privacy_page_says_the_fragment_and_the_gallery_in_both_languages', () => {
  const html = fs.readFileSync(path.join(site, 'confidentialite.html'), 'utf8');
  const fr = html.split('<article lang="fr"')[1].split('</article>')[0];
  const en = html.split('<article lang="en"')[1].split('</article>')[0];
  const must = (text, parts, label) => {
    for (const part of parts) assert.ok(text.includes(part), `${label} : « ${part} » absent`);
  };
  must(fr, ['Rechercher une mise à jour', 'Galerie de modèles', 'signe #', 'ne transmet jamais', 'historique de votre navigateur', 'synchronisation', 'mesure d\'audience', 'tiers', 'SiteLinks', 'Microsoft Store', 'télécharge', 'ne télécharge ni n\'installe rien'], 'fr');
  must(en, ['Check for updates', 'Template gallery', 'after the # sign', 'never sends', 'browser history', 'synchronisation', 'analytics', 'third part', 'SiteLinks', 'Microsoft Store', 'download', 'downloads or installs nothing'], 'en');
  // The two exceptions to "nothing leaves the computer" keep their text.
  must(fr, ['<b>En ligne</b>, Anthropic, AWS Bedrock', 'Voix naturelle en ligne</b> : elle n\'est proposée qu\'après une question'], 'fr exceptions');
  must(en, ['<b>Online</b>, Anthropic, AWS Bedrock', 'Natural online voice</b>: it is only offered after a question'], 'en exceptions');
  // The version read is never said to travel to the site.
  assert.doesNotMatch(fr, /envoy\w+ (à|au) l'éditeur la version/i);
  assert.ok(!html.includes('\r'));
});

test('the_footer_of_the_versions_pages_leads_to_the_gallery', () => {
  const files = built();
  for (const [file, href] of [['versions/index.html', '/modeles/'], ['en/versions/index.html', '/en/templates/']]) {
    const foot = files[file].slice(files[file].indexOf('<footer'));
    assert.ok(foot.includes(`href="${href}"`), file);
  }
});

// ---------- the home page follows the latest version (PA-P1-01) ----------

/** Every .html, .xml, .txt and .js file of the site, the blog and the tools left out. */
function siteFiles(dir = site, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['outils', 'blog', 'node_modules', '.git'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) siteFiles(full, out);
    else if (/\.(html|xml|txt|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test('no_link_of_the_site_points_to_a_release_other_than_the_latest', () => {
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, 'versions.json'), 'utf8'));
  const latest = versions.check(real, { draft: true })[0].version;
  let seen = 0;
  for (const file of siteFiles()) {
    for (const [, version] of fs.readFileSync(file, 'utf8').matchAll(/releases\/(?:download|tag)\/v(\d+\.\d+\.\d+)/g)) {
      seen += 1;
      assert.equal(version, latest, `${path.relative(site, file)} : release v${version}, la dernière est v${latest}`);
    }
  }
  assert.ok(seen > 0, 'the home page and the versions page carry release links');
});

test('the_home_page_is_the_one_the_latest_version_gives', () => {
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, 'versions.json'), 'utf8'));
  const stamped = versions.homeFiles({ site, data: real, draft: true });
  for (const [relative, content] of Object.entries(stamped)) {
    assert.equal(fs.readFileSync(path.join(site, ...relative.split('/')), 'utf8'), content, `${relative} : relancer node outils/versions.cjs`);
  }
  const short = versions.check(real, { draft: true })[0].version.split('.').slice(0, 2).join('.');
  const en = fs.readFileSync(path.join(site, 'en', 'index.html'), 'utf8');
  assert.ok(new RegExp(`Download Topogenia[  ]${short.replace('.', '\.')}<`).test(en) && en.includes(`Topogenia ${short} · `));
});

test('stamping_the_home_page_changes_every_number_and_nothing_else', () => {
  const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  const i18n = fs.readFileSync(path.join(site, 'assets', 'i18n.js'), 'utf8');
  const next = entry('3.5.0', '2027-02-10', 'a', 'b');
  const zip = 'https://example.org/site/releases/download/v3.5.0/Topogenia-3.5.0-portable.zip';
  next.portable.url = zip;
  const { html: h, i18n: t } = versions.stampHome(html, i18n, next);
  assert.ok(h.includes('"softwareVersion": "3.5.0"') && h.includes(`href="${zip}"`) && h.includes(`href="${zip}.sha256"`));
  assert.ok(h.includes('"releaseNotes": "https://example.org/site/releases/tag/v3.5.0"'));
  assert.ok(h.includes('Télécharger Topogenia&nbsp;3.5<') && t.includes('Download Topogenia 3.5\'') && t.includes('Topogenia 3.5 · '));
  assert.doesNotMatch(h + t, /3\.[34]\.0|Topogenia(?:&nbsp;| | )3\.[34]\b/);
  assert.throws(() => versions.stampHome('<p>vide</p>', i18n, next), /accueil/);
});

// ---------- a version without server ZIP (PA-P2-01) ----------

test('a_version_without_a_server_zip_offers_none_and_says_so', () => {
  const d = data();
  delete d.versions[1].server;
  const files = built(d);
  for (const name of [...PAGES, ...FEEDS]) assert.ok(!files[name].includes('-3.5.0-server.zip'), name);
  assert.ok(files['versions/index.html'].includes(P35));
  const list = d.versions;
  const asked = page.verdict('#v=3.4.0&d=server', list);
  assert.equal(asked.kind, 'update');
  assert.deepEqual(asked.downloads, []);
  assert.deepEqual(page.verdict('#v=9.0.0', list).downloads, []);
  assert.deepEqual(page.verdict('', list).downloads.map((f) => f.dist), ['portable']);
  assert.throws(() => built((() => { const x = data(); delete x.versions[1].portable; return x; })()), /portable/);
});
