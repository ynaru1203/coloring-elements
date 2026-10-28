import * as vscode from 'vscode';
import { parse, ParseError } from 'jsonc-parser';
import { Customizations } from './rules';

type TextRule = { scope?: string | string[]; settings?: { foreground?: string } };
type Theme = { include?: string; colors?: Record<string, string>; semanticTokenColors?: Record<string, unknown>; tokenColors?: TextRule[] };
type Preview = { color?: string; source: string; approximate: boolean };
let cachedTheme: { uri: string; value: Promise<Theme> } | undefined;

async function readTheme(uri: vscode.Uri, visited = new Set<string>()): Promise<Theme> {
    if (visited.has(uri.toString()) || visited.size >= 20) { throw new Error('테마 include가 순환하거나 너무 깊습니다.'); }
    visited.add(uri.toString());
    const errors: ParseError[] = [];
    const theme = parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'), errors, { allowTrailingComma: true }) as Theme;
    if (errors.length || !theme || typeof theme !== 'object') { throw new Error('테마 JSON을 읽을 수 없습니다.'); }
    const base = theme.include ? await readTheme(vscode.Uri.joinPath(uri, '..', theme.include), visited) : {};
    return { colors: { ...base.colors, ...theme.colors }, semanticTokenColors: { ...base.semanticTokenColors, ...theme.semanticTokenColors },
        tokenColors: [...(base.tokenColors ?? []), ...(Array.isArray(theme.tokenColors) ? theme.tokenColors : [])] };
}

function hex(value: unknown): string | undefined {
    if (typeof value !== 'string') { return; }
    if (/^#[0-9a-f]{6}$/i.test(value)) { return value.toUpperCase(); }
    if (/^#[0-9a-f]{3}$/i.test(value)) { return '#' + [...value.slice(1)].map(c => c + c).join('').toUpperCase(); }
}
function foreground(style: unknown) {
    return hex(typeof style === 'string' ? style : (style as { foreground?: unknown } | null)?.foreground);
}

export function semanticColor(rules: Record<string, unknown>, type: string, modifiers: string[]): string | undefined {
    // shortcut: preview matches direct token types only; add registered type ancestry with a full theme resolver.
    let winner: string | undefined, best = -1;
    for (const [selector, style] of Object.entries(rules)) {
        const [pattern, language] = selector.split(':');
        const [token, ...required] = pattern.split('.');
        if ((language && language !== 'csharp') || (token !== '*' && token !== type) || !required.every(m => modifiers.includes(m))) { continue; }
        const score = (token === '*' ? 0 : 100) + required.length * 100 + (language ? 10 : 0);
        const value = foreground(style);
        if (value && score >= best) { best = score; winner = value; }
    }
    return winner;
}

function themedBlocks(settings: Record<string, unknown>, name: string): Record<string, unknown>[] {
    return Object.entries(settings).filter(([key, value]) => {
        if (!key.startsWith('[') || !value || typeof value !== 'object') { return false; }
        return [...key.matchAll(/\[([^\]]+)\]/g)].some(([, pattern]) =>
            new RegExp('^' + pattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(name));
    }).map(([, value]) => value as Record<string, unknown>);
}

const scopes: Record<string, string[]> = {
    namespace: ['entity.name.namespace'], type: ['entity.name.type', 'support.type'], class: ['entity.name.type.class', 'support.class'],
    struct: ['entity.name.type.struct'], interface: ['entity.name.type.interface', 'support.class'], enum: ['entity.name.type.enum'],
    typeParameter: ['entity.name.type.parameter'], parameter: ['variable.parameter'], property: ['variable.other.property'],
    variable: ['variable.other.readwrite', 'entity.name.variable'], method: ['entity.name.function.member', 'support.function'],
    function: ['entity.name.function', 'support.function'], enumMember: ['variable.other.enummember'], event: ['variable.other.event'],
    keyword: ['keyword'], modifier: ['storage.modifier'], comment: ['comment'], string: ['string'], number: ['constant.numeric'], operator: ['keyword.operator']
};

export async function colorPreview(type: string, modifiers: string[], resource?: vscode.Uri): Promise<Preview> {
    const name = vscode.workspace.getConfiguration('workbench', resource).get<string>('colorTheme', '');
    const config = vscode.workspace.getConfiguration('editor', resource);
    const semantic = config.get<Customizations>('semanticTokenColorCustomizations') ?? {};
    const customRules = Object.assign({}, semantic.rules, ...themedBlocks(semantic, name).map(block => block.rules));
    const configured = semanticColor(customRules, type, modifiers);
    if (configured) { return { color: configured, source: '상속된 의미 색상 규칙', approximate: true }; }
    let theme: Theme = {};
    try {
        for (const extension of vscode.extensions.all) {
            const entry = (extension.packageJSON.contributes?.themes as { id?: string; label?: string; path: string }[] | undefined)
                ?.find(item => item.id === name || item.label === name);
            if (!entry) { continue; }
            const uri = vscode.Uri.joinPath(extension.extensionUri, entry.path);
            if (cachedTheme?.uri !== uri.toString()) { cachedTheme = { uri: uri.toString(), value: readTheme(uri) }; }
            theme = await cachedTheme.value;
            break;
        }
    } catch { cachedTheme = undefined; }
    const semanticDefault = semanticColor(theme.semanticTokenColors ?? {}, type, modifiers);
    if (semanticDefault) { return { color: semanticDefault, source: '테마 의미 색상', approximate: true }; }
    const textCustom = config.get<Record<string, unknown>>('tokenColorCustomizations') ?? {};
    const textRules = [...(theme.tokenColors ?? []), ...(textCustom.textMateRules as TextRule[] ?? []),
        ...themedBlocks(textCustom, name).flatMap(block => block.textMateRules as TextRule[] ?? [])];
    let candidates = scopes[type] ?? [];
    if (modifiers.includes('readonly') && ['property', 'variable'].includes(type)) { candidates = [`variable.other.constant${type === 'property' ? '.property' : ''}`]; }
    for (const candidate of candidates) {
        // shortcut: simple fallback scopes only; use a grammar-aware resolver for compound TextMate selectors.
        let winner: string | undefined, best = -1;
        for (const rule of textRules) {
            const selectors = Array.isArray(rule.scope) ? rule.scope : (rule.scope ?? '').split(',');
            for (const selector of selectors) {
                const scope = selector.trim();
                if (!scope || (candidate !== scope && !candidate.startsWith(scope + '.'))) { continue; }
                const value = hex(rule.settings?.foreground);
                if (value && scope.length >= best) { best = scope.length; winner = value; }
            }
        }
        if (winner) { return { color: winner, source: '테마 구문 색상', approximate: true }; }
    }
    const workbench = vscode.workspace.getConfiguration('workbench', resource).get<Record<string, unknown>>('colorCustomizations') ?? {};
    const colors = Object.assign({}, theme.colors, workbench, ...themedBlocks(workbench, name));
    return { color: hex(colors['editor.foreground']), source: '테마 기본 글자색 (분류별 색상 확인 불가)', approximate: true };
}
