# topogenia.com

**Français** · [English](#english)

La vitrine de [Topogenia](https://topogenia.com) : du récit aux diagrammes.

Site statique (HTML, CSS, JavaScript) publié par GitHub Pages : aucune bibliothèque, aucun cookie, aucune ressource
chargée d'un tiers. Une seule étape de construction : la page anglaise `en/index.html` est fabriquée par
`node outils/page-en.cjs` à partir de `index.html` et `assets/i18n.js` ; la relancer après toute modification de l'un
des deux.

## Aperçu local

Servir le dossier par un serveur statique (en `file://`, le navigateur bloque les polices), par exemple
`python -m http.server 4173`, puis ouvrir `http://localhost:4173/`.

## Contenu

- `index.html` : la page, en français ; l'anglais et les récits de la démonstration sont dans `assets/i18n.js`.
- `en/index.html` : la page anglaise, fabriquée (ne pas la modifier à la main) ; les deux pages sont reliées par des
  liens `hreflang`.
- `logiciel-diagramme-couloirs-gratuit-hors-ligne/index.html` et `en/free-swimlane-diagram-software-offline/index.html` :
  la page qui répond à une recherche, dans chaque langue ; écrites à la main, reliées par des liens `hreflang`.
- `robots.txt`, `sitemap.xml` : pour les moteurs de recherche.
- `mentions-legales.html` : mentions légales et confidentialité, en français et en anglais.
- `assets/site.css`, `assets/site.js`, `assets/legal.js` : styles et comportements.
- `assets/fonts/` : police Inter, sous licence SIL Open Font License 1.1.
- `og-image.png` : image de partage (1200 x 630).

## Droits

© 2026 Peter Barcauti. Textes, illustrations et code de ce site : tous droits réservés. La police Inter est distribuée
sous SIL Open Font License 1.1 (`assets/fonts/Inter-OFL-1.1.txt`). Contact : Peter.Barcauti@topogenia.com.

---

## English

The showcase of [Topogenia](https://topogenia.com): from story to diagrams.

A static site (HTML, CSS, JavaScript) published by GitHub Pages: no library, no cookie, nothing loaded from third
parties. One build step: the English page `en/index.html` is made by `node outils/page-en.cjs` from `index.html` and
`assets/i18n.js`; run it again after changing either of them.

**Local preview**: serve the folder with a static server (browsers block the fonts over `file://`), for example
`python -m http.server 4173`, then open `http://localhost:4173/`.

**Rights**: © 2026 Peter Barcauti. Texts, illustrations and code of this site: all rights reserved. The Inter typeface
is distributed under the SIL Open Font License 1.1 (`assets/fonts/Inter-OFL-1.1.txt`). Contact:
Peter.Barcauti@topogenia.com.
