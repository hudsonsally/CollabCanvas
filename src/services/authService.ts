import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  Auth,
  User
} from 'firebase/auth';
import { getAuth } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import firebaseConfig from '../../firebase-applet-config.json';

let auth: Auth;

export const initializeAuth = () => {
  if (!getApps().length) {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
  } else {
    auth = getAuth(getApps()[0]);
  }
  return auth;
};

export const getAuthInstance = () => {
  if (!auth) {
    initializeAuth();
  }
  return auth;
};

export const signUp = async (email: string, password: string) => {
  const authInstance = getAuthInstance();
  try {
    const userCredential = await createUserWithEmailAndPassword(authInstance, email, password);
    return userCredential.user;
  } catch (error: any) {
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('Email already in use');
    } else if (error.code === 'auth/weak-password') {
      throw new Error('Password is too weak');
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('Invalid email address');
    }
    throw error;
  }
};

export const signIn = async (email: string, password: string) => {
  const authInstance = getAuthInstance();
  try {
    const userCredential = await signInWithEmailAndPassword(authInstance, email, password);
    return userCredential.user;
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      throw new Error('User not found');
    } else if (error.code === 'auth/wrong-password') {
      throw new Error('Incorrect password');
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('Invalid email address');
    }
    throw error;
  }
};

export const signOut = async () => {
  const authInstance = getAuthInstance();
  return firebaseSignOut(authInstance);
};

export const getCurrentUser = (): Promise<User | null> => {
  const authInstance = getAuthInstance();
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      authInstance,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      reject
    );
  });
};

export const onAuthStateChangedListener = (callback: (user: User | null) => void) => {
  const authInstance = getAuthInstance();
  return onAuthStateChanged(authInstance, callback);
};

export const getAuthToken = async (): Promise<string> => {
  const authInstance = getAuthInstance();
  const user = authInstance.currentUser;
  if (!user) {
    throw new Error('No user logged in');
  }
  return user.getIdToken();
};
