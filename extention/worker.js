
// 1) Grab the single‐file CDN build (must be web_accessible)
importScripts(chrome.runtime.getURL('opencv/opencv.full.js'));

// 2) Load the cascade into Emscripten’s FS
fetch(chrome.runtime.getURL('opencv/haarcascade_frontalface_default.xml'))
  .then(r => r.arrayBuffer())
  .then(buf => {
    cv.FS_createDataFile(
      '/', 'haarcascade_frontalface_default.xml',
      new Uint8Array(buf), true, false, false
    );
    postMessage({ type: 'ready' });
  })
  .catch(err => postMessage({ type: 'error', error: err.message }));

// 3) On each detect request, run the classifier and post back rectangles
onmessage = ({ data }) => {
  if (data.type !== 'detect') return;
  const { width, height, pixels, requestId } = data;
  const img = new ImageData(new Uint8ClampedArray(pixels), width, height);

  const src = cv.matFromImageData(img);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const faces = new cv.RectVector();
  const clf   = new cv.CascadeClassifier();
  clf.load('haarcascade_frontalface_default.xml');
  clf.detectMultiScale(gray, faces, 1.1, 3, 0);

  const out = [];
  for (let i = 0; i < faces.size(); i++) {
    const r = faces.get(i);
    out.push({ x: r.x, y: r.y, w: r.width, h: r.height });
  }

  // clean up
  src.delete(); gray.delete(); faces.delete(); clf.delete();

  postMessage({ type: 'done', requestId, faces: out });
};
