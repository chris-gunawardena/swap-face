// content-script.js
const tag = document.createElement('script');
tag.src = chrome.runtime.getURL('bootstrap.js');
document.head.appendChild(tag);

window.addEventListener('opencv-loaded', async () => {
  console.log('🚀 OpenCV initialized; cv=', !!window.cv);

  // load Haar cascade once
  const xmlUrl = chrome.runtime.getURL('opencv/haarcascade_frontalface_default.xml');
  const resp   = await fetch(xmlUrl);
  const buf    = await resp.arrayBuffer();
  cv.FS_createDataFile('/', 'haarcascade_frontalface_default.xml',
                      new Uint8Array(buf), true, false, false);
  console.log('✅ Haar cascade loaded');

  // now run all your hasFace(), addSwapButton(), observers…
  startObservingImages();
});
