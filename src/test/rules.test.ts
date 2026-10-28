import * as assert from 'assert';
import { selector, color, updateRule, exportColors, importColors, Customizations } from '../rules';
suite('C# color rules', () => {
    test('selectors are C# scoped and canonical', () => {
        assert.strictEqual(selector('property', ['static', 'readonly', 'static']), 'property.readonly.static:csharp');
        assert.throws(() => selector('property:javascript', []));
        assert.throws(() => selector('property', ['bad.modifier']));
        assert.throws(() => selector('property', null));
    });
    test('colors reject CSS, alpha and malformed values', () => {
        assert.strictEqual(color('#aabbcc'), '#AABBCC');
        for (const value of ['red', '#abc', '#11223344', 'url(x)', null]) { assert.throws(() => color(value)); }
    });
    test('save/reset retain unrelated languages, theme overrides and font styles', () => {
        const initial: Customizations = { enabled: false, '[Dark Modern]': { rules: { 'class:csharp': '#112233' } },
            rules: { 'class:javascript': '#123456', 'property:csharp': { foreground: '#111111', bold: true } } };
        const saved = updateRule(initial, 'property:csharp', '#abcdef');
        assert.deepStrictEqual(saved.rules?.['property:csharp'], { foreground: '#ABCDEF', bold: true });
        assert.strictEqual(saved.rules?.['class:javascript'], '#123456');
        assert.deepStrictEqual(saved['[Dark Modern]'], initial['[Dark Modern]']);
        assert.strictEqual(saved.enabled, false);
        assert.deepStrictEqual(updateRule(saved, 'property:csharp', null).rules?.['property:csharp'], { bold: true });
        assert.deepStrictEqual(initial.rules?.['property:csharp'], { foreground: '#111111', bold: true });
        assert.deepStrictEqual(updateRule({ rules: { 'property:csharp': '#111111' } }, 'property:csharp', null).rules, {});
    });
    test('export/import round trip only portable C# colors', () => {
        const colors = exportColors({ rules: { 'class:csharp': '#ABCDEF', 'class:javascript': '#112233',
            'property:csharp': { foreground: '#123456', italic: true }, 'variable:csharp': { bold: true } } });
        assert.deepStrictEqual(importColors(JSON.parse(JSON.stringify({ version: 1, colors }))), colors);
        for (const invalid of [null, [], { version: 2, colors: {} }, { version: 1, colors: { 'class:javascript': '#112233' } },
            { version: 1, colors: { 'class:csharp': 'red' } }, { version: 1, colors: [] }]) { assert.throws(() => importColors(invalid)); }
    });
    test('reset handles pre-existing rules with a different modifier order', () => {
        const original = { rules: { 'property.static.readonly:csharp': { foreground: '#123456', bold: true } } };
        assert.deepStrictEqual(exportColors(original), { 'property.readonly.static:csharp': '#123456' });
        assert.deepStrictEqual(updateRule(original, 'property.readonly.static:csharp', null).rules,
            { 'property.static.readonly:csharp': { bold: true } });
    });
});
