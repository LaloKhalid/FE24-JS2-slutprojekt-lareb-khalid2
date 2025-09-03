import { db } from "./firebase.js";
import { collection, addDoc, getDocs } from "firebase/firestore";

// Step 1: Create array of tasks
const tasks = [
  { title: "Setup project repo", category: "frontend", status: "new" },
  { title: "Implement login page", category: "frontend", status: "new" },
  { title: "Configure Firebase", category: "backend", status: "new" },
  { title: "Setup Firestore rules", category: "backend", status: "new" },
  { title: "Design UX flow diagram", category: "ux", status: "new" }
];

// Step 2: Add tasks
async function addTasks() {
  for (const task of tasks) {
    await addDoc(collection(db, "assignments"), task);
    console.log(`✅ Added task: ${task.title}`);
  }
}

// Step 3: Read tasks
async function getAssignments() {
  const querySnapshot = await getDocs(collection(db, "assignments"));
  console.log("\n📋 Tasks in Firestore:");
  querySnapshot.forEach((doc) => {
    console.log(doc.id, "=>", doc.data());
  });
}

// Step 4: Run add then read
(async () => {
  await addTasks();
  await getAssignments();
})();
