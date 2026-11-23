// blog.test.cjs
// Tests of the lines of llms.txt that the blog generator carries for the gallery and the versions: written once, in outils/llms-liens.json, and kept by every build of the blog. Run from the site root: node --test outils/*.test.cjs

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const site = path.resolve(__dirname, '..');
const blog = require('./blog.cjs');
const links = JSON.parse(fs.readFileSync(path.join(__dirname, 'llms-liens.json'), 'utf8'));

const article = (lang, n) => ({ title: `Article ${lang}${n}`, url: `/${lang === 'en' ? 'en/' : ''}blog/a${n}/`, description: `Description ${n}.` });
const byLang = { fr: [article('fr', 1), article('fr', 2)], en: [article('en', 1)] };
const count = (text, part) => text.split(part).length - 1;

test('llms_carries_the_gallery_and_the_versions_once_in_each_language', () => {
  const text = blog.llms(byLang, links);
  for (const lang of ['fr', 'en']) {
    assert.ok(links[lang].liens.length >= 3, lang);
    for (const link of links[lang].liens) {
      assert.match(link.url, /^https:\/\/topogenia\.com\//);
      assert.equal(count(text, `(${link.url})`), 1, link.url);
    }
  }
  const urls = links.fr.liens.map((l) => l.url).concat(links.en.liens.map((l) => l.url));
  for (const wanted of ['/modeles/', '/en/templates/', '/versions/', '/en/versions/', '/versions/feed.xml', '/en/versions/feed.xml']) {
    assert.ok(urls.includes(`https://topogenia.com${wanted}`), wanted);
  }
});

test('llms_keeps_the_part_of_the_blog_unchanged', () => {
  const without = blog.llms(byLang, { fr: { titre: 'x', liens: [] }, en: { titre: 'y', liens: [] } });
  const withLinks = blog.llms(byLang, links);
  assert.ok(withLinks.startsWith(without), 'everything the blog wrote before comes first, as it was');
  assert.ok(without.includes('## Blog, en français\n\n- [Article fr1](https://topogenia.com/blog/a1/): Description 1.\n- [Article fr2](https://topogenia.com/blog/a2/): Description 2.\n'));
  assert.ok(without.includes('## Blog, in English\n\n- [Article en1](https://topogenia.com/en/blog/a1/): Description 1.\n'));
  assert.ok(!without.includes('## x') && !without.includes('## y'), 'a language without link has no empty section');
});

test('a_build_of_the_blog_keeps_the_links_and_writes_them_once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-'));
  fs.cpSync(site, path.join(dir, 'site'), { recursive: true, filter: (source) => !source.split(path.sep).includes('.git') });
  const copy = path.join(dir, 'site');
  fs.writeFileSync(path.join(copy, 'llms.txt'), 'a line added by hand\n');
  fs.writeFileSync(path.join(copy, 'outils', 'reglages-site.json'), '{ "blog": true }' + String.fromCharCode(10)); // this test is about a build with the blog
  // An English article, so that the English pages of the blog are built too.
  fs.mkdirSync(path.join(copy, 'outils', 'articles', 'en'), { recursive: true });
  fs.mkdirSync(path.join(copy, 'en', 'blog', 'images'), { recursive: true });
  fs.copyFileSync(path.join(copy, 'blog', 'images', '08-carte.webp'), path.join(copy, 'en', 'blog', 'images', '08-carte.webp'));
  fs.writeFileSync(path.join(copy, 'outils', 'articles', 'en', 'one.md'), '---\ntitle: One\ndescription: A test article.\ndate: 2026-11-10\nslug: one\norder: 1\nimage: 08-carte.webp\nimageAlt: A map.\n---\n\nSome text.\n');
  execFileSync(process.execPath, [path.join(copy, 'outils', 'blog.cjs')], { cwd: copy, stdio: 'pipe' });
  const first = fs.readFileSync(path.join(copy, 'llms.txt'), 'utf8');
  execFileSync(process.execPath, [path.join(copy, 'outils', 'blog.cjs')], { cwd: copy, stdio: 'pipe' });
  const second = fs.readFileSync(path.join(copy, 'llms.txt'), 'utf8');
  assert.equal(second, first, 'two builds give the same file');
  assert.ok(!first.includes('added by hand'));
  for (const lang of ['fr', 'en']) for (const link of links[lang].liens) assert.equal(count(first, `(${link.url})`), 1, link.url);
  assert.equal(count(first, '## Blog, en français'), 1);
  // The footer of the pages of the blog leads to the gallery and to the versions, in each language.
  const pages = { 'blog/index.html': ['/modeles/', '/versions/'], 'en/blog/index.html': ['/en/templates/', '/en/versions/'] };
  for (const [file, hrefs] of Object.entries(pages)) {
    const html = fs.readFileSync(path.join(copy, file), 'utf8');
    const foot = html.slice(html.indexOf('<footer'));
    for (const href of hrefs) assert.ok(foot.includes(`href="${href}"`), `${file} : ${href}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the_blog_is_left_out_of_llms_and_sitemap_when_the_setting_says_so', () => {
  assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname, 'reglages-site.json'), 'utf8')).blog, false, 'the blog is out of 3.4');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-off-'));
  fs.cpSync(site, path.join(dir, 'site'), { recursive: true, filter: (source) => !source.split(path.sep).includes('.git') });
  const copy = path.join(dir, 'site');
  // A sitemap and an llms.txt that still carry the blog, as an earlier build left them.
  fs.writeFileSync(path.join(copy, 'sitemap.xml'), ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', '  <url>', '    <loc>https://topogenia.com/</loc>', '  </url>', '  <url>', '    <loc>https://topogenia.com/blog/</loc>', '    <lastmod>2026-11-10</lastmod>', '  </url>', '  <url>', '    <loc>https://topogenia.com/blog/x/</loc>', '  </url>', '</urlset>', ''].join('\n'));
  const before = fs.readdirSync(path.join(copy, 'blog')).sort();
  execFileSync(process.execPath, [path.join(copy, 'outils', 'blog.cjs')], { cwd: copy, stdio: 'pipe' });
  const llmsText = fs.readFileSync(path.join(copy, 'llms.txt'), 'utf8');
  const map = fs.readFileSync(path.join(copy, 'sitemap.xml'), 'utf8');
  assert.ok(!/blog/i.test(llmsText), 'llms.txt: no blog');
  assert.ok(!/blog/i.test(map), 'sitemap.xml: no blog');
  assert.ok(map.includes('<loc>https://topogenia.com/</loc>'), 'the other entries stay');
  for (const lang of ['fr', 'en']) for (const link of links[lang].liens) assert.equal(count(llmsText, `(${link.url})`), 1, link.url);
  assert.deepEqual(fs.readdirSync(path.join(copy, 'blog')).sort(), before, 'the folder of the blog is neither written nor removed');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the_links_file_is_lf_and_names_nobody', () => {
  const raw = fs.readFileSync(path.join(__dirname, 'llms-liens.json'), 'utf8');
  assert.ok(!raw.includes('\r'));
  assert.ok(!raw.includes(['Bar', 'cauti'].join('')));
  assert.doesNotMatch(raw, /[A-Z]:\\|\\Users\\/);
});
