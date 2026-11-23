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
- `mentions-legales.html` : mentions légales et confidentialité du site, en français et en anglais.
- `confidentialite.html` : politique de confidentialité de l'application, en français et en anglais.
- `modeles/` et `en/templates/` : la galerie de modèles (une page par domaine, les `.pmap`, les collections `.pmaps`,
  `sha256.txt`, les images), 16 domaines, fabriquée à partir des modèles par **une seule commande** :
  `node outils/galerie-tout.cjs <dossier des modèles> <dossier des images> [--sans-image]` (elle enchaîne
  `galerie.cjs fichiers`, `galerie.cjs pages` puis `blog.cjs` pour `llms.txt` et `sitemap.xml`) ; `--sans-image` montre
  sans figure un modèle dont l'image n'est pas encore prise (la liste est affichée), à retirer pour la publication.
  Textes dans `outils/galerie-domaines.json` et `outils/galerie-mode-d-emploi.json` ; ne pas modifier à la main.
- `versions/` et `en/versions/` : la page des versions et son flux Atom, fabriqués par `node outils/versions.cjs` à partir de
  `outils/versions.json` (`--brouillon` tant que les dates et empreintes de la version à venir sont vides). La même commande met l'accueil à la dernière version de ce fichier (numéro, bouton, lien de l'empreinte, bandeau) puis relance `page-en.cjs` ; un ZIP du serveur n'est proposé que si `versions.json` en liste un (clé `server`, absente tant qu'aucun n'est fabriqué). La ligne de licence de la galerie se remplit par un seul réglage : `"licence": "CC0 1.0"` dans `outils/galerie-domaines.json`, puis `galerie-tout.cjs`.
- `blog/` et `en/blog/` : le blog, fabriqué par `node outils/blog.cjs` à partir de `outils/articles/` ; la même commande
  écrit `llms.txt`, dont les liens de la galerie et des versions sont dans `outils/llms-liens.json` (une seule fois).
  **Le blog est exclu de la 3.4** (`"blog": false` dans `outils/reglages-site.json` : ni pages, ni adresses dans `llms.txt`
  et `sitemap.xml`) ; pour le réactiver, mettre `true` et relancer `node outils/blog.cjs`.
- `outils/*.test.cjs` : les essais des générateurs, `node --test outils/*.test.cjs`.
- `assets/site.css`, `assets/site.js`, `assets/legal.js`, `assets/galerie.*`, `assets/versions.*`, `assets/blog.css` : styles
  et comportements.
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

**Contents, added with the template gallery**: `modeles/` and `en/templates/` (the gallery: pages, `.pmap` files, `.pmaps`
collections, `sha256.txt`, images), 16 domains, all rebuilt from the models by one command,
`node outils/galerie-tout.cjs <models folder> <images folder> [--sans-image]` (it runs `galerie.cjs fichiers`, `galerie.cjs pages`, then
`blog.cjs` for `llms.txt` and `sitemap.xml`; `--sans-image` shows a model without figure while its image is not taken yet, to drop at publication); `versions/` and `en/versions/` (the versions page and its Atom feed), made by
`node outils/versions.cjs` from `outils/versions.json` (it also stamps the home page with the latest version, then runs `page-en.cjs`; the server ZIP is offered only when `versions.json` lists one; the gallery licence line is filled by one setting, `"licence": "CC0 1.0"` in `outils/galerie-domaines.json`); `blog/` and `en/blog/`, made by `node outils/blog.cjs` (the blog is left out of 3.4: `"blog": false` in `outils/reglages-site.json`, set `true` and run it again to bring it back), which also
writes `llms.txt` (the gallery and versions links live once in `outils/llms-liens.json`). Do not edit generated pages by
hand. Tests: `node --test outils/*.test.cjs`.

**Rights**: © 2026 Peter Barcauti. Texts, illustrations and code of this site: all rights reserved. The Inter typeface
is distributed under the SIL Open Font License 1.1 (`assets/fonts/Inter-OFL-1.1.txt`). Contact:
Peter.Barcauti@topogenia.com.
