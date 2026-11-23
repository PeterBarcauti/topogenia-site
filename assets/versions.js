// versions.js
// The versions page, in the browser: reads the version in the fragment of the address (#v=3.4.0&d=portable), compares it with the list written in the page, and says up to date or which version is available. The version read is only ever written as text: it enters no link, no address and no storage, and the page sends nothing anywhere.

(function (factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.start(window, document);
}(function () {
  'use strict';

  const VERSION = /^\d{1,9}\.\d{1,9}\.\d{1,9}$/;
  const DISTS = ['portable', 'server'];
  const FRAGMENT_MAX = 200;

  /** The three numbers of a version, or null when it is not three groups of digits. */
  function parseVersion(text) {
    return typeof text === 'string' && VERSION.test(text) ? text.split('.').map(Number) : null;
  }

  /** Negative, zero or positive, as `a` is older, equal or newer than `b`, number by number. */
  function compareVersions(a, b) {
    const x = parseVersion(a);
    const y = parseVersion(b);
    for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  }

  /** What the fragment says: the version (null when absent or unreadable) and the distribution (portable by default). */
  function readFragment(hash) {
    const text = typeof hash === 'string' ? hash.replace(/^#/, '') : '';
    if (text.length > FRAGMENT_MAX) return { version: null, dist: 'portable' };
    const params = new URLSearchParams(text);
    const version = params.get('v');
    const dist = params.get('d');
    return { version: parseVersion(version) ? version : null, dist: DISTS.includes(dist) ? dist : 'portable' };
  }

  /** The files offered with a verdict, taken from the list alone. */
  const downloadsOf = (latest, dists) => dists.filter((dist) => latest[dist]).map((dist) => ({ dist, url: latest[dist].url, sha256: latest[dist].sha256 }));

  /**
   * The verdict, pure: `latest` (the version read is the latest), `update` (older: the file of its distribution),
   * `newer` (newer than the list), `none` (no readable version: the latest one and all its files).
   */
  function verdict(hash, versions) {
    const latest = versions.reduce((best, entry) => (compareVersions(entry.version, best.version) > 0 ? entry : best));
    const { version, dist } = readFragment(hash);
    if (version === null) return { kind: 'none', read: null, dist, latest, downloads: downloadsOf(latest, DISTS) };
    const order = compareVersions(version, latest.version);
    if (order === 0) return { kind: 'latest', read: version, dist, latest, downloads: [] };
    if (order > 0) return { kind: 'newer', read: version, dist, latest, downloads: [] };
    return { kind: 'update', read: version, dist, latest, downloads: downloadsOf(latest, [dist]) };
  }

  /** A sentence of the page: each {name} replaced by its value; the result goes to textContent only. */
  const fill = (template, values) => template.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? values[name] : whole));

  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.setAttribute('class', className);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function link(doc, className, href, text) {
    const node = element(doc, 'a', className, text);
    node.setAttribute('href', href);
    return node;
  }

  function downloadList(doc, files, texts) {
    const list = element(doc, 'ul', 'versions-downloads');
    for (const file of files) {
      const item = element(doc, 'li');
      item.append(link(doc, 'btn btn-primary', file.url, texts[file.dist]));
      const hash = element(doc, 'p', 'versions-sha', texts.sha);
      hash.append(element(doc, 'code', '', file.sha256 === null ? texts.pending : file.sha256));
      item.append(hash);
      list.append(item);
    }
    return list;
  }

  /** Writes the verdict of the fragment into `root`, from the data of the page. */
  function render(doc, root, data, hash) {
    const result = verdict(hash, data.versions);
    const texts = data.texts;
    const values = { version: result.latest.version, dated: result.latest.dated, read: result.read };
    const nodes = [element(doc, 'p', 'versions-verdict-text', fill(texts[result.kind], values))];
    if (result.kind === 'update') nodes.push(element(doc, 'p', 'versions-yours', fill(texts.yours, values)));
    // A server installation looking for an update, when no server ZIP is listed for the latest version
    if (result.kind === 'update' && result.dist === 'server' && result.downloads.length === 0) nodes.push(element(doc, 'p', 'versions-yours', texts.noServer));
    if (result.downloads.length > 0) {
      nodes.push(downloadList(doc, result.downloads, texts));
      const store = element(doc, 'p', 'versions-store');
      store.append(link(doc, 'btn btn-ghost', data.store, texts.store));
      nodes.push(store);
    }
    root.replaceChildren(...nodes);
  }

  /** In the page: the data block, the place of the verdict, and the verdict again when the fragment changes. */
  function start(win, doc) {
    const source = doc.getElementById('versions-data');
    const root = doc.getElementById('versions-verdict');
    if (!source || !root) return;
    const data = JSON.parse(source.textContent);
    const show = () => render(doc, root, data, win.location.hash);
    show();
    win.addEventListener('hashchange', show);
  }

  return { parseVersion, compareVersions, readFragment, verdict, render, start };
}));
