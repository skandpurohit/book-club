/**
 * firebase-config.js — Firebase project configuration.
 *
 * HOW TO SET THIS UP:
 * 1. Go to https://console.firebase.google.com and create a project.
 * 2. Click "Add app" → Web (</>) → register the app.
 * 3. Copy the firebaseConfig object and paste the values below.
 * 4. In Firestore → Rules, paste these rules and publish:
 *
 *    rules_version = '2';
 *    service cloud.firestore {
 *      match /databases/{database}/documents {
 *        match /{document=**} {
 *          allow read, write: if true;
 *        }
 *      }
 *    }
 *
 * NOTE: Firebase web API keys are safe to commit — they are public
 * identifiers, not secrets. Access is controlled by Firestore Security Rules.
 */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDLCUYaC9wZHtYAblKkWGBtDq2jCt-Wyeo",
  authDomain:        "book-club-2fa6c.firebaseapp.com",
  projectId:         "book-club-2fa6c",
  storageBucket:     "book-club-2fa6c.firebasestorage.app",
  messagingSenderId: "5283892564",
  appId:             "1:5283892564:web:cd38068785b3c1bcc5ccc1"
};
