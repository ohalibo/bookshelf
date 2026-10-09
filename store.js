import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

// 이 파일은 "데모 모드(로컬 브라우저 저장)"와 "실서비스 모드(Firebase)"를
// 똑같은 함수 이름으로 감싸주는 어댑터입니다. app.js / admin/app.js는 store가
// 어느 모드인지 몰라도 되게 짜여 있어요.

let storePromise = null;

export function getStore() {
  if (!storePromise) {
    storePromise = isFirebaseConfigured ? createFirestoreStore() : createLocalStore();
  }
  return storePromise;
}

export function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function entryId(bookId, person) {
  return `${bookId}__${person}`;
}

export function parseEntryId(id) {
  const idx = id.indexOf("__");
  if (idx < 0) return null;
  return { bookId: id.slice(0, idx), person: id.slice(idx + 2) };
}

// ---------------------------------------------------------------------------
// 데모 모드: localStorage. 이 브라우저에서만 보이고, 다른 사람과 공유되지 않음.
// ---------------------------------------------------------------------------
function createLocalStore() {
  const KEY = "bookshelf_demo_v1";
  const listeners = {
    books: new Set(),
    members: new Set(),
    entries: new Set(), // { bookId -> Set(cb) } 는 아래 bookEntryListeners에서 따로 관리
  };
  const bookEntryListeners = new Map(); // bookId -> Set(cb)
  const commentListeners = new Map(); // entryId -> Set(cb)
  const allCommentsListeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) throw new Error("empty");
      const data = JSON.parse(raw);
      if (!Array.isArray(data.books)) data.books = [];
      if (!Array.isArray(data.members)) data.members = [];
      if (!data.entries) data.entries = {};
      if (!Array.isArray(data.comments)) data.comments = [];
      return data;
    } catch {
      const data = { books: [], members: [], entries: {}, comments: [] };
      save(data);
      return data;
    }
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function sortedBooks(list) {
    return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  function sortedMembers(list) {
    return [...list].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  }

  function notifyBooks() {
    const list = sortedBooks(load().books);
    listeners.books.forEach((cb) => cb(list));
  }

  function notifyMembers() {
    const list = sortedMembers(load().members);
    listeners.members.forEach((cb) => cb(list));
  }

  function notifyBookEntries(bookId) {
    const set = bookEntryListeners.get(bookId);
    if (!set || !set.size) return;
    const data = load();
    const list = Object.values(data.entries).filter((e) => e.bookId === bookId);
    set.forEach((cb) => cb(list));
  }

  function notifyComments(entryIdValue) {
    const set = commentListeners.get(entryIdValue);
    if (!set || !set.size) return;
    const data = load();
    const list = data.comments
      .filter((c) => c.entryId === entryIdValue)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    set.forEach((cb) => cb(list));
  }

  function notifyAllComments() {
    if (!allCommentsListeners.size) return;
    const list = [...load().comments].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    allCommentsListeners.forEach((cb) => cb(list));
  }

  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    notifyBooks();
    notifyMembers();
    bookEntryListeners.forEach((_set, bookId) => notifyBookEntries(bookId));
    commentListeners.forEach((_set, entryIdValue) => notifyComments(entryIdValue));
    notifyAllComments();
  });

  return {
    mode: "demo",

    // ---- books ----
    subscribeBooks(cb) {
      cb(sortedBooks(load().books));
      listeners.books.add(cb);
      return () => listeners.books.delete(cb);
    },

    async saveBook(book) {
      const data = load();
      const idx = data.books.findIndex((b) => b.id === book.id);
      const now = Date.now();
      if (idx >= 0) {
        data.books[idx] = { ...data.books[idx], ...book, updatedAt: now };
      } else {
        data.books.push({ ...book, updatedAt: now });
      }
      save(data);
      notifyBooks();
    },

    async deleteBook(id) {
      const data = load();
      data.books = data.books.filter((b) => b.id !== id);
      save(data);
      notifyBooks();
    },

    // ---- members ----
    subscribeMembers(cb) {
      cb(sortedMembers(load().members));
      listeners.members.add(cb);
      return () => listeners.members.delete(cb);
    },

    async addMember(name, pin, rounds = []) {
      const data = load();
      if (data.members.some((m) => m.pin === pin)) {
        return { ok: false, error: "이미 사용 중인 번호예요." };
      }
      const id = newId();
      data.members.push({ id, name, pin, rounds, createdAt: Date.now() });
      save(data);
      notifyMembers();
      return { ok: true, id };
    },

    async updateMember(id, fields) {
      const data = load();
      if (fields.pin && data.members.some((m) => m.pin === fields.pin && m.id !== id)) {
        return { ok: false, error: "이미 사용 중인 번호예요." };
      }
      const idx = data.members.findIndex((m) => m.id === id);
      if (idx >= 0) data.members[idx] = { ...data.members[idx], ...fields };
      save(data);
      notifyMembers();
      return { ok: true };
    },

    async deleteMember(id) {
      const data = load();
      data.members = data.members.filter((m) => m.id !== id);
      save(data);
      notifyMembers();
    },

    // ---- entries (책별 개인 독후감) ----
    subscribeEntry(bookId, person, cb) {
      const id = entryId(bookId, person);
      const handler = () => cb(load().entries[id] || null);
      handler();
      // 같은 탭 안에서는 간단히 polling 없이, saveEntry 직후 수동으로 다시 불러줌
      listeners.entries.add(handler);
      return () => listeners.entries.delete(handler);
    },

    subscribeBookEntries(bookId, cb) {
      const data = load();
      const list = Object.values(data.entries).filter((e) => e.bookId === bookId);
      cb(list);
      if (!bookEntryListeners.has(bookId)) bookEntryListeners.set(bookId, new Set());
      bookEntryListeners.get(bookId).add(cb);
      return () => bookEntryListeners.get(bookId)?.delete(cb);
    },

    async saveEntry(bookId, person, title, content) {
      const data = load();
      const id = entryId(bookId, person);
      data.entries[id] = { bookId, person, title, content, updatedAt: Date.now() };
      save(data);
      listeners.entries.forEach((cb) => cb());
      notifyBookEntries(bookId);
    },

    // ---- comments (독후감 댓글) ----
    subscribeComments(entryIdValue, cb) {
      const data = load();
      const list = data.comments
        .filter((c) => c.entryId === entryIdValue)
        .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
      cb(list);
      if (!commentListeners.has(entryIdValue)) commentListeners.set(entryIdValue, new Set());
      commentListeners.get(entryIdValue).add(cb);
      return () => commentListeners.get(entryIdValue)?.delete(cb);
    },

    async addComment(entryIdValue, author, content) {
      const data = load();
      data.comments.push({ id: newId(), entryId: entryIdValue, author, content, createdAt: Date.now() });
      save(data);
      notifyComments(entryIdValue);
      notifyAllComments();
    },

    async updateComment(commentId, content) {
      const data = load();
      const c = data.comments.find((x) => x.id === commentId);
      if (!c) return;
      c.content = content;
      c.updatedAt = Date.now();
      save(data);
      notifyComments(c.entryId);
      notifyAllComments();
    },

    async deleteComment(commentId) {
      const data = load();
      const c = data.comments.find((x) => x.id === commentId);
      if (!c) return;
      data.comments = data.comments.filter((x) => x.id !== commentId);
      save(data);
      notifyComments(c.entryId);
      notifyAllComments();
    },

    subscribeAllComments(cb) {
      cb([...load().comments].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)));
      allCommentsListeners.add(cb);
      return () => allCommentsListeners.delete(cb);
    },

    async getMyEntries(person) {
      const data = load();
      return Object.values(data.entries).filter((e) => e.person === person);
    },
  };
}

// ---------------------------------------------------------------------------
// 실서비스 모드: Firebase Firestore (여러 명이 실시간으로 공유)
// ---------------------------------------------------------------------------
async function createFirestoreStore() {
  const [{ initializeApp }, firestoreMod, authMod] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js"),
    import("https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js"),
  ]);
  const {
    getFirestore,
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    collection,
    doc,
    onSnapshot,
    setDoc,
    addDoc,
    deleteDoc,
    query,
    where,
    limit,
    getDocs,
    serverTimestamp,
  } = firestoreMod;
  const { getAuth, signInAnonymously, onAuthStateChanged } = authMod;

  const app = initializeApp(firebaseConfig);
  let db;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (err) {
    console.warn("Firestore 로컬 캐시를 켜지 못했어요. 캐시 없이 계속 진행해요.", err);
    db = getFirestore(app);
  }
  const auth = getAuth(app);

  await new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) resolve(user);
    });
    signInAnonymously(auth).catch(reject);
  });

  const booksCol = collection(db, "books");
  const membersCol = collection(db, "members");
  const entriesCol = collection(db, "entries");
  const commentsCol = collection(db, "comments");

  return {
    mode: "live",

    // ---- books ----
    subscribeBooks(cb) {
      return onSnapshot(booksCol, (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        cb(list);
      });
    },

    async saveBook(book) {
      const { id, ...fields } = book;
      await setDoc(doc(db, "books", id), { ...fields, updatedAt: serverTimestamp() }, { merge: true });
    },

    async deleteBook(id) {
      await deleteDoc(doc(db, "books", id));
    },

    // ---- members ----
    subscribeMembers(cb) {
      return onSnapshot(membersCol, (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
        cb(list);
      });
    },

    async addMember(name, pin, rounds = []) {
      const dupe = await getDocs(query(membersCol, where("pin", "==", pin), limit(1)));
      if (!dupe.empty) return { ok: false, error: "이미 사용 중인 번호예요." };
      const ref = await addDoc(membersCol, { name, pin, rounds, createdAt: serverTimestamp() });
      return { ok: true, id: ref.id };
    },

    async updateMember(id, fields) {
      if (fields.pin) {
        const dupe = await getDocs(query(membersCol, where("pin", "==", fields.pin), limit(1)));
        if (!dupe.empty && dupe.docs[0].id !== id) {
          return { ok: false, error: "이미 사용 중인 번호예요." };
        }
      }
      await setDoc(doc(db, "members", id), fields, { merge: true });
      return { ok: true };
    },

    async deleteMember(id) {
      await deleteDoc(doc(db, "members", id));
    },

    // ---- entries (책별 개인 독후감) ----
    subscribeEntry(bookId, person, cb) {
      const id = entryId(bookId, person);
      return onSnapshot(doc(db, "entries", id), (snap) => {
        cb(snap.exists() ? snap.data() : null);
      });
    },

    subscribeBookEntries(bookId, cb) {
      const q = query(entriesCol, where("bookId", "==", bookId));
      return onSnapshot(q, (snap) => {
        cb(snap.docs.map((d) => d.data()));
      });
    },

    async saveEntry(bookId, person, title, content) {
      const id = entryId(bookId, person);
      await setDoc(
        doc(db, "entries", id),
        { bookId, person, title, content, updatedAt: serverTimestamp() },
        { merge: true }
      );
    },

    // ---- comments (독후감 댓글) ----
    subscribeComments(entryIdValue, cb) {
      const q = query(commentsCol, where("entryId", "==", entryIdValue));
      return onSnapshot(q, (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
        cb(list);
      });
    },

    async addComment(entryIdValue, author, content) {
      await addDoc(commentsCol, { entryId: entryIdValue, author, content, createdAt: serverTimestamp() });
    },

    async updateComment(commentId, content) {
      await setDoc(doc(db, "comments", commentId), { content, updatedAt: serverTimestamp() }, { merge: true });
    },

    async deleteComment(commentId) {
      await deleteDoc(doc(db, "comments", commentId));
    },

    subscribeAllComments(cb) {
      return onSnapshot(commentsCol, (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
        cb(list);
      });
    },

    async getMyEntries(person) {
      const snap = await getDocs(query(entriesCol, where("person", "==", person)));
      return snap.docs.map((d) => d.data());
    },
  };
}
