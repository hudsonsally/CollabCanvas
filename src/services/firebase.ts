import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  query,
  orderBy,
  deleteDoc,
  setDoc,
  getDocs,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Shape, UserCursor } from '../types';

// Singleton init
let app: FirebaseApp;
let db: any;
let auth: any;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const currentUser = auth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo: currentUser?.providerData?.map((provider: any) => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  
  let errorPayload: string;
  try {
    errorPayload = JSON.stringify(errInfo);
  } catch (e) {
    // Fallback for circular structures or other serialization issues
    errorPayload = JSON.stringify({
      error: errInfo.error,
      operationType: errInfo.operationType,
      path: errInfo.path,
      authInfo: {
        userId: errInfo.authInfo.userId,
        isAnonymous: errInfo.authInfo.isAnonymous
      }
    });
  }

  console.error('Firestore Error: ', errorPayload);
  throw new Error(errorPayload);
}

// Helper to remove undefined values which Firestore rejects
const cleanPayload = (data: any) => {
    const cleaned = { ...data };
    Object.keys(cleaned).forEach(key => {
        if (cleaned[key] === undefined) {
            delete cleaned[key];
        }
    });
    return cleaned;
};

export const initFirebase = () => {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    auth = getAuth(app);
  } else {
    app = getApps()[0];
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    auth = getAuth(app);
  }

  // Connection test
  const testConnection = async () => {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error) {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration.");
      }
    }
  };
  testConnection();

  return db;
};

// --- Room-aware Collection Helpers ---

const getShapesRef = (roomId: string) => collection(db, 'rooms', roomId, 'shapes');
const getCursorsRef = (roomId: string) => collection(db, 'rooms', roomId, 'cursors');

// --- Services ---

export const subscribeToShapes = (roomId: string, callback: (shapes: Shape[]) => void) => {
  if (!db) return () => {};
  
  const path = `rooms/${roomId}/shapes`;
  const q = query(getShapesRef(roomId), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const shapes = snapshot.docs.map(doc => {
        const data = doc.data() as Omit<Shape, 'id'>;
        return { ...data, id: doc.id } as Shape;
    });
    callback(shapes);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  });
};

export const addShapeToRemote = async (roomId: string, shape: Shape) => {
  if (!db) return;
  const path = `rooms/${roomId}/shapes/${shape.id}`;
  try {
    const shapeRef = doc(getShapesRef(roomId), shape.id);
    const payload = cleanPayload({
        ...shape,
        createdAt: shape.createdAt || Date.now()
    });
    
    await setDoc(shapeRef, payload);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const updateShapeInRemote = async (roomId: string, shapeId: string, updates: Partial<Shape>) => {
  if (!db) return;
  const path = `rooms/${roomId}/shapes/${shapeId}`;
  try {
    const shapeRef = doc(getShapesRef(roomId), shapeId);
    await updateDoc(shapeRef, cleanPayload(updates));
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const deleteShapeFromRemote = async (roomId: string, shapeId: string) => {
    if (!db) return;
    const path = `rooms/${roomId}/shapes/${shapeId}`;
    try {
        await deleteDoc(doc(getShapesRef(roomId), shapeId));
    } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, path);
    }
};

export const updateCursorRemote = async (roomId: string, cursor: UserCursor) => {
  if (!db) return;
  const path = `rooms/${roomId}/cursors/${cursor.id}`;
  const cursorRef = doc(getCursorsRef(roomId), cursor.id);
  try {
    await setDoc(cursorRef, {
      ...cursor,
      lastActive: Date.now()
    }, { merge: true });
  } catch (e) {
    // Silent fail for cursor updates usually, but following instructions
    handleFirestoreError(e, OperationType.WRITE, path);
  }
};

export const subscribeToCursors = (roomId: string, currentUserId: string, callback: (cursors: UserCursor[]) => void) => {
  if (!db) return () => {};

  const path = `rooms/${roomId}/cursors`;
  const q = getCursorsRef(roomId);
  return onSnapshot(q, (snapshot) => {
    const cursors = snapshot.docs
      .map(doc => doc.data() as UserCursor)
      .filter(c => c.id !== currentUserId) // Don't show own cursor
      .filter(c => Date.now() - c.lastActive < 30000); // Filter out inactive > 30s
    callback(cursors);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  });
};

export const clearCanvasRemote = async (roomId: string) => {
  if (!db) return;
  const path = `rooms/${roomId}/shapes`;
  try {
    const q = query(getShapesRef(roomId));
    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};
