// ========= SAFETY: Read Firebase bindings injected by index.html =========
const fb = (window as any).fb;
if (!fb) {
  console.error(
    "Firebase SDK not found on window.fb. " +
      "Make sure your index.html includes the CDN loader script BEFORE app.js."
  );
}

// Destructure what we exposed in index.html
const {
  db,
  auth,
  provider,
  // Firestore fns
  collection,
  addDoc,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  getDocs,
  serverTimestamp,
  Timestamp,
  // Auth fns
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} = fb || {};

// ========= Constants =========
const ASSIGNMENTS = "assignments"; // <- keep consistent with your DB
const MEMBERS = "members";

// Map task status => column element id (matches your HTML)
const STATUS_TO_COL_ID: Record<string, string> = {
  new: "new-tasks",
  "in-progress": "in-progress",
  done: "done",
};

// ========= DOM Elements =========
const loginBtn = document.getElementById("loginBtn") as HTMLButtonElement;
const logoutBtn = document.getElementById("logoutBtn") as HTMLButtonElement;
const userInfo = document.getElementById("userInfo") as HTMLElement;

const taskForm = document.getElementById("taskForm") as HTMLFormElement;
const searchBox = document.getElementById("searchBox") as HTMLInputElement;

const memberForm = document.getElementById("memberForm") as HTMLFormElement;
const membersList = document.getElementById("membersList") as HTMLElement;
const assignedMemberSelect = document.getElementById(
  "assignedMember"
) as HTMLSelectElement;

// Column roots
const newCol = document.getElementById("new-tasks") as HTMLElement;
const inProgCol = document.getElementById("in-progress") as HTMLElement;
const doneCol = document.getElementById("done") as HTMLElement;

// ========= Helpers =========
function resetColumnsWithHeaders() {
  if (newCol) newCol.innerHTML = "<h3>New Tasks</h3>";
  if (inProgCol) inProgCol.innerHTML = "<h3>In Progress</h3>";
  if (doneCol) doneCol.innerHTML = "<h3>Done</h3>";
}

function getColumnForStatus(status: string): HTMLElement | null {
  const id = STATUS_TO_COL_ID[status];
  return id ? (document.getElementById(id) as HTMLElement) : null;
}

function fmtDate(d: any): string {
  try {
    if (d instanceof Timestamp) {
      return d.toDate().toLocaleString();
    }
    if (d?.seconds) {
      return new Date(d.seconds * 1000).toLocaleString();
    }
    const dt = d instanceof Date ? d : new Date(d);
    return isNaN(dt as any) ? "Unknown date" : dt.toLocaleString();
  } catch {
    return "Unknown date";
  }
}

// ========= Auth =========
if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("❌ Login error:", err);
    }
  });
}
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("❌ Logout error:", err);
    }
  });
}

onAuthStateChanged(auth, (user: any) => {
  if (user) {
    userInfo.textContent = `Logged in as: ${
      user.displayName || user.email || "User"
    }`;
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    taskForm.style.display = "block";
  } else {
    userInfo.textContent = "Not logged in";
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
    taskForm.style.display = "none";
  }
});

// ========= Members =========
memberForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = (document.getElementById("memberName") as HTMLInputElement).value.trim();
  const role = (document.getElementById("memberRole") as HTMLSelectElement).value;

  if (!name) return;

  try {
    await addDoc(collection(db, MEMBERS), { name, role });
    memberForm.reset();
  } catch (err) {
    console.error("❌ Error adding member:", err);
  }
});

function renderMember(docData: any, id: string) {
  const wrap = document.createElement("div");
  wrap.className = "member";
  wrap.textContent = `${docData.name} — ${docData.role} `;

  const del = document.createElement("button");
  del.textContent = "Remove";
  del.onclick = async () => {
    if (confirm(`Remove ${docData.name}?`)) {
      await deleteDoc(doc(db, MEMBERS, id));
    }
  };
  wrap.appendChild(del);
  membersList.appendChild(wrap);

  // Keep the assignment dropdown in sync
  const opt = document.createElement("option");
  opt.value = docData.name;
  opt.textContent = docData.name;
  assignedMemberSelect.appendChild(opt);
}

// Real-time members
onSnapshot(collection(db, MEMBERS), (snap: any) => {
  membersList.innerHTML = "";
  assignedMemberSelect.innerHTML = `<option value="">-- None --</option>`;
  snap.forEach((d: any) => renderMember(d.data(), d.id));
});

// ========= Tasks / Assignments =========
taskForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const title = (document.getElementById("title") as HTMLInputElement).value.trim();
  const description = (document.getElementById("description") as HTMLInputElement).value.trim();
  const category = (document.getElementById("category") as HTMLInputElement).value.trim();
  const assignedMember = (document.getElementById("assignedMember") as HTMLSelectElement).value;
  const status = (document.getElementById("status") as HTMLSelectElement).value;

  if (!title || !category || !status) return;

  try {
    await addDoc(collection(db, ASSIGNMENTS), {
      title,
      description,
      category,
      assignedMember: assignedMember || "",
      status, // "new" | "in-progress" | "done"
      timestamp: serverTimestamp(), // ✅ always Firestore Timestamp
    });
    taskForm.reset();
  } catch (err) {
    console.error("❌ Error adding task:", err);
  }
});

function renderTask(task: any, id: string) {
  const col = getColumnForStatus(task.status);
  if (!col) return;

  const card = document.createElement("div");
  card.className = "task-card";
  card.innerHTML = `
    <strong>${task.title}</strong><br>
    ${task.description ? `Description: ${task.description}<br>` : ""}
    Category: ${task.category}<br>
    Status: ${task.status}<br>
    Created: ${fmtDate(task.timestamp)}<br>
    ${task.assignedMember ? `Assigned: ${task.assignedMember}<br>` : ""}
  `;

  // Actions by state
  if (task.status === "new") {
    const assignBtn = document.createElement("button");
    assignBtn.textContent = "Assign to member";
    assignBtn.onclick = () => chooseMemberAndAssign(id);
    card.appendChild(assignBtn);
  } else if (task.status === "in-progress") {
    const doneBtn = document.createElement("button");
    doneBtn.textContent = "Mark as Done";
    doneBtn.onclick = async () => {
      await updateDoc(doc(db, ASSIGNMENTS, id), { status: "done" });
    };
    card.appendChild(doneBtn);

    const reassignBtn = document.createElement("button");
    reassignBtn.textContent = "Reassign";
    reassignBtn.onclick = () => chooseMemberAndAssign(id);
    card.appendChild(reassignBtn);
  } else if (task.status === "done") {
    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.onclick = async () => {
      if (confirm("Delete this task?")) {
        await deleteDoc(doc(db, ASSIGNMENTS, id));
      }
    };
    card.appendChild(delBtn);
  }

  col.appendChild(card);
}

// ========= Sorting + Task Rendering =========

// Keep all tasks in memory
let allTasks: { id: string; data: any }[] = [];
let currentSort = "time-desc"; // default sort

function getMillis(ts: any): number {
  if (!ts) return 0;
  if (ts instanceof Timestamp) return ts.toMillis();
  if (ts?.seconds) return ts.seconds * 1000;
  return new Date(ts).getTime();
}

// Apply sorting before rendering
function sortTasks(tasks: { id: string; data: any }[]) {
  const getTime = (ts: any): number => {
    if (!ts) return 0;
    if (ts.seconds) return ts.seconds * 1000; // Firestore Timestamp
    if (ts.toDate) return ts.toDate().getTime(); // Timestamp object with toDate()
    if (ts instanceof Date) return ts.getTime(); // JS Date
    return new Date(ts).getTime(); // fallback
  };

  switch (currentSort) {
    case "time-asc":
      return tasks.sort((a, b) => getTime(a.data.timestamp) - getTime(b.data.timestamp));
    case "time-desc":
      return tasks.sort((a, b) => getTime(b.data.timestamp) - getTime(a.data.timestamp));
    case "title-asc":
      return tasks.sort((a, b) => a.data.title.localeCompare(b.data.title));
    case "title-desc":
      return tasks.sort((a, b) => b.data.title.localeCompare(a.data.title));
    default:
      return tasks;
  }
}

// Render all tasks again
function renderAllTasks() {
  ["new-tasks", "in-progress", "done"].forEach((id) => {
    const col = document.getElementById(id)!;
    col.innerHTML = `<h3>${col.querySelector("h3")!.innerText}</h3>`;
  });

  sortTasks(allTasks).forEach(({ data, id }) => renderTask(data, id));
}

// Real-time tasks
onSnapshot(collection(db, ASSIGNMENTS), (snap: any) => {
  allTasks = [];
  snap.forEach((docSnap: any) => {
    allTasks.push({ id: docSnap.id, data: docSnap.data() });
  });
  renderAllTasks();
});

// Handle dropdown changes
(document.getElementById("sortSelect") as HTMLSelectElement)?.addEventListener("change", (e) => {
  currentSort = (e.target as HTMLSelectElement).value;
  renderAllTasks();
});

// ========= Search (client-side filter over current data) =========
searchBox.addEventListener("input", async () => {
  const query = searchBox.value.toLowerCase();

  const snap = await getDocs(collection(db, ASSIGNMENTS));
  resetColumnsWithHeaders();

  snap.forEach((docSnap: any) => {
    const t = docSnap.data();
    const hay =
      `${t.title || ""} ${t.description || ""} ${t.category || ""} ${t.assignedMember || ""}`.toLowerCase();
    if (hay.includes(query)) {
      renderTask(t, docSnap.id);
    }
  });
});

// ========= Assign helper =========
async function chooseMemberAndAssign(taskId: string) {
  const dropdown = document.createElement("select");
  dropdown.innerHTML = `<option value="">-- Select member --</option>`;

  const ms = await getDocs(collection(db, MEMBERS));
  ms.forEach((m: any) => {
    const data = m.data();
    const opt = document.createElement("option");
    opt.value = data.name;
    opt.textContent = `${data.name} (${data.role})`;
    dropdown.appendChild(opt);
  });

  const confirm = document.createElement("button");
  confirm.textContent = "Assign";

  const modal = document.createElement("div");
  Object.assign(modal.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "white",
    padding: "20px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
    zIndex: "1000",
    borderRadius: "8px",
    display: "flex",
    gap: "8px",
    alignItems: "center",
  } as CSSStyleDeclaration);

  modal.appendChild(dropdown);
  modal.appendChild(confirm);
  document.body.appendChild(modal);

  confirm.onclick = async () => {
    const chosen = dropdown.value;
    if (chosen) {
      await updateDoc(doc(db, ASSIGNMENTS, taskId), {
        assignedMember: chosen,
        status: "in-progress",
      });
    }
    document.body.removeChild(modal);
  };
}
