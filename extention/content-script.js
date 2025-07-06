// content-script.js

(async () => {
  // 1) Fetch the single-file build as text
  const [opencvTxt, cascadeBuf] = await Promise.all([
    fetch(chrome.runtime.getURL('opencv/opencv.full.js')).then(r => r.text()),
    fetch(chrome.runtime.getURL('opencv/haarcascade_frontalface_default.xml'))
      .then(r => r.arrayBuffer())
  ]);

  // 2) Build the blob-worker source by inlining opencvTxt and the cascade bytes
  const workerSrc = `
    // — bundled OpenCV.js + WASM —
    ${opencvTxt}

    // Immediately run an async init IIFE
    (async () => {
      // 3) Put the cascade into Emscripten FS
      const cascadeData = new Uint8Array(${JSON.stringify(Array.from(new Uint8Array(cascadeBuf)))});
      cv.FS_createDataFile('/', 'haarcascade_frontalface_default.xml',
                          cascadeData, true, false, false);

      // 4) Notify main thread that we’re ready
      postMessage({ type: 'ready' });

      // 5) Handle detection requests
      onmessage = ({ data }) => {
        if (data.type !== 'detect') return;
        const { width, height, pixels, requestId } = data;
        const img = new ImageData(new Uint8ClampedArray(pixels), width, height);

        // Detection
        const src  = cv.matFromImageData(img);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        const facesVec = new cv.RectVector();
        const clf      = new cv.CascadeClassifier();
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

  // 6) Spawn the blob worker
  const blob    = new Blob([workerSrc], { type: 'text/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  const faceWorker = new Worker(blobUrl);

  // 7) Wire up messages & image observation
  const pending = new Map();
  faceWorker.onmessage = ({ data }) => {
    if (data.type === 'ready') {
      console.log('🛠️ Worker: OpenCV + cascade ready');
      observeImages();
    }
    if (data.type === 'done') {
      const img = pending.get(data.requestId);
      pending.delete(data.requestId);
      if (img && data.faces.length) addSwapButton(img, data.faces);
    }
  };

  let nextReq = 1;
  function observeImages() {
    document.querySelectorAll('img').forEach(initImg);
    new MutationObserver(ms => {
      ms.forEach(m => {
        m.addedNodes.forEach(n => n.tagName==='IMG' && initImg(n));
        if (m.type==='attributes' && m.target.tagName==='IMG') initImg(m.target);
      });
    }).observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['src']
    });
  }

  function initImg(img) {
    if (img._swapped) return;
    img._swapped = true;
    const io = new IntersectionObserver(es => {
      for (let { target, isIntersecting } of es) {
        if (!isIntersecting) continue;
        const w = target.naturalWidth, h = target.naturalHeight;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(target, 0, 0, w, h);
        const data = c.getContext('2d').getImageData(0, 0, w, h);

        const reqId = nextReq++;
        pending.set(reqId, target);
        faceWorker.postMessage({
          type:      'detect',
          requestId: reqId,
          width:     w,
          height:    h,
          pixels:    data.data.buffer
        }, [data.data.buffer]);

        io.unobserve(target);
      }
    }, { threshold: 0.1 });
    io.observe(img);
  }

  function addSwapButton(img, faces) {
    console.log('Detected faces on', img, faces);
    // …your swap‐button overlay code here…
  }
})();
