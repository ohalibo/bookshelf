import { getStore, entryId, parseEntryId } from "./store.js";

const COMMENTS_DIGEST_MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000;

const SESSION_KEY = "bookshelf_session";

let store = null;
let books = [];
let booksLoaded = false;
let members = [];
let session = loadSession();

let entryUnsub = null;
let bookEntriesUnsub = null;
let rowCommentsUnsubs = [];

let currentBookId = null;
let currentPeriodStatus = "open"; // "open" | "before" | "after"
let entryMode = "loading"; // "loading" | "edit" | "view"
let currentEntryTitle = "";
let currentEntryContent = "";
let currentEntrySavedAt = null;

let sortOrder = "newest"; // "newest" | "oldest"

let allComments = [];
let digestOpen = false;
let digestTab = "mine"; // "mine" | "others"

init();

async function init() {
  store = await getStore();
  router();
  store.subscribeBooks((list) => {
    books = list;
    booksLoaded = true;
    router();
    renderDigestButton();
    if (digestOpen) renderDigestPanel();
  });
  store.subscribeMembers((list) => {
    members = list;
  });
  store.subscribeAllComments((list) => {
    allComments = list;
    renderDigestButton();
    if (digestOpen) renderDigestPanel();
  });
  wireDigestButton();
}

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(iso) {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${Number(m)}.${Number(d)}`;
}

function formatRange(start, end) {
  if (!start || !end) return "";
  return `${formatDate(start)} - ${formatDate(end)}`;
}

function bookPeriodStatus(book) {
  if (!book.start && !book.end) return "open";
  const today = todayISO();
  if (book.start && today < book.start) return "before";
  if (book.end && today > book.end) return "after";
  return "open";
}

function currentMemberRecord() {
  return members.find((x) => x.name === session?.name) || null;
}

// 책에 회차가 하나도 체크 안 되어 있으면 모든 회원에게 공개. 체크돼 있으면
// 그 회차 중 하나라도 회원의 회차와 겹쳐야 보임.
function memberCanSeeBook(member, book) {
  const bookRounds = book.rounds || [];
  if (!bookRounds.length) return true;
  const memberRounds = (member && member.rounds) || [];
  return bookRounds.some((r) => memberRounds.includes(r));
}

function bookVisibleToMe(book) {
  return memberCanSeeBook(currentMemberRecord(), book);
}

function visibleBooks() {
  return books.filter(bookVisibleToMe);
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function saveSession(s) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  session = null;
  router();
}

// ---------------------------------------------------------------------------
// 댓글 알림 (우측 하단 종 모양 버튼) — 챕터n의 "댓글 모아보기"와 같은 방식
// ---------------------------------------------------------------------------
function commentsSeenKey() {
  return `bookshelf_comments_seen_${session?.name || ""}`;
}

function getCommentsSeenAt() {
  const raw = localStorage.getItem(commentsSeenKey());
  return raw ? Number(raw) : 0;
}

function markCommentsSeen() {
  localStorage.setItem(commentsSeenKey(), String(Date.now()));
}

function toMillis(t) {
  if (typeof t === "number") return t;
  return t?.toMillis?.() ?? 0;
}

function commentTimeMs(c) {
  return toMillis(c.createdAt);
}

function computeDigestRows() {
  if (!session) return { mine: [], others: [], newCount: 0 };
  const seenAt = getCommentsSeenAt();
  const cutoff = Date.now() - COMMENTS_DIGEST_MAX_AGE_MS;
  const base = allComments
    .map((c) => ({ c, parsed: parseEntryId(c.entryId) }))
    .filter((x) => x.parsed && books.some((b) => b.id === x.parsed.bookId))
    .filter((x) => commentTimeMs(x.c) >= cutoff)
    .sort((a, b) => commentTimeMs(b.c) - commentTimeMs(a.c));
  // "내가 쓴 글" 탭은 내 글이면 회차와 무관하게 항상 보여줌 (내가 쓴 거니까)
  const mine = base.filter((x) => x.parsed.person === session.name);
  // "다른 사람들" 탭은 지금 내 회차에서 볼 수 있는 책만
  const others = base.filter((x) => {
    if (x.parsed.person === session.name) return false;
    const book = books.find((b) => b.id === x.parsed.bookId);
    return !!book && bookVisibleToMe(book);
  });
  const newCount = [...mine, ...others].filter((x) => commentTimeMs(x.c) > seenAt).length;
  return { mine, others, newCount };
}

function renderDigestButton() {
  const btn = document.getElementById("commentsDigestBtn");
  if (!btn) return;
  if (!session) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  const { newCount } = computeDigestRows();
  const badge = document.getElementById("digestBadge");
  if (badge) badge.remove();
  if (newCount > 0) {
    const span = document.createElement("span");
    span.id = "digestBadge";
    span.className = "digest-badge";
    span.textContent = newCount > 9 ? "9+" : String(newCount);
    btn.appendChild(span);
  }
}

function digestRowHtml(x) {
  const book = books.find((b) => b.id === x.parsed.bookId);
  const target = digestTab === "mine" ? `#/book/${x.parsed.bookId}` : `#/members/${x.parsed.bookId}`;
  return `
    <a href="${target}" class="digest-row">
      <div class="digest-row-head"><strong>${esc(x.c.author)}</strong><span class="entry-row-time">${savedAtText(x.c.createdAt)}</span></div>
      <p class="digest-row-book">${esc(book ? book.title : "")}</p>
      <p class="digest-row-content">${esc(x.c.content)}</p>
    </a>
  `;
}

function renderDigestPanel() {
  const panel = document.getElementById("commentsDigestPanel");
  if (!panel) return;
  if (!digestOpen || !session) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  const { mine, others } = computeDigestRows();
  const rows = digestTab === "mine" ? mine : others;
  panel.hidden = false;
  panel.innerHTML = `
    <div class="digest-head">
      <button type="button" class="digest-tab ${digestTab === "mine" ? "active" : ""}" data-tab="mine">내가 쓴 글</button>
      <button type="button" class="digest-tab ${digestTab === "others" ? "active" : ""}" data-tab="others">다른 사람들</button>
    </div>
    <div class="digest-list">
      ${rows.length ? rows.map(digestRowHtml).join("") : `<p class="page-placeholder-inline">아직 댓글이 없어요.</p>`}
    </div>
  `;
  panel.querySelectorAll(".digest-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      digestTab = btn.dataset.tab;
      renderDigestPanel();
    });
  });
  panel.querySelectorAll(".digest-row").forEach((row) => {
    row.addEventListener("click", () => {
      digestOpen = false;
      panel.hidden = true;
    });
  });
}

function toggleDigestPanel() {
  digestOpen = !digestOpen;
  if (digestOpen) markCommentsSeen();
  renderDigestPanel();
  renderDigestButton();
}

function wireDigestButton() {
  const btn = document.getElementById("commentsDigestBtn");
  if (!btn) return;
  btn.addEventListener("click", toggleDigestPanel);
  document.addEventListener("click", (e) => {
    if (!digestOpen) return;
    const panel = document.getElementById("commentsDigestPanel");
    if (panel && !panel.contains(e.target) && !btn.contains(e.target)) {
      digestOpen = false;
      renderDigestPanel();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && digestOpen) {
      digestOpen = false;
      renderDigestPanel();
    }
  });
}

// ---------------------------------------------------------------------------
// 로그인 게이트
// ---------------------------------------------------------------------------
function renderGate() {
  const isDemo = store && store.mode === "demo";
  return `
    <div class="gate-wrap">
      <div class="gate-card">
        <p class="gate-kicker">Welcome</p>
        <h1>북클럽</h1>
        <p class="gate-sub">4자리 번호를 입력해서 들어가세요</p>
        <form id="pin-form" novalidate>
          <input class="pin-input" id="pin-input" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••" />
          <div class="form-error" id="pin-error"></div>
          <button type="submit" class="btn-primary">입장하기</button>
        </form>
        ${isDemo ? `<p class="demo-banner">데모 모드예요. admin 페이지의 "회원 관리"에서 먼저 번호를 등록해보세요.</p>` : ""}
      </div>
    </div>
  `;
}

function wireGate() {
  const input = document.getElementById("pin-input");
  if (!input) return;
  input.focus();
  document.getElementById("pin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = input.value.trim();
    const errorEl = document.getElementById("pin-error");
    if (!/^\d{4}$/.test(pin)) {
      errorEl.textContent = "숫자 4자리를 입력해주세요.";
      return;
    }
    const match = await store.verifyPin(pin);
    if (!match) {
      errorEl.textContent = "등록되지 않은 번호예요. 운영진에게 문의해주세요.";
      input.value = "";
      input.focus();
      return;
    }
    session = { name: match.name, pin: match.pin };
    saveSession(session);
    router();
  });
}

function renderSessionBar() {
  const bar = document.getElementById("sessionBar");
  if (!bar) return;
  if (!session) {
    bar.innerHTML = "";
    return;
  }
  bar.innerHTML = `
    <span class="session-name">${esc(session.name)}님</span>
    <button type="button" class="session-download" id="downloadBtn">독후감 다운로드</button>
    <button type="button" class="session-logout" id="logoutBtn">로그아웃</button>
  `;
  document.getElementById("logoutBtn").addEventListener("click", clearSession);
  document.getElementById("downloadBtn").addEventListener("click", downloadMyEntries);
}

async function downloadMyEntries() {
  const btn = document.getElementById("downloadBtn");
  if (btn) btn.disabled = true;
  try {
    const entries = await store.getMyEntries(session.name);
    const withContent = entries.filter((e) => e.content && e.content.trim());
    if (!withContent.length) {
      alert("아직 저장한 독후감이 없어요.");
      return;
    }
    withContent.sort((a, b) => toMillis(a.updatedAt) - toMillis(b.updatedAt));
    const lines = withContent.map((e) => {
      const book = books.find((b) => b.id === e.bookId);
      const bookTitle = book ? book.title : "(삭제된 책)";
      const author = book ? book.author : "";
      const entryTitle = e.title && e.title.trim() ? e.title : "(제목 없음)";
      return `■ ${bookTitle}${author ? ` (${author})` : ""}\n독후감 제목: ${entryTitle}\n${savedAtText(e.updatedAt)}\n\n${e.content}\n`;
    });
    const text = `${session.name}님의 독후감 모음\n${"=".repeat(20)}\n\n${lines.join("\n----------------------------------------\n\n")}`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.name}_독후감.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// 책장
// ---------------------------------------------------------------------------
function renderCover(book) {
  if (book.cover) {
    return `<img src="${book.cover}" alt="${esc(book.author)}의 책 표지">`;
  }
  const color = book.coverColor || "#eceae4";
  return `<div class="cover-placeholder" style="background:${color}">${esc(book.title)}</div>`;
}

function sortBar() {
  return `
    <div class="filter-bar">
      <span class="filter-label">정렬</span>
      <select class="sort-select" id="sort-select">
        <option value="newest" ${sortOrder === "newest" ? "selected" : ""}>최신순</option>
        <option value="oldest" ${sortOrder === "oldest" ? "selected" : ""}>오래된순</option>
      </select>
    </div>
  `;
}

function sortedBooksForDisplay() {
  const list = visibleBooks();
  list.sort((a, b) => {
    const ma = toMillis(a.createdAt);
    const mb = toMillis(b.createdAt);
    return sortOrder === "oldest" ? ma - mb : mb - ma;
  });
  return list;
}

function booksSortedByNewest() {
  return visibleBooks().sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

function bookCardsHtml(list, linkPrefix) {
  return list.map((book) => `
    <a href="#${linkPrefix}/${book.id}" class="book-card">
      <div class="book-card-head">
        <span class="book-title">${esc(book.title)}</span>
        <span class="book-author">${esc(book.author)}</span>
      </div>
      <div class="book-cover">${renderCover(book)}</div>
      <div class="book-card-foot">
        <span class="book-tag">${esc(book.tag || "")}</span>
        <span class="book-period">${book.start && book.end ? formatRange(book.start, book.end) : "상시 가능"}</span>
      </div>
    </a>
  `).join("");
}

function renderShelf() {
  if (!booksLoaded) {
    return `${sortBar()}<div class="page-placeholder"><p>불러오는 중...</p></div>`;
  }
  if (!visibleBooks().length) {
    return `${sortBar()}<div class="page-placeholder">
      <h1>아직 등록된 책이 없어요</h1>
      <p>운영진이 admin 페이지에서 책을 추가하면 여기에 보여요.</p>
    </div>`;
  }
  return `${sortBar()}<div class="book-grid">${bookCardsHtml(sortedBooksForDisplay(), "/book")}</div>`;
}

function wireShelf() {
  const select = document.getElementById("sort-select");
  if (!select) return;
  select.addEventListener("change", (e) => {
    sortOrder = e.target.value;
    const view = document.getElementById("view");
    if (view) view.innerHTML = renderShelf();
    wireShelf();
  });
}

// ---------------------------------------------------------------------------
// 책 상세 — 내 독후감 (쓰기/보기)
// ---------------------------------------------------------------------------
function periodNoticeText(status, book) {
  if (status === "before") return `${formatRange(book.start, book.end)}부터 독후감을 쓸 수 있어요.`;
  if (status === "after") return `${formatRange(book.start, book.end)}에 작성 기간이 끝났어요. 더 이상 수정할 수 없어요.`;
  return "";
}

function entryBlockHtml(periodStatus, book) {
  if (entryMode === "loading") {
    return `<p class="page-placeholder-inline">불러오는 중...</p>`;
  }

  if (periodStatus !== "open") {
    const notice = `<p class="entry-period-notice">${periodNoticeText(periodStatus, book)}</p>`;
    if (currentEntryContent) {
      return `
        ${currentEntryTitle ? `<h3 class="entry-view-title">${esc(currentEntryTitle)}</h3>` : ""}
        <p class="entry-view-content">${esc(currentEntryContent)}</p>
        <div class="entry-actions">
          <span class="entry-saved-at">${savedAtText(currentEntrySavedAt)}</span>
        </div>
        ${notice}
        ${commentsSectionHtml()}
      `;
    }
    return notice;
  }

  if (entryMode === "view") {
    const body = currentEntryContent
      ? `
        ${currentEntryTitle ? `<h3 class="entry-view-title">${esc(currentEntryTitle)}</h3>` : ""}
        <p class="entry-view-content">${esc(currentEntryContent)}</p>
      `
      : `<p class="entry-row-empty">아직 작성한 내용이 없어요.</p>`;
    return `
      ${body}
      <div class="entry-actions">
        <span class="entry-saved-at">${savedAtText(currentEntrySavedAt)}</span>
        <button type="button" class="btn-secondary-inline" id="edit-entry-btn">수정하기</button>
      </div>
      ${currentEntryContent ? commentsSectionHtml() : ""}
    `;
  }
  return `
    <input type="text" id="entry-title-input" class="entry-title-input" value="${esc(currentEntryTitle)}" placeholder="독후감 제목" maxlength="80" />
    <textarea id="entry-textarea" placeholder="이 책을 읽고 느낀 점을 자유롭게 적어보세요." rows="8">${esc(currentEntryContent)}</textarea>
    <div class="entry-actions">
      <span class="entry-saved-at" id="entry-saved-at">${savedAtText(currentEntrySavedAt)}</span>
      <button type="button" class="btn-primary-inline" id="save-entry-btn">저장</button>
    </div>
  `;
}

function renderBookEntry(id) {
  const book = books.find((b) => b.id === id);
  if (!book) {
    return `
      <a href="#/" class="back-link">← 책장으로</a>
      <div class="page-placeholder"><p>${booksLoaded ? "찾을 수 없는 책이에요." : "불러오는 중..."}</p></div>
    `;
  }
  if (!bookVisibleToMe(book)) {
    return `
      <a href="#/" class="back-link">← 책장으로</a>
      <div class="page-placeholder"><p>이 책은 내 회차에 공개된 책이 아니에요.</p></div>
    `;
  }
  currentPeriodStatus = bookPeriodStatus(book);
  return `
    <a href="#/" class="back-link">← 책장으로</a>
    <div class="book-detail">
      <div class="detail-cover">${renderCover(book)}</div>
      <div class="detail-info">
        <span class="book-tag">${esc(book.tag || "")}</span>
        <h1>${esc(book.title)}</h1>
        <p class="detail-meta">${esc(book.author)}${book.start && book.end ? ` · ${formatRange(book.start, book.end)}` : ""}</p>
        <div class="entry-block" id="entry-block">${entryBlockHtml(currentPeriodStatus, book)}</div>
      </div>
    </div>
  `;
}

function savedAtText(ts) {
  if (!ts) return "아직 저장한 기록이 없어요.";
  const ms = typeof ts === "number" ? ts : ts?.toMillis?.() ?? null;
  if (!ms) return "저장됨";
  const d = new Date(ms);
  return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} 저장됨`;
}

function commentsSectionHtml() {
  return `<div class="comments-section"><h3>댓글</h3><div class="comments" id="comments-mine"></div></div>`;
}

function rerenderEntryBlock() {
  const block = document.getElementById("entry-block");
  if (!block) return;
  const book = books.find((b) => b.id === currentBookId);
  if (book) currentPeriodStatus = bookPeriodStatus(book);
  block.innerHTML = entryBlockHtml(currentPeriodStatus, book || {});
  wireEntryBlock();
  mountOwnComments();
}

let ownCommentsUnsub = null;

function mountOwnComments() {
  if (ownCommentsUnsub) {
    ownCommentsUnsub();
    ownCommentsUnsub = null;
  }
  const box = document.getElementById("comments-mine");
  if (!box || !currentBookId || !session) return;
  const idValue = entryId(currentBookId, session.name);
  box.innerHTML = `<p class="page-placeholder-inline">댓글 불러오는 중...</p>`;
  ownCommentsUnsub = store.subscribeComments(idValue, (comments) => renderCommentsInto(box, idValue, comments));
}

// ---------------------------------------------------------------------------
// 댓글 (독후감 하나에 달리는 짧은 댓글 목록)
// ---------------------------------------------------------------------------
function commentRowHtml(c) {
  const mine = session && c.author === session.name;
  return `
    <div class="comment-row">
      <div class="comment-row-head">
        <strong>${esc(c.author)}</strong>
        <span class="entry-row-time">${savedAtText(c.createdAt)}</span>
        ${mine ? `
          <span class="comment-row-actions">
            <button type="button" class="comment-edit-btn" data-id="${c.id}">수정</button>
            <button type="button" class="comment-delete-btn" data-id="${c.id}">삭제</button>
          </span>
        ` : ""}
      </div>
      <p class="comment-content" data-id="${c.id}">${esc(c.content)}</p>
    </div>
  `;
}

function commentsHtml(comments) {
  const list = comments.length
    ? comments.map(commentRowHtml).join("")
    : `<p class="page-placeholder-inline">아직 댓글이 없어요.</p>`;
  return `
    <div class="comments-list">${list}</div>
    <form class="comment-form">
      <input type="text" class="comment-input" placeholder="댓글을 남겨보세요" maxlength="300" autocomplete="off" />
      <button type="submit" class="btn-secondary-inline comment-submit">등록</button>
    </form>
  `;
}

function wireCommentForm(box, entryIdValue) {
  const form = box.querySelector(".comment-form");
  if (!form) return;
  const submit = async () => {
    const input = box.querySelector(".comment-input");
    const content = input.value.trim();
    if (!content) return;
    const btn = box.querySelector(".comment-submit");
    btn.disabled = true;
    await store.addComment(entryIdValue, session.name, content);
    input.value = "";
    btn.disabled = false;
    input.focus();
  };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submit();
  });
}

function startEditComment(box, commentId) {
  const p = box.querySelector(`.comment-content[data-id="${commentId}"]`);
  if (!p) return;
  const original = p.textContent;
  const wrap = document.createElement("div");
  wrap.className = "comment-edit-form";
  wrap.innerHTML = `
    <input type="text" class="comment-edit-input" value="${esc(original)}" maxlength="300" />
    <div class="comment-edit-actions">
      <button type="button" class="btn-secondary-inline comment-save-btn">저장</button>
      <button type="button" class="btn-secondary-inline comment-cancel-btn">취소</button>
    </div>
  `;
  p.replaceWith(wrap);
  const input = wrap.querySelector(".comment-edit-input");
  input.focus();
  wrap.querySelector(".comment-save-btn").addEventListener("click", async () => {
    const content = input.value.trim();
    if (!content) return;
    await store.updateComment(commentId, content);
  });
  wrap.querySelector(".comment-cancel-btn").addEventListener("click", () => {
    const restored = document.createElement("p");
    restored.className = "comment-content";
    restored.dataset.id = commentId;
    restored.textContent = original;
    wrap.replaceWith(restored);
  });
}

function wireCommentRows(box) {
  box.querySelectorAll(".comment-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => startEditComment(box, btn.dataset.id));
  });
  box.querySelectorAll(".comment-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("댓글을 삭제할까요?")) return;
      await store.deleteComment(btn.dataset.id);
    });
  });
}

function renderCommentsInto(box, entryIdValue, comments) {
  box.innerHTML = commentsHtml(comments);
  wireCommentForm(box, entryIdValue);
  wireCommentRows(box);
}

function mountCommentsBox(box, idValue) {
  if (!box) return;
  box.innerHTML = `<p class="page-placeholder-inline">댓글 불러오는 중...</p>`;
  const unsub = store.subscribeComments(idValue, (comments) => renderCommentsInto(box, idValue, comments));
  rowCommentsUnsubs.push(unsub);
}

function isEditingNow() {
  const active = document.activeElement;
  return active?.id === "entry-textarea" || active?.id === "entry-title-input";
}

function wireEntryBlock() {
  const saveBtn = document.getElementById("save-entry-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const titleInput = document.getElementById("entry-title-input");
      const ta = document.getElementById("entry-textarea");
      const title = titleInput.value.trim();
      const content = ta.value;
      saveBtn.disabled = true;
      await store.saveEntry(currentBookId, session.name, title, content);
      currentEntryTitle = title;
      currentEntryContent = content;
      currentEntrySavedAt = Date.now();
      entryMode = "view";
      rerenderEntryBlock();
    });
  }
  const editBtn = document.getElementById("edit-entry-btn");
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      entryMode = "edit";
      rerenderEntryBlock();
      document.getElementById("entry-textarea")?.focus();
    });
  }
}

// ---------------------------------------------------------------------------
// 멤버 — 책 선택 → 그 책의 다른 멤버 독후감
// ---------------------------------------------------------------------------
function renderMembersBookList() {
  if (!booksLoaded) {
    return `<div class="page-placeholder"><p>불러오는 중...</p></div>`;
  }
  if (!visibleBooks().length) {
    return `<div class="page-placeholder">
      <h1>아직 등록된 책이 없어요</h1>
      <p>운영진이 admin 페이지에서 책을 추가하면 여기에 보여요.</p>
    </div>`;
  }
  return `
    <div class="page-heading">
      <h1>멤버들의 독후감</h1>
      <p>책을 선택하면 그 책을 읽은 다른 멤버들의 독후감을 볼 수 있어요.</p>
    </div>
    <div class="book-grid">${bookCardsHtml(booksSortedByNewest(), "/members")}</div>
  `;
}

function renderMembersForBook(id) {
  const book = books.find((b) => b.id === id);
  if (!book) {
    return `
      <a href="#/members" class="back-link">← 책 목록으로</a>
      <div class="page-placeholder"><p>${booksLoaded ? "찾을 수 없는 책이에요." : "불러오는 중..."}</p></div>
    `;
  }
  if (!bookVisibleToMe(book)) {
    return `
      <a href="#/members" class="back-link">← 책 목록으로</a>
      <div class="page-placeholder"><p>이 책은 내 회차에 공개된 책이 아니에요.</p></div>
    `;
  }
  return `
    <a href="#/members" class="back-link">← 책 목록으로</a>
    <div class="members-page-heading">
      <span class="book-tag">${esc(book.tag || "")}</span>
      <h1>${esc(book.title)}</h1>
      <p class="detail-meta">${esc(book.author)}${book.start && book.end ? ` · ${formatRange(book.start, book.end)}` : ""}</p>
    </div>
    <div class="entries-section">
      <div class="entry-list" id="entry-list"><p class="page-placeholder-inline">불러오는 중...</p></div>
    </div>
  `;
}

function clearRowCommentsUnsubs() {
  rowCommentsUnsubs.forEach((u) => u && u());
  rowCommentsUnsubs = [];
}

function renderEntryList(bookId, entries) {
  const el = document.getElementById("entry-list");
  if (!el) return;
  clearRowCommentsUnsubs();
  const book = books.find((b) => b.id === bookId);
  const byPerson = new Map(entries.map((e) => [e.person, e]));
  const sameRoundMembers = book
    ? members.filter((m) => memberCanSeeBook(m, book)).map((m) => m.name)
    : [];
  const roster = (sameRoundMembers.length ? sameRoundMembers : [...byPerson.keys()])
    .filter((name) => name !== session.name);
  if (!roster.length) {
    el.innerHTML = `<p class="page-placeholder-inline">아직 다른 멤버가 없어요.</p>`;
    return;
  }
  // 아직 안 쓴 사람은 따로 표시하지 않고 그냥 목록에서 빠짐
  const written = roster
    .map((name) => ({ name, entry: byPerson.get(name) }))
    .filter((x) => x.entry && x.entry.content);
  if (!written.length) {
    el.innerHTML = `<p class="page-placeholder-inline">아직 작성된 독후감이 없어요.</p>`;
    return;
  }
  el.innerHTML = written.map((x, i) => {
    const titleText = x.entry.title && x.entry.title.trim() ? x.entry.title : "(제목 없음)";
    return `
      <div class="entry-row">
        <button type="button" class="entry-row-toggle" data-idx="${i}" aria-expanded="false">
          <span class="entry-row-num">${i + 1}</span>
          <span class="entry-row-chevron">▸</span>
          <span class="entry-row-toggle-title">${esc(titleText)}</span>
          <span class="entry-row-toggle-meta"><strong>${esc(x.name)}</strong><span class="entry-row-time">${savedAtText(x.entry.updatedAt)}</span></span>
        </button>
        <div class="entry-row-body" id="entry-row-body-${i}" hidden>
          <p class="entry-row-content">${esc(x.entry.content)}</p>
          <div class="comments-section"><h3>댓글</h3><div class="comments" id="comments-row-${i}"></div></div>
        </div>
      </div>
    `;
  }).join("");

  written.forEach((x, i) => {
    const toggleBtn = el.querySelector(`.entry-row-toggle[data-idx="${i}"]`);
    const body = document.getElementById(`entry-row-body-${i}`);
    if (!toggleBtn || !body) return;
    let mounted = false;
    toggleBtn.addEventListener("click", () => {
      const wasOpen = !body.hidden;
      body.hidden = wasOpen;
      toggleBtn.setAttribute("aria-expanded", String(!wasOpen));
      toggleBtn.classList.toggle("open", !wasOpen);
      if (!wasOpen && !mounted) {
        mounted = true;
        mountCommentsBox(document.getElementById(`comments-row-${i}`), entryId(bookId, x.name));
      }
    });
  });
}

function updateNavActive(route) {
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === route);
  });
}

function cleanupSubscriptions() {
  if (entryUnsub) {
    entryUnsub();
    entryUnsub = null;
  }
  if (bookEntriesUnsub) {
    bookEntriesUnsub();
    bookEntriesUnsub = null;
  }
  if (ownCommentsUnsub) {
    ownCommentsUnsub();
    ownCommentsUnsub = null;
  }
  clearRowCommentsUnsubs();
}

function router() {
  const view = document.getElementById("view");
  if (!view || !store) return;

  renderSessionBar();
  renderDigestButton();

  if (!session) {
    cleanupSubscriptions();
    digestOpen = false;
    renderDigestPanel();
    view.innerHTML = renderGate();
    updateNavActive(null);
    wireGate();
    return;
  }

  const hash = location.hash || "#/";
  const path = hash.replace(/^#/, "") || "/";

  if (path === "/") {
    cleanupSubscriptions();
    view.innerHTML = renderShelf();
    wireShelf();
    updateNavActive("shelf");
  } else if (path === "/members") {
    cleanupSubscriptions();
    view.innerHTML = renderMembersBookList();
    updateNavActive("members");
  } else if (/^\/members\/[^/]+$/.test(path)) {
    const id = path.split("/")[2];
    cleanupSubscriptions();
    view.innerHTML = renderMembersForBook(id);
    updateNavActive("members");
    bookEntriesUnsub = store.subscribeBookEntries(id, (entries) => renderEntryList(id, entries));
  } else if (path.startsWith("/book/")) {
    const id = path.split("/")[2];
    cleanupSubscriptions();
    currentBookId = id;
    entryMode = "loading";
    currentEntryTitle = "";
    currentEntryContent = "";
    currentEntrySavedAt = null;
    view.innerHTML = renderBookEntry(id);
    updateNavActive("shelf");
    entryUnsub = store.subscribeEntry(id, session.name, (entry) => {
      if (isEditingNow()) return;
      currentEntryTitle = entry?.title || "";
      currentEntryContent = entry?.content || "";
      currentEntrySavedAt = entry?.updatedAt || null;
      entryMode = currentEntryContent ? "view" : "edit";
      rerenderEntryBlock();
    });
  } else {
    cleanupSubscriptions();
    view.innerHTML = renderShelf();
    wireShelf();
    updateNavActive("shelf");
  }

  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", router);
