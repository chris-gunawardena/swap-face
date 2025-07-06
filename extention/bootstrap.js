// bootstrap.js
;(function(){
  // 1) Grab our own extension base URL
  const me = document.currentScript;
  if (!me) return console.error('bootstrap.js: no currentScript');
  const baseURL = me.src.replace(/bootstrap\.js$/, '');

  // 2) Emscripten hook: when single-file (base64) build finishes, fire an event
  window.Module = {
    onRuntimeInitialized() {
      window.dispatchEvent(new Event('opencv‐loaded'));
    }
  };

  // 3) Temporarily disable AMD/RequireJS so opencv.js attaches to window.cv
  const _define = window.define, _require = window.require;
  if (_define && _define.amd) {
    window.define  = undefined;
    window.require = undefined;
  }

  // 4) Inject the single-file opencv.js (which already includes Wasm)
  const s = document.createElement('script');
  s.src = baseURL + 'opencv/opencv.js';
  s.onload = () => {
    // restore AMD immediately
    if (_define && _define.amd) {
      window.define  = _define;
      window.require = _require;
    }
    console.log('bootstrap.js → opencv.js loaded, waiting for onRuntimeInitialized');
  };
  s.onerror = () => console.error('bootstrap.js → failed to load opencv.js');
  document.head.appendChild(s);
})();
