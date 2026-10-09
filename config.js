// bookshelf 기본 설정

// 표지 이미지 용량 가드 (Firestore 문서 1개 최대 1MB 제한 때문)
export const COVER_MAX_WIDTH = 1000;
export const COVER_JPEG_QUALITY = 0.82;
export const MAX_COVER_BASE64 = 700000; // 대략 700KB 상당의 문자 수

// 표지 이미지가 없을 때 대신 보여줄 기본 배경색
export const DEFAULT_COVER_COLOR = "#eceae4";

// 책/회원에 체크박스로 붙일 수 있는 회차 목록. 새 회차가 시작되면 여기에
// 한 줄만 추가하면 admin 책 관리/회원 관리 양쪽 체크박스에 자동으로 생겨요.
export const KNOWN_ROUNDS = ["1회차", "2회차", "3회차", "4회차"];
