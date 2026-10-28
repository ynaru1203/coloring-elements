import { advancedModifiers, advancedTypes } from './catalog';
import { color, selector } from './rules';
import { tokenKinds } from './tokenKinds';

export type AdvancedRules = Record<string, string>;
export function advancedSelector(type: unknown, modifiers: unknown) {
    const key = selector(type, modifiers);
    const choices = type === 'keyword' || type === 'literal' ? tokenKinds[type] : undefined;
    if (choices) {
        if ((modifiers as string[]).length > 1 || !(modifiers as string[]).every(mod => choices.includes(mod.replace(/^text_/, '')) && mod.startsWith('text_'))) {
            throw new Error('키워드 또는 고정값 종류를 확인해 주세요.');
        }
        return key;
    }
    if ((type !== '*' && !advancedTypes.includes(type as string)) || !(modifiers as string[]).every(mod => advancedModifiers.includes(mod))) {
        throw new Error('정밀 분류에서 지원하지 않는 요소 또는 속성입니다.');
    }
    return key;
}
export function winningRule(rules: AdvancedRules, type: string, modifiers: string[]) {
    let winner: { key: string; color: string; score: number } | undefined;
    for (const key of Object.keys(rules).sort()) {
        const [token, ...required] = key.slice(0, -7).split('.');
        try {
            if (advancedSelector(token, required) !== key || (token !== '*' && token !== type) || !required.every(mod => modifiers.includes(mod))) { continue; }
            const score = required.length * 100 + (token === '*' ? 0 : 1);
            if (!winner || score > winner.score) { winner = { key, color: color(rules[key]), score }; }
        } catch { /* Ignore hand-edited invalid rules without breaking the editor. */ }
    }
    return winner;
}
