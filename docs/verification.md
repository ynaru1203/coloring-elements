# 검증 기록

[README](../README.md) · [개발 안내](DEVELOPMENT.md) · [코드 정리 기록](CODE_REVIEW.md)

## 환경과 재현 방법

Windows x64, Node 24.18.0, npm 11.16.0, .NET SDK 10.0.401, VS Code 1.143.1에서 검증했습니다. 현재 패키지의 최소 VS Code 버전은 1.140.0입니다.

```sh
npm run compile
npm run lint
npm run test:unit
npm test
npm run package
```

테스트는 `.vscode-test/runs` 아래 매번 새 프로젝트 복사본과 VS Code 사용자 프로필에서 실행합니다. 프로젝트 fixture는 `analyzer/Fixtures/Project`에 있으며 외부 Unity 프로젝트나 개인 사용자 설정을 테스트 입력으로 사용하지 않습니다.

## 자동 테스트 범위

전체 VS Code 테스트는 29개입니다.

| 범위 | 확인 내용 |
| --- | --- |
| 기본 규칙 | C# 전용 선택자, HEX 검증, 타 언어·테마 블록·글꼴 스타일 보존, 초기화, 가져오기 검증 |
| 정밀 규칙 | AND 조건, 구체성 우선순위와 동점 결정, 잘못된 규칙 무시, 한국어 이름·설명 |
| Webview | 기본 분류 속성 UI 숨김, 기존 기본 규칙 유지, 조건 자동 체크, 종류 드롭다운 전환 |
| 색상 입력 | 드래그 input 500회에서 저장 0회, change 시 1회 저장, 초기화 후 선택기/HEX/RGB 갱신 |
| 네이티브 API | range/full Semantic Token provider 감지, 확장 활성화·패널 생성, 실제 설정 API 병합 |
| 테마 | Dark Modern include/JSONC 로드, 상속 규칙과 프로퍼티 기본색 미리보기 |
| Roslyn | MSBuild 프로젝트 로드, readonly 필드/매개변수 이름 가리기, 다른 파일의 private setter/get 전용 참조 |
| 문서 변경 | 미저장 setter 변경과 되돌림의 교차 파일 반영, 컴파일 오류 거부·복구, 프로젝트 밖 파일 거부 |
| 키워드 | 실제 키워드·문맥 키워드·버림표·고정값, 주석/문자열/이스케이프 식별자 제외, 종류 목록 동기화 |
| 편집기 적용 | 실제 C# 문서에서 필드/public/true 감지, 승자 규칙과 decoration API 경로 |

별도로 분석기의 `--self-test`는 심볼/이름 가리기 검사 14개와 선언·참조 일치 검사 14개를 수행합니다. 미사용 코드 점검에서는 TypeScript noUnusedLocals/noUnusedParameters와 export 참조를 대조했습니다.

## 패키지와 공개 범위

VSIX에는 런타임 JavaScript, GUI, .NET 분석기/라이브러리, jsonc-parser, README/CHANGELOG/LICENSE를 포함합니다. 소스·테스트·캐시·PDB·개인 경로가 포함된 빌드 산출물의 개발 파일은 제외합니다. SDK 자체는 포함하지 않습니다.

소스 저장소에는 소스·fixture·개발 설정·문서를 포함하고, `.gitignore`로 node_modules, analyzer-bin, out, .NET/NuGet/npm 캐시, 테스트 프로필, VSIX 및 환경 파일을 제외합니다. VSIX는 GitHub 릴리즈 자산으로 따로 배포합니다.

## 확인하지 않은 범위

픽셀 색상을 비교하는 스크린샷 검증, 실제 Unity 대형 솔루션, Remote/WSL, 복잡한 다중 타깃 환경과 OS 색상 선택기의 모든 조작은 검증하지 않았습니다. 확장 호스트에서 decoration API 호출이 성공한 것이 모든 테마의 시각적 결과를 증명하지는 않습니다.

현재 컴파일 오류가 있는 프로젝트는 정밀 색상을 보류합니다. 전처리 지시문·비활성 코드, 임의 문자열/숫자 내용별 선택, 일부 특수 구문은 지원 범위에 포함하지 않았습니다. 테마 미리보기는 복잡한 scope에서 실제 색상과 다를 수 있습니다.

## 개발 도구 의존성 참고

이전에 npm audit가 VSIX 개발 도구의 Azure 인증 간접 의존성에 high 경고 2건을 보고했습니다. 해당 개발 의존성은 VSIX 런타임에 포함되지 않습니다. 호환성 검증 없이 major override를 추가하지 않았으며, 이 배포에서는 Marketplace 로그인·게시 기능을 사용하지 않습니다. 관련 내용은 [공식 advisory](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5)를 참고하세요.
