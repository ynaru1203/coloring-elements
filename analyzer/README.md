# Roslyn 분석 모듈

.NET 10 SDK와 공식 Roslyn 5.0.0, MSBuildWorkspace, Microsoft.Build.Locator를 사용합니다. 이제 GUI에 연결되며 `analyzer-bin` 배포물이 VSIX에 포함됩니다.

```sh
dotnet run --project analyzer/ColoringElements.Analysis -- --self-test
npm run build:analyzer
```

`SymbolClassifier`는 바인딩된 심볼을 종류/접근성/static/readonly/const/접근자 속성으로 변환합니다. 자체 검증은 선언과 참조의 분류 일치 및 이름 가리기를 검사합니다. `AnalysisServer`는 `--server`로 실행되어 JSON Lines 요청을 처리합니다.

0.2.0부터 `Classifier.GetClassifiedSpansAsync`로 실제 키워드와 고정값도 분류합니다. `keyword`/`literal` 토큰에 `text_public`, `text_true`처럼 종류 하나를 전달하며 기존 범위/규칙 경로를 재사용합니다. 문자열·주석·비활성 코드·전처리 지시문은 제외합니다. `true`/`false` 연산자 선언을 실제 상수 값으로 오인하지 않습니다.

`--catalog`는 포함된 Roslyn의 예약어/문맥 키워드와 의미 분류용 특수 단어(var/dynamic/네이티브 정수/버림표 등)를 JSON으로 출력합니다. `src/tokenKinds.ts`는 이 결과를 저장한 목록이며 패키지 업그레이드 시 다시 생성합니다. 테스트에서 분석기의 실제 목록과 일치하는지 확인합니다.

- `open`: `id`, `kind`, `projectPath` 절대 경로. MSBuildWorkspace로 솔루션/프로젝트를 로드하며 실패 진단을 반환합니다. 프로젝트 복원/실제 빌드는 자동 실행하지 않습니다.
- `analyze`: `id`, `kind`, `uri`, `filePath`, `version`, `text`, `overlays: [{filePath,text}]`. URI는 문서 식별용이고 파일 매칭은 운영체제 경로로 합니다. VS Code의 percent-encoded 드라이브 문자에 의존하지 않습니다.
- 응답: 같은 `id`, `uri`, `version`, `tokens: [{line,character,length,type,modifiers}]`. 위치는 UTF-16이며 오류 응답은 `error`를 포함합니다. 프로젝트 문맥이 모호하거나 컴파일 오류가 있으면 색상을 추측하지 않습니다.

열린 문서의 overlay를 반영한 solution/compilation을 재사용합니다. 클라이언트는 닫힌 문서·외부 파일·프로젝트 변경 시 프로세스를 다시 로드하여 폐기된 미저장 내용이나 오래된 파일이 남지 않게 합니다. 편집 중 요청을 합치고 오래된 버전의 응답은 적용하지 않습니다. 프로세스는 셸 없이 실행하며 작업 공간 신뢰가 있어야 시작합니다.

실제 프로젝트 통합 fixture는 `analyzer/Fixtures/Project`에 있습니다. 테스트 실행 시 별도 폴더로 복사하여 readonly 필드/매개변수 이름 가리기/다른 파일의 private setter/미저장 수정/오류 복구를 검증합니다. VS Code 서비스 테스트는 실제 편집기의 감지와 decoration API 호출까지 확인합니다.

아직 실제 Unity 참조/대형 솔루션/다중 타깃을 검증하지 않았습니다. 분석기에 적용된 문법·참조·define은 선택한 프로젝트에서 읽으며, 단독 파일을 임의의 compilation으로 분석하지 않습니다. 여러 프로젝트에 속한 파일은 해당 csproj 선택을 요구합니다.
