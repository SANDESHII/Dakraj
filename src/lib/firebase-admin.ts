import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import config from "../../firebase-applet-config.json" assert { type: "json" };

if (!getApps().length) {
  initializeApp({
    projectId: config.projectId,
  });
}

export const db = getFirestore(config.firestoreDatabaseId);
export const auth = getAuth();
