# ON-AIR 사내표 예약 데스크

음악프로그램 사내표 신청자를 관리하는 개인용 웹 앱입니다. 휴대폰과 PC 양쪽에
"앱처럼" 설치해서 쓸 수 있도록 PWA로 구성되어 있습니다.

## 1. 로컬에서 실행하기

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 을 열면 바로 사용할 수 있습니다.
**별도 설정 없이도 실행됩니다** — 이 상태에서는 데이터가 지금 사용 중인
기기의 브라우저에만 저장돼요 (아래 3번 참고).

## 2. Vercel에 배포하기

1. 이 프로젝트를 GitHub 저장소로 올립니다 (`.env`는 `.gitignore`에 있어
   자동으로 제외돼요 — 실수로도 키가 올라가지 않습니다).
2. [vercel.com](https://vercel.com) 에서 "New Project" → 방금 만든 저장소
   선택. 프레임워크는 Vite로 자동 인식됩니다. Build Command
   `npm run build`, Output Directory `dist` (기본값 그대로 두면 됩니다).
3. 기기 간 동기화를 쓰려면(3-B) 배포 전에 Vercel 프로젝트의
   **Settings → Environment Variables** 에 `.env`와 같은 두 값을
   넣어주세요.
4. Deploy를 누르면 `https://프로젝트이름.vercel.app` 주소가 생깁니다.

## 3. 데이터 저장 방식 & 기기 간 동기화

이 앱은 `src/storage.js` 에서 저장 방식을 자동으로 고릅니다.

**A. 기본값 — 브라우저 localStorage (설정 없이 바로 됨)**
`.env`를 채우지 않으면 신청 데이터가 지금 쓰고 있는 **그 기기의 그
브라우저 안에만** 저장됩니다. 휴대폰 사파리에서 입력한 내용이 PC 크롬
에는 보이지 않고, 그 반대도 마찬가지예요. 앱을 지우거나 브라우저 데이터를
초기화하면 그 기기의 기록도 함께 사라집니다. 빠르게 테스트해보기엔
충분하지만, "휴대폰과 PC에서 같은 명단 확인" 용도로는 부족합니다.

**B. 진짜 기기 간 동기화 — Supabase 연동 (권장)**
무료 Supabase 프로젝트를 하나 만들면, 신청 데이터가 클라우드 DB에
저장되어 **휴대폰에서 등록한 신청을 PC에서 바로 확인하고, 그 반대도
가능**해집니다. 설정 방법:

1. [supabase.com](https://supabase.com) 에서 무료 프로젝트 생성
2. 프로젝트의 **SQL Editor** 에서 이 저장소의 `sql/init.sql` 내용을
   그대로 실행 (테이블 하나 생성)
3. 프로젝트 **Settings → API** 에서 `Project URL` 과 `anon public` 키 복사
4. `.env.example` 을 `.env` 로 복사한 뒤 두 값을 붙여넣기

   ```bash
   cp .env.example .env
   ```

5. 로컬 개발 서버를 재시작(`npm run dev`)하거나, Vercel이라면 Environment
   Variables에 같은 값을 넣고 다시 배포

헤더의 작은 상태 표시(☁️ 클라우드 동기화 중 / 💾 이 기기에만 저장됨)로
지금 어떤 모드인지 앱 안에서도 바로 확인할 수 있어요.

> 이 앱은 로그인 기능이 없는 개인용 도구라, Supabase 접근을 URL과
> anon key로만 제어합니다. 이 두 값은 절대 코드에 직접 적지 말고
> `.env`(로컬)와 Vercel의 Environment Variables(배포)에만 넣어주세요.
> `.env`는 git에 올라가지 않도록 이미 `.gitignore`에 포함돼 있습니다.

## 4. 휴대폰 / PC에 "앱처럼" 설치하기 (PWA)

배포된 주소(Vercel URL)에 접속한 뒤:

- **아이폰(Safari)**: 공유 버튼 → "홈 화면에 추가"
- **안드로이드(Chrome)**: 오른쪽 위 점 3개 메뉴 → "앱 설치" 또는
  "홈 화면에 추가"
- **PC(Chrome/Edge)**: 주소창 오른쪽의 설치 아이콘 클릭, 또는
  메뉴 → "앱 설치"

설치하면 브라우저 주소창 없이 독립된 앱처럼 아이콘으로 실행됩니다.

## 5. 개인정보 관련

- 신청자·방문자의 이름/연락처 등은 코드에 저장되지 않고, 저장 방식(A 또는
  B)에 따라 브라우저 또는 Supabase DB에만 저장됩니다.
- Supabase URL/키 같은 접속 정보는 `.env` 파일에만 두고, 이 파일은 git에
  커밋되지 않습니다 (`.gitignore` 참고).
- 저장소를 GitHub에 공개로 올릴 경우에도 `.env`가 함께 올라가지 않는지
  한 번 확인해주세요 (`git status`에 `.env`가 안 보이면 정상입니다).

## 프로젝트 구조

```
├── index.html
├── package.json
├── vite.config.js
├── .env.example
├── public/
│   ├── manifest.json      # PWA 설치 정보
│   ├── sw.js               # 서비스 워커 (오프라인/설치 지원)
│   └── icons/               # 앱 아이콘
├── src/
│   ├── main.jsx             # 진입점, 서비스 워커 등록
│   ├── App.jsx               # 앱 전체 UI/로직
│   ├── storage.js             # 저장소 추상화 (Supabase ↔ localStorage)
│   └── index.css
└── sql/init.sql             # Supabase 테이블 생성 스크립트
```
