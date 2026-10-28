import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { tokenAt } from './tokens';
import { colorPreview } from './preview';
import { selector, color, updateRule, exportColors, importColors, Customizations } from './rules';
import { catalog } from './catalog';
import { advancedSelector, AdvancedRules, winningRule } from './advancedRules';
import { RoslynColoring } from './roslyn';

const setting = 'semanticTokenColorCustomizations';
export function activate(context: vscode.ExtensionContext) {
    let panel: vscode.WebviewPanel | undefined;
    let editor: vscode.TextEditor | undefined;
    let target = vscode.ConfigurationTarget.Global;
    let engine = 'roslyn';
    let analysisStatus = '프로젝트를 선택하거나 식별자 감지를 눌러 정밀 분석을 시작하세요.';
    let queue = Promise.resolve();
    const roslyn = new RoslynColoring(context, message => {
        analysisStatus = message;
        void panel?.webview.postMessage({ kind: 'analysisStatus', message });
    });
    context.subscriptions.push(roslyn);
    const config = () => vscode.workspace.getConfiguration('editor', editor?.document.uri);
    const advancedConfig = () => vscode.workspace.getConfiguration('coloringElements', editor?.document.uri);
    const advancedAtTarget = (): AdvancedRules => {
        const inspected = advancedConfig().inspect<AdvancedRules>('rules');
        return (target === vscode.ConfigurationTarget.Global ? inspected?.globalValue : inspected?.workspaceValue) ?? {};
    };
    const atTarget = (): Customizations => {
        const inspected = config().inspect<Customizations>(setting);
        return (target === vscode.ConfigurationTarget.Global ? inspected?.globalValue : inspected?.workspaceValue) ?? {};
    };
    const send = () => panel?.webview.postMessage({
        kind: 'state', ...catalog(engine), engine, analysisStatus, target: target === vscode.ConfigurationTarget.Global ? 'user' : 'workspace',
        local: engine === 'roslyn' ? advancedAtTarget() : exportColors(atTarget()),
        effective: engine === 'roslyn' ? advancedConfig().get<AdvancedRules>('rules', {}) : exportColors(config().get<Customizations>(setting) ?? {}),
        enabled: vscode.workspace.getConfiguration('editor', { uri: editor?.document.uri, languageId: 'csharp' }).get('semanticHighlighting.enabled'),
        workspace: !!vscode.workspace.workspaceFile || !!vscode.workspace.workspaceFolders?.length
    });
    async function handle(message: Record<string, unknown>) {
        if (!panel) { return; }
        switch (message.kind) {
            case 'preview': {
                selector(message.type, message.modifiers);
                const precise = engine === 'roslyn' ? winningRule(advancedConfig().get<AdvancedRules>('rules', {}), message.type as string, message.modifiers as string[]) : undefined;
                const type = ({ field: 'property', constructor: 'method', delegate: 'type', literal: 'keyword' } as Record<string, string>)[message.type as string] ?? message.type as string;
                const preview = precise ? { color: precise.color, source: '현재 조건에 적용되는 정밀 색상 규칙', approximate: false }
                    : await colorPreview(type, message.modifiers as string[], editor?.document.uri);
                await panel.webview.postMessage({ kind: 'preview', request: message.request, ...preview });
                break;
            }
            case 'engine':
                if (message.value !== 'native' && message.value !== 'roslyn') { throw new Error('분류 방식을 확인해 주세요.'); }
                engine = message.value; await send(); break;
            case 'project':
                await roslyn.chooseProject(true, true); await roslyn.refresh(); await send(); break;
            case 'ready': await send(); break;
            case 'target':
                if (message.value !== 'user' && message.value !== 'workspace') { throw new Error('저장 범위가 잘못되었습니다.'); }
                if (message.value === 'workspace' && !vscode.workspace.workspaceFolders?.length && !vscode.workspace.workspaceFile) {
                    throw new Error('작업 공간을 먼저 열어 주세요.');
                }
                target = message.value === 'user' ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace;
                await send(); break;
            case 'save': case 'reset': {
                const key = engine === 'roslyn' ? advancedSelector(message.type, message.modifiers) : selector(message.type, message.modifiers);
                const value = message.kind === 'reset' ? null : color(message.color);
                if (engine === 'roslyn') {
                    const rules = { ...advancedAtTarget() };
                    if (value === null) { delete rules[key]; } else { rules[key] = value; }
                    await advancedConfig().update('rules', rules, target);
                    roslyn.invalidate();
                    await roslyn.refresh();
                } else { await config().update(setting, updateRule(atTarget(), key, value), target); }
                await send(); break;
            }
            case 'enable':
                await vscode.workspace.getConfiguration('editor', { uri: editor?.document.uri, languageId: 'csharp' })
                    .update('semanticHighlighting.enabled', true, target, true);
                await send(); break;
            case 'inspect':
                if (!editor || editor.document.languageId !== 'csharp') { throw new Error('C# 식별자를 선택한 후 편집기를 다시 열어 주세요.'); }
                await vscode.window.showTextDocument(editor.document, editor.viewColumn);
                await vscode.commands.executeCommand('editor.action.inspectTMScopes');
                break;
            case 'detect': {
                if (!editor || editor.document.languageId !== 'csharp') { throw new Error('C# 식별자에 커서를 놓고 편집기를 다시 열어 주세요.'); }
                const detected = engine === 'roslyn' ? await roslyn.detect(editor) : await tokenAt(editor.document, editor.selection.active);
                await panel.webview.postMessage({ kind: 'detected', ...catalog(engine), availableModifiers: catalog(engine).modifiers, ...detected, engine });
                break;
            }
            case 'export': {
                const uri = await vscode.window.showSaveDialog({ filters: { 'Coloring Elements': ['json'] } });
                if (uri) { await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify({ version: 1, engine, colors: engine === 'roslyn' ? advancedAtTarget() : exportColors(atTarget()) }, null, 2))); }
                break;
            }
            case 'import': {
                const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Coloring Elements': ['json'] } });
                if (!uris?.length) { return; }
                if ((await vscode.workspace.fs.stat(uris[0])).size > 1024 * 1024) { throw new Error('파일 크기는 1MB 이하여야 합니다.'); }
                const file = JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uris[0])).toString('utf8'));
                if ((file.engine ?? 'native') !== engine) { throw new Error('파일의 분류 방식과 현재 분류 방식을 맞춰 주세요.'); }
                const colors = importColors(file);
                if (engine === 'roslyn') {
                    for (const key of Object.keys(colors)) { const [type, ...mods] = key.slice(0, -7).split('.'); advancedSelector(type, mods); }
                    await advancedConfig().update('rules', { ...advancedAtTarget(), ...colors }, target);
                    roslyn.invalidate(); await roslyn.refresh();
                } else {
                    let next = atTarget();
                    for (const [key, value] of Object.entries(colors)) { next = updateRule(next, key, value); }
                    await config().update(setting, next, target);
                }
                await send(); break;
            }
        }
    }
    context.subscriptions.push(vscode.commands.registerCommand('coloring-elements.open', async () => {
        if (vscode.window.activeTextEditor?.document.languageId === 'csharp') { editor = vscode.window.activeTextEditor; }
        if (panel) { panel.reveal(vscode.ViewColumn.Beside); return; }
        panel = vscode.window.createWebviewPanel('coloringElements', 'Coloring Elements', vscode.ViewColumn.Beside,
            { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] });
        const nonce = randomBytes(16).toString('hex');
        const resource = (name: string) => panel!.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', name)).toString();
        const html = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'media', 'editor.html'))).toString('utf8');
        panel.webview.html = html.replaceAll('{{csp}}', panel.webview.cspSource).replaceAll('{{nonce}}', nonce)
            .replaceAll('{{css}}', resource('editor.css')).replaceAll('{{script}}', resource('editor.js'));
        const messages = panel.webview.onDidReceiveMessage(message => {
            queue = queue.then(() => handle(message)).catch(error => {
                void panel?.webview.postMessage({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
            });
        });
        panel.onDidDispose(() => { messages.dispose(); panel = undefined; });
    }), vscode.window.onDidChangeActiveTextEditor(active => {
        if (active?.document.languageId === 'csharp') { editor = active; void send(); }
    }), vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('editor') || event.affectsConfiguration('coloringElements.rules') || event.affectsConfiguration('workbench.colorTheme') || event.affectsConfiguration('workbench.colorCustomizations')) { void send(); }
    }), { dispose: () => panel?.dispose() });
}
// 종료 정리는 context.subscriptions의 Disposable이 담당하므로 빈 종료 훅은 사용하지 않습니다.
// export function deactivate() {}
