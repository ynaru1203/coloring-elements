# 개발 빠른 시작

이 프로젝트는 생성기의 Hello World 예제에서 출발했지만 현재 명령과 빌드 구조는 달라졌습니다. 최신 안내는 [개발 안내](docs/DEVELOPMENT.md)를 사용하세요.

```sh
npm ci
npm run compile
npm run build:analyzer
```

.NET 10 SDK를 준비한 뒤 F5의 **Run Coloring Elements**를 실행합니다. 그 창에서 C# 프로젝트를 열고 **Coloring Elements: C# 색상 편집기 열기** 명령을 실행하세요.

테스트는 `npm run test:unit`과 `npm test`, VSIX 생성은 `npm run package`로 수행합니다. 실제 기능 사용 방법은 [사용 설명서](docs/USER_GUIDE.md)에 있습니다.
