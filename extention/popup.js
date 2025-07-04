import { initializeApp } from './firebase/firebase-app.js';
import {
  getAuth, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut
} from './firebase/firebase-auth.js';
import {
  getStorage, ref as storageRef,
  uploadBytes, getDownloadURL
} from './firebase/firebase-storage.js';

const firebaseConfig = { /* your config */ };
const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const storage = getStorage(app);

const authCt   = document.getElementById('auth-container');
const appCt    = document.getElementById('app-container');
const emailIn  = document.getElementById('email');
const passIn   = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const signBtn  = document.getElementById('signup-btn');
const outBtn   = document.getElementById('logout-btn');
const settings = document.getElementById('settings-link');
const userSpan = document.getElementById('user-email');
const fileIn   = document.getElementById('file-input');
const capBtn   = document.getElementById('capture-btn');
const videoEl  = document.getElementById('video-stream');
const canvasEl = document.getElementById('capture-canvas');
const saveBtn  = document.getElementById('save-photo-btn');

let streamTrack = null;

loginBtn.addEventListener('click', () =>
  signInWithEmailAndPassword(auth, emailIn.value, passIn.value)
    .catch(e => alert(e.message))
);
signBtn.addEventListener('click', () =>
  createUserWithEmailAndPassword(auth, emailIn.value, passIn.value)
    .catch(e => alert(e.message))
);
outBtn.addEventListener('click', () => signOut(auth));
settings.addEventListener('click', () =>
  chrome.runtime.openOptionsPage()
);

onAuthStateChanged(auth, user => {
  if (user) {
    authCt.style.display = 'none';
    appCt.style.display  = 'block';
    userSpan.textContent = user.email;
  } else {
    authCt.style.display = 'block';
    appCt.style.display  = 'none';
  }
});

fileIn.addEventListener('change', async () => {
  const file = fileIn.files[0];
  if (!file) return;
  const ref = storageRef(storage, `faces/${auth.currentUser.uid}.jpg`);
  await uploadBytes(ref, file);
  const url = await getDownloadURL(ref);
  await chrome.storage.local.set({ faceUrl: url });
  alert('Photo saved!');
});

capBtn.addEventListener('click', async () => {
  if (!streamTrack) {
    const stream = await navigator.mediaDevices.getUserMedia({video:true});
    videoEl.srcObject = stream;
    streamTrack = stream.getVideoTracks()[0];
    videoEl.style.display  = 'block';
    saveBtn.style.display  = 'inline-block';
  }
});

saveBtn.addEventListener('click', () => {
  const ctx = canvasEl.getContext('2d');
  canvasEl.width  = videoEl.videoWidth;
  canvasEl.height = videoEl.videoHeight;
  ctx.drawImage(videoEl, 0, 0);
  canvasEl.toBlob(async blob => {
    const ref = storageRef(storage, `faces/${auth.currentUser.uid}.jpg`);
    await uploadBytes(ref, blob);
    const url = await getDownloadURL(ref);
    await chrome.storage.local.set({ faceUrl: url });
    alert('Captured & saved!');
    streamTrack.stop();
    videoEl.style.display = 'none';
    saveBtn.style.display = 'none';
  }, 'image/jpeg');
});
