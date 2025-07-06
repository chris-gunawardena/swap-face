// bootstrap.js
;(function(){
  const me = document.currentScript;
  if (!me) {
    console.error('bootstrap.js: no currentScript!');
    return;
  }
  // The URL that points at your extension’s opencv/ folder:
  const base = me.src.replace(/bootstrap\.js$/, '');

  // 1) Let Emscripten fire an event when it’s actually up
  window.Module = {
    onRuntimeInitialized() {
      window.dispatchEvent(new Event('opencv-loaded'));
    }
  };

  // 2) Temporarily disable AMD so OpenCV.js will do `root.cv = factory()`
  const _d = window.define, _r = window.require;
  if (_d && _d.amd) {
    window.define  = undefined;
    window.require = undefined;
  }

  // 3) Inject the single-file opencv.js
  const s = document.createElement('script');
  s.src = base + 'opencv/opencv.js';  // now your bundled file
  s.onload = () => {
    // restore AMD right away
    if (_d && _d.amd) {
      window.define  = _d;
      window.require = _r;
    }
    console.log('bootstrap.js → opencv.js loaded; awaiting runtime init');
  };
  s.onerror = () => console.error('bootstrap.js → failed to load opencv.js');
  document.head.appendChild(s);
})();
