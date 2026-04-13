
// Firebase Configuration
// 1. Create a Firebase project at https://console.firebase.google.com/
// 2. Register a new Web App in the project settings
// 3. Copy the config object and replace the placeholder below
// 4. Enable Firestore Database in the Firebase Console (Start in Test Mode)

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCWjvCJRcRsymJOTtPGAIcx-S7_SQ1-4Qc",
  authDomain: "collabcanvas-1815a.firebaseapp.com",
  projectId: "collabcanvas-1815a",
  storageBucket: "collabcanvas-1815a.firebasestorage.app",
  messagingSenderId: "842184419120",
  appId: "1:842184419120:web:3df2aa4203a95ce7fc8af5",
  measurementId: "G-8MBX98G04Z"
};

// Colors for multi-user cursors
export const USER_COLORS = [
  '#EF4444', // Red
  '#F59E0B', // Amber
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#8B5CF6', // Violet
  '#EC4899', // Pink
];

// Default styles
export const DEFAULT_FILL = 'transparent';
export const DEFAULT_STROKE = '#1F2937'; // Gray-800
export const DEFAULT_STROKE_WIDTH = 2;
