import * as vscode from 'vscode';
import * as path from 'path';
import { RoslynClient } from './roslynClient';
import { AdvancedRules, advancedSelector, winningRule } from './advancedRules';

export interface AnalyzedToken { line: number; character: number; length: number; type: string; modifiers: string[] }
interface Analysis { uri: string; version: number; tokens: AnalyzedToken[] }

export class RoslynColoring implements vscode.Disposable {
    private client?: RoslynClient;
    private loading?: Promise<void>;
    private project?: string;
    private revision = 0;
    private readonly cache = new Map<string, Promise<Analysis>>();
    private readonly decorations = new Map<string, vscode.TextEditorDecorationType>();
    private readonly subscriptions: vscode.Disposable[] = [];
    private timer?: NodeJS.Timeout;
    private busy = false;
    private again = false;
    private disposed = false;

    constructor(private readonly context: vscode.ExtensionContext, private readonly status: (message: string) => void) {
        this.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId === 'csharp') { this.invalidate(); }
        }), vscode.workspace.onDidCloseTextDocument(document => {
            if (document.languageId === 'csharp') { this.invalidate(); }
        }), vscode.window.onDidChangeVisibleTextEditors(() => this.schedule(0)),
        vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('coloringElements.rules')) { this.clear(); this.schedule(0); } }));
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.{cs,csproj,sln,slnx}');
        this.subscriptions.push(watcher, watcher.onDidCreate(() => this.invalidate(true)), watcher.onDidDelete(() => this.invalidate(true)),
            watcher.onDidChange(uri => {
                if (!uri.path.endsWith('.cs') || !vscode.workspace.textDocuments.some(document => document.uri.toString() === uri.toString())) { this.invalidate(true); }
            }));
        this.schedule();
    }

    async chooseProject(interactive = true, force = false): Promise<boolean> {
        if (!vscode.workspace.isTrusted) { throw new Error('정밀 분석은 신뢰한 작업 공간에서 사용할 수 있습니다.'); }
        if (!force && this.project && this.loading) { await this.loading; return true; }
        let selected = force ? undefined : this.project ?? this.context.workspaceState.get<string>('analysisProject');
        if (selected && !vscode.workspace.getWorkspaceFolder(vscode.Uri.file(selected))) { selected = undefined; }
        if (!selected) {
            const candidates = await vscode.workspace.findFiles('**/*.{sln,slnx,csproj}', '**/{node_modules,.git,.nuget,.dotnet,Library,Temp,obj,bin,.vscode-test}/**', 2000);
            if (candidates.length === 1) { selected = candidates[0].fsPath; }
            else if (interactive && candidates.length) {
                const choice = await vscode.window.showQuickPick(candidates.sort((a, b) => Number(a.path.endsWith('.csproj')) - Number(b.path.endsWith('.csproj')))
                    .map(uri => ({ label: path.basename(uri.fsPath), description: vscode.workspace.asRelativePath(uri), value: uri.fsPath })),
                { title: '정밀 색상 분석에 사용할 솔루션 또는 프로젝트', placeHolder: 'Unity에서는 생성된 솔루션을 먼저 선택하세요.' });
                selected = choice?.value;
            }
        }
        if (!selected) {
            this.status('프로젝트를 선택해 주세요. Unity에서는 솔루션·프로젝트 파일을 먼저 생성해야 합니다.');
            return false;
        }
        if (force || this.project !== selected) {
            this.invalidate(true); this.project = selected;
            void this.context.workspaceState.update('analysisProject', selected).then(undefined, error => this.status(String(error)));
        }
        if (!this.client) {
            this.status(`프로젝트 불러오는 중: ${path.basename(selected)}`);
            this.client = new RoslynClient(vscode.Uri.joinPath(this.context.extensionUri, 'analyzer-bin', 'ColoringElements.Analysis.dll').fsPath, path.dirname(selected));
            this.loading = this.client.request({ kind: 'open', projectPath: selected }).then(() => {
                this.status(`정밀 분석 준비됨: ${path.basename(selected!)}`);
            });
        }
        await this.loading;
        return true;
    }

    async analyze(document: vscode.TextDocument, interactive = false): Promise<Analysis | undefined> {
        if (document.languageId !== 'csharp' || document.uri.scheme !== 'file') { throw new Error('프로젝트에 포함된 저장된 C# 파일을 선택해 주세요.'); }
        if (!await this.chooseProject(interactive)) { return; }
        const version = document.version, revision = this.revision;
        const key = `${document.uri}#${version}#${revision}`;
        let task = this.cache.get(key);
        if (!task) {
            task = this.client!.request<Analysis>({ kind: 'analyze', uri: document.uri.toString(), filePath: document.fileName, version, text: document.getText(),
                overlays: vscode.workspace.textDocuments.filter(doc => doc.languageId === 'csharp' && doc.uri.scheme === 'file')
                    .map(doc => ({ filePath: doc.fileName, text: doc.getText() })) }).then(result => {
                if (document.version !== version || this.revision !== revision) { throw new Error('문서가 변경되었습니다. 다시 감지해 주세요.'); }
                if (result.uri !== document.uri.toString() || result.version !== version || !Array.isArray(result.tokens)) { throw new Error('Roslyn 문서 응답이 일치하지 않습니다.'); }
                for (const token of result.tokens) {
                    if (!Number.isInteger(token.line) || token.line < 0 || token.line >= document.lineCount || !Number.isInteger(token.character) || token.character < 0 ||
                        !Number.isInteger(token.length) || token.length <= 0 || token.character + token.length > document.lineAt(token.line).text.length ||
                        !Array.isArray(token.modifiers)) {
                        throw new Error('Roslyn이 유효하지 않은 분류 범위를 반환했습니다.');
                    }
                    advancedSelector(token.type, token.modifiers);
                }
                return result;
            });
            this.cache.set(key, task);
            task.catch(() => this.cache.delete(key));
        }
        return task;
    }

    async detect(editor: vscode.TextEditor) {
        const result = await this.analyze(editor.document, true);
        if (!result) { throw new Error('분석할 솔루션 또는 프로젝트를 선택해 주세요.'); }
        const position = editor.selection.active;
        const token = result.tokens.find(token => token.line === position.line && token.character <= position.character && position.character < token.character + token.length);
        if (!token) { throw new Error('이 위치에서 심볼을 확인할 수 없습니다. 식별자 안에 커서를 놓아 주세요.'); }
        const rules = vscode.workspace.getConfiguration('coloringElements', editor.document.uri).get<AdvancedRules>('rules', {});
        return { ...token, winner: winningRule(rules, token.type, token.modifiers)?.key };
    }

    private clear() {
        for (const decoration of this.decorations.values()) { decoration.dispose(); }
        this.decorations.clear();
    }
    invalidate(reload = false) {
        this.revision++; this.cache.clear(); this.clear();
        if (reload) { this.client?.dispose(); this.client = undefined; this.loading = undefined; this.project = undefined; }
        this.schedule();
    }
    schedule(delay = 300) {
        if (this.disposed) { return; }
        if (this.timer) { clearTimeout(this.timer); }
        this.timer = setTimeout(() => { void this.refresh(); }, delay);
    }
    async refresh() {
        if (this.disposed || !vscode.workspace.isTrusted) { return; }
        if (this.busy) { this.again = true; return; }
        this.busy = true;
        try {
            for (const editor of vscode.window.visibleTextEditors) {
                if (editor.document.languageId !== 'csharp' || editor.document.uri.scheme !== 'file') { continue; }
                let rules = vscode.workspace.getConfiguration('coloringElements', editor.document.uri).get<AdvancedRules>('rules', {});
                if (!Object.keys(rules).length) { continue; }
                const result = await this.analyze(editor.document);
                if (!result) { continue; }
                rules = vscode.workspace.getConfiguration('coloringElements', editor.document.uri).get<AdvancedRules>('rules', {});
                const groups = new Map<string, vscode.Range[]>();
                for (const token of result.tokens) {
                    const winner = winningRule(rules, token.type, token.modifiers);
                    if (!winner) { continue; }
                    const ranges = groups.get(winner.color) ?? [];
                    ranges.push(new vscode.Range(token.line, token.character, token.line, token.character + token.length)); groups.set(winner.color, ranges);
                }
                for (const color of groups.keys()) {
                    if (!this.decorations.has(color)) { this.decorations.set(color, vscode.window.createTextEditorDecorationType({ color, rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed })); }
                }
                for (const [color, decoration] of this.decorations) { editor.setDecorations(decoration, groups.get(color) ?? []); }
                this.status(`정밀 색상 적용됨: ${path.basename(editor.document.fileName)}`);
            }
        } catch (error) { this.status(error instanceof Error ? error.message : String(error)); }
        finally { this.busy = false; if (this.again) { this.again = false; this.schedule(0); } }
    }
    dispose() {
        this.disposed = true;
        if (this.timer) { clearTimeout(this.timer); }
        this.client?.dispose(); this.clear();
        this.subscriptions.forEach(subscription => subscription.dispose());
    }
}
