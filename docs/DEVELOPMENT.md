# 개발 안내

[README](../README.md) · [사용 설명서](USER_GUIDE.md) · [변경 이력](../CHANGELOG.md)

## 준비

개발에는 Node.js/npm, .NET 10 SDK, VS Code가 필요합니다. 검증에는 Windows x64, Node 24.18.0, npm 11.16.0, .NET SDK 10.0.401, VS Code 1.143.1을 사용했습니다. 의존성 복원과 최초 테스트용 VS Code 다운로드에는 네트워크가 필요합니다.

```sh
git clone https://github.com/ynaru1203/coloring-elements.git
cd coloring-elements
npm ci
npm run compile
npm run build:analyzer
```

`out/`은 TypeScript 산출물이고 `analyzer-bin/`은 배포용 .NET 분석기입니다. 둘 다 Git에 커밋하지 않습니다. VSIX는 소스 저장소가 아니라 GitHub 릴리즈에 첨부합니다.

## 디버깅

VS Code에서 저장소 폴더를 열고 F5의 **Run Coloring Elements**를 실행합니다. 기본 빌드 작업이 TypeScript와 Roslyn 분석기를 순서대로 빌드한 뒤 Extension Development Host를 엽니다. 그 창에서 C# 프로젝트를 열고 색상 편집기 명령을 실행합니다.

`npm run watch`는 TypeScript 변경을 감시합니다. C# 분석기 소스를 바꾼 뒤에는 `npm run build:analyzer`를 다시 실행하고 확장 호스트를 다시 불러오세요.

## 검사와 테스트

```sh
npm run compile
npm run lint
npm run test:unit
npm test
```

- `test:unit`: 규칙 검증·매칭·설정 병합과 Webview 스크립트 동작을 검사합니다.
- `test`: 컴파일·린트·분석기 publish 후 실제 VS Code 호스트와 Roslyn/MSBuild 통합 테스트를 실행합니다.
- 테스트마다 `.vscode-test/runs/` 아래 새 C# 프로젝트 복사본과 사용자 프로필을 사용합니다. 개인 VS Code 설정을 테스트 데이터로 사용하지 않습니다.
- 기본 동작은 테스트용 VS Code 다운로드입니다. 설치된 VS Code를 사용하려면 환경 변수 `VSCODE_EXECUTABLE_PATH`를 Code.exe의 절대 경로로 지정합니다.

```powershell
$env:VSCODE_EXECUTABLE_PATH = 'C:\path\to\Code.exe'
npm test
```

분석기 자체 심볼 분류 검증은 다음 명령으로 실행합니다.

```sh
dotnet run --project analyzer/ColoringElements.Analysis -- --self-test
```

## 구조

| 경로 | 역할 |
| --- | --- |
| src/extension.ts | 명령, Webview 메시지, 저장 범위, 가져오기/내보내기 |
| src/catalog.ts / tokenKinds.ts | 한국어 이름, 속성 설명, 키워드·고정값 목록 |
| src/rules.ts / advancedRules.ts | 기본 설정 병합, 입력 검증, 정밀 규칙 우선순위 |
| src/tokens.ts / preview.ts | 기본 서버 토큰 감지, 테마 색상 미리보기 |
| src/roslynClient.ts / roslyn.ts | 분석기 프로세스 통신, 문서 갱신, 색상 장식 |
| media/ | Webview HTML·JavaScript·CSS |
| analyzer/ColoringElements.Analysis/ | 프로젝트 로드, 의미 분류, 키워드 분류, JSONL 서버 |
| src/test/ / analyzer/Fixtures/ | 단위·통합 테스트와 C# fixture |

설계의 세부 동작은 [아키텍처](architecture.md), 현재 검증 범위는 [검증 기록](verification.md)에 있습니다.

## 키워드 목록 갱신

Roslyn 패키지를 바꾸면 `dotnet analyzer-bin/ColoringElements.Analysis.dll --catalog`로 종류 목록을 확인하고 `src/tokenKinds.ts`를 같은 내용으로 갱신합니다. 전체 테스트가 분석기의 목록과 TypeScript 목록의 일치를 검사합니다. 문맥 키워드를 문자열 검색으로 분류하지 마세요.

## 패키징과 릴리즈

```sh
npm run package
```

`vscode:prepublish`가 TypeScript와 분석기를 빌드한 후 `coloring-elements-<version>.vsix`를 생성합니다. 배포물에는 GUI, 런타임 JavaScript, 분석기 DLL/의존성, README, CHANGELOG, 라이선스가 들어갑니다. 소스·테스트·캐시·PDB는 제외합니다. SDK 자체는 포함하지 않습니다.

릴리즈 시에는 다음 순서로 진행합니다.

1. package.json 버전과 CHANGELOG.md 갱신, package-lock.json 동기화
2. 전체 테스트와 VSIX 패키징
3. 소스 커밋과 같은 커밋을 가리키는 `v<version>` 태그 생성
4. GitHub 릴리즈에 해당 VSIX 첨부, 버전·파일 크기·SHA-256 확인

이 프로젝트의 publisher는 로컬 VSIX 배포용 `coloring-elements-local`입니다. GitHub 릴리즈와 Visual Studio Marketplace 게시는 별개입니다. Marketplace 게시를 위한 계정 등록이나 인증은 이번 배포에 포함하지 않습니다.

## 미사용 코드 점검

현재 점검 결과는 [코드 정리 기록](CODE_REVIEW.md)에 있습니다. TypeScript의 noUnusedLocals/noUnusedParameters 검사와 export 참조 확인을 함께 사용했습니다. VS Code가 동적으로 호출하는 진입점, Webview 이벤트 핸들러, 오류 복구 경로, 테스트 fixture는 단순히 정적 호출이 적다는 이유로 제거하지 않습니다.
