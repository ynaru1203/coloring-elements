# 아키텍처

[README](../README.md) · [개발 안내](DEVELOPMENT.md) · [검증 기록](verification.md)

## 기본 분류

Webview → 입력 검증/규칙 병합 → `editor.semanticTokenColorCustomizations` → 기존 C# 서버와 VS Code의 네이티브 강조 경로를 사용합니다. 선택자는 `:csharp`로 제한하고 선택한 규칙의 foreground만 수정합니다. 다른 언어·테마별 블록·글꼴 스타일을 보존합니다.

기본 분류 UI는 요소별 색상 편집만 제공합니다. 서버가 누락한 속성을 생성하지 않습니다. 이전에 저장된 속성 규칙은 목록에서 다시 선택·초기화할 수 있도록 보존합니다. 공개 토큰 요청 명령은 선택한 줄의 range provider를 먼저 사용하고, 없으면 full-document provider로 대체합니다.

## 정밀 분류

Webview → `advancedRules.ts` → `roslyn.ts` → `roslynClient.ts` → 별도 .NET 분석기 → MSBuildWorkspace/의미 모델 → 범위별 decoration 순서입니다. Microsoft C# Semantic Token provider를 새 provider로 대체하거나 자동 합성될 것이라고 가정하지 않습니다.

분석할 솔루션/프로젝트는 GUI에서 선택하고 작업 공간 상태에 기억합니다. MSBuild는 선택한 프로젝트의 참조·언어 버전·컴파일 조건을 사용합니다. 확장은 실제 빌드나 패키지 복원을 자동 실행하지 않습니다. 로드 실패, 문맥이 모호한 linked 파일, 참조 누락, 컴파일 오류는 색상 적용을 보류합니다.

분류는 `GetDeclaredSymbol`과 `GetSymbolInfo`로 얻은 심볼의 종류/접근성/static/readonly/const 및 프로퍼티 접근자 정보를 사용합니다. get 전용, private set, readonly 필드는 별개의 조건입니다. 선언과 참조에 같은 속성을 전달하며 이름 가리기를 구분합니다.

## 키워드와 고정값

Roslyn `Classifier.GetClassifiedSpansAsync`의 keyword/control-keyword 결과를 실제 구문 토큰 범위와 대조합니다. 심볼 식별자와 중복 장식을 만들지 않고, 주석·문자열·비활성 코드·전처리 지시문을 키워드로 추측하지 않습니다.

`keyword`와 `literal`은 종류 하나를 `text_public`, `text_true` 등의 조건으로 전달합니다. 종류 목록은 `--catalog` 결과를 저장한 `tokenKinds.ts`와 테스트로 동기화를 확인합니다. 이 두 요소에서만 종류 드롭다운을 표시하고 심볼 속성 체크박스를 숨깁니다.

## 저장과 우선순위

기본 규칙은 네이티브 설정, 정밀 규칙은 `coloringElements.rules`에 별도 저장합니다. 사용자/작업 공간 범위를 GUI에서 선택합니다. 정밀 규칙은 모든 조건이 포함되어야 매칭하며 조건 수가 많은 순서, 특정 요소를 지정한 순서, 규칙 ID의 사전순으로 승자를 정합니다. 개별 키워드 종류는 전체 키워드 규칙보다 우선합니다.

가져오기는 파일 크기/규칙 수/선택자/색상을 전체 검증한 후 한 번에 병합합니다. 확장 내부의 설정 변경 메시지는 직렬화합니다. 초기화는 해당 범위의 색상 제거이며 설치 전 상태를 복원하지 않습니다.

## 문서 갱신과 성능

편집 후 300ms 지연과 요청 합치기로 중복 분석을 줄입니다. 문서 버전과 revision이 바뀐 결과는 적용하지 않습니다. 열린 문서의 미저장 텍스트를 overlay로 반영하고 solution/compilation 및 결과를 재사용합니다. 닫힌 문서·외부 파일·프로젝트 변경 시 분석기를 다시 로드합니다. 규칙에 맞는 토큰만 색상별 decoration으로 묶습니다.

색상 선택기의 드래그 input은 화면 숫자만 갱신합니다. change 시 한 번 저장하므로 매 이동마다 설정 저장/규칙 목록 재생성이 발생하지 않습니다.

## 통신과 신뢰 경계

분석기는 셸 없이 `dotnet <dll> --server`로 실행합니다. 신뢰한 작업 공간에서만 MSBuild 로드를 허용합니다. JSON Lines의 요청 ID, 문서 URI/버전, UTF-16 범위, 종류/속성을 확인합니다. 파일 매칭은 운영체제 경로를 별도로 전달하여 Windows의 percent-encoded 드라이브 문자를 URI에서 임의로 해석하지 않습니다.

Webview는 nonce CSP와 로컬 리소스 제한을 사용하며 textContent로 값을 표시합니다. 호스트에서도 색상과 선택자를 검증합니다. 프로세스 종료/타임아웃 시 대기 요청을 실패 처리합니다.

## 미리보기의 한계

VS Code 네이티브 최종 토큰 색상을 직접 반환하는 공개 API는 사용하지 않습니다. 테마 include/JSONC, 의미 색상 규칙과 일반 TextMate fallback으로 추정한 미리보기를 표시합니다. 복잡한 scope 문맥·사용자 정의 타입 계층은 화면과 다를 수 있습니다. 정밀 규칙의 승자는 직접 계산하여 감지 결과에 표시합니다.

## 공식 자료

- [VS Code Semantic Highlight Guide](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide)
- [VS Code Built-in Commands](https://code.visualstudio.com/api/references/commands)
- [Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust)
- [Roslyn 의미 모델](https://learn.microsoft.com/en-us/dotnet/csharp/roslyn-sdk/work-with-semantics)
- [Microsoft C# 확장](https://github.com/dotnet/vscode-csharp)
