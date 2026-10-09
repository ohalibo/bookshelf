# bookshelf — 진행 상황

여러 명이 함께 쓰는 "책장" 웹앱. chap.n(`/Users/ohalibo/projects/chap.n`)과
같은 패턴(빌드 없는 순수 JS, 데모 모드 ↔ Firebase 실서비스 모드 어댑터)을
참고해서 시작함.

**⚠️ 폴더명 변경 이력**: 처음에 `booshelf`(오타, k 빠짐)로 만들었다가 사용자가
지적해서 `bookshelf`로 폴더명 + 코드 내 모든 참조(`BOOSHELF` 브랜드명,
localStorage 키, admin 문구 등)를 일괄 변경함. 지금 경로는
`/Users/ohalibo/projects/bookshelf`.

**⚠️ 용어**: 사용자가 "이제부터 어드민 아닌 실제 공개 페이지는 <독서록>이라고
부르겠다"고 선언함. 브랜드/파일명은 그대로 두고(요청받지 않았음), 대화 중에만
"독서록 = 공개 사이트"로 이해하면 됨.

## 지금까지 한 것 (최신순)

1. **멤버 탭 목록에 순번 추가 + 안 쓴 사람은 아예 목록에서 제외** — 사용자가
   "순번 없이 토글만 있으니 헷갈린다", "작성 안 한 사람은 '작성하지
   않았어요'로 보여줄 필요 없이 그냥 목록에서 빼달라"고 요청. `renderEntryList`에서
   `written`(content 있는 사람만 필터링한 배열)을 따로 만들어서 그걸로만
   렌더링, 각 줄 맨 앞에 1부터 시작하는 순번(`.entry-row-num`) 추가. 아무도
   안 썼으면 "아직 작성된 독후감이 없어요"로 안내 (로스터 자체가 비어있는
   "아직 다른 멤버가 없어요"와는 구분됨)
2. **독후감 제목 필드 추가 + 멤버 탭 아코디언 + admin 빈 화면 버그 수정**
   - **버그 수정**: 사용자가 "어드민에 내용이 안 보여"라고 보고. 원인은
     회차를 체크박스(배열)로 바꾸면서, `rounds` 필드가 없는 예전 책/회원
     데이터를 불러오면 `bookDraft.rounds.includes(...)`가 undefined에서
     터지는 거였음. `selectBook`/`selectMember`/책 목록 자동 선택, 이 세
     군데에서 draft를 만들 때 `rounds: x.rounds || []`로 정규화해서 해결.
     **교훈**: 스키마를 바꿀 때는 기존 데이터에 새 필드가 없을 수 있다는 걸
     항상 가정하고 방어 코드를 넣어야 함 — 이번처럼 테스트 데이터가 세션
     내내 누적되는 프로젝트에서는 특히
   - **독후감 제목**: `entries` 문서에 `title` 필드 추가.
     `store.saveEntry(bookId, person, title, content)`로 시그니처 변경 (기존
     3개 인자 → 4개). 내 독후감 편집 화면에 제목 input 한 줄 + 본문
     textarea로 분리
   - **멤버 탭 아코디언**: `renderEntryList`를 전부 펼쳐서 보여주던 것에서,
     제목(`.entry-row-toggle`)을 누르면 그 아래 본문+댓글(`.entry-row-body`)이
     펼쳐지는 방식으로 변경. 댓글 구독(`mountCommentsBox`)은 **처음 펼칠 때만**
     지연 마운트하도록 해서, 안 펼친 줄까지 전부 댓글을 미리 구독하는 낭비를
     없앰 (`mounted` 클로저 플래그로 중복 마운트 방지)
2. **회차를 자유 텍스트 → 체크박스(복수 선택)로 변경** — 바로 전 턴에서
   `book.round`/`member.round`를 문자열 하나로 만들었는데, 사용자가 "체크박스로
   해서 1~4회차 만들어두고 나중에 더 추가하는 식으로 해도 될까"라고 요청.
   - `config.js`에 `KNOWN_ROUNDS = ["1회차","2회차","3회차","4회차"]` 추가 —
     새 회차 생기면 여기 한 줄만 추가하면 admin 체크박스에 자동 반영됨
   - 데이터 모델을 **단일 string → string 배열**로 변경:
     `book.rounds`/`member.rounds` (예전 `book.round`/`member.round` 필드는
     이제 안 씀 — 데모 모드에서 이전에 텍스트로 넣어본 값이 있다면 더 이상
     적용 안 되니 체크박스로 다시 설정해야 함)
   - 매칭 로직도 정확히 일치 → **겹치면 됨**(교집합)으로 변경:
     `memberCanSeeBook(member, book)` — 책에 체크된 회차가 하나도 없으면
     전체 공개, 있으면 회원의 회차 중 하나라도 겹쳐야 보임
   - admin 책 관리/회원 관리 폼 둘 다 `KNOWN_ROUNDS`를 매핑한 체크박스 그룹으로
     교체 (`.round-checks`/`.round-check`)
2. **회차(기수) 구분 + 독후감 다운로드** — 사용자가 "독서모임 회원이 매번
   바뀌는데, 책/회원마다 회차를 지정해서 그 회차 것만 보이고 쓸 수 있게 할 수
   있나?"와 "내가 쓴 독후감 파일로 다운받기"를 같이 요청함
   - **회차**: `books`와 `members` 둘 다 `round`(string, 비워두면 전체
     공개) 필드 추가. admin 책/회원 편집 폼에 입력칸 추가. 공개 사이트는
     `currentMemberRound()`(로그인한 이름으로 `members`에서 조회)와
     `bookVisibleToMe(book)` = `(book.round||"") === currentMemberRound()`로
     판정. **빈 값끼리는 항상 매치**되게 해서(`"" === ""`) 기존 데이터(회차
     설정 전)는 그대로 전체 공개로 동작 — 하위 호환 깨지지 않게 의도적으로
     설계함
     - 책장(`visibleBooks()`)·멤버→책 목록 둘 다 필터링됨
     - `#/book/:id`, `#/members/:id` 직접 URL 접근 시에도
       `bookVisibleToMe` 재확인해서 "이 책은 내 회차에 공개된 책이
       아니에요" 표시 (그냥 숨기기만 한 게 아니라 직접 접근도 막음)
     - 멤버 탭의 "다른 회원" 명단도 그 책과 같은 회차인 멤버만 (다른 회차
       사람은 애초에 그 책을 못 봤을 테니)
     - 알림 종의 "다른 사람들" 탭도 회차 필터링함. 단 "내가 쓴 글" 탭은 내
       글이니까 회차 무관하게 항상 보여줌
   - **다운로드**: 상단 세션 바에 "독후감 다운로드" 버튼 추가. 클릭하면
     `store.getMyEntries(person)`(새로 추가, 전체 책 통틀어 그 사람이 쓴
     entries 전부 조회)로 내용을 모아서 `.txt` 하나로 `Blob` +
     `URL.createObjectURL` + 임시 `<a download>`로 받게 함 (서버 없이 순수
     클라이언트)
2. **바로 전 턴에서 "댓글은 멤버 탭에서만"으로 좁혔던 걸 다시 되돌림 + 여러
   버그 수정** — 사용자가 한 번에 다섯 가지 요청:
   - "내 독후감에도 댓글이 있어야겠다, 남이 단 댓글 나도 봐야 하니" → 직전
     턴에 만든 전용 경로(`#/book/:id/comments`, `renderMyEntryThread`)를
     없애고, **내 독후감 쓰기/보기 화면(`entryBlockHtml`)에 댓글을 다시
     넣음**. 종 알림의 "내가 쓴 글" 탭도 다시 `#/book/:id`로 연결. (멤버 탭의
     일반 목록은 여전히 "나" 제외 — 그건 안 바뀜)
   - "댓글 수정/삭제 기능" → `store.js`에 `updateComment`/`deleteComment`
     추가. 댓글 작성자 본인 글에만 "수정"/"삭제" 버튼 노출
     (`commentRowHtml`의 `mine` 체크). 수정은 전체 목록을 다시 그리지 않고
     그 댓글 한 줄만 인라인 `<input>`으로 바꿔치기(`startEditComment`) —
     실시간 구독 때문에 목록이 통째로 다시 그려지면 수정 폼이 날아갈 수
     있어서 일부러 DOM 부분 교체로 처리함
   - "알림 버튼 위에 정체불명의 줄" → **버그였음**: `.comments-digest-panel`/
     `.comments-digest-btn`에 `display:flex`를 줘놔서 HTML `hidden` 속성이
     안 먹히고 있었음 (author 스타일이 UA 기본 `[hidden]{display:none}`을
     덮어씀). `.comments-digest-btn[hidden], .comments-digest-panel[hidden]
     { display: none; }` 추가해서 고침
   - "admin 표지 미리보기 비율이 이상함" → `.cover-preview`가 160×200(거의
     정사각형)이었던 걸 `aspect-ratio: 2/3`(책 느낌 세로 비율)로 변경
   - "책장/멤버 책 순서가 다름, 멤버는 항상 최신순이어야" → 책장은
     사용자가 고르는 `sortOrder`를 따르고, 멤버→책 선택 목록은 별도로
     `booksSortedByNewest()`(항상 최신순 고정)를 쓰도록 분리
2. **댓글 알림 종 + 댓글 범위 축소 + 정렬 단순화 + 작성 기간 상시 노출** —
   사용자가 한 번에 네 가지 요청:
   - "챕터n처럼 댓글 달리면 우측 하단에 알림" → chap.n의 "댓글 모아보기"를
     조사(서브에이전트 포크)해서 그대로 이식. `store.js`에
     `subscribeAllComments`/`parseEntryId` 추가, `app.js`에 종 모양 버튼
     (`#commentsDigestBtn`, index.html에 고정 위치로 추가) + 패널
     (`#commentsDigestPanel`) + "내가 쓴 글"/"다른 사람들" 탭. 안 읽음 판정은
     `localStorage`(`bookshelf_comments_seen_{이름}`에 마지막으로 패널을 연
     시각) 기준, 10일 이내 댓글만 집계(`COMMENTS_DIGEST_MAX_AGE_MS`). "내가 쓴
     글" = `parseEntryId(comment.entryId).person === session.name`인 댓글
   - "책장(=내 독후감 쓰는 페이지)에는 댓글 안 보여도 된다, 멤버 탭에서만" →
     `entryBlockHtml`(내 독후감 쓰기/보기 화면)에서 댓글 섹션 완전히 제거.
     대신 알림 종의 "내가 쓴 글" 탭에서 들어가는 전용 경로
     `#/book/:id/comments`(`renderMyEntryThread`)를 새로 만들어서, 내 글에
     달린 댓글은 거기서만 보임 (멤버 탭의 일반 목록은 여전히 "나" 제외)
   - "분류 없애고 정렬은 최신순/오래된순만" → `filterBar()`를 `sortBar()`로
     교체(네이티브 `<select>`), `book.createdAt` 기준 정렬
     (`sortedBooksForDisplay`). ⚠️ 이때 admin에서 새 책을 만들 때
     `createdAt`을 아예 안 넣고 있었던 걸 발견해서 `emptyBookDraft()`에
     `createdAt: Date.now()` 추가함 (이전엔 정렬할 기준 자체가 없었음)
   - "독서록 메인 책장에도 작성 기간이 보여야" → 이미 지난 턴에 카드 하단에
     넣어뒀던 걸 확인했고, 기간 미설정 책은 빈칸 대신 "상시 가능"으로 항상
     표시되게 고침 (`bookCardsHtml`)
2. **멤버 보기 레이아웃 단순화 + 댓글 + 책 작성 기간** — 사용자가 세 가지를
   한 번에 요청함:
   - "멤버 독후감 볼 때 표지 사진 크게 나올 필요 없이 바로 이름/시간/내용
     나오면 된다" → `renderMembersForBook`에서 `.book-detail`(표지 그리드)를
     빼고 `.members-page-heading`(텍스트만, 태그+제목+작성자)로 교체
   - "댓글 기능" → `store.js`에 `comments` 컬렉션 추가 (답글 없는 1단계,
     `entryId`/`author`/`content`/`createdAt`). 내 독후감 보기 화면과 멤버가
     쓴 독후감 각 줄 양쪽에 다 붙임 (`mountOwnComments`/`renderEntryList`
     안의 `comments-row-N` 구독). ⚠️ 댓글 등록 버튼을 처음에
     `type="button"`으로 만들어서 클릭해도 제출이 안 되는 버그가 있었음 —
     `type="submit"`으로 고쳐서 form submit 이벤트가 타게 함
   - "책 등록할 때 작성 기간(시작일/종료일) 설정, 그 기간에만 독후감 작성
     가능, 책장에도 기간 노출" → book 문서에 `start`/`end`(YYYY-MM-DD) 추가,
     admin에 `<input type="date">` 두 개, 공개 사이트 `bookPeriodStatus()`가
     `open`/`before`/`after` 판정 → `before`/`after`면 textarea 자체를 안
     보여주고 안내 문구만 표시 (기존에 써둔 내용은 읽기 전용으로는 계속 보임,
     댓글도 기간과 무관하게 항상 가능). 책장 카드와 멤버 책 목록 카드 모두
     기간을 `M.D - M.D` 형식으로 노출 (`formatRange`)
2. **독후감 UX 재설계** — 사용자가 "표지 사진 때문에 스크롤 한참 내려야 독후감
   나온다, 우측 제목/작성자 바로 아래 바로 쓰게 해달라"고 요청. 추가로
   "저장하면 읽기 전용 + 수정하기 버튼", "멤버 탭은 책을 먼저 선택하는 목록
   페이지로 분리하고 내 글은 제외"도 요청
   - `renderBookEntry`: `.entries-section`을 따로 떼지 않고 `.detail-info`
     (제목/작성자 바로 아래) 안에 `#entry-block`으로 바로 배치
   - `entryMode` 상태(`loading`/`edit`/`view`) 추가. 처음 쓸 때는 바로 textarea,
     저장하면 읽기 전용 + "수정하기" 버튼으로 전환 (`entryBlockHtml`/
     `rerenderEntryBlock`/`wireEntryBlock`)
   - "멤버" 전역 내비게이션을 더 이상 "현재 보고 있는 책"에 묶지 않고 항상
     `#/members`로 고정 → 책 목록(`renderMembersBookList`) → 책 선택 시
     `#/members/:bookId`(`renderMembersForBook`)에서 그 책의 다른 멤버
     독후감만(본인 제외, `renderEntryList`의 `.filter((name) => name !==
     session.name)`) 노출
   - 이전에 책 상세 페이지 안에 있던 "내 독후감 / 멤버" 로컬 탭(`entryTabsHtml`)과
     `updateMembersNavHref` 동적 href 전환 로직은 제거함 (이제 안 씀)
2. **로그인 + 책별 독후감 기능 추가** — 사용자가 "로그인 기반이어야 하고,
   어드민에 회원관리도 있어야 하고, 각자 독후감 쓰는 칸 + 다 같이 보는 목록도
   있어야 한다"고 요청. 이어서 구체적인 흐름을 알려줌: "책장 → 책 클릭 →
   독후감 쓰고 저장 → 상단 멤버 탭 누르면 다른 사람 독후감 보기"
   - `store.js`에 `members`/`entries` 컬렉션 추가 (책은 기존 `books`
     그대로). entries 문서 ID는 `{bookId}__{회원이름}`
   - admin에 탭 UI 추가 (`책 관리` / `회원 관리`). 회원 관리는 이름 + 4자리
     PIN, 중복 PIN 체크는 chap.n의 `addMember`/`updateMember` dup-check
     로직 그대로 가져옴
   - 공개 사이트: 전체가 4자리 PIN 로그인 게이트 뒤에 있음 (chap.n의
     `renderGate`/`verifyPin`/세션(localStorage) 패턴 그대로, 세션 키는
     `bookshelf_session`)
   - 책 상세 페이지가 두 개 하위 탭으로 나뉨: **"내 독후감"**(`#/book/:id`,
     textarea + 저장 버튼, 본인 글만 수정) / **"멤버"**
     (`#/book/:id/members`, 전체 회원 명단에 각자의 독후감을 매칭해서
     보여줌 — 안 쓴 사람은 "아직 작성하지 않았어요")
   - 상단 전역 내비게이션의 "멤버" 링크는 지금 보고 있는 책이 있으면 그 책의
     `/members` 라우트로, 없으면 "책을 먼저 선택하세요" 안내 페이지로 동적으로
     바뀜 (`updateMembersNavHref`)
2. **폴더명 오타 수정** (`booshelf` → `bookshelf`) — 사용자가 "왜 booshelf야
   bookshelf도 아니고"라고 지적. mv + 전체 파일 sed 일괄 치환으로 처리
3. admin 암호를 사용자 요청으로 `book`으로 변경 (원래
   `bookshelf-admin-2026`이었음 — 매우 짧고 추측하기 쉬우니 실제 배포 전엔
   꼭 바꾸라고 안내해둠)
4. **admin 페이지 추가** — "지금 책 카드가 하나도 없는데 어디서 만드냐"는
   질문에 답하면서 chap.n의 admin/처럼 책 추가/수정/삭제 화면을 만듦.
   공개 사이트 `app.js`는 하드코딩 배열 대신 `store.subscribeBooks()` 구독으로
   전환
5. 메인 책장 레이아웃 — 첨부받은 BOOOKIN 레퍼런스 이미지 스타일(흰 배경, 검은
   보더, 모노 라벨, 4열 그리드)을 거의 그대로 따라 구현

## 핵심 아키텍처

- `firebase-config.js`가 placeholder 값이면 데모 모드로 동작 (chap.n과 동일한
  `isFirebaseConfigured` 체크)
- 컬렉션 3개: `books`(author/title/tag/cover/coverColor/order),
  `members`(name/pin/createdAt), `entries`(bookId/person/content/updatedAt,
  문서ID `{bookId}__{person}`)
- admin의 책 reorder는 인접한 두 책의 `order` 값을 서로 바꾸는 방식 (드래그 앤
  드롭 아님, ▲▼ 버튼)
- 공개 사이트 로그인은 세션을 localStorage(`bookshelf_session`)에 저장,
  `router()`가 매번 세션 유무부터 체크해서 없으면 어떤 해시든 로그인 게이트를
  보여줌
- "내 독후감" 에디터는 `store.subscribeEntry`로 실시간 구독하되, textarea에
  포커스가 가 있으면 덮어쓰지 않도록 가드(`document.activeElement !== ta`)만
  넣음 — chap.n의 shell/view 완전 분리만큼 정교하진 않지만, 혼자 쓰는 글이라
  충돌 가능성이 낮아서 이 정도로 타협함
- admin은 아직 shell/view 분리 없음 — 운영진 한 명이 쓰는 게 보통이라 우선순위
  낮게 둠

## 알려진 제약

- 이 세션 내내 `mcp__claude-in-chrome` 브라우저 확장이 한 번도 연결되지
  않아서, 화면을 직접 띄워 시각적으로 확인한 적이 없음. 중괄호/괄호 균형
  체크(python) + curl 상태 코드로만 검증함 — **다음 세션에서 브라우저가
  연결되면 실제 로그인 → 독후감 작성 → 멤버 탭까지 꼭 실제로 클릭해서
  확인할 것**
- `file://`로 직접 열면 ES 모듈이 로드되지 않아 완전히 빈 화면이 됨 — 반드시
  로컬 서버(`python3 -m http.server`)로 열어야 함. 사용자가 이걸로 한 번
  헷갈렸던 적 있음
- Firestore 무료 티어(Spark) + 문서당 1MB 제한이 표지 이미지 정책(리사이즈
  1000px, JPEG 압축, 용량 초과 시 에러 안내)의 근거
- 로그인 PIN이 클라이언트에서 평문 비교되는 구조 (chap.n과 동일한 트레이드오프,
  README에 명시해둠)

## 보류 중 / 아직 처리 안 한 것

- "소개"/"모아보기" 메뉴는 전부 placeholder 페이지
- 독후감에 사진 첨부, 댓글/답글, 좋아요 없음
- 표지 이미지를 올리는 "빌더" 툴 연결 (사용자가 나중에 만들 예정이라고 언급함,
  지금은 admin에서 직접 업로드하는 방식으로 임시 대체)
- Firebase 프로젝트 미생성 상태 (데모 모드로만 테스트됨, 실제 여러 명이 쓰려면
  README 1~3단계 진행 필요)
- 실제 브라우저로 로그인 → 독후감 작성 → 저장 → 멤버 탭 플로우를 한 번도
  눈으로 확인 못 함 (위 "알려진 제약" 참고)
