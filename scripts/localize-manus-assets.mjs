#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const publicRoot = path.join(projectRoot, 'public');
const assetRoot = path.join(publicRoot, 'assets', 'manus');
const defaultOrigin = 'https://sheabliss-dvmdn63o.manus.space';
const origin = (process.env.MANUS_ASSET_ORIGIN || defaultOrigin).replace(/\/$/, '');
const shouldRewrite = !process.argv.includes('--download-only');
const sourceFiles = [
  'index.html',
  'cookies.html',
  'src/main.js',
  'src/styles.css',
  'public/manus-routes.json',
];

const manuscriptPattern = /(?:https?:\/\/[^\s"'`()<>]+)?(\/manus-storage\/[A-Za-z0-9._~:/?#[\]@!$&+,;=%-]+)/g;
const extensionFor = (url, contentType = '') => {
  const pathname = new URL(url).pathname;
  const extension = path.extname(pathname).toLowerCase();
  if (/^\.[a-z0-9]{2,5}$/.test(extension)) return extension;
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('jpeg')) return '.jpg';
  if (contentType.includes('svg')) return '.svg';
  if (contentType.includes('avif')) return '.avif';
  return '.webp';
};

const readSourceFiles = async () => {
  const files = [];
  for (const relativePath of sourceFiles) {
    const absolutePath = path.join(projectRoot, relativePath);
    try {
      const content = await fs.readFile(absolutePath, 'utf8');
      files.push({ relativePath, absolutePath, content });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return files;
};

const collectReferences = (files) => {
  const references = new Map();
  for (const file of files) {
    for (const match of file.content.matchAll(manuscriptPattern)) {
      const reference = match[1];
      if (!references.has(reference)) references.set(reference, { reference, files: new Set() });
      references.get(reference).files.add(file.relativePath);
    }
  }
  return [...references.values()];
};

const remoteUrlFor = (reference) => reference.startsWith('http') ? reference : `${origin}${reference}`;

const downloadAsset = async (reference) => {
  const response = await fetch(remoteUrlFor(reference), { redirect: 'follow' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) throw new Error(`expected an image, received ${contentType || 'unknown content type'}`);
  const extension = extensionFor(remoteUrlFor(reference), contentType);
  const hash = Buffer.from(reference).toString('base64url').replace(/[^A-Za-z0-9_-]/g, '').slice(-48);
  const filename = `${hash}${extension}`;
  const relativePath = `/assets/manus/${filename}`;
  const absolutePath = path.join(projectRoot, 'public', relativePath.replace(/^\//, ''));
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, Buffer.from(await response.arrayBuffer()));
  return { reference, relativePath, absolutePath, bytes: (await fs.stat(absolutePath)).size };
};

const main = async () => {
  const files = await readSourceFiles();
  const references = collectReferences(files);
  if (!references.length) {
    console.log('No Manus Storage image references found.');
    return;
  }

  console.log(`Found ${references.length} unique Manus Storage reference(s). Origin: ${origin}`);
  const localized = new Map();
  for (const entry of references) {
    try {
      const result = await downloadAsset(entry.reference);
      localized.set(entry.reference, result.relativePath);
      console.log(`Downloaded ${entry.reference} -> ${result.relativePath} (${result.bytes} bytes)`);
    } catch (error) {
      console.error(`Could not download ${entry.reference}: ${error.message}`);
      process.exitCode = 1;
    }
  }

  if (!shouldRewrite || !localized.size) return;
  for (const file of files) {
    let updated = file.content;
    for (const [reference, localPath] of localized) {
      updated = updated.replaceAll(reference, localPath);
      const absoluteUrl = remoteUrlFor(reference);
      updated = updated.replaceAll(absoluteUrl, localPath);
    }
    if (updated !== file.content) {
      await fs.writeFile(file.absolutePath, updated);
      console.log(`Rewrote ${file.relativePath}`);
    }
  }
};

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
