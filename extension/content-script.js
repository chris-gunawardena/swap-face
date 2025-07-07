// content-script.js
(async () => {
  // ─────────────────────────────────────────────
  // 1) Grab OpenCV.js and Haar cascade for face detection
  // ─────────────────────────────────────────────
  const [opencvText, cascadeBuf] = await Promise.all([
    fetch(chrome.runtime.getURL('opencv/opencv.full.js')).then(r => r.text()),
    fetch(chrome.runtime.getURL('opencv/haarcascade_frontalface_default.xml'))
      .then(r => r.arrayBuffer())
  ]);
  const cascadeBytes = Array.from(new Uint8Array(cascadeBuf));

  // ─────────────────────────────────────────────
  // 2) Build & spawn the detection worker
  // ─────────────────────────────────────────────
  const detectWorkerSrc = `
    ${opencvText}

    cv.onRuntimeInitialized = () => {
      // write Haar file into Wasm FS
      const data = new Uint8Array(${JSON.stringify(cascadeBytes)});
      cv.FS_createDataFile('/', 'haarcascade_frontalface_default.xml',
                          data, true, false, false);
      postMessage({ type: 'ready' });

      onmessage = ({ data }) => {
        if (data.type !== 'detect') return;
        const { width, height, pixels, requestId } = data;
        const imgData = new ImageData(new Uint8ClampedArray(pixels), width, height);

        // run detection
        const src  = cv.matFromImageData(imgData);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        const facesVec = new cv.RectVector();
        const clf = new cv.CascadeClassifier();
        clf.load('haarcascade_frontalface_default.xml');
        clf.detectMultiScale(gray, facesVec, 1.1, 3, 0);

        const faces = [];
        for (let i = 0; i < facesVec.size(); i++) {
          const r = facesVec.get(i);
          faces.push({ x: r.x, y: r.y, w: r.width, h: r.height });
        }

        src.delete(); gray.delete(); facesVec.delete(); clf.delete();
        postMessage({ type: 'done', requestId, faces });
      };
    };
  `;
  const detectWorker = new Worker(
    URL.createObjectURL(new Blob([detectWorkerSrc], { type: 'application/javascript' }))
  );

  // ─────────────────────────────────────────────
  // 3) Build & spawn the swap worker (on-device ONNX)
  // ─────────────────────────────────────────────
  const swapWorkerSrc = `
    // load the UMD build of onnxruntime-web
    importScripts("${chrome.runtime.getURL('ort/ort.min.js')}");

    let session;
    (async () => {
      session = await ort.InferenceSession.create(
        chrome.runtime.getURL('models/simswap_quant.onnx'),
        { executionProviders: ['webgl'] }
      );
      postMessage({ type: 'swap-ready' });
    })().catch(err => postMessage({ type: 'swap-error', error: err.message }));

    onmessage = async ({ data }) => {
      if (data.type !== 'swap') return;
      const { width, height, pixels, requestId } = data;

      // RGBA → Float32 [1,3,H,W]
      const px = new Uint8ClampedArray(pixels);
      const inData = new Float32Array(width * height * 3);
      for (let i = 0, j = 0; i < px.length; i += 4, j += 3) {
        inData[j  ] = px[i  ] / 255;
        inData[j+1] = px[i+1] / 255;
        inData[j+2] = px[i+2] / 255;
      }
      const input = new ort.Tensor('float32', inData, [1,3,height,width]);

      // run the model
      const outputMap = await session.run({ src: input });
      const outData   = outputMap.out.data;  // Float32Array

      // Float32 → RGBA
      const swapped = new Uint8ClampedArray(width * height * 4);
      for (let i = 0, j = 0; j < outData.length; i += 4, j += 3) {
        swapped[i  ] = Math.round(outData[j  ] * 255);
        swapped[i+1] = Math.round(outData[j+1] * 255);
        swapped[i+2] = Math.round(outData[j+2] * 255);
        swapped[i+3] = 255;
      }

      postMessage(
        { type: 'swap-done', requestId, pixels: swapped.buffer },
        [swapped.buffer]
      );
    };
  `;
  const swapWorker = new Worker(
    URL.createObjectURL(new Blob([swapWorkerSrc], { type: 'application/javascript' }))
  );

  // ─────────────────────────────────────────────
  // 4) State: pending requests
  // ─────────────────────────────────────────────
  const pendingDetect = new Map();
  const pendingSwap   = new Map();
  let nextReqId = 1;

  // ─────────────────────────────────────────────
  // 5) Handle detection messages
  // ─────────────────────────────────────────────
  detectWorker.onmessage = ({ data }) => {
    if (data.type === 'ready') {
      console.log('🛠️ Detection worker ready');
      observeImages();
    }
    if (data.type === 'done') {
      const img = pendingDetect.get(data.requestId);
      pendingDetect.delete(data.requestId);
      if (img && data.faces.length) {
        // use first detected face
        addSwapButton(img, data.faces[0]);
      }
    }
  };

  // ─────────────────────────────────────────────
  // 6) Handle swap messages
  // ─────────────────────────────────────────────
  swapWorker.onmessage = ({ data }) => {
    if (data.type === 'swap-ready') return console.log('🔄 Swap worker ready');
    if (data.type === 'swap-error') {
      console.error('Swap worker error:', data.error);
      return;
    }
    if (data.type === 'swap-done') {
      const { img, box } = pendingSwap.get(data.requestId);
      pendingSwap.delete(data.requestId);

      // composite swapped face back onto original
      const cvs = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
      const ctx = cvs.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const faceImg = new ImageData(
        new Uint8ClampedArray(data.pixels),
        256, 256
      );
      ctx.putImageData(faceImg, box.x, box.y);

      cvs.convertToBlob({ type: 'image/png' })
        .then(b => img.src = URL.createObjectURL(b));
    }
  };

  // ─────────────────────────────────────────────
  // 7) Observe <img> elements and run detection
  // ─────────────────────────────────────────────
  function observeImages() {
    document.querySelectorAll('img').forEach(watchImage);
    new MutationObserver(ms => {
      ms.forEach(m => {
        m.addedNodes.forEach(n => {
          if (n.tagName === 'IMG') watchImage(n);
        });
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

  async function watchImage(img) {
    if (img._fsObserved) return;
    img._fsObserved = true;

    const io = new IntersectionObserver(entries => {
      entries.forEach(async ({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        io.unobserve(target);

        // fetch as blob to avoid CORS taint
        let blob;
        try { blob = await (await fetch(target.src)).blob(); }
        catch (e) { console.warn('Fetch failed', e); return; }

        // createImageBitmap + getImageData
        let bitmap;
        try { bitmap = await createImageBitmap(blob); }
        catch (e) { console.warn('Bitmap error', e); return; }

        const w = bitmap.width, h = bitmap.height;
        const off = new OffscreenCanvas(w, h);
        const ctx = off.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        let imageData;
        try { imageData = ctx.getImageData(0, 0, w, h); }
        catch (e) { console.warn('getImageData failed', e); return; }

        // send to detect worker
        const id = nextReqId++;
        pendingDetect.set(id, target);
        detectWorker.postMessage({
          type:      'detect',
          requestId: id,
          width:     w,
          height:    h,
          pixels:    imageData.data.buffer
        }, [imageData.data.buffer]);
      });
    }, { threshold: 0.1 });
    io.observe(img);
  }

  // ─────────────────────────────────────────────
  // 8) Add Swap button & trigger on-device swap
  // ─────────────────────────────────────────────
  function addSwapButton(img, box) {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    img.parentNode.insertBefore(wrapper, img);
    wrapper.appendChild(img);

    const btn = document.createElement('button');
    btn.textContent = '🔄 Swap';
    Object.assign(btn.style, {
      position:   'absolute',
      bottom:     '8px',
      right:      '8px',
      padding:    '4px 8px',
      background: 'rgba(0,0,0,0.6)',
      color:      'white',
      border:     'none',
      borderRadius:'4px',
      cursor:     'pointer',
      zIndex:     9999
    });

    btn.onclick = async () => {
      // re-fetch & crop face region → 256×256
      const imgBlob = await (await fetch(img.src)).blob();
      const bmp     = await createImageBitmap(imgBlob);
      const off     = new OffscreenCanvas(256, 256);
      const ctx2    = off.getContext('2d');
      ctx2.drawImage(
        bmp,
        box.x, box.y, box.w, box.h,
        0, 0, 256, 256
      );
      const imageData = ctx2.getImageData(0, 0, 256, 256);

      const id = nextReqId++;
      pendingSwap.set(id, { img, box });
      swapWorker.postMessage({
        type:      'swap',
        requestId: id,
        width:     256,
        height:    256,
        pixels:    imageData.data.buffer
      }, [imageData.data.buffer]);
    };

    wrapper.appendChild(btn);
  }
})();
