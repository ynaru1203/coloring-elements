import * as assert from 'assert';
import { advancedSelector, winningRule } from '../advancedRules';
import { advancedTypes, advancedModifiers, typeLabels, modifierLabels } from '../catalog';
import { tokenKinds } from '../tokenKinds';

suite('Precise rules and Korean labels', () => {
    test('all precise types and checkboxes have Korean names and explanations', () => {
        for (const type of advancedTypes) { assert.match(typeLabels[type], /[가-힣]/); }
        for (const modifier of advancedModifiers) {
            assert.match(modifierLabels[modifier][0], /[가-힣]/);
            assert.ok(modifierLabels[modifier][1]);
        }
        assert.strictEqual(typeLabels.class, '클래스');
        assert.strictEqual(typeLabels.method, '함수');
    });
    test('combined conditions use AND and precise rules win for declarations and references', () => {
        const rules = { 'field:csharp': '#123456', 'field.private.readonly:csharp': '#808080', '*.readonly:csharp': '#445566', 'property.setterPrivate:csharp': '#ABCDEF' };
        assert.strictEqual(winningRule(rules, 'field', ['private', 'readonly'])?.color, '#808080');
        assert.strictEqual(winningRule(rules, 'field', ['public', 'readonly'])?.color, '#445566');
        assert.strictEqual(winningRule(rules, 'property', ['public', 'setterPrivate', 'hasSetter'])?.color, '#ABCDEF');
        assert.strictEqual(winningRule(rules, 'property', ['public', 'getOnly']), undefined);
        assert.throws(() => advancedSelector('property', ['invented']));
    });
    test('ties are deterministic; invalid hand-edited rules are ignored', () => {
        const rules = { 'field.static:csharp': '#445566', 'field.private:csharp': '#112233', 'bad': 'red' };
        assert.strictEqual(winningRule(rules, 'field', ['private', 'static'])?.key, 'field.private:csharp');
        assert.strictEqual(winningRule(Object.fromEntries(Object.entries(rules).reverse()), 'field', ['private', 'static'])?.key, 'field.private:csharp');
    });
    test('keyword and literal kinds are separate, validated and more specific than whole categories', () => {
        assert.strictEqual(advancedSelector('constructor', ['public']), 'constructor.public:csharp');
        assert.throws(() => advancedSelector('toString', []));
        for (const word of ['public', 'private', 'protected', 'readonly', 'class', 'struct', 'var', 'dynamic', 'get', 'set']) {
            assert.ok(tokenKinds.keyword.includes(word));
            assert.strictEqual(advancedSelector('keyword', ['text_' + word]), `keyword.text_${word}:csharp`);
        }
        const rules = { 'keyword:csharp': '#112233', 'keyword.text_public:csharp': '#445566', 'literal.text_true:csharp': '#ABCDEF' };
        assert.strictEqual(winningRule(rules, 'keyword', ['text_public'])?.color, '#445566');
        assert.strictEqual(winningRule(rules, 'keyword', ['text_private'])?.color, '#112233');
        assert.strictEqual(winningRule(rules, 'literal', ['text_true'])?.color, '#ABCDEF');
        assert.strictEqual(winningRule(rules, 'literal', ['text_false']), undefined);
        for (const [type, mods] of [['field', ['text_public']], ['keyword', ['readonly']], ['keyword', ['text_true']],
            ['literal', ['text_public']], ['keyword', ['text_public', 'text_private']]] as const) {
            assert.throws(() => advancedSelector(type, [...mods]));
        }
    });
});
