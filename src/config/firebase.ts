import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, OAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: "AIzaSyAa1UIZm1DtzTmP2kJk9LM8Gn5iJIK_Z1E",
  authDomain: "echo-gestion-d2fd2.firebaseapp.com",
  projectId: "echo-gestion-d2fd2",
  storageBucket: "echo-gestion-d2fd2.firebasestorage.app",
  messagingSenderId: "959654285593",
  appId: "1:959654285593:web:8920fd9218b866150d3588"
};

// Azure Active Directory / Entra ID configuration
export const MICROSOFT_TENANT_ID = "d64f809a-e0da-4724-abb6-6f2aac3bdef9";
export const ALLOWED_EMAIL_DOMAINS = ["echosdechezmoi.com"];

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const storage = getStorage(app);

// Configure Microsoft Auth Provider
export const getMicrosoftProvider = () => {
  const provider = new OAuthProvider('microsoft.com');
  provider.addScope('openid');
  provider.addScope('email');
  provider.addScope('profile');
  provider.addScope('User.Read');
  
  provider.setCustomParameters({
    tenant: MICROSOFT_TENANT_ID,
    prompt: 'select_account'
  });
  return provider;
};

export default app;
