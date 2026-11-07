// Firebase web config. These values are public identifiers, not secrets:
// what visitors may read or write is enforced by firestore.rules.
// Firebase console → Project settings → Your apps → Web app → Config.
export const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.firebasestorage.app",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

export const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.14.1";
export const isFirebaseConfigured = !String(firebaseConfig.apiKey).includes("REPLACE_ME");
