import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractLinkMetadataFromHtml,
  isSafePublicPreviewUrl,
} from './linkPreviewLogic';

test('isSafePublicPreviewUrl allows public https links and blocks private/SSRF targets', () => {
  assert.equal(isSafePublicPreviewUrl('https://example.com/article').valid, true);
  assert.equal(isSafePublicPreviewUrl('http://news.ycombinator.com/item?id=1').valid, true);

  assert.equal(isSafePublicPreviewUrl('http://localhost:3000/secret').valid, false);
  assert.equal(isSafePublicPreviewUrl('http://127.0.0.1/admin').valid, false);
  assert.equal(isSafePublicPreviewUrl('http://169.254.169.254/latest/meta-data').valid, false);
  assert.equal(isSafePublicPreviewUrl('http://10.0.0.5/internal').valid, false);
  assert.equal(isSafePublicPreviewUrl('http://192.168.1.1/router').valid, false);
  assert.equal(isSafePublicPreviewUrl('http://172.16.5.2/api').valid, false);
  assert.equal(isSafePublicPreviewUrl('http://[::1]/local').valid, false);
  assert.equal(isSafePublicPreviewUrl('javascript:alert(1)').valid, false);
  assert.equal(isSafePublicPreviewUrl('file:///etc/passwd').valid, false);
});

test('extractLinkMetadataFromHtml derives image, title, description, and handles relative URLs & entities', () => {
  const html = `
    <!doctype html>
    <html>
      <head>
        <title>Fallback Title</title>
        <meta content="Looma &amp; Studio Launch" property="og:title" />
        <meta name="description" content="Explore our architecture &amp; cameras guide." />
        <meta property="og:image" content="/assets/hero-banner.jpg" />
        <meta property="og:site_name" content="Looma Journal" />
      </head>
      <body>Hello</body>
    </html>
  `;
  const meta = extractLinkMetadataFromHtml(html, 'https://journal.example.com/posts/launch');
  assert.equal(meta.title, 'Looma & Studio Launch');
  assert.equal(meta.description, 'Explore our architecture & cameras guide.');
  assert.equal(meta.imageUrl, 'https://journal.example.com/assets/hero-banner.jpg');
  assert.equal(meta.videoUrl, '');
  assert.equal(meta.mediaKind, 'image');
  assert.equal(meta.siteName, 'Looma Journal');
});

test('extractLinkMetadataFromHtml derives video preview and YouTube embed cleanly when present', () => {
  const mp4Html = `
    <html><head>
      <meta property="og:title" content="Keynote Highlight" />
      <meta property="og:image" content="https://cdn.example.com/poster.jpg" />
      <meta property="og:video:secure_url" content="https://cdn.example.com/reel.mp4" />
    </head></html>
  `;
  const mp4Meta = extractLinkMetadataFromHtml(mp4Html, 'https://example.com/watch');
  assert.equal(mp4Meta.mediaKind, 'video');
  assert.equal(mp4Meta.videoUrl, 'https://cdn.example.com/reel.mp4');
  assert.equal(mp4Meta.imageUrl, 'https://cdn.example.com/poster.jpg');

  const ytOgHtml = `
    <html><head>
      <meta property="og:title" content="Demo Reel" />
      <meta property="og:video" content="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />
    </head></html>
  `;
  const ytMeta = extractLinkMetadataFromHtml(ytOgHtml, 'https://example.com/reel');
  assert.equal(ytMeta.mediaKind, 'video');
  assert.equal(ytMeta.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
});
