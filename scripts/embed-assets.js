#!/usr/bin/env node
'use strict';
// Keep the preview document self-contained without maintaining duplicate code by hand.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const escapeClosingTag = (text, tag) => text.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);
function embedAssets(html) {
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  const calculations = fs.readFileSync(path.join(root, 'calculations.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const styles = `<!-- BEGIN EMBEDDED STYLES -->\n<style>\n${escapeClosingTag(css, 'style')}\n</style>\n<!-- END EMBEDDED STYLES -->`;
  const scripts = `<!-- BEGIN EMBEDDED SCRIPTS -->\n<script>\n${escapeClosingTag(calculations, 'script')}\n</script>\n<script>\n${escapeClosingTag(app, 'script')}\n</script>\n<!-- END EMBEDDED SCRIPTS -->`;
  if (!html.includes('<!-- BEGIN EMBEDDED STYLES -->') || !html.includes('<!-- BEGIN EMBEDDED SCRIPTS -->')) {
    throw new Error('Missing embedded asset markers in index.html');
  }
  return html.replace(/<!-- BEGIN EMBEDDED STYLES -->[\s\S]*?<!-- END EMBEDDED STYLES -->/, () => styles)
    .replace(/<!-- BEGIN EMBEDDED SCRIPTS -->[\s\S]*?<!-- END EMBEDDED SCRIPTS -->/, () => scripts);
}
if (require.main === module) {
  const file = path.join(root, 'index.html');
  const original = fs.readFileSync(file, 'utf8');
  const updated = embedAssets(original);
  if (process.argv.includes('--check')) {
    if (updated !== original) {
      console.error('Embedded assets are stale. Run: node scripts/embed-assets.js');
      process.exitCode = 1;
    } else console.log('Embedded preview assets are up to date.');
  } else {
    fs.writeFileSync(file, updated);
    console.log('Updated index.html with embedded CSS and JavaScript.');
  }
}
module.exports = { embedAssets };
