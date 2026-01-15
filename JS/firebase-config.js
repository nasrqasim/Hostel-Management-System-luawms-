 // This file initializes your Firebase app with the correct configuration.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAR47QeyP_K4E2_8bG3erR9MfgO3sc2pP4",
  authDomain: "hostel-management-system-e8a6d.firebaseapp.com",
  projectId: "hostel-management-system-e8a6d",
  storageBucket: "hostel-management-system-e8a6d.firebasestorage.app",
  messagingSenderId: "706430783849",
  appId: "1:706430783849:web:7c02cd8398cbb6e6fd6df8",
  measurementId: "G-NQLT3RCVR5"
};

// Initialize Firebase app and export it for use in other modules
export const app = initializeApp(firebaseConfig);
