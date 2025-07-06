// bootstrap.js
;(function(){
  const me = document.currentScript;
  const base = me.src.replace(/bootstrap\.js$/, '');
  window.Module = {
    onRuntimeInitialized() {
      window.dispatchEvent(new Event('opencv-loaded'));
    }
  };
  const s = document.createElement('script');
  s.src = base + 'opencv/opencv.js';
  s.onload = () =>
    console.log('bootstrap.js → patched opencv loaded, waiting for init');
  s.onerror = () => console.error('bootstrap.js → failed to load opencv.full.js');
  document.head.appendChild(s);
})();
