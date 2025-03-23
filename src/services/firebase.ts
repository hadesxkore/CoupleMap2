import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDJIokaQQi13vxuceGoPgVFykCdugXgrSE",
  authDomain: "centralizedics.firebaseapp.com",
  projectId: "centralizedics",
  storageBucket: "centralizedics.firebasestorage.app",
  messagingSenderId: "619644211373",
  appId: "1:619644211373:web:09ac446887f85c641cb624",
  measurementId: "G-4TK19N7FK9"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

export { app, auth, db, analytics }; 