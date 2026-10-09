# bookshelf

여러 명이 함께 쓰는 "책장" 웹앱. 메인 화면은 책 표지 그리드이고, 책 한 권을
클릭하면 그 책의 개별 페이지로 들어갑니다. 빌드 도구 없이 순수 HTML/CSS/JS로
되어 있고, GitHub Pages에 그대로 올려서 씁니다. (chap.n 회고록 프로젝트와
같은 방식)

## 지금 상태 (데모 모드)

`firebase-config.js`를 아직 설정하지 않았기 때문에, 지금 `index.html`을
열면 **데모 모드**로 동작합니다. 데모 모드는 이 브라우저(localStorage)에만
저장되고 다른 사람과 공유되지 않아요. 구조/디자인 확인용입니다.

- 로컬에서 바로 열어보려면: `python3 -m http.server 8000` 실행 후
  `http://localhost:8000` 접속 (file:// 로 직접 열면 모듈 로드가 막힐 수 있어요)
- 책을 추가/수정하려면 `http://localhost:8000/admin/` 접속 (암호는
  `admin/app.js` 맨 위 `ADMIN_PASSCODE`에 설정돼 있어요 — 운영진만 공유)

실제로 여러 명이 각자 브라우저에서 접속해 같은 책장을 보게 하려면 아래
순서대로 Firebase를 딱 한 번만 연결하면 됩니다. **완전 무료(Spark 요금제)**로
충분하고, 카드 등록도 필요 없어요.

## 1. Firebase 프로젝트 만들기

1. https://console.firebase.google.com 접속 → "프로젝트 추가"
2. 이름 아무거나 (예: bookshelf) 입력 → Google Analytics는 꺼도 됨
3. 왼쪽 메뉴 **Firestore Database** → "데이터베이스 만들기" → **프로덕션 모드** →
   리전은 asia-northeast3(서울) 추천
4. 왼쪽 메뉴 **Authentication** → "시작하기" → 로그인 방법 탭에서
   **익명(Anonymous)** 사용 설정 (사람이 로그인하는 화면이 아니라, 앱이
   조용히 인증 토큰만 받아서 아무나 마구 쓰기(write)하는 걸 막는 최소한의
   장치예요)
5. 왼쪽 상단 톱니바퀴 → **프로젝트 설정** → 아래로 스크롤 → "웹 앱 추가"
   (`</>` 아이콘) → 이름 아무거나 → 나오는 `firebaseConfig` 객체를 통째로 복사

## 2. 이 프로젝트에 설정 붙여넣기

`firebase-config.js` 파일을 열어서 복사한 값을 그대로 붙여넣으세요.

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};
```

저장하면 자동으로 "실서비스 모드"로 전환됩니다.

## 3. Firestore 보안 규칙 설정

Firebase 콘솔 → Firestore Database → **규칙(Rules)** 탭에 아래 내용을
붙여넣고 게시(Publish)하세요.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /books/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /members/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /entries/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /comments/{docId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

**⚠️ 알아두어야 할 점**: 공개 사이트가 실시간으로 책장·회원·독후감·댓글을
읽을 수 있으려면 네 컬렉션 모두 읽기가 모두에게 열려 있어야 해요. 즉 마음만 먹으면
개발자도구로 회원들의 로그인 번호(PIN)도 볼 수 있는 정도의 보안입니다. 쓰기는
익명 인증을 받은 사용자만 가능하지만, admin 페이지 암호를 아는 사람만 그
화면에 들어갈 수 있게 막는 구조라서 완전한 보안은 아니에요. 외부에 공개하지
않고 아는 사람들끼리만 쓰는 용도로는 충분합니다.

## 4. 관리자 — 책/회원 관리 (`admin/`)

책과 회원(로그인 번호)을 관리하는 화면은 `admin/index.html`에 따로 있어요.
공개 사이트(`index.html`)와는 별개 페이지라 링크로 연결돼 있지 않고, 주소를
직접 아는 사람만 들어갈 수 있어요.

1. `admin/app.js` 맨 위의 `ADMIN_PASSCODE` 값을 **배포 전에 꼭 바꾸세요.**
2. 로컬에서 열어보려면 메인 사이트와 같은 서버로 `http://localhost:8000/admin/` 접속
3. 배포 후에는 `https://<도메인>/admin/` 으로 접속

탭 구성:
- **책 관리**: 왼쪽은 책 목록(▲▼ 버튼으로 책장에 보이는 순서 조정), 오른쪽은
  선택한 책의 편집 폼(작성자/제목/태그/**회차**/독후감 작성 기간/표지색/
  표지이미지). 작성 기간(시작일·종료일)은 비워두면 기간 제한 없이 항상 쓸 수
  있어요. 표지 이미지는 업로드 시 자동으로 리사이즈·압축되어 저장됩니다
  (`config.js`의 `COVER_MAX_WIDTH` / `COVER_JPEG_QUALITY`로 조절 가능).
- **회원 관리**: 공개 사이트에 로그인할 회원의 이름·4자리 번호(PIN)·**회차**를
  추가/수정/삭제. 여기서 추가한 회원만 공개 사이트에 로그인할 수 있어요.

**회차**: 독서모임을 여러 번 돌리면서 회원이 바뀌는 걸 지원하기 위한
체크박스예요. 책/회원 편집 폼에 `1회차`~`4회차` 체크박스가 있고, 한 책이나
한 회원이 여러 회차에 동시에 속할 수도 있어요 (복수 선택 가능). 목록은
`config.js`의 `KNOWN_ROUNDS` 배열이라서, 새 회차가 시작되면 그 배열에 한 줄만
추가하면 돼요 (예: `"5회차"` 추가).

매칭 규칙: **책에 체크된 회차가 하나도 없으면 전체 공개**(누구나 봄). 책에
회차가 하나라도 체크돼 있으면, 그중 하나라도 겹치는 회차를 가진 회원에게만
보여요. 회원 쪽에 아무 회차도 안 체크돼 있으면 회차 제한이 없는(=전체 공개)
책만 볼 수 있어요.

## 5. 공개 사이트 사용 흐름

1. 공개 사이트에 처음 들어가면 4자리 번호(admin에서 등록한 PIN)를 입력해야
   들어갈 수 있어요.
2. 책장 카드마다 작성 기간이 항상 보여요 (기간을 안 정했으면 "상시 가능").
   우측 상단 "정렬"로 최신순/오래된순을 바꿀 수 있어요.
3. 책장에서 책을 클릭하면 제목/작성자 바로 아래에 독후감 입력칸(제목 한 줄 +
   본문 textarea)이 바로 보여요. 저장하면 읽기 전용으로 바뀌고 "수정하기"
   버튼을 눌러야 다시 고칠 수 있어요. 책에 작성 기간이 설정돼 있으면 그
   기간에만 쓰거나 고칠 수 있어요 (기간 전/후에는 읽기만 가능). 저장한
   내용이 있으면 그 아래에 댓글도 바로 보여요 — 남이 내 독후감에 남긴
   댓글을 여기서 확인할 수 있어요.
4. 상단 "멤버" 메뉴를 누르면 책 목록이 뜨고(항상 최신 등록순), 책을 하나
   선택하면 그 책에 대해 다른 회원들이 쓴 독후감 **제목**이 쭉 나열돼요. 제목을
   누르면 그 아래로 본문+댓글이 펼쳐지는 아코디언 방식이에요 (내 글은 빠짐,
   아직 안 쓴 회원은 "아직 작성하지 않았어요"로 표시).
5. 댓글은 어디서든 내가 쓴 것만 "수정"/"삭제" 버튼이 보여요 (답글 없이
   1단계 목록).
6. 누군가 내 독후감에 댓글을 달면 우측 하단 종 버튼에 알림이 떠요. 눌러보면
   "내가 쓴 글"(내 독후감에 달린 댓글) / "다른 사람들"(다른 사람 독후감에
   달린 댓글, 최근 10일, 내 회차 책만) 두 탭으로 모아 볼 수 있고, 항목을
   클릭하면 해당 댓글이 있는 화면으로 이동해요.
7. 상단 이름 옆 "독후감 다운로드" 버튼을 누르면, 지금까지 내가 쓴 독후감을
   전부 모아서 `.txt` 파일 하나로 받을 수 있어요.
8. 내 회차가 설정돼 있으면, 책장·멤버 목록 둘 다 같은 회차 책만 보여요. 다른
   회차 책 주소로 직접 들어가도 "이 책은 내 회차에 공개된 책이 아니에요"로
   막혀요.

## 6. 데이터 구조 참고

**`books`** — 책 한 권당 문서 하나: `author`(string, 작성자),
`title`(string, 책 제목 — 카드/상세 페이지에 표시), `tag`(string, 예:
`VOL. 01`), `rounds`(string[], 예: `["1회차","2회차"]`, 빈 배열이면 전체
공개), `start`/`end`(string "YYYY-MM-DD" 또는 빈 값, 독후감 작성 가능 기간 —
둘 다 비어있으면 기간 제한 없음), `cover`(string 또는 null, base64 data URL),
`coverColor`(string, 표지 이미지가 없을 때 대신 쓰는 배경색 hex),
`order`(number, 책장 정렬 순서), `createdAt`/`updatedAt`(timestamp)

**`members`** — 회원 한 명당 문서 하나: `name`(string), `pin`(4자리
string, 로그인용), `rounds`(string[], 예: `["2회차"]`, 빈 배열이면 회차
제한 없는 책만 볼 수 있음), `createdAt`(timestamp)

**`entries`** — 책 한 권 × 회원 한 명의 독후감 한 건당 문서 하나, 문서 ID는
`{bookId}__{회원이름}`: `bookId`(string), `person`(string, 회원 이름),
`title`(string, 독후감 제목), `content`(string, 독후감 본문),
`updatedAt`(timestamp)

**`comments`** — 독후감 하나에 달리는 댓글 한 건당 문서 하나 (답글 없이
1단계): `entryId`(string, 위 `entries` 문서 ID와 동일한 값), `author`(string,
댓글 작성자 이름), `content`(string), `createdAt`(timestamp)

이 구조는 `store.js` 하나에 다 구현되어 있고, 공개 사이트(`app.js`)와
관리자 페이지(`admin/app.js`) 둘 다 같은 `store.js`를 가져다 씁니다.

**⚠️ 로그인 PIN을 클라이언트(브라우저)에서 직접 확인하는 구조**라서,
`members` 컬렉션은 읽기가 모두에게 열려 있어야 해요. 즉 개발자도구로 모든
회원의 PIN을 볼 수 있는 정도의 보안입니다 (chap.n과 동일한 트레이드오프).

## 7. GitHub Pages / Vercel로 배포하기

1. 이 폴더(`bookshelf`)를 GitHub 저장소로 푸시
   ```
   git init
   git add .
   git commit -m "bookshelf 초기 세팅"
   git branch -M main
   git remote add origin <레포 주소>
   git push -u origin main
   ```
2. 저장소 → Settings → Pages → Source를 "Deploy from a branch",
   Branch를 `main` / `(root)`로 설정 → Save
3. 몇 분 뒤 `https://<계정>.github.io/<레포명>/` 으로 접속 가능

빌드 과정이 없는 순수 정적 사이트라 Vercel에 같이 연결하는 것도 chap.n과
동일한 방식으로 가능합니다 (Framework Preset: Other, Root Directory: `./`).

## 앞으로의 방향

- 지금은 admin 페이지에서 책 표지를 "직접 업로드"하는 방식이에요. 나중에
  별도의 빌더 툴과 연결해서 표지 이미지를 더 쉽게 올릴 수 있게 할 예정입니다.
- "멤버" 탭은 지금 로그인한 회원 전체를 보여주고, 실제 접속 여부나 책을
  읽었는지 여부는 구분하지 않아요 (독후감을 썼는지 안 썼는지만 구분).
- 댓글은 답글(대댓글)이 없는 1단계 목록이에요. 수정/삭제는 가능합니다.
  필요하면 chap.n의 대댓글 구조를 참고해서 이어서 만들 수 있습니다.
- 독후감에는 아직 사진 첨부, 좋아요 같은 기능이 없어요.
- "소개"/"모아보기" 메뉴는 아직 placeholder예요.
