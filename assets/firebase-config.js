// Firebase web config. These values are public identifiers, not secrets:
// what visitors may read or write is enforced by firestore.rules.
// Firebase console → Project settings → Your apps → Web app → Config.
export const firebaseConfig = {
  apiKey: "AIzaSyDiA4GLrH2dy7zmOc3GblNmPn-Dh1U3veo",
  authDomain: "myportfolio-cfa5d.firebaseapp.com",
  projectId: "myportfolio-cfa5d",
  storageBucket: "myportfolio-cfa5d.firebasestorage.app",
  messagingSenderId: "806091865248",
  appId: "1:806091865248:web:c46e2a1ad6d6c578ce9dc5",
};

export const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.14.1";
export const isFirebaseConfigured = !String(firebaseConfig.apiKey).includes("REPLACE_ME");
