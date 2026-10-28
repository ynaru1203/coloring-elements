import * as assert from 'assert';
import { readFileSync } from 'fs';
import * as path from 'path';
import { runInNewContext } from 'vm';
import { catalog } from '../catalog';

function webview() {
    class Element {
        value = ''; checked = false; disabled = false; textContent = ''; type = '';
        hidden = false;
        children: Element[] = [];
        oninput?: () => void; onchange?: () => void; onclick?: () => void;
        get options() { return this.children; }
        append(...children: Element[]) { this.children.push(...children); }
        replaceChildren() { this.children = []; }
        addEventListener(event: string, handler: () => void) { if (event === 'change') { this.onchange = handler; } }
        querySelector() { return new Element(); }
    }
    const elements: Record<string, Element> = {};
    const get = (id: string) => elements[id] ??= new Element();
    const sent: Record<string, unknown>[] = [];
    let receive: (event: { data: Record<string, unknown> }) => void;
    runInNewContext(readFileSync(path.resolve(__dirname, '../..', 'media/editor.js'), 'utf8'), {
        acquireVsCodeApi: () => ({ postMessage: (message: Record<string, unknown>) => sent.push(message) }),
        document: { getElementById: get, createElement: () => new Element(), createTextNode: () => new Element(),
            querySelectorAll: (query: string) => get('modifiers').children.flatMap(label => label.children)
                .filter(input => input.type === 'checkbox' && (!query.includes(':checked') || input.checked)) },
        window: { addEventListener: (_: string, handler: typeof receive) => { receive = handler; } }
    });
    const message = (data: Record<string, unknown>) => receive({ data });
    const state = (effective = {}, extra = {}) => message({ kind: 'state', types: ['property'], modifiers: ['readonly'],
        local: {}, effective, target: 'user', workspace: true, enabled: true, ...extra });
    state();
    return { get, sent, message, state };
}

suite('Color editor interaction', () => {
    test('basic mode removes attribute controls and detection edits only the base category', () => {
        const ui = webview();
        ui.state({}, { ...catalog('native'), engine: 'native' });
        assert.ok(ui.get('modifier-section').hidden);
        assert.ok(ui.get('subtype-row').hidden);
        assert.strictEqual(ui.get('modifiers').children.length, 0);
        ui.message({ kind: 'detected', engine: 'native', type: 'property', types: ['property'],
            availableModifiers: ['readonly'], modifiers: ['readonly'] });
        ui.get('hex').value = '#123456'; ui.get('hex').onchange!();
        assert.strictEqual((ui.sent.at(-1)?.modifiers as string[]).length, 0);
    });
    test('legacy basic rules remain selectable and resettable without exposing checkboxes', () => {
        const ui = webview();
        ui.state({}, { ...catalog('native'), engine: 'native', local: { 'property.readonly:csharp': '#123456' } });
        ui.get('rules').children[0].children[0].onclick!();
        assert.ok(ui.get('modifier-section').hidden);
        ui.get('reset').onclick!();
        assert.strictEqual((ui.sent.at(-1)?.modifiers as string[])[0], 'readonly');
        ui.get('type').onchange!();
        ui.get('reset').onclick!();
        assert.strictEqual((ui.sent.at(-1)?.modifiers as string[]).length, 0);
    });
    test('only precise keyword and literal categories show their separate dropdowns', () => {
        const ui = webview();
        ui.state({}, { ...catalog('roslyn'), engine: 'roslyn' });
        assert.ok(ui.get('subtype-row').hidden);
        ui.get('type').value = 'keyword'; ui.get('type').onchange!();
        assert.ok(!ui.get('subtype-row').hidden);
        assert.ok(ui.get('modifier-section').hidden);
        assert.ok(ui.get('subtype').options.some(option => option.value === 'readonly'));
        ui.get('subtype').value = 'public'; ui.get('subtype').onchange!();
        ui.get('hex').value = '#112233'; ui.get('hex').onchange!();
        assert.strictEqual(ui.sent.at(-1)?.type, 'keyword');
        assert.strictEqual((ui.sent.at(-1)?.modifiers as string[])[0], 'text_public');
        ui.get('type').value = 'literal'; ui.get('type').onchange!();
        assert.ok(!ui.get('subtype-row').hidden);
        assert.ok(ui.get('subtype').options.some(option => option.textContent === '참 (true)'));
        ui.get('subtype').value = 'false'; ui.get('subtype').onchange!();
        assert.strictEqual((ui.sent.at(-1)?.modifiers as string[])[0], 'text_false');
        ui.get('type').value = 'property'; ui.get('type').onchange!();
        assert.ok(ui.get('subtype-row').hidden);
        assert.ok(!ui.get('modifier-section').hidden);
        assert.ok(!(ui.sent.at(-1)?.modifiers as string[]).some(mod => mod.startsWith('text_')));
        ui.get('type').value = 'constructor'; ui.get('type').onchange!();
        assert.ok(ui.get('subtype-row').hidden);
        assert.ok(!ui.get('modifier-section').hidden);
    });
    test('detecting a fixed value selects its dropdown without creating an attribute checkbox', () => {
        const ui = webview();
        ui.state({}, { ...catalog('roslyn'), engine: 'roslyn' });
        ui.message({ kind: 'detected', engine: 'roslyn', type: 'literal', types: ['literal'],
            availableModifiers: catalog('roslyn').modifiers, modifiers: ['text_true'] });
        assert.strictEqual(ui.get('subtype').value, 'true');
        assert.ok(!ui.get('subtype-row').hidden);
        assert.ok(ui.get('modifier-section').hidden);
        assert.ok(!ui.get('modifiers').children.flatMap(label => label.children).some(input => input.value === 'text_true'));
        ui.get('reset').onclick!();
        assert.strictEqual((ui.sent.at(-1)?.modifiers as string[])[0], 'text_true');
    });
    test('precise detection checks matching conditions, clears old checks and uses Korean labels', () => {
        const ui = webview();
        ui.state({}, { ...catalog('roslyn'), engine: 'roslyn' });
        const inputs = ui.get('modifiers').children.flatMap(label => label.children).filter(input => input.type === 'checkbox');
        inputs.find(input => input.value === 'readonly')!.checked = true;
        ui.message({ kind: 'detected', engine: 'roslyn', type: 'property', types: ['property'],
            availableModifiers: catalog('roslyn').modifiers, modifiers: ['public', 'hasGetter', 'hasSetter', 'getterPublic', 'setterPrivate'] });
        assert.strictEqual(inputs.find(input => input.value === 'readonly')!.checked, false);
        assert.strictEqual(inputs.find(input => input.value === 'setterPrivate')!.checked, true);
        assert.ok(ui.get('type').options.some(option => option.value === 'method' && option.textContent === '함수 (method)'));
        assert.match(ui.get('detected').textContent, /설정 범위/);
        const checkbox = inputs.find(input => input.value === 'setterPrivate')!;
        checkbox.checked = false; checkbox.onchange!();
        assert.ok(!(ui.sent.at(-1)?.modifiers as string[]).includes('setterPrivate'));
        ui.get('hex').value = '#123456'; ui.get('hex').onchange!();
        assert.ok((ui.sent.at(-1)?.modifiers as string[]).includes('getterPublic'));
    });
    test('dragging updates local fields without settings writes; commit saves once', () => {
        const ui = webview();
        const oldPreview = ui.sent.at(-1)?.request;
        ui.get('picker').value = '#123456';
        for (let i = 0; i < 500; i++) { ui.get('picker').oninput!(); }
        assert.strictEqual(ui.sent.filter(message => message.kind === 'save').length, 0);
        assert.strictEqual(ui.get('hex').value, '#123456');
        assert.strictEqual(ui.get('rgb').value, '18, 52, 86');
        ui.get('picker').onchange!();
        assert.strictEqual(ui.sent.filter(message => message.kind === 'save').length, 1);
        assert.strictEqual(ui.sent.find(message => message.kind === 'save')?.color, '#123456');
        ui.message({ kind: 'preview', request: oldPreview, color: '#FF0000' });
        assert.strictEqual(ui.get('picker').value, '#123456');
    });
    test('reset refreshes picker, HEX and RGB from the inherited theme preview', () => {
        const ui = webview();
        ui.get('picker').value = '#123456'; ui.get('picker').oninput!();
        ui.get('reset').onclick!();
        assert.strictEqual(ui.sent.at(-1)?.kind, 'reset');
        ui.state();
        const request = ui.sent.at(-1)?.request;
        ui.message({ kind: 'preview', request, color: '#9CDCFE', source: '테마 구문 색상', approximate: true });
        assert.strictEqual(ui.get('picker').value, '#9CDCFE');
        assert.strictEqual(ui.get('hex').value, '#9CDCFE');
        assert.strictEqual(ui.get('rgb').value, '156, 220, 254');
        ui.message({ kind: 'preview', request: Number(request) - 1, color: '#FF0000' });
        assert.strictEqual(ui.get('picker').value, '#9CDCFE');
    });
    test('an unavailable theme color clears stale numeric values', () => {
        const ui = webview();
        ui.get('hex').value = '#123456';
        ui.message({ kind: 'preview', request: ui.sent.at(-1)?.request, source: '색상 확인 불가', approximate: true });
        assert.strictEqual(ui.get('hex').value, '');
        assert.strictEqual(ui.get('rgb').value, '');
    });
});
