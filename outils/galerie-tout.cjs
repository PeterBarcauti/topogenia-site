// galerie-tout.cjs
// The single command that rebuilds the whole gallery from the models: the .pmap, the .pmaps of each domain and the sha256.txt (galerie.cjs fichiers), the pages in French and in English, the images and the gallery entries of sitemap.xml (galerie.cjs pages), then llms.txt and sitemap.xml with the blog left out or in as set in outils/reglages-site.json (blog.cjs). Usage, from the site root: node outils/galerie-tout.cjs <folder of the models> <folder of the images> [--sans-image] ; --sans-image shows a model without image when its image is not taken yet (the missing ones are listed). Nothing is published.

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const flags = args.filter((arg) => arg.startsWith('--'));
const [models, images, ...rest] = args.filter((arg) => !arg.startsWith('--'));
if (!models || !images || rest.length > 0 || flags.some((flag) => flag !== '--sans-image')) {
  console.error('usage : node outils/galerie-tout.cjs <dossier des modèles> <dossier des images> [--sans-image]');
  process.exit(1);
}
const run = (script, ...scriptArgs) => {
  console.log(`> ${script} ${scriptArgs.join(' ')}`.trim());
  execFileSync(process.execPath, [path.join(__dirname, script), ...scriptArgs], { stdio: 'inherit' });
};
try {
  run('galerie.cjs', 'fichiers', path.resolve(models));
  run('galerie.cjs', 'pages', path.resolve(images), ...flags);
  run('blog.cjs');
} catch (error) {
  console.error('ERREUR : la chaîne s\'est arrêtée (voir le message ci-dessus)');
  process.exit(1);
}
