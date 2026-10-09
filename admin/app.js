import { getStore, newId } from "../store.js";
import { COVER_MAX_WIDTH, COVER_JPEG_QUALITY, MAX_COVER_BASE64, DEFAULT_COVER_COLOR, KNOWN_ROUNDS } from "../config.js";

// ⚠️ 배포 전에 아래 문구를 꼭 바꾸세요. 이 파일은 브라우저에 그대로 내려가므로
// "아무나 못 찾는 주소 + 이 암호" 조합일 뿐, 완전한 보안은 아니에요.
const ADMIN_PASSCODE = "granite-violet-cedar-45";
const SESSION_KEY = "bookshelf_admin_session";

const TABS = [
  { key: "books", label: "책 관리" },
  { key: "members", label: "회원 관리" },
];

const root = document.getElementById("app");

let store = null;
let books = [];
let members = [];
let activeTab = "books";

let bookSelectedId = null;
let bookDraft = null;
let bookDirty = false;

let memberSelectedId = null;
let memberDraft = null;
let memberDirty = false;

init();

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function init() {
  if (sessionStorage.getItem(SESSION_KEY) !== "ok") {
    renderGate();
    return;
  }
  boot();
}

function renderGate() {
  root.innerHTML = `
    <div class="gate-wrap">
      <div class="gate-card">
        <p class="gate-kicker">Admin</p>
        <h1>Bookshelf admin</h1>
        <p>운영진 암호를 입력하세요</p>
        <form id="pw-form" novalidate>
          <input type="password" id="pw-input" autocomplete="off" />
          <div class="form-error" id="pw-error"></div>
          <button type="submit" class="btn-primary">입장하기</button>
        </form>
      </div>
    </div>
  `;
  document.getElementById("pw-input").focus();
  document.getElementById("pw-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const val = document.getElementById("pw-input").value;
    if (val === ADMIN_PASSCODE) {
      sessionStorage.setItem(SESSION_KEY, "ok");
      boot();
    } else {
      document.getElementById("pw-error").textContent = "암호가 올바르지 않아요.";
    }
  });
}

async function boot() {
  root.innerHTML = `<div class="admin-app"><p class="empty-state">불러오는 중...</p></div>`;
  store = await getStore();
  store.subscribeBooks((list) => {
    books = list;
    if (!bookSelectedId && !bookDraft && books.length) {
      bookSelectedId = books[0].id;
      bookDraft = { ...books[0], rounds: books[0].rounds || [] };
    }
    render();
  });
  store.subscribeMembers((list) => {
    members = list;
    render();
  });
}

function render() {
  root.innerHTML = `
    <div class="admin-app">
      <header class="admin-header">
        <h1>Bookshelf admin</h1>
        <span class="mode-badge">${store.mode === "demo" ? "데모 모드" : "실서비스 모드"}</span>
      </header>
      <nav class="admin-tabs">
        ${TABS.map((t) => `<button class="tab-btn ${activeTab === t.key ? "active" : ""}" data-tab="${t.key}">${t.label}</button>`).join("")}
      </nav>
      <div class="admin-body">
        <aside class="book-list" id="list-pane"></aside>
        <main class="book-editor" id="editor"></main>
      </div>
    </div>
  `;

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      render();
    });
  });

  if (activeTab === "books") {
    renderBookList();
    renderBookEditor();
  } else {
    renderMemberList();
    renderMemberEditor();
  }
}

// ---------------------------------------------------------------------------
// 책 관리
// ---------------------------------------------------------------------------
function emptyBookDraft() {
  const maxOrder = books.length ? Math.max(...books.map((b) => b.order ?? 0)) : -1;
  return {
    id: newId(),
    author: "",
    title: "",
    tag: `VOL. ${String(books.length + 1).padStart(2, "0")}`,
    rounds: [],
    cover: null,
    coverColor: DEFAULT_COVER_COLOR,
    start: "",
    end: "",
    order: maxOrder + 1,
    createdAt: Date.now(),
    isNew: true,
  };
}

function startNewBook() {
  bookSelectedId = null;
  bookDraft = emptyBookDraft();
  bookDirty = true;
  render();
}

function selectBook(id) {
  if (bookDirty && !confirm("저장하지 않은 내용이 있어요. 버리고 이동할까요?")) return;
  bookSelectedId = id;
  const book = books.find((b) => b.id === id);
  bookDraft = book ? { ...book, rounds: book.rounds || [] } : null;
  bookDirty = false;
  render();
}

function markBookDirty() {
  bookDirty = true;
  const btn = document.getElementById("save-book-btn");
  if (btn) btn.disabled = false;
}

function renderBookList() {
  const pane = document.getElementById("list-pane");
  pane.innerHTML = `
    <button class="btn-new" id="new-book-btn">+ 새 책 추가</button>
    <ul>
      ${books.length ? books.map((b, i) => `
        <li class="book-row ${b.id === bookSelectedId ? "active" : ""}" data-id="${b.id}">
          <span class="row-order">
            <button class="order-btn" data-dir="up" data-id="${b.id}" ${i === 0 ? "disabled" : ""} title="위로">▲</button>
            <button class="order-btn" data-dir="down" data-id="${b.id}" ${i === books.length - 1 ? "disabled" : ""} title="아래로">▼</button>
          </span>
          <span class="row-label">
            <strong>${esc(b.author) || "(작성자 미정)"}</strong>
            <small>${esc(b.title) || "(제목 없음)"}${b.rounds && b.rounds.length ? ` · ${esc(b.rounds.join(", "))}` : ""}</small>
          </span>
        </li>
      `).join("") : '<li class="empty-state">아직 책이 없어요.<br>"새 책 추가"로 시작하세요.</li>'}
    </ul>
  `;

  document.getElementById("new-book-btn").addEventListener("click", startNewBook);
  pane.querySelectorAll(".book-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".order-btn")) return;
      selectBook(row.dataset.id);
    });
  });
  pane.querySelectorAll(".order-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      reorderBook(btn.dataset.id, btn.dataset.dir);
    });
  });
}

async function reorderBook(id, dir) {
  const idx = books.findIndex((b) => b.id === id);
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= books.length) return;
  const a = books[idx];
  const b = books[swapIdx];
  const orderA = a.order ?? idx;
  const orderB = b.order ?? swapIdx;
  await store.saveBook({ id: a.id, order: orderB });
  await store.saveBook({ id: b.id, order: orderA });
}

function renderBookEditor() {
  const el = document.getElementById("editor");
  if (!bookDraft) {
    el.innerHTML = `<p class="empty-state">왼쪽에서 책을 선택하거나 "새 책 추가"를 눌러주세요.</p>`;
    return;
  }
  el.innerHTML = `
    <div class="field">
      <label>작성자</label>
      <input type="text" id="f-author" value="${esc(bookDraft.author)}" placeholder="예: 김영서" />
    </div>
    <div class="field">
      <label>책 제목</label>
      <input type="text" id="f-title" value="${esc(bookDraft.title)}" placeholder="예: 서른의 기록" />
    </div>
    <div class="field">
      <label>태그 (볼륨 표시)</label>
      <input type="text" id="f-tag" value="${esc(bookDraft.tag)}" placeholder="예: VOL. 01" />
    </div>
    <div class="field">
      <label>회차 <span class="field-hint-inline">(아무 것도 안 고르면 모든 회원에게 공개)</span></label>
      <div class="round-checks" id="book-round-checks">
        ${KNOWN_ROUNDS.map((r) => `
          <label class="round-check">
            <input type="checkbox" value="${esc(r)}" ${bookDraft.rounds.includes(r) ? "checked" : ""} />
            ${esc(r)}
          </label>
        `).join("")}
      </div>
    </div>
    <div class="field">
      <label>독후감 작성 기간 <span class="field-hint-inline">(비워두면 기간 제한 없이 항상 작성 가능)</span></label>
      <div class="field-row">
        <input type="date" id="f-start" value="${esc(bookDraft.start || "")}" />
        <span class="field-row-sep">~</span>
        <input type="date" id="f-end" value="${esc(bookDraft.end || "")}" />
      </div>
      <p class="field-hint" id="date-error"></p>
    </div>
    <div class="field">
      <label>표지 배경색 <span class="field-hint-inline">(이미지 없을 때 대신 보여요)</span></label>
      <input type="color" id="f-color" value="${bookDraft.coverColor || DEFAULT_COVER_COLOR}" />
    </div>
    <div class="field">
      <label>표지 이미지</label>
      <div class="cover-preview" id="cover-preview">
        ${bookDraft.cover
          ? `<img src="${bookDraft.cover}" alt="표지 미리보기" />`
          : `<div class="cover-placeholder-mini" style="background:${bookDraft.coverColor || DEFAULT_COVER_COLOR}">${esc(bookDraft.title) || "표지 없음"}</div>`}
      </div>
      <div class="cover-actions">
        <button type="button" id="upload-btn" class="btn-secondary">이미지 선택</button>
        ${bookDraft.cover ? '<button type="button" id="remove-cover-btn" class="btn-secondary">이미지 제거</button>' : ""}
      </div>
      <input type="file" id="cover-input" accept="image/*" hidden />
      <p class="field-hint" id="cover-error"></p>
    </div>
    <div class="editor-actions">
      <button type="button" id="save-book-btn" class="btn-primary" ${bookDirty ? "" : "disabled"}>저장</button>
      ${bookDraft.isNew ? "" : '<button type="button" id="delete-book-btn" class="btn-danger">삭제</button>'}
    </div>
  `;

  document.getElementById("f-author").addEventListener("input", (e) => {
    bookDraft.author = e.target.value;
    markBookDirty();
  });
  document.getElementById("f-title").addEventListener("input", (e) => {
    bookDraft.title = e.target.value;
    markBookDirty();
    refreshCoverPlaceholder();
  });
  document.getElementById("f-tag").addEventListener("input", (e) => {
    bookDraft.tag = e.target.value;
    markBookDirty();
  });
  document.querySelectorAll('#book-round-checks input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) {
        if (!bookDraft.rounds.includes(cb.value)) bookDraft.rounds.push(cb.value);
      } else {
        bookDraft.rounds = bookDraft.rounds.filter((r) => r !== cb.value);
      }
      markBookDirty();
    });
  });
  document.getElementById("f-start").addEventListener("input", (e) => {
    bookDraft.start = e.target.value;
    markBookDirty();
  });
  document.getElementById("f-end").addEventListener("input", (e) => {
    bookDraft.end = e.target.value;
    markBookDirty();
  });
  document.getElementById("f-color").addEventListener("input", (e) => {
    bookDraft.coverColor = e.target.value;
    markBookDirty();
    refreshCoverPlaceholder();
  });
  document.getElementById("upload-btn").addEventListener("click", () => {
    document.getElementById("cover-input").click();
  });
  document.getElementById("cover-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const errorEl = document.getElementById("cover-error");
    errorEl.textContent = "";
    try {
      const dataUrl = await compressImage(file);
      if (dataUrl.length > MAX_COVER_BASE64) {
        errorEl.textContent = "이미지 용량이 너무 커요. 다른 사진으로 시도해주세요.";
        return;
      }
      bookDraft.cover = dataUrl;
      markBookDirty();
      renderBookEditor();
    } catch (err) {
      console.error(err);
      errorEl.textContent = "이미지를 불러오지 못했어요.";
    }
  });
  const removeCoverBtn = document.getElementById("remove-cover-btn");
  if (removeCoverBtn) {
    removeCoverBtn.addEventListener("click", () => {
      bookDraft.cover = null;
      markBookDirty();
      renderBookEditor();
    });
  }
  document.getElementById("save-book-btn").addEventListener("click", saveBookDraft);
  const deleteBtn = document.getElementById("delete-book-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!confirm(`"${bookDraft.title || bookDraft.author}"을(를) 삭제할까요?`)) return;
      await store.deleteBook(bookDraft.id);
      bookSelectedId = null;
      bookDraft = null;
      bookDirty = false;
      render();
    });
  }
}

function refreshCoverPlaceholder() {
  if (bookDraft.cover) return;
  const preview = document.getElementById("cover-preview");
  if (!preview) return;
  preview.innerHTML = `<div class="cover-placeholder-mini" style="background:${bookDraft.coverColor || DEFAULT_COVER_COLOR}">${esc(bookDraft.title) || "표지 없음"}</div>`;
}

async function saveBookDraft() {
  const dateErrorEl = document.getElementById("date-error");
  if (dateErrorEl) dateErrorEl.textContent = "";
  if (!bookDraft.author.trim() || !bookDraft.title.trim()) {
    alert("작성자와 책 제목은 꼭 입력해주세요.");
    return;
  }
  if (bookDraft.start && bookDraft.end && bookDraft.end < bookDraft.start) {
    if (dateErrorEl) dateErrorEl.textContent = "종료일이 시작일보다 빠를 수 없어요.";
    return;
  }
  const { isNew, ...book } = bookDraft;
  await store.saveBook(book);
  bookDirty = false;
  bookSelectedId = bookDraft.id;
  bookDraft.isNew = false;
  render();
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, COVER_MAX_WIDTH / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", COVER_JPEG_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// 회원 관리
// ---------------------------------------------------------------------------
function emptyMemberDraft() {
  return { id: newId(), name: "", pin: "", rounds: [], isNew: true };
}

function startNewMember() {
  memberSelectedId = null;
  memberDraft = emptyMemberDraft();
  memberDirty = true;
  render();
}

function selectMember(id) {
  if (memberDirty && !confirm("저장하지 않은 내용이 있어요. 버리고 이동할까요?")) return;
  memberSelectedId = id;
  const member = members.find((m) => m.id === id);
  memberDraft = member ? { ...member, rounds: member.rounds || [] } : null;
  memberDirty = false;
  render();
}

function markMemberDirty() {
  memberDirty = true;
  const btn = document.getElementById("save-member-btn");
  if (btn) btn.disabled = false;
}

function renderMemberList() {
  const pane = document.getElementById("list-pane");
  pane.innerHTML = `
    <button class="btn-new" id="new-member-btn">+ 새 회원 추가</button>
    <ul>
      ${members.length ? members.map((m) => `
        <li class="book-row ${m.id === memberSelectedId ? "active" : ""}" data-id="${m.id}">
          <span class="row-label">
            <strong>${esc(m.name) || "(이름 미정)"}</strong>
            <small>PIN ${esc(m.pin)}${m.rounds && m.rounds.length ? ` · ${esc(m.rounds.join(", "))}` : ""}</small>
          </span>
        </li>
      `).join("") : '<li class="empty-state">아직 회원이 없어요.<br>"새 회원 추가"로 시작하세요.</li>'}
    </ul>
  `;

  document.getElementById("new-member-btn").addEventListener("click", startNewMember);
  pane.querySelectorAll(".book-row").forEach((row) => {
    row.addEventListener("click", () => selectMember(row.dataset.id));
  });
}

function renderMemberEditor() {
  const el = document.getElementById("editor");
  if (!memberDraft) {
    el.innerHTML = `<p class="empty-state">왼쪽에서 회원을 선택하거나 "새 회원 추가"를 눌러주세요.</p>`;
    return;
  }
  el.innerHTML = `
    <div class="field">
      <label>이름</label>
      <input type="text" id="f-name" value="${esc(memberDraft.name)}" placeholder="예: 김영서" />
    </div>
    <div class="field">
      <label>로그인 번호 (4자리 숫자)</label>
      <input type="text" id="f-pin" inputmode="numeric" maxlength="4" value="${esc(memberDraft.pin)}" placeholder="예: 1234" />
      <p class="field-hint" id="member-error"></p>
    </div>
    <div class="field">
      <label>회차 <span class="field-hint-inline">(아무 것도 안 고르면 모든 책을 볼 수 있음)</span></label>
      <div class="round-checks" id="member-round-checks">
        ${KNOWN_ROUNDS.map((r) => `
          <label class="round-check">
            <input type="checkbox" value="${esc(r)}" ${memberDraft.rounds.includes(r) ? "checked" : ""} />
            ${esc(r)}
          </label>
        `).join("")}
      </div>
    </div>
    <div class="editor-actions">
      <button type="button" id="save-member-btn" class="btn-primary" ${memberDirty ? "" : "disabled"}>저장</button>
      ${memberDraft.isNew ? "" : '<button type="button" id="delete-member-btn" class="btn-danger">삭제</button>'}
    </div>
  `;

  document.getElementById("f-name").addEventListener("input", (e) => {
    memberDraft.name = e.target.value;
    markMemberDirty();
  });
  document.getElementById("f-pin").addEventListener("input", (e) => {
    memberDraft.pin = e.target.value.replace(/\D/g, "").slice(0, 4);
    e.target.value = memberDraft.pin;
    markMemberDirty();
  });
  document.querySelectorAll('#member-round-checks input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) {
        if (!memberDraft.rounds.includes(cb.value)) memberDraft.rounds.push(cb.value);
      } else {
        memberDraft.rounds = memberDraft.rounds.filter((r) => r !== cb.value);
      }
      markMemberDirty();
    });
  });
  document.getElementById("save-member-btn").addEventListener("click", saveMemberDraft);
  const deleteBtn = document.getElementById("delete-member-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!confirm(`"${memberDraft.name}"님을 삭제할까요?`)) return;
      await store.deleteMember(memberDraft.id);
      memberSelectedId = null;
      memberDraft = null;
      memberDirty = false;
      render();
    });
  }
}

async function saveMemberDraft() {
  const errorEl = document.getElementById("member-error");
  errorEl.textContent = "";
  if (!memberDraft.name.trim()) {
    errorEl.textContent = "이름을 입력해주세요.";
    return;
  }
  if (!/^\d{4}$/.test(memberDraft.pin)) {
    errorEl.textContent = "로그인 번호는 숫자 4자리여야 해요.";
    return;
  }
  let result;
  if (memberDraft.isNew) {
    result = await store.addMember(memberDraft.name.trim(), memberDraft.pin, memberDraft.rounds);
  } else {
    result = await store.updateMember(memberDraft.id, {
      name: memberDraft.name.trim(),
      pin: memberDraft.pin,
      rounds: memberDraft.rounds,
    });
  }
  if (!result.ok) {
    errorEl.textContent = result.error;
    return;
  }
  if (memberDraft.isNew && result.id) {
    memberDraft.id = result.id;
  }
  memberDirty = false;
  memberDraft.isNew = false;
  memberSelectedId = memberDraft.id;
  render();
}
