// Admin check used by every admin page.
// The real lock is firestore.rules; this only decides what the page shows.
import { firebaseConfig, FIREBASE_SDK, isFirebaseConfigured } from "../firebase-config.js";

// Firebase console → Authentication → Users → copy the admin's "User UID".
// Must match the list in firestore.rules.
export const ADMIN_UIDS = ["npniMBSKjJZzXzItVP4qk3Acf733"];

let cached = null;

export async function getFirebase() {
  if (!isFirebaseConfigured) throw new Error("not-configured");
  if (cached) return cached;
  const [appMod, authMod, fs] = await Promise.all([
    import(`${FIREBASE_SDK}/firebase-app.js`),
    import(`${FIREBASE_SDK}/firebase-auth.js`),
    import(`${FIREBASE_SDK}/firebase-firestore.js`),
  ]);
  const app = appMod.getApps()[0] || appMod.initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  await authMod.setPersistence(auth, authMod.browserLocalPersistence);
  cached = { app, auth, authMod, fs, db: fs.getFirestore(app) };
  return cached;
}

export const isAdminUser = (user) => !!user && ADMIN_UIDS.includes(user.uid);

// Wait for Firebase Auth to restore the session.
export async function currentUser() {
  const { auth, authMod } = await getFirebase();
  return new Promise((resolve) => {
    const off = authMod.onAuthStateChanged(auth, (u) => { off(); resolve(u); });
  });
}

// Resolve with the admin user, or send the visitor to the login page.
export async function requireAdmin() {
  let user = null;
  try {
    user = await currentUser();
  } catch (err) {
    if (err.message === "not-configured") {
      document.body.innerHTML = `<div class="admin-fatal">Firebase isn't configured yet. Fill in <code>assets/firebase-config.js</code>.</div>`;
    }
    throw err;
  }
  if (!isAdminUser(user)) {
    if (user) { const { auth, authMod } = await getFirebase(); await authMod.signOut(auth); }
    const next = encodeURIComponent(location.pathname + location.search);
    location.replace(`/admin/login?next=${next}`);
    return new Promise(() => {}); // never resolves: the page is navigating away
  }
  return user;
}

export async function logout() {
  const { auth, authMod } = await getFirebase();
  await authMod.signOut(auth);
  location.replace("/admin/login");
}

// Theme: same key as the public site.
export function applySavedTheme() {
  let t = "cyber";
  try { t = localStorage.getItem("sufyan_portfolio_theme") || "cyber"; } catch { /* blocked */ }
  document.documentElement.setAttribute("data-theme", t);
}
