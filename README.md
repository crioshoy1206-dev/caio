# 내 캘린더

구글 계정으로 로그인해서 날짜별 **일정**, **할 일**(체크리스트), **시간표**를 기록하는 웹 캘린더입니다.
학교 시간표처럼 매주 반복되는 일정은 **📌 고정 일정**으로 한 번만 등록하면 해당 요일의 시간표에 자동으로 들어갑니다. 특정 날짜(방학, 공휴일 등)에서는 그 날만 숨길 수 있습니다.
일정, 시간표, 고정 일정에는 **카테고리**(기본: 학교, 친구, 가족, 개인)를 붙여 색으로 구분하고, 달력에서 카테고리별로 숨겨 볼 수 있습니다. 화면은 시스템/라이트/다크 테마를 지원합니다.
하단 메뉴는 캘린더 / 이번 주 시간표 / 내 정보로 나뉩니다. 시간은 10분 단위로 고르고, 고정 일정은 하나씩 월간 캘린더 표시를 켜고 끌 수 있습니다(기본은 꺼짐, 시간표에는 항상 표시).
**친구** 탭에서 친구 코드로 친구를 추가하고, 날짜 상세의 "친구와 약속 만들기"로 친구를 초대할 수 있습니다. 초대받은 친구는 참여/거절을 고르고, 참여자는 시간·장소를 바꾸고(채팅방에 자동 안내) 약속별 채팅방에서 이야기할 수 있습니다.
날짜를 누르면 그 날의 상세 일정이 팝업(핸드폰에서는 아래에서 올라오는 창)으로 열립니다.
한국 공휴일(설날·추석·부처님오신날, 대체공휴일, 선거일 포함)은 `src/holidays.js`에서 계산하며, 음력 명절 날짜표는 2025~2030년까지 들어 있습니다.
React + Vite, Firebase Authentication(Google 로그인), Cloud Firestore를 씁니다.

## 바로 실행 (체험 모드)

```bash
npm install
npm run dev
```

Firebase 설정이 없으면 체험 모드로 열리고, 데이터는 그 브라우저에만 저장됩니다.

## Firebase 연결 (진짜 구글 로그인)

1. https://console.firebase.google.com 에서 프로젝트를 만듭니다.
2. **Authentication > 로그인 방법**에서 **Google**을 사용 설정합니다.
3. **Firestore Database**를 만들고, **규칙** 탭에 `firestore.rules` 내용을 붙여 넣어 게시합니다. (개인 데이터는 본인만, 약속과 채팅은 참여자만 볼 수 있게 하는 규칙)
4. **프로젝트 설정 > 내 앱**에서 웹 앱(`</>`)을 추가하고 나오는 설정값을 `.env.example`을 복사한 `.env.local`에 채웁니다.
5. 다른 도메인에 배포하면 **Authentication > 설정 > 승인된 도메인**에 그 도메인을 추가합니다.

## 데이터 구조

친구와 약속 (여러 사람이 함께 쓰는 데이터, 권한은 `firestore.rules` 참고)

```js
profiles/{uid}                  { name, photoURL, friendCode }
friendships/{uidA_uidB}         { memberIds: [a, b], profiles, requestedBy, status: 'pending' | 'accepted' }
sharedEvents/{id}               { title, date, start, end, place, memo, ownerId, memberIds,
                                  members: { uid: { name, photoURL, status: 'owner' | 'invited' | 'accepted' | 'declined' } } }
sharedEvents/{id}/messages/{id} { uid, name, text, createdAt }
```

개인 데이터

`users/{uid}/days/{YYYY-MM-DD}` 문서 하나에 그 날짜의 내용이 모두 들어갑니다.

```js
{
  events:    [{ id, title, memo, categoryId }],
  todos:     [{ id, text, done }],
  timetable: [{ id, start: '09:00', end: '10:00', title, categoryId }],
  skipRecurring: ['고정 일정 id']   // 이 날만 숨긴 고정 일정
}
```

고정 일정은 `users/{uid}/settings/recurring` 문서에 목록으로 저장됩니다.

```js
{ items: [{ id, title, weekdays: [1, 3, 5], start: '09:00', end: '09:50', categoryId, from: '2026-09-01', until: '2026-12-31', showInCalendar: false }] }
// weekdays: 일=0, 월=1 … 토=6 / from, until 은 비워 두면 기간 제한 없음
```

카테고리는 `users/{uid}/settings/categories` 문서에 `{ items: [{ id, name, color }] }` 로 저장됩니다. 항목의 색은 카테고리에서 가져오므로 카테고리 색을 바꾸면 모든 항목에 반영됩니다.
