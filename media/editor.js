/* global acquireVsCodeApi */
const vscode = acquireVsCodeApi();
const $ = id => document.getElementById(id);
let state;
let dragging = false;
let previewRequest = 0;
let subtypeType;
let nativeRuleModifiers = [];
const subtypeNames = { true: '참 (true)', false: '거짓 (false)', null: '값 없음 (null)', _: '값을 버림 (_)' };
const isSubtype = type => state?.engine === 'roslyn' && ['keyword', 'literal'].includes(type) && Array.isArray(state.tokenKinds?.[type]);
const selectedModifiers = () => {
    if (state?.engine !== 'roslyn') { return nativeRuleModifiers; }
    if (isSubtype($('type').value)) { return $('subtype').value ? ['text_' + $('subtype').value] : []; }
    return [...document.querySelectorAll('#modifiers input:checked')].map(input => input.value).sort();
};
const key = () => [$('type').value, ...selectedModifiers()].join('.') + ':csharp';
const post = (kind, extra = {}) => vscode.postMessage({ kind, ...extra });
const typeName = type => state?.typeLabels?.[type] || `추가 분류 (${type})`;
const modifierName = modifier => modifier.startsWith('text_') ? subtypeNames[modifier.slice(5)] || modifier.slice(5)
    : state?.modifierLabels?.[modifier]?.[0] || `추가 속성 (${modifier})`;
const conditionName = (type, mods) => [typeName(type), ...mods.map(modifierName)].join(' · ');
function syncControls() {
    const type = $('type').value;
    const choices = isSubtype(type) ? state.tokenKinds[type] : undefined;
    $('subtype-row').hidden = !choices;
    $('modifier-section').hidden = state.engine !== 'roslyn' || !!choices;
    if (choices && subtypeType !== type) {
        $('subtype').replaceChildren();
        for (const value of ['', ...choices]) {
            const option = document.createElement('option'); option.value = value;
            option.textContent = value ? subtypeNames[value] || value : type === 'keyword' ? '모든 키워드' : '모든 고정값';
            $('subtype').append(option);
        }
        $('subtype').value = '';
        $('subtype-label').textContent = type === 'keyword' ? '키워드 종류' : '고정값 종류';
    }
    subtypeType = type;
}
function chooseConditions(type, mods, savedRule = false) {
    addType(type); $('type').value = type;
    nativeRuleModifiers = state.engine !== 'roslyn' && savedRule ? mods : [];
    syncControls();
    if (state.engine === 'roslyn') {
        if (isSubtype(type)) { $('subtype').value = mods.find(mod => mod.startsWith('text_'))?.slice(5) || ''; }
        else { mods.forEach(addModifier); }
    }
    document.querySelectorAll('#modifiers input').forEach(input => { input.checked = mods.includes(input.value); });
}
function display() {
    syncControls();
    $('selector').textContent = conditionName($('type').value, selectedModifiers());
    const value = state.effective[key()];
    $('value').textContent = `선택 범위: ${state.local[key()] || '상속'} · 병합된 기본 규칙: ${value || '테마/다른 규칙'} (테마별 규칙 제외)`;
    if (!dragging) {
        if (value) { setColor(value); }
        post('preview', { type: $('type').value, modifiers: selectedModifiers(), request: ++previewRequest });
    }
}
function setColor(hex) {
    $('picker').value = hex;
    $('hex').value = hex;
    $('rgb').value = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ');
}
function save(hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) { $('status').textContent = 'HEX는 #RRGGBB 형식으로 입력해 주세요.'; return; }
    setColor(hex);
    post('save', { type: $('type').value, modifiers: selectedModifiers(), color: hex });
}
function addType(type) {
    if (![...$('type').options].some(option => option.value === type)) {
        const option = document.createElement('option'); option.value = type; option.textContent = `${typeName(type)} (${type})`; $('type').append(option);
    }
}
function addModifier(modifier) {
    if ([...document.querySelectorAll('#modifiers input')].some(input => input.value === modifier)) { return; }
    const label = document.createElement('label');
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = modifier;
    label.title = state?.modifierLabels?.[modifier]?.[1] || '현재 언어 서버가 제공한 추가 속성입니다.';
    input.addEventListener('change', () => { dragging = false; display(); });
    label.append(input, document.createTextNode(`${modifierName(modifier)} (${modifier})`)); $('modifiers').append(label);
}
window.addEventListener('message', ({ data }) => {
    if (data.kind === 'error') { $('status').textContent = data.message; return; }
    if (data.kind === 'analysisStatus') { $('analysis-status').textContent = data.message; return; }
    if (data.kind === 'preview') {
        if (data.request !== previewRequest || dragging) { return; }
        if (data.color) {
            setColor(data.color);
        } else {
            $('picker').value = '#000000'; $('hex').value = ''; $('rgb').value = '';
        }
        $('preview').textContent = `${data.source}${data.approximate ? ' (테마 추정값 · 실제 색상은 토큰 검사기로 확인)' : ''}`;
        return;
    }
    if (data.kind === 'detected') {
        data.types.forEach(addType);
        if (state.engine === 'roslyn') { data.availableModifiers.forEach(addModifier); }
        chooseConditions(data.type, data.modifiers);
        const [winnerType, ...winnerMods] = data.winner ? data.winner.slice(0, -7).split('.') : [];
        $('detected').textContent = `감지: ${conditionName(data.type, data.modifiers)}. ${data.engine === 'roslyn'
            ? `${isSubtype(data.type) ? '같은 종류의 키워드·고정값에 적용됩니다.' : '선언과 참조에 같은 조건이 적용됩니다.'} 현재 적용 규칙: ${data.winner ? conditionName(winnerType, winnerMods) : '기존 테마'}`
            : '기본 분류는 요소별로 색상을 설정합니다. 속성 조합은 정밀 분류를 사용하세요.'}`;
        display(); return;
    }
    if (data.kind !== 'state') { return; }
    const resetCatalog = !state || state.engine !== data.engine;
    state = data;
    if (resetCatalog) {
        $('type').replaceChildren(); $('modifiers').replaceChildren();
        subtypeType = undefined; nativeRuleModifiers = [];
        ['*', ...data.types].forEach(addType);
        if (data.engine === 'roslyn') { data.modifiers.forEach(addModifier); }
        $('type').value = 'property';
        $('detected').textContent = '';
    }
    $('engine').value = data.engine || 'native';
    $('analysis-status').textContent = data.analysisStatus || '';
    $('engine-note').textContent = data.engine === 'roslyn'
        ? '정밀 분류: 심볼 속성을 조합하거나 키워드·고정값을 종류별로 고를 수 있습니다. 조건 또는 종류를 고른 뒤 색상을 변경하세요.'
        : '기본 분류: 기존 C# 서버의 요소별 색상을 설정합니다. 속성 조합은 정밀 분류를 사용하세요.';
    $('target').value = data.target;
    $('target').querySelector('[value="workspace"]').disabled = !data.workspace;
    $('enabled').textContent = `C# 의미 강조: ${String(data.enabled)} · 적용되지 않으면 언어 서버 준비 상태와 테마별 규칙을 확인하세요.`;
    $('rules').replaceChildren();
    for (const [selector, hex] of Object.entries(data.local)) {
        const li = document.createElement('li'); const button = document.createElement('button');
        const [ruleType, ...ruleMods] = selector.slice(0, -7).split('.');
        button.textContent = `${conditionName(ruleType, ruleMods)} — ${hex}`;
        button.title = selector;
        button.onclick = () => {
            const [type, ...mods] = selector.slice(0, -7).split('.'); chooseConditions(type, mods, true); display();
        };
        li.append(button); $('rules').append(li);
    }
    $('status').textContent = '설정을 불러왔습니다. 색상을 변경하면 자동 저장됩니다.'; display();
});
$('type').onchange = () => { dragging = false; nativeRuleModifiers = []; display(); };
$('subtype').onchange = () => { dragging = false; display(); };
$('engine').onchange = () => { dragging = false; previewRequest++; post('engine', { value: $('engine').value }); };
$('target').onchange = () => { dragging = false; post('target', { value: $('target').value }); };
$('picker').oninput = () => { if (!dragging) { previewRequest++; } dragging = true; setColor($('picker').value); };
$('picker').onchange = () => { dragging = false; save($('picker').value); };
$('hex').onchange = () => save($('hex').value.trim());
$('rgb').onchange = () => {
    const parts = $('rgb').value.split(',').map(s => s.trim());
    if (parts.length !== 3 || parts.some(s => !/^\d{1,3}$/.test(s) || Number(s) > 255)) {
        $('status').textContent = 'RGB는 0~255 정수 세 개를 쉼표로 구분해 주세요.'; return;
    }
    save('#' + parts.map(s => Number(s).toString(16).padStart(2, '0')).join(''));
};
$('reset').onclick = () => { dragging = false; previewRequest++; post('reset', { type: $('type').value, modifiers: selectedModifiers() }); };
for (const id of ['detect', 'inspect', 'enable', 'import', 'export', 'project']) { $(id).onclick = () => post(id); }
post('ready');
