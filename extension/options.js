import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.18.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/9.18.0/firebase-auth.js';
import {
  getStorage, ref as storageRef,
  uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/9.18.0/firebase-storage.js';

const firebaseConfig = { /* your config */ };
const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const storage = getStorage(app);

const cont      = document.getElementById('settings-container');
const loginP    = document.getElementById('login-prompt');
const emailEl   = document.getElementById('settings-email');
const imgEl     = document.getElementById('face-photo');
const changeBtn = document.getElementById('change-photo-btn');
const logoutBtn = document.getElementById('logout-settings-btn');
const chgCt     = document.getElementById('change-container');
const fIn       = document.getElementById('opt-file-input');
const cBtn      = document.getElementById('opt-capture-btn');
const vid       = document.getElementById('opt-video');
const cvs       = document.getElementById('opt-canvas');
const sBtn      = document.getElementById('opt-save-btn');

let track = null;

onAuthStateChanged(auth, async user => {
  if (user) {
    cont.style.display   = 'block';
    loginP.style.display = 'none';
    emailEl.textContent  = user.email;
    try {
      const url = await getDownloadURL(storageRef(storage, `faces/${user.uid}.jpg`));
      imgEl.src = url;
    } catch {
      imgEl.alt = 'No photo uploaded';
    }
  } else {
    cont.style.display   = 'none';
    loginP.style.display = 'block';
  }
});

logoutBtn.addEventListener('click', () => signOut(auth));
changeBtn.addEventListener('click', () => {
  chgCt.style.display = chgCt.style.display === 'none' ? 'block' : 'none';
});

fIn.addEventListener('change', async () => {
  const file = fIn.files[0];
  if (!file) return;
  const uid = auth.currentUser.uid;
  const ref = storageRef(storage, `faces/${uid}.jpg`);
  await uploadBytes(ref, file);
  imgEl.src = await getDownloadURL(ref);
  alert('Photo updated!');
});

cBtn.addEventListener('click', async () => {
  if (!track) {
    const stream = await navigator.mediaDevices.getUserMedia({video:true});
    vid.srcObject = stream;
    track = stream.getVideoTracks()[0];
    vid.style.display = 'block';
    sBtn.style.display = 'inline-block';
  }
});

sBtn.addEventListener('click', () => {
  const ctx = cvs.getContext('2d');
  cvs.width  = vid.videoWidth;
  cvs.height = vid.videoHeight;
  ctx.drawImage(vid, 0, 0);
  cvs.toBlob(async blob => {
    const uid = auth.currentUser.uid;
    const ref = storageRef(storage, `faces/${uid}.jpg`);
    await uploadBytes(ref, blob);
    imgEl.src = await getDownloadURL(ref);
    alert('Captured & updated!');
    track.stop();
    vid.style.display = 'none';
    sBtn.style.display = 'none';
  }, 'image/jpeg');
});
