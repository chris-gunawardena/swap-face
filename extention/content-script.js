// ==UserScript==
// @name         Face Swap Content Script
// @match        *://*/*
// @grant        none
// ==/UserScript==

(async function() {
  // -- Setup injected CSS
  const style = document.createElement('style');
  style.textContent = `
    .swap-container { position: relative; display: inline-block; }
    .swap-overlay {
      position: absolute; bottom: 4px; right: 4px;
      background: rgba(0,0,0,0.6); border: none;
      padding: 4px; border-radius: 4px;
      cursor: pointer; z-index: 9999;
    }
    .swap-progress {
      position: absolute; bottom: 0; left: 0;
      height: 3px; background: #00acee; width: 0;
      z-index: 9999;
    }
  `;
  document.head.appendChild(style);

  // -- Helpers --
  const detectedFaces = new WeakSet();
  const overlayAdded  = new WeakSet();

  function ensureContainer(img) {
    if (img.parentElement.classList.contains('swap-container')) {
      return img.parentElement;
    }
    const wrap = document.createElement('div');
    wrap.classList.add('swap-container');
    img.replaceWith(wrap);
    wrap.appendChild(img);
    return wrap;
  }

  function estimateSwapTime(img) {
    const mp = (img.naturalWidth * img.naturalHeight) / (1024*1024);
    return Math.min(Math.max(mp * 500, 1000), 5000);
  }

  async function getUserFaceUrl() {
    const data = await chrome.storage.local.get('faceUrl');
    return data.faceUrl;
  }

  // overlay + progress UI + swap call
  function addSwapButton(img) {
    if (overlayAdded.has(img)) return;
    overlayAdded.add(img);
    const container = ensureContainer(img);
    const btn = document.createElement('button');
    btn.className = 'swap-overlay';
    btn.innerHTML = `<img src="${chrome.runtime.getURL('assets/swap-icon.svg')}" width=16 height=16/>`;
    container.appendChild(btn);

    btn.addEventListener('click', async () => {
      btn.remove();
      const bar = document.createElement('div');
      bar.className = 'swap-progress';
      container.appendChild(bar);
      const duration = estimateSwapTime(img);
      requestAnimationFrame(() => {
        bar.style.transition = `width ${duration}ms linear`;
        bar.style.width = '100%';
      });
      try {
        const userFaceUrl = await getUserFaceUrl();
        const res = await fetch('https://<your-function-url>', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: img.src,
            userFaceUrl
          })
        });
        if (!res.ok) throw new Error(res.statusText);
        const blob = await res.blob();
        img.src = URL.createObjectURL(blob);
      } catch (e) {
        console.error('Swap failed', e);
      } finally {
        bar.remove();
        container.appendChild(btn);
      }
    });
  }

  // face detection via face-api.js
  let faceApiLoaded = false;
  async function hasFace(img) {
    if (!img.complete || img.naturalWidth === 0) {
      await new Promise((r, e) => {
        img.addEventListener('load', r, { once: true });
        img.addEventListener('error', e, { once: true });
      });
    }
    if (!faceApiLoaded) {
      const modelPath = chrome.runtime.getURL('face-api/weights');
      await faceapi.nets.tinyFaceDetector.loadFromUri(modelPath);
      faceApiLoaded = true;
    }
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
    return (await faceapi.detectSingleFace(img, opts)) != null;
  }

  // process when visible
  const io = new IntersectionObserver(entries => {
    for (let { target, isIntersecting } of entries) {
      if (isIntersecting) {
        if (!detectedFaces.has(target)) {
          hasFace(target).then(found => {
            if (found) {
              detectedFaces.add(target);
              addSwapButton(target);
            }
          });
        }
      }
    }
  }, { threshold: 0.1 });

  function observeImage(img) {
    if (img.src) io.observe(img);
  }

  // watch for new images & src changes
  const mo = new MutationObserver(muts => {
    for (let m of muts) {
      if (m.type === 'childList') {
        m.addedNodes.forEach(n => {
          if (n.tagName === 'IMG') observeImage(n);
          else if (n.querySelectorAll) n.querySelectorAll('img').forEach(observeImage);
        });
      }
      if (m.type === 'attributes' && m.attributeName === 'src' && m.target.tagName === 'IMG') {
        observeImage(m.target);
      }
    }
  });
  mo.observe(document.body, {
    childList: true, subtree: true,
    attributes: true, attributeFilter: ['src']
  });

  window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('img').forEach(observeImage);
  });
})();
