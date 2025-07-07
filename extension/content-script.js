// content-script.js
(async () => {
  // 1) Grab OpenCV.js (single-file, base64 Wasm) and Haar XML
  const [opencvText, cascadeBuf] = await Promise.all([
    fetch(chrome.runtime.getURL('opencv/opencv.full.js')).then(r => r.text()),
    fetch(chrome.runtime.getURL('opencv/haarcascade_frontalface_default.xml'))
      .then(r => r.arrayBuffer())
  ]);
  const cascadeBytes = Array.from(new Uint8Array(cascadeBuf));

  // 2) Build the blob-worker source
  const workerSrc = `
    ${opencvText}

    (async () => {
      // Load cascade into FS
      const data = new Uint8Array(${JSON.stringify(cascadeBytes)});
      cv.FS_createDataFile(
        '/', 'haarcascade_frontalface_default.xml',
        data, true, false, false
      );

      // Signal ready
      postMessage({ type: 'ready' });

      // Handle detection requests
      onmessage = ({ data }) => {
        if (data.type !== 'detect') return;
        const { width, height, pixels, requestId } = data;
        const imgData = new ImageData(new Uint8ClampedArray(pixels), width, height);
        
        // Run detection
        const src  = cv.matFromImageData(imgData);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        const facesVec = new cv.RectVector();
        const clf = new cv.CascadeClassifier();
        clf.load('haarcascade_frontalface_default.xml');
        clf.detectMultiScale(gray, facesVec, 1.1, 3, 0);

        // Collect results
        const faces = [];
        for (let i = 0; i < facesVec.size(); i++) {
          const r = facesVec.get(i);
          faces.push({ x: r.x, y: r.y, w: r.width, h: r.height });
        }

        // Cleanup
        src.delete(); gray.delete(); facesVec.delete(); clf.delete();

        postMessage({ type: 'done', requestId, faces });
      };
    })();
  `;

  // 3) Spawn the worker
  const blob    = new Blob([workerSrc], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  const faceWorker = new Worker(workerUrl);

  // 4) Handle messages
  const pending = new Map();
  let nextRequestId = 1;

  faceWorker.onmessage = ({ data }) => {
    if (data.type === 'ready') {
      console.log('🛠️ Worker: OpenCV + cascade ready');
      observeImages();
    }
    if (data.type === 'done') {
      const img = pending.get(data.requestId);
      pending.delete(data.requestId);
      if (img && data.faces.length) {
        addSwapButton(img, data.faces);
      }
    }
  };

  // 5) Observe images entering viewport
  function observeImages() {
    document.querySelectorAll('img').forEach(watchImage);
    new MutationObserver(ms => {
      ms.forEach(m => {
        m.addedNodes.forEach(n => n.tagName === 'IMG' && watchImage(n));
        if (m.type === 'attributes' && m.target.tagName === 'IMG') {
          watchImage(m.target);
        }
      });
    }).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src']
    });
  }

  function watchImage(img) {
    if (img._fs_observed) return;
    img._fs_observed = true;

    const io = new IntersectionObserver(entries => {
      entries.forEach(async ({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        io.unobserve(target);

        // 6) Fetch the image via extension to avoid CORS
        let blob;
        try {
          const resp = await fetch(target.src);
          blob = await resp.blob();
        } catch (err) {
          console.warn('Fetch image failed', err);
          return;
        }

        // 7) Create an ImageBitmap
        let bitmap;
        try {
          bitmap = await createImageBitmap(blob);
        } catch (err) {
          console.warn('createImageBitmap failed', err);
          return;
        }

        // 8) Draw into OffscreenCanvas & get pixels
        const w = bitmap.width, h = bitmap.height;
        const off = new OffscreenCanvas(w, h);
        const ctx = off.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        let imageData;
        try {
          imageData = ctx.getImageData(0, 0, w, h);
        } catch (err) {
          console.warn('Canvas tainted unexpectedly', err);
          return;
        }

        // 9) Send to worker
        const reqId = nextRequestId++;
        pending.set(reqId, target);
        faceWorker.postMessage({
          type:      'detect',
          requestId: reqId,
          width:     w,
          height:    h,
          pixels:    imageData.data.buffer
        }, [imageData.data.buffer]);
      });
    }, { threshold: 0.1 });

    io.observe(img);
  }

  // 10) Overlay button when faces detected
  function addSwapButton(img, faces) {
    const container = document.createElement('div');
    container.style.position = 'relative';
    img.parentNode.insertBefore(container, img);
    container.appendChild(img);

    const btn = document.createElement('button');
    btn.textContent = '🔄 Swap';
    Object.assign(btn.style, {
      position: 'absolute',
      bottom: '8px',
      right: '8px',
      padding: '4px 8px',
      background: 'rgba(0,0,0,0.6)',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      zIndex: 9999
    });
    btn.onclick = () => console.log('Swap faces', faces, 'in', img);
    container.appendChild(btn);
  }
})();
