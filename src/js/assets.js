const preload = (src, priority = 'low') => {
  const link = document.createElement('link');
  link.rel = 'preload'; link.as = 'image'; link.href = src; link.fetchPriority = priority;
  document.head.append(link);
};

function checkImage(src) {
  return new Promise((resolve) => {
    const image = new Image(); image.onload = () => resolve({ src, ok: true }); image.onerror = () => resolve({ src, ok: false }); image.src = src;
  });
}

const unavailable = new Set();
document.addEventListener('error', (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  unavailable.add(image.getAttribute('src'));
  replaceWithFallback(image);
}, true);

function replaceWithFallback(image) {
  if (image.dataset.fallbackShown === 'true') return;
  image.dataset.fallbackShown = 'true'; image.hidden = true;
  const fallback = document.createElement('span'); fallback.className = 'asset-fallback'; fallback.textContent = 'الصورة مش متاحة دلوقتي';
  image.insertAdjacentElement('afterend', fallback);
}

export function applyAssetFallbacks(root = document) {
  root.querySelectorAll('img').forEach((image) => {
    if ((unavailable.has(image.getAttribute('src')) || image.complete) && image.naturalWidth === 0) replaceWithFallback(image);
  });
}

export async function prepareAssets(manifest) {
  preload(manifest.logo, 'high');
  preload(manifest.heroDesktop, 'high');
  const results = await Promise.all([
    ...manifest.memories.map((item) => checkImage(item.file)),
    checkImage(manifest.logo), checkImage(manifest.heroDesktop), checkImage(manifest.heroMobile),
    checkImage(manifest.envelope), checkImage(manifest.songCover),
    ...manifest.songs.map((song) => checkImage(song.cover)),
  ]);
  for (const result of results) {
    if (result.ok) continue;
    unavailable.add(result.src);
  }
  applyAssetFallbacks();
  return results;
}
