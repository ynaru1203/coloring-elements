export const types = ['namespace', 'type', 'class', 'struct', 'interface', 'enum', 'typeParameter', 'parameter', 'variable', 'property', 'enumMember', 'event', 'function', 'method', 'macro', 'keyword', 'modifier', 'comment', 'string', 'number', 'operator', 'decorator'];
// 기본 분류의 속성 조합 UI를 제거하여 더 이상 참조하지 않는 목록입니다.
// export const modifiers = ['declaration', 'definition', 'readonly', 'static', 'deprecated', 'abstract', 'async', 'modification', 'documentation', 'defaultLibrary'];
export type Customizations = Record<string, unknown> & { rules?: Record<string, unknown> };

export function selector(type: unknown, mods: unknown): string {
    if (typeof type !== 'string' || !/^(\*|[\w-]+)$/.test(type) || !Array.isArray(mods) ||
        mods.length > 32 || !mods.every(m => typeof m === 'string' && /^[\w-]+$/.test(m))) {
        throw new Error('유효하지 않은 요소 또는 속성입니다.');
    }
    return [type, ...[...new Set(mods)].sort()].join('.') + ':csharp';
}
export function color(value: unknown): string {
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) { throw new Error('색상은 #RRGGBB 형식이어야 합니다.'); }
    return value.toUpperCase();
}
export function updateRule(current: Customizations, key: string, value: string | null): Customizations {
    const rules = { ...current.rules };
    // Equivalent modifier orders are the same predicate; clear their colors together.
    for (const alias of Object.keys(rules)) {
        if (alias === key || !/^(\*|[\w-]+)(\.[\w-]+)*:csharp$/.test(alias)) { continue; }
        const [type, ...mods] = alias.slice(0, -7).split('.');
        if (selector(type, mods) !== key) { continue; }
        const style = typeof rules[alias] === 'object' && rules[alias] !== null ? { ...rules[alias] as object } as Record<string, unknown> : {};
        delete style.foreground;
        if (Object.keys(style).length) { rules[alias] = style; } else { delete rules[alias]; }
    }
    const old = rules[key];
    const style = typeof old === 'object' && old !== null ? { ...old } as Record<string, unknown> : {};
    if (value === null) { delete style.foreground; } else { style.foreground = color(value); }
    if (Object.keys(style).length) { rules[key] = style; } else { delete rules[key]; }
    return { ...current, rules };
}
export function exportColors(current: Customizations): Record<string, string> {
    return Object.fromEntries(Object.entries(current.rules ?? {}).flatMap(([key, value]) => {
        const foreground = typeof value === 'string' ? value : (value as { foreground?: unknown } | null)?.foreground;
        if (!/^(\*|[\w-]+)(\.[\w-]+)*:csharp$/.test(key) || typeof foreground !== 'string' || !/^#[0-9a-f]{6}$/i.test(foreground)) { return []; }
        const [type, ...mods] = key.slice(0, -7).split('.');
        return [[selector(type, mods), foreground]];
    }));
}
export function importColors(input: unknown): Record<string, string> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) { throw new Error('색상 파일 형식이 잘못되었습니다.'); }
    const file = input as { version?: unknown; colors?: unknown };
    if (file.version !== 1 || !file.colors || typeof file.colors !== 'object' || Array.isArray(file.colors)) { throw new Error('지원하지 않는 색상 파일입니다.'); }
    const entries = Object.entries(file.colors);
    if (entries.length > 1000) { throw new Error('규칙은 최대 1000개까지 가져올 수 있습니다.'); }
    return Object.fromEntries(entries.map(([key, value]) => {
        if (!/^(\*|[\w-]+)(\.[\w-]+)*:csharp$/.test(key)) { throw new Error('C# 전용 규칙만 가져올 수 있습니다.'); }
        const [type, ...mods] = key.slice(0, -7).split('.');
        return [selector(type, mods), color(value)];
    }));
}
