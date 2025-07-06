// content-script.js

// 1) Inject bootstrap.js into the PAGE (so it runs in the page’s context)
const tag = document.createElement('script');
tag.src = chrome.runtime.getURL('bootstrap.js');
tag.onload = () => tag.remove();  // optional cleanup
(document.head||document.documentElement).appendChild(tag);

// 2) Wait for OpenCV to finish initializing
window.addEventListener('opencv-loaded', async () => {
  console.log('🚀 opencv-loaded event fired; cv →', !!window.cv);

  // 3) Load your Haar cascade into the in-memory FS
  const xmlUrl = chrome.runtime.getURL('opencv/haarcascade_frontalface_default.xml');
  const resp   = await fetch(xmlUrl);
  const buf    = await resp.arrayBuffer();
  cv.FS_createDataFile(
    '/', 'haarcascade_frontalface_default.xml',
    new Uint8Array(buf), true, /*readable*/ false, /*writable*/ false /*owning*/
  );
  console.log('✅ Haar cascade loaded');

  // 4) Now kick off your face-swap logic
  startObservingImages();
});

// 5) All of your hasFace(), addSwapButton(), observers, etc. go here:
function startObservingImages() { /* …your existing code… */ }
