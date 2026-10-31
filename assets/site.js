// site.js
// Comportement de la vitrine : langue, démonstration du récit à la carte, carte d'essai, fond WebGL, apparitions et compteurs

(() => {
  'use strict';

  const T = window.TOPO;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const CANCEL = Symbol('cancel');

  const svg = (tag, attributes = {}, parent) => {
    const element = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (parent) parent.appendChild(element);
    return element;
  };
  const colours = {};
  const css = (name) => (colours[name] ??= getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  const pastel = (tint) => css(`--lane-${tint}-pastel`);
  const ink = (tint) => css(`--lane-${tint}-ink`);
  const store = {
    get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
    set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* private window */ } }
  };
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const easeInOut = (p) => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

  /** Calls step(progress) on every frame for a duration; resolves at the end. */
  const tween = (duration, step, ease = easeInOut) => new Promise((resolve) => {
    const start = performance.now();
    const frame = (now) => {
      const p = Math.min(1, (now - start) / duration);
      step(ease(p));
      if (p < 1) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });

  /** A path through points, its corners rounded. */
  const roundedPath = (points, radius = 7) => {
    let d = `M${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length - 1; i += 1) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      const r = Math.min(radius, Math.hypot(x1 - x0, y1 - y0) / 2, Math.hypot(x2 - x1, y2 - y1) / 2);
      const ax = x1 - Math.sign(x1 - x0) * r; const ay = y1 - Math.sign(y1 - y0) * r;
      const bx = x1 + Math.sign(x2 - x1) * r; const by = y1 + Math.sign(y2 - y1) * r;
      d += ` L${ax} ${ay} Q${x1} ${y1} ${bx} ${by}`;
    }
    const [xl, yl] = points[points.length - 1];
    return `${d} L${xl} ${yl}`;
  };

  /** A label cut in at most two lines of maxChars characters. */
  const wrap = (label, maxChars) => {
    const lines = [];
    let line = '';
    for (const word of label.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (next.length <= maxChars || !line) line = next; else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    if (lines.length > 2) lines.splice(1, lines.length - 1, `${lines.slice(1).join(' ').slice(0, maxChars - 1)}…`);
    return lines;
  };

  const ICONS = {
    person: 'M7 7.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zM2.2 13c.4-2.6 2.4-4.2 4.8-4.2s4.4 1.6 4.8 4.2',
    building: 'M2.5 13V2.5h6V13M8.5 6h3.5v7M1.5 13h11M4.5 5h2M4.5 7.5h2M4.5 10h2',
    system: 'M2 2.5h10v3.6H2zM2 8h10v3.6H2zM4.3 4.3h.01M4.3 9.8h.01'
  };

  /* ---------------------------------------------------------------- language */

  const i18nNodes = $$('[data-i18n]').map((element) => ({ element, key: element.dataset.i18n, fr: element.innerHTML }));
  const ariaNodes = $$('[data-i18n-aria]').map((element) => ({ element, key: element.dataset.i18nAria, fr: element.getAttribute('aria-label') }));
  const frTitle = document.title;
  const description = $('meta[name="description"]');
  const frDescription = description.content;
  let lang = store.get('topogenia.lang') || ((navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en');
  const languageListeners = [];

  const applyLanguage = (next) => {
    lang = next;
    document.documentElement.lang = next;
    for (const { element, key, fr } of i18nNodes) {
      if (next === 'fr') element.innerHTML = fr; else if (T.en[key] !== undefined) element.textContent = T.en[key];
    }
    for (const { element, key, fr } of ariaNodes) element.setAttribute('aria-label', next === 'fr' ? fr : T.en[key] ?? fr);
    document.title = next === 'fr' ? frTitle : T.en['meta.title'];
    description.content = next === 'fr' ? frDescription : T.en['meta.desc'];
    for (const button of $$('.lang button')) button.setAttribute('aria-pressed', String(button.dataset.lang === next));
    for (const listener of languageListeners) listener(next);
  };
  for (const button of $$('.lang button')) {
    button.addEventListener('click', () => {
      if (button.dataset.lang === lang) return;
      store.set('topogenia.lang', button.dataset.lang);
      if (document.startViewTransition && !reduced) document.startViewTransition(() => applyLanguage(button.dataset.lang));
      else applyLanguage(button.dataset.lang);
    });
  }

  /* ---------------------------------------------------------------- the map */

  const W = 860;
  const H = 400;
  const HEAD = 156;

  /** Draws a story's map in the SVG, hidden (for the demonstration) or as it ends. */
  const drawMap = (root, story, visible) => {
    root.replaceChildren();
    const defs = svg('defs', {}, root);
    const marker = svg('marker', { id: 'demo-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '8', markerHeight: '8',
      markerUnits: 'userSpaceOnUse', orient: 'auto' }, defs);
    svg('path', { d: 'M0 1L9 5L0 9z', class: 'arrow' }, marker);
    const laneH = H / story.lanes.length;
    const x0 = HEAD + 20;
    const colW = (W - x0 - 14) / story.cols;
    const taskW = Math.min(colW - 14, 100);
    const maxChars = Math.floor((taskW - 10) / 5.9);
    const lanesLayer = svg('g', {}, root);
    const edgesLayer = svg('g', {}, root);
    const stepsLayer = svg('g', {}, root);
    const hide = (element) => { if (!visible) element.style.opacity = '0'; return element; };

    const lanes = story.lanes.map(([name, tint, icon], index) => {
      const top = index * laneH;
      const cy = top + laneH / 2;
      const group = hide(svg('g', {}, lanesLayer));
      svg('rect', { x: 0, y: top, width: W, height: laneH, class: `lane-bg${index % 2 ? ' even' : ''}` }, group);
      svg('line', { x1: 0, x2: W, y1: top + laneH, y2: top + laneH, class: 'lane-line' }, group);
      svg('rect', { x: 0, y: top, width: HEAD, height: laneH, fill: pastel(tint) }, group);
      svg('rect', { x: HEAD - 3, y: top, width: 3, height: laneH, fill: ink(tint) }, group);
      const label = hide(svg('g', { fill: ink(tint) }, group));
      svg('path', { d: ICONS[icon], transform: `translate(12 ${cy - 13})`, fill: 'none', stroke: ink(tint), 'stroke-width': '1.4',
        'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, label);
      const nameElement = svg('text', { x: 32, y: cy - 3, class: 'lane-name' }, label);
      nameElement.textContent = name;
      const code = svg('text', { x: 32, y: cy + 13, class: 'lane-code' }, label);
      code.textContent = `${story.code}-C${String(index + 1).padStart(2, '0')}`;
      return { group, label, nameElement, tint };
    });

    const downFrom = new Set(story.links.filter((link) => link[3] === 'down').map((link) => link[0]));
    const steps = new Map();
    story.steps.forEach(([id, laneIndex, col, kind, label], index) => {
      const cx = x0 + colW * (col + .5);
      const cy = laneIndex * laneH + laneH / 2;
      const tint = story.lanes[laneIndex][1];
      const outer = svg('g', { transform: `translate(${cx} ${cy})`, class: `step${visible ? '' : ' preview'}` }, stepsLayer);
      const pop = hide(svg('g', { class: 'step-shadow' }, outer));
      pop.style.transformBox = 'fill-box';
      pop.style.transformOrigin = 'center';
      const code = `${story.code}-E${String(index + 1).padStart(3, '0')}`;
      let hw; let hh;
      if (kind === 'task' || kind === 'start' || kind === 'end') {
        const h = 50;
        hw = taskW / 2; hh = h / 2;
        svg('rect', { x: -hw, y: -hh, width: taskW, height: h, rx: kind === 'task' ? 10 : hh, class: 'step-box' }, pop);
        if (kind === 'end') svg('rect', { x: -hw + 3, y: -hh + 3, width: taskW - 6, height: h - 6, rx: hh - 3, fill: 'none', stroke: '#C4C7CE', class: 'step-accent' }, pop);
        if (kind === 'task') svg('rect', { x: -hw, y: -hh + 9, width: 3, height: h - 18, rx: 1.5, fill: ink(tint), class: 'step-accent' }, pop);
        const lines = wrap(label, maxChars);
        const codeText = svg('text', { x: 0, y: -hh + 14, 'text-anchor': 'middle', class: 'step-code', fill: ink(tint) }, pop);
        codeText.textContent = code;
        const start = -hh + 28 + (lines.length === 1 ? 4 : 0);
        lines.forEach((line, lineIndex) => {
          const text = svg('text', { x: 0, y: start + lineIndex * 12.5, 'text-anchor': 'middle', class: 'step-label' }, pop);
          text.textContent = line;
        });
      } else {
        const gateway = kind === 'decision';
        hw = gateway ? 32 : 18; hh = gateway ? 22 : 18;
        svg('polygon', { points: `0 ${-hh} ${hw} 0 0 ${hh} ${-hw} 0`, class: 'step-box gw', style: `--ink:${ink(tint)}` }, pop);
        if (!gateway) svg('path', { d: 'M-6 0H6M0 -6V6', stroke: ink(tint), 'stroke-width': 1.6, 'stroke-linecap': 'round' }, pop);
        if (label) {
          const above = downFrom.has(id);
          const text = svg('text', { x: 0, y: above ? -hh - 8 : hh + 15, 'text-anchor': 'middle', class: 'step-label' }, pop);
          text.textContent = label;
        }
      }
      steps.set(id, { outer, pop, cx, cy, hw, hh });
    });

    const words = T.words[story.lang];
    const edges = story.links.map(([from, to, branch, mode]) => {
      const a = steps.get(from);
      const b = steps.get(to);
      let points;
      if (mode === 'down') points = [[a.cx, a.cy + a.hh], [a.cx, b.cy], [b.cx - b.hw, b.cy]];
      else if (Math.abs(a.cy - b.cy) < 1) points = [[a.cx + a.hw, a.cy], [b.cx - b.hw, b.cy]];
      else {
        const mx = (a.cx + a.hw + b.cx - b.hw) / 2;
        points = [[a.cx + a.hw, a.cy], [mx, a.cy], [mx, b.cy], [b.cx - b.hw, b.cy]];
      }
      const group = hide(svg('g', {}, edgesLayer));
      const path = svg('path', { d: roundedPath(points), class: 'edge' }, group);
      if (visible) path.setAttribute('marker-end', 'url(#demo-arrow)');
      if (branch) {
        const text = svg('text', mode === 'down'
          ? { x: a.cx + 6, y: a.cy + a.hh + 13, class: 'edge-label' }
          : { x: a.cx + a.hw + 6, y: a.cy - 6, class: 'edge-label' }, group);
        text.textContent = words[branch];
      }
      return { from, to, group, path, drawn: visible };
    });
    return { lanes, steps, edges };
  };

  /* ---------------------------------------------------------------- the demonstration */

  const stage = $('#stage');
  const mapRoot = $('#demo-map');
  const field = $('#demo-field');
  const textRoot = $('#demo-text');
  const caret = $('.caret', field);
  const tabs = $$('.stories button');
  const demo = { token: 0, paused: true, started: false, index: 0, elapsed: 0, total: 1 };

  const storiesFor = (language) => T.stories[language].map((story) => ({ ...story, lang: language }));

  const progress = () => {
    const tab = tabs[demo.index];
    if (tab) tab.style.setProperty('--p', Math.min(1, demo.elapsed / demo.total).toFixed(3));
  };

  /** Waits while the demonstration is on screen; throws CANCEL once another story has started. */
  const wait = (ms, token) => new Promise((resolve, reject) => {
    let left = ms;
    let last = performance.now();
    const tick = (now) => {
      if (token !== demo.token) { reject(CANCEL); return; }
      const dt = Math.min(now - last, 100);
      last = now;
      if (!demo.paused) { left -= dt; demo.elapsed += dt; progress(); }
      if (left <= 0) resolve(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  /** Types the story in the field, the actors marked in their lane colour as they are written. */
  const typeStory = (story, token) => new Promise((resolve, reject) => {
    const spans = story.text.map(([text, laneIndex, step]) => {
      const span = document.createElement('span');
      if (laneIndex !== undefined && laneIndex !== null) { span.className = 'actor'; span.dataset.lane = laneIndex; }
      if (step) { span.className = 'act'; span.dataset.step = step; }
      textRoot.appendChild(span);
      return { span, text, laneIndex, typed: 0 };
    });
    let current = 0;
    let budget = 0;
    let last = performance.now();
    const cps = 46;
    const tick = (now) => {
      if (token !== demo.token) { reject(CANCEL); return; }
      const dt = Math.min(now - last, 100);
      last = now;
      if (!demo.paused) { budget += dt * cps / 1000; demo.elapsed += dt; progress(); }
      while (budget >= 1 && current < spans.length) {
        const item = spans[current];
        if (item.typed < item.text.length) {
          const char = item.text[item.typed];
          item.span.textContent += char;
          item.typed += 1;
          budget -= ('.,:'.includes(char) ? 7 : 1);
        }
        if (item.typed >= item.text.length) {
          if (item.laneIndex !== undefined && item.laneIndex !== null) {
            const tint = story.lanes[item.laneIndex][1];
            item.span.classList.add('hl');
            item.span.style.background = pastel(tint);
            item.span.style.color = ink(tint);
          }
          current += 1;
        }
      }
      if (current >= spans.length) resolve(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  /** A word of the story flies to the name of its lane. */
  const fly = (span, target) => new Promise((resolve) => {
    const from = span.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const flyer = document.createElement('span');
    flyer.className = 'flyer';
    flyer.textContent = span.textContent;
    const style = getComputedStyle(span);
    Object.assign(flyer.style, { left: `${from.left}px`, top: `${from.top}px`, height: `${from.height}px`, lineHeight: `${from.height}px`,
      fontSize: style.fontSize, fontWeight: '650', background: span.style.background, color: span.style.color });
    document.body.appendChild(flyer);
    const scale = Math.max(.6, Math.min(1.6, to.height / Math.max(1, from.height)));
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const animation = flyer.animate([
      { transform: 'translate(0, 0) scale(1)', boxShadow: '0 0 0 rgba(0,0,0,0)' },
      { transform: `translate(${dx * .55}px, ${dy * .55 - 40}px) scale(${(1 + scale) / 2 + .15})`, boxShadow: '0 12px 24px rgba(40,32,110,.25)', offset: .55 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, boxShadow: '0 0 0 rgba(0,0,0,0)' }
    ], { duration: 900, easing: 'cubic-bezier(.55, 0, .25, 1)', fill: 'forwards' });
    animation.onfinish = () => { flyer.remove(); resolve(); };
    animation.oncancel = () => { flyer.remove(); resolve(); };
  });

  const show = (element, duration = 350) => {
    element.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing: 'ease-out', fill: 'forwards' });
  };

  const resetPanel = (story) => {
    textRoot.replaceChildren();
    $('#demo-proposal').className = 'as-proposal';
    $('#demo-done').className = 'as-done';
    $('#demo-work').className = 'as-work';
    $('#demo-mark').className = 'as-mark';
    $('#demo-ai-button').classList.remove('on');
    caret.classList.remove('off');
    $('#demo-project').textContent = story.project;
    $('#demo-code').textContent = story.code;
  };

  const selectTab = (index) => {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.style.setProperty('--p', '0');
    });
  };

  /** The end of a story, at once: for reduced motion. */
  const showFinal = (index) => {
    demo.token += 1;
    demo.index = index;
    selectTab(index);
    const story = storiesFor(lang)[index];
    resetPanel(story);
    drawMap(mapRoot, story, true);
    for (const [text, laneIndex, step] of story.text) {
      const span = document.createElement('span');
      span.textContent = text;
      if (laneIndex !== undefined && laneIndex !== null) {
        const tint = story.lanes[laneIndex][1];
        span.className = 'actor hl';
        span.style.background = pastel(tint);
        span.style.color = ink(tint);
      }
      if (step) span.className = 'act hl';
      textRoot.appendChild(span);
    }
    caret.classList.add('off');
    $('#demo-summary').textContent = summaryOf(story);
    $('#demo-proposal').className = 'as-proposal on applied';
    $('#demo-done').className = 'as-done on';
  };

  const summaryOf = (story) => {
    const gateways = story.steps.filter((step) => !['task', 'start', 'end'].includes(step[3])).length;
    return T.words[story.lang].summary(story.lanes.length, story.steps.length, gateways);
  };

  const press = async (element, token) => {
    element.classList.add('press');
    await wait(160, token);
    element.classList.remove('press');
  };

  const playStory = async (index) => {
    if (reduced) { showFinal(index); return; }
    demo.token += 1;
    const token = demo.token;
    demo.index = index;
    demo.elapsed = 0;
    const story = storiesFor(lang)[index];
    const characters = story.text.reduce((sum, [text]) => sum + text.length, 0);
    demo.total = characters / 46 * 1000 + 1800 + 1100 + story.steps.length * 300 + 1500 + 4200;
    selectTab(index);
    try {
      await new Promise((resolve) => {
        const fade = mapRoot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' });
        fade.onfinish = resolve;
        fade.oncancel = resolve;
      });
      resetPanel(story);
      mapRoot.parentElement.scrollLeft = 0;
      const map = drawMap(mapRoot, story, false);
      mapRoot.getAnimations().forEach((animation) => animation.cancel());
      field.classList.add('focus');
      await wait(400, token);
      await typeStory(story, token);
      await wait(450, token);
      await press($('#demo-send'), token);
      field.classList.remove('focus');
      caret.classList.add('off');
      $('#demo-work').className = 'as-work on';
      $('#demo-mark').className = 'as-mark busy';
      $('#demo-ai-button').classList.add('on');
      await wait(1300, token);
      $('#demo-work').className = 'as-work';

      // The actors fly to their lanes
      const flights = [];
      const actors = $$('.actor', textRoot);
      for (const lane of map.lanes) show(lane.group, 400);
      for (const span of actors) {
        const lane = map.lanes[Number(span.dataset.lane)];
        flights.push(fly(span, lane.nameElement).then(() => show(lane.label, 250)));
        await wait(170, token);
      }
      await Promise.all(flights);
      if (token !== demo.token) throw CANCEL;

      // The steps appear in reading order, their links drawn as soon as both ends are there
      const shown = new Set();
      const canvas = mapRoot.parentElement;
      for (const [id] of story.steps) {
        const step = map.steps.get(id);
        if (canvas.scrollWidth > canvas.clientWidth + 1) {
          // On a phone the map is wider than its frame: it follows the steps as they appear
          const box = step.pop.getBoundingClientRect();
          const frame = canvas.getBoundingClientRect();
          canvas.scrollTo({ left: canvas.scrollLeft + box.left + box.width / 2 - frame.left - canvas.clientWidth / 2, behavior: 'smooth' });
        }
        step.pop.animate([{ opacity: 0, transform: 'scale(.55)' }, { opacity: 1, transform: 'scale(1)' }],
          { duration: 520, easing: 'cubic-bezier(.34, 1.56, .64, 1)', fill: 'forwards' });
        shown.add(id);
        const phrase = $(`.act[data-step="${id}"]`, textRoot);
        if (phrase) phrase.classList.add('hl');
        for (const edge of map.edges) {
          if (edge.drawn || !shown.has(edge.from) || !shown.has(edge.to)) continue;
          edge.drawn = true;
          edge.group.style.opacity = '1';
          const length = edge.path.getTotalLength();
          edge.path.style.strokeDasharray = `${length}`;
          edge.path.style.strokeDashoffset = `${length}`;
          const draw = edge.path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 420, easing: 'ease-out', fill: 'forwards' });
          draw.onfinish = () => { edge.path.style.strokeDasharray = ''; edge.path.style.strokeDashoffset = ''; draw.cancel(); edge.path.setAttribute('marker-end', 'url(#demo-arrow)'); };
        }
        await wait(300, token);
      }

      // The proposal, then "Apply": the preview becomes the map
      $('#demo-summary').textContent = summaryOf(story);
      $('#demo-proposal').className = 'as-proposal on';
      $('#demo-mark').className = 'as-mark';
      await wait(1300, token);
      await press($('#demo-apply'), token);
      for (const [id] of story.steps) {
        map.steps.get(id).outer.classList.remove('preview');
        await wait(45, token);
      }
      $('#demo-proposal').className = 'as-proposal on applied';
      $('#demo-done').className = 'as-done on';
      $('#demo-ai-button').classList.remove('on');
      await wait(4200, token);
      playStory((index + 1) % tabs.length);
    } catch (error) {
      if (error !== CANCEL) throw error;
    }
  };

  tabs.forEach((tab, index) => tab.addEventListener('click', () => { demo.started = true; playStory(index); }));
  new IntersectionObserver(([entry]) => {
    demo.paused = !entry.isIntersecting;
    if (entry.isIntersecting && !demo.started) { demo.started = true; playStory(0); }
  }, { threshold: .25 }).observe(stage);
  languageListeners.push(() => { if (demo.started) playStory(demo.index); });

  /* ---------------------------------------------------------------- the map to try */

  const playground = $('#playground');
  const PW = 560;
  const PH = 420;
  const PHEAD = 110;
  const SW = 96;
  const SH = 50;
  const lanesTint = [5, 2, 3];
  const pg = { steps: [], edges: [], laneLabels: [], hotLane: null, auto: true, dragging: null, stepLabels: [], hint: null };
  const laneOf = (y) => Math.max(0, Math.min(2, Math.floor(y / (PH / 3))));
  const laneCenter = (lane) => lane * (PH / 3) + PH / 6;

  const playgroundRoute = (a, b) => {
    if (b.x - a.x >= SW + 12) {
      const x1 = a.x + SW / 2; const x2 = b.x - SW / 2;
      if (Math.abs(a.y - b.y) < 1) return [[x1, a.y], [x2, b.y]];
      const mx = (x1 + x2) / 2;
      return [[x1, a.y], [mx, a.y], [mx, b.y], [x2, b.y]];
    }
    if (Math.abs(b.y - a.y) >= SH + 16) {
      const down = b.y > a.y;
      const y1 = a.y + (down ? SH / 2 : -SH / 2); const y2 = b.y + (down ? -SH / 2 : SH / 2);
      const my = (y1 + y2) / 2;
      if (Math.abs(a.x - b.x) < 1) return [[a.x, y1], [b.x, y2]];
      return [[a.x, y1], [a.x, my], [b.x, my], [b.x, y2]];
    }
    const x1 = a.x + SW / 2; const x2 = b.x - SW / 2;
    return [[x1, a.y], [x2, b.y]];
  };

  const drawPlayground = () => {
    playground.replaceChildren();
    const defs = svg('defs', {}, playground);
    const marker = svg('marker', { id: 'pg-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '8', markerHeight: '8',
      markerUnits: 'userSpaceOnUse', orient: 'auto' }, defs);
    svg('path', { d: 'M0 1L9 5L0 9z', class: 'arrow' }, marker);
    const lanesLayer = svg('g', {}, playground);
    pg.hotLane = svg('rect', { x: PHEAD, y: 0, width: PW - PHEAD, height: PH / 3, class: 'pg-lane-hot', opacity: 0 }, lanesLayer);
    const words = T.words[lang].playground;
    pg.laneLabels = lanesTint.map((tint, index) => {
      const top = index * (PH / 3);
      svg('rect', { x: 0, y: top, width: PW, height: PH / 3, class: `lane-bg${index % 2 ? ' even' : ''}` }, lanesLayer);
      svg('line', { x1: 0, x2: PW, y1: top + PH / 3, y2: top + PH / 3, class: 'lane-line' }, lanesLayer);
      svg('rect', { x: 0, y: top, width: PHEAD, height: PH / 3, fill: pastel(tint) }, lanesLayer);
      svg('rect', { x: PHEAD - 3, y: top, width: 3, height: PH / 3, fill: ink(tint) }, lanesLayer);
      const name = svg('text', { x: 14, y: top + PH / 6 - 2, class: 'lane-name', fill: ink(tint) }, lanesLayer);
      name.textContent = words.lanes[index];
      const code = svg('text', { x: 14, y: top + PH / 6 + 14, class: 'lane-code', fill: ink(tint) }, lanesLayer);
      code.textContent = `${words.code}-C0${index + 1}`;
      return name;
    });
    lanesLayer.appendChild(pg.hotLane);
    const edgesLayer = svg('g', {}, playground);
    const stepsLayer = svg('g', {}, playground);
    const start = [[166, 0], [278, 1], [390, 2], [502, 0]];
    pg.steps = start.map(([x, lane], index) => {
      const step = { x, y: laneCenter(lane), lane };
      step.group = svg('g', { class: 'pg-step step', tabindex: '0' }, stepsLayer);
      const inner = svg('g', { class: 'step-shadow' }, step.group);
      svg('rect', { x: -SW / 2, y: -SH / 2, width: SW, height: SH, rx: 10, class: 'step-box' }, inner);
      step.accent = svg('rect', { x: -SW / 2, y: -SH / 2 + 9, width: 3, height: SH - 18, rx: 1.5, fill: ink(lanesTint[lane]) }, inner);
      step.code = svg('text', { x: 0, y: -SH / 2 + 14, 'text-anchor': 'middle', class: 'step-code', fill: ink(lanesTint[lane]) }, inner);
      step.code.textContent = `${words.code}-E00${index + 1}`;
      const lines = wrap(words.steps[index], Math.floor((SW - 10) / 5.9));
      lines.forEach((line, lineIndex) => {
        const text = svg('text', { x: 0, y: -SH / 2 + 28 + (lines.length === 1 ? 4 : 0) + lineIndex * 12.5, 'text-anchor': 'middle', class: 'step-label' }, inner);
        text.textContent = line;
      });
      return step;
    });
    pg.edges = [[0, 1], [1, 2], [2, 3]].map(([a, b]) => ({ a, b, path: svg('path', { class: 'edge', 'marker-end': 'url(#pg-arrow)' }, edgesLayer) }));
    pg.hint = svg('g', { opacity: 0 }, playground);
    const hintBox = svg('rect', { x: -38, y: -14, width: 76, height: 22, rx: 11, fill: '#fff', stroke: '#DAD3F6' }, pg.hint);
    const hintText = svg('text', { x: 0, y: 1, 'text-anchor': 'middle', class: 'pg-hint' }, pg.hint);
    hintText.textContent = words.hint;
    hintBox.setAttribute('width', String(Math.max(70, words.hint.length * 7 + 20)));
    hintBox.setAttribute('x', String(-Math.max(70, words.hint.length * 7 + 20) / 2));
    pg.cursor = svg('path', { d: 'M0 0L0 17L4.6 12.6L7.6 19.4L10.4 18.2L7.5 11.6L13.6 11.4Z', fill: '#1D1D1F', stroke: '#fff', 'stroke-width': 1.3,
      class: 'pg-cursor', opacity: 0 }, playground);
    layoutPlayground();
  };

  const layoutPlayground = () => {
    for (const step of pg.steps) step.group.setAttribute('transform', `translate(${step.x} ${step.y})`);
    for (const edge of pg.edges) edge.path.setAttribute('d', roundedPath(playgroundRoute(pg.steps[edge.a], pg.steps[edge.b])));
  };

  const setLane = (step, lane) => {
    if (lane === step.lane) return;
    step.lane = lane;
    step.accent.setAttribute('fill', ink(lanesTint[lane]));
    step.code.setAttribute('fill', ink(lanesTint[lane]));
  };

  const moveStep = (step, x, y) => {
    step.x = Math.max(PHEAD + SW / 2 + 8, Math.min(PW - SW / 2 - 6, x));
    step.y = Math.max(SH / 2 + 4, Math.min(PH - SH / 2 - 4, y));
    const lane = laneOf(step.y);
    pg.hotLane.setAttribute('y', String(lane * (PH / 3)));
    setLane(step, lane);
    layoutPlayground();
  };

  const snap = async (step) => {
    const from = step.y;
    const to = laneCenter(laneOf(step.y));
    pg.hotLane.setAttribute('opacity', '0');
    await tween(220, (p) => { step.y = from + (to - from) * p; layoutPlayground(); }, easeOut);
  };

  const toSvg = (event) => {
    const point = playground.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(playground.getScreenCTM().inverse());
  };

  playground.addEventListener('pointerdown', (event) => {
    const group = event.target.closest('.pg-step');
    if (!group) return;
    pg.auto = false;
    const step = pg.steps.find((candidate) => candidate.group === group);
    const point = toSvg(event);
    pg.dragging = { step, dx: point.x - step.x, dy: point.y - step.y };
    group.classList.add('dragging');
    group.parentNode.appendChild(group);
    pg.hotLane.setAttribute('opacity', '1');
    playground.setPointerCapture(event.pointerId);
    pg.hint.setAttribute('opacity', '0');
  });
  playground.addEventListener('pointermove', (event) => {
    if (!pg.dragging) return;
    const point = toSvg(event);
    moveStep(pg.dragging.step, point.x - pg.dragging.dx, point.y - pg.dragging.dy);
  });
  const release = () => {
    if (!pg.dragging) return;
    const { step } = pg.dragging;
    step.group.classList.remove('dragging');
    pg.dragging = null;
    snap(step);
  };
  playground.addEventListener('pointerup', release);
  playground.addEventListener('pointercancel', release);
  playground.addEventListener('keydown', (event) => {
    const step = pg.steps.find((candidate) => candidate.group === document.activeElement);
    if (!step) return;
    const moves = { ArrowUp: [0, -PH / 3], ArrowDown: [0, PH / 3], ArrowLeft: [-24, 0], ArrowRight: [24, 0] };
    if (!moves[event.key]) return;
    event.preventDefault();
    pg.auto = false;
    moveStep(step, step.x + moves[event.key][0], laneCenter(laneOf(step.y + moves[event.key][1])));
  });

  /** Once, when the card comes into view: a cursor shows the gesture. */
  const showGesture = async () => {
    if (reduced || !pg.auto) return;
    const step = pg.steps[1];
    const cursor = pg.cursor;
    const place = (x, y) => cursor.setAttribute('transform', `translate(${x} ${y})`);
    let cx = step.x + 70; let cy = step.y + 60;
    place(cx, cy);
    cursor.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' });
    await tween(600, (p) => place(cx + (step.x + 8 - cx) * p, cy + (step.y + 4 - cy) * p));
    if (!pg.auto) { cursor.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }); return; }
    step.group.classList.add('dragging');
    pg.hotLane.setAttribute('opacity', '1');
    const path = async (toX, toY, duration) => {
      const fromX = step.x; const fromY = step.y;
      await tween(duration, (p) => {
        if (!pg.auto) return;
        moveStep(step, fromX + (toX - fromX) * p, fromY + (toY - fromY) * p);
        place(step.x + 8, step.y + 4);
      });
    };
    await path(step.x + 10, laneCenter(2) + 6, 900);
    step.group.classList.remove('dragging');
    await snap(step);
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (pg.auto) {
      step.group.classList.add('dragging');
      pg.hotLane.setAttribute('opacity', '1');
      await path(step.x - 10, laneCenter(1) - 4, 800);
      step.group.classList.remove('dragging');
      await snap(step);
    }
    cursor.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
    if (pg.auto) {
      pg.hint.setAttribute('transform', `translate(${step.x} ${step.y - SH / 2 - 16})`);
      pg.hint.animate([{ opacity: 0, transform: `translate(${step.x}px, ${step.y - SH / 2 - 10}px)` }, { opacity: 1, transform: `translate(${step.x}px, ${step.y - SH / 2 - 16}px)` }],
        { duration: 400, easing: 'ease-out', fill: 'forwards' });
    }
  };

  drawPlayground();
  languageListeners.push(drawPlayground);
  new IntersectionObserver(([entry], observer) => {
    if (!entry.isIntersecting) return;
    observer.disconnect();
    setTimeout(showGesture, 500);
  }, { threshold: .6 }).observe(playground);

  /* ---------------------------------------------------------------- the small animations of the cards */

  const typed = $('#prompt-typed');
  let promptToken = 0;
  const typePrompts = async () => {
    promptToken += 1;
    const token = promptToken;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let index = 0;
    while (token === promptToken) {
      const prompt = T.words[lang].prompts[index % T.words[lang].prompts.length];
      if (reduced) { typed.textContent = prompt; return; }
      for (let i = 1; i <= prompt.length && token === promptToken; i += 1) { typed.textContent = prompt.slice(0, i); await sleep(34); }
      await sleep(2000);
      for (let i = prompt.length; i >= 0 && token === promptToken; i -= 2) { typed.textContent = prompt.slice(0, i); await sleep(12); }
      await sleep(350);
      index += 1;
    }
  };
  languageListeners.push(typePrompts);

  const langCode = $('#lang-code');
  const langWord = $('#lang-word');
  let languageIndex = 0;
  setInterval(() => {
    if (reduced || document.hidden) return;
    languageIndex = (languageIndex + 1) % T.languages.length;
    const [code, word] = T.languages[languageIndex];
    langCode.textContent = code;
    langWord.textContent = word;
    langWord.classList.remove('swap');
    void langWord.offsetWidth;
    langWord.classList.add('swap');
  }, 1700);

  $$('.raci i').forEach((cell, index) => cell.style.setProperty('--d', String(index * 45)));
  const nest = $('.nest');
  setInterval(() => { if (!reduced) nest.classList.toggle('on'); }, 2600);

  for (const card of $$('.card')) {
    card.addEventListener('pointermove', (event) => {
      const box = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - box.left}px`);
      card.style.setProperty('--my', `${event.clientY - box.top}px`);
    });
  }

  /* ---------------------------------------------------------------- reveals and counters */

  const count = (element) => {
    const target = Number(element.dataset.count);
    const from = target === 0 ? 12 : 0;
    if (reduced) { element.textContent = String(target); return; }
    tween(1500, (p) => { element.textContent = String(Math.round(from + (target - from) * p)); }, easeOut);
  };
  const revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      revealObserver.unobserve(entry.target);
      const number = $('.num', entry.target);
      if (number) count(number);
    }
  }, { threshold: .15, rootMargin: '0px 0px -8% 0px' });
  $$('.reveal').forEach((element) => revealObserver.observe(element));

  if (!CSS.supports('animation-timeline: scroll()')) {
    const nav = $('#nav');
    const onScroll = () => nav.classList.toggle('scrolled', scrollY > 40);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------------------------------------------------------------- the aurora (WebGL) */

  const PALETTES = {
    light: { base: '#FBFBFC', colors: ['#E5E0F8', '#D9E9FA', '#F9DCE6', '#C9BFF6'], strength: .95 },
    dark: { base: '#0B0B17', colors: ['#2A2470', '#4A2A7A', '#1D3A6E', '#6B5BE0'], strength: .9 }
  };
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const FRAGMENT = `precision mediump float;
uniform vec2 u_res; uniform float u_t; uniform vec3 u_base; uniform vec3 u_c1; uniform vec3 u_c2; uniform vec3 u_c3; uniform vec3 u_c4; uniform float u_k;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = uv * vec2(u_res.x / u_res.y, 1.0) * 1.35;
  float t = u_t * 0.045;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, -t)));
  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t), fbm(p + 3.0 * q + vec2(8.3, 2.8) - t));
  float f = fbm(p + 2.5 * r);
  vec3 col = u_base;
  col = mix(col, u_c1, smoothstep(0.35, 0.75, f) * u_k);
  col = mix(col, u_c2, smoothstep(0.45, 0.9, q.x) * u_k);
  col = mix(col, u_c3, smoothstep(0.5, 0.95, r.y) * u_k);
  col = mix(col, u_c4, smoothstep(0.62, 1.0, f * 1.15) * u_k * 0.85);
  gl_FragColor = vec4(col, 1.0);
}`;

  const aurora = (canvas) => {
    const palette = PALETTES[canvas.dataset.palette];
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    const fallback = () => {
      const [c1, c2, c3] = palette.colors;
      canvas.style.background = `radial-gradient(60% 50% at 25% 30%, ${c1}, transparent 70%), radial-gradient(50% 50% at 75% 20%, ${c3}, transparent 70%), radial-gradient(60% 60% at 60% 60%, ${c2}, transparent 70%), ${palette.base}`;
    };
    if (!gl) { fallback(); return; }
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
    };
    const vertex = compile(gl.VERTEX_SHADER, 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }');
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vertex || !fragment) { fallback(); return; }
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { fallback(); return; }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, 'a');
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    const uniform = (name) => gl.getUniformLocation(program, name);
    gl.uniform3fv(uniform('u_base'), rgb(palette.base));
    palette.colors.forEach((color, index) => gl.uniform3fv(uniform(`u_c${index + 1}`), rgb(color)));
    gl.uniform1f(uniform('u_k'), palette.strength);
    const resolution = uniform('u_res');
    const time = uniform('u_t');
    const resize = () => {
      const scale = .35;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(resolution, canvas.width, canvas.height);
    };
    const render = (seconds) => { gl.uniform1f(time, seconds); gl.drawArrays(gl.TRIANGLES, 0, 6); };
    resize();
    addEventListener('resize', () => { resize(); render(performance.now() / 1000 + 20); });
    if (reduced) { render(20); return; }
    let visible = false;
    let last = 0;
    const frame = (now) => {
      if (!visible) return;
      if (now - last > 33) { last = now; render(now / 1000 + 20); }
      requestAnimationFrame(frame);
    };
    new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = entry.isIntersecting;
      if (visible && !was) requestAnimationFrame(frame);
    }).observe(canvas);
  };
  $$('canvas.aurora').forEach(aurora);

  /* ---------------------------------------------------------------- start */

  applyLanguage(lang);
})();
