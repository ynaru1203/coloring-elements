import { types } from './rules';
import { tokenKinds } from './tokenKinds';

export const advancedTypes = ['namespace', 'class', 'struct', 'interface', 'enum', 'delegate', 'typeParameter', 'field', 'property', 'variable', 'parameter', 'method', 'constructor', 'event', 'enumMember', 'keyword', 'literal'];
const accessibility = ['public', 'private', 'protected', 'internal', 'protectedInternal', 'privateProtected'];
export const advancedModifiers = [...accessibility, 'static', 'readonly', 'const', 'getOnly', 'initOnly', 'hasGetter', 'hasSetter',
    ...['getter', 'setter'].flatMap(prefix => accessibility.map(access => prefix + access[0].toUpperCase() + access.slice(1)))];

export const typeLabels: Record<string, string> = {
    '*': '모든 요소', namespace: '네임스페이스', type: '자료형', class: '클래스', struct: '구조체', interface: '인터페이스',
    enum: '열거형', delegate: '델리게이트', typeParameter: '제네릭 자료형 매개변수', parameter: '함수 매개변수',
    field: '필드 (클래스·구조체의 변수)', property: '프로퍼티', variable: '지역 변수', enumMember: '열거형 항목',
    event: '이벤트', function: '함수', method: '함수', constructor: '생성자', macro: '전처리 매크로', keyword: '키워드 (예약어)', literal: '고정값 (true·false·null)',
    modifier: '수식어 키워드', comment: '주석', string: '문자열', number: '숫자', regexp: '정규식', operator: '연산자',
    decorator: '특성 (어트리뷰트)', label: '이동 대상 이름 (레이블)'
};
export const modifierLabels: Record<string, [string, string]> = {
    declaration: ['선언하는 위치만', '이름이 선언된 위치에만 적용합니다. 참조 위치에도 적용하려면 해제하세요.'],
    definition: ['정의하는 위치만', '구현이 정의된 위치에만 적용합니다. 실제 제공 여부는 언어 서버에 따라 다릅니다.'],
    readonly: ['읽기 전용', '정밀 분류에서는 readonly 필드입니다. 다른 값으로 재대입할 수 없지만 List 등의 내용 변경까지 막지는 않습니다.'],
    static: ['인스턴스 없이 사용', 'static 요소입니다. 개별 객체가 아니라 클래스·구조체에 속합니다.'],
    const: ['컴파일 시 결정되는 상수', 'const 필드 또는 지역 변수입니다.'],
    getOnly: ['읽기만 가능 (get 전용)', 'get은 있고 set과 init은 없는 프로퍼티입니다. 생성자에서 초기화할 수는 있습니다.'],
    initOnly: ['초기화할 때만 설정 가능', 'init 접근자가 있는 프로퍼티입니다. 일반적인 set과 구분합니다.'],
    hasGetter: ['읽기 기능 있음 (get)', 'get 접근자가 있는 프로퍼티입니다.'],
    hasSetter: ['설정 기능 있음 (set 또는 init)', 'set 또는 init 접근자가 있는 프로퍼티입니다.'],
    public: ['어디서나 접근 가능', 'public: 외부 코드에서도 접근할 수 있습니다.'],
    private: ['선언한 클래스·구조체 안에서 접근', 'private: 선언한 형식 내부에서 접근할 수 있습니다.'],
    protected: ['자신과 상속받은 클래스에서 접근', 'protected: 해당 클래스와 그 클래스를 상속받은 코드에서 접근할 수 있습니다.'],
    internal: ['같은 어셈블리 안에서 접근', 'internal: 같은 .dll 등 하나의 출력 단위에 묶인 코드에서 접근할 수 있습니다.'],
    protectedInternal: ['같은 어셈블리 또는 상속 클래스에서 접근', 'protected internal: 두 조건 중 하나를 만족하면 됩니다.'],
    privateProtected: ['같은 어셈블리의 자신·상속 클래스에서 접근', 'private protected: 상속 관계와 같은 어셈블리 조건을 함께 만족해야 합니다.'],
    deprecated: ['사용 중단이 권장됨', '대체 기능 사용이 권장되는 요소입니다.'], abstract: ['구현을 상속 클래스에 맡김', 'abstract 요소입니다.'],
    async: ['비동기 함수', 'async 함수입니다.'], modification: ['값을 쓰거나 바꾸는 위치', '언어 서버가 modification으로 표시한 사용 위치입니다.'],
    documentation: ['문서 주석 안의 요소', '문서 주석에 속하는 요소입니다.'], defaultLibrary: ['기본 라이브러리 요소', '언어 서버가 기본 라이브러리에 속한다고 분류한 요소입니다.']
};
for (const [prefix, action] of [['getter', '읽기'], ['setter', '설정']] as const) {
    for (const access of accessibility) {
        const key = prefix + access[0].toUpperCase() + access.slice(1);
        modifierLabels[key] = [`${action} 범위: ${modifierLabels[access][0]}`, `${action} 접근자의 ${access} 접근 범위를 검사합니다. ${modifierLabels[access][1]}`];
    }
}
export function catalog(engine: string) {
    return { types: engine === 'roslyn' ? advancedTypes : types, modifiers: engine === 'roslyn' ? advancedModifiers : [],
        typeLabels, modifierLabels, tokenKinds: engine === 'roslyn' ? tokenKinds : {} };
}
