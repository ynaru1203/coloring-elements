import * as assert from 'assert';
import { readFileSync } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { RoslynClient } from '../roslynClient';
import { RoslynColoring, type AnalyzedToken } from '../roslyn';
import { execFileSync } from 'child_process';
import { tokenKinds } from '../tokenKinds';
import { advancedSelector } from '../advancedRules';

suite('Real Roslyn project analysis', () => {
    const root = path.resolve(__dirname, '../..');
    const fixture = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const playerPath = path.join(fixture, 'Player.cs');
    const refsPath = path.join(fixture, 'References.cs');
    const player = readFileSync(playerPath, 'utf8'), references = readFileSync(refsPath, 'utf8');
    let client: RoslynClient;
    const analyze = (file: string, text: string, overlays: { filePath: string; text: string }[] = []) =>
        client.request<{ tokens: AnalyzedToken[] }>({ kind: 'analyze', uri: vscode.Uri.file(file).toString(), filePath: file, version: 1, text, overlays });
    const named = (tokens: AnalyzedToken[], text: string, name: string) => tokens.filter(token =>
        text.split(/\r?\n/)[token.line].slice(token.character, token.character + token.length) === name);

    suiteSetup(async function () {
        this.timeout(120_000);
        client = new RoslynClient(path.join(root, 'analyzer-bin/ColoringElements.Analysis.dll'), fixture);
        await client.request({ kind: 'open', projectPath: path.join(fixture, 'Fixture.csproj') });
    });
    suiteTeardown(() => client?.dispose());
    test('readonly fields and shadowing parameters stay distinct at all references', async () => {
        const { tokens } = await analyze(playerPath, player);
        const identifiers = named(tokens, player, 'id');
        assert.strictEqual(identifiers.filter(token => token.type === 'field' && token.modifiers.includes('readonly')).length, 2);
        assert.strictEqual(identifiers.filter(token => token.type === 'parameter' && !token.modifiers.includes('readonly')).length, 2);
        assert.ok(named(tokens, player, 'MaxHealth').every(token => token.modifiers.includes('setterPrivate')));
        assert.ok(named(tokens, player, 'Level').every(token => token.modifiers.includes('getOnly') && !token.modifiers.includes('hasSetter')));
    });
    test('another file inherits setter accessibility and unsaved edits update its references', async () => {
        const text = '// 😀 한글\n' + references;
        const original = await analyze(refsPath, text, [{ filePath: playerPath, text: player }]);
        assert.ok(named(original.tokens, text, 'MaxHealth')[0].modifiers.includes('setterPrivate'));
        const changed = await analyze(refsPath, text, [{ filePath: playerPath, text: player.replace('private set', 'protected set') }]);
        assert.ok(named(changed.tokens, text, 'MaxHealth')[0].modifiers.includes('setterProtected'));
        const reverted = await analyze(refsPath, text, [{ filePath: playerPath, text: player }]);
        assert.ok(named(reverted.tokens, text, 'MaxHealth')[0].modifiers.includes('setterPrivate'));
    });
    test('compile errors and files outside the project fail without guessed classifications', async () => {
        await assert.rejects(() => analyze(playerPath, player + '\ninvalid syntax'), /컴파일 오류/);
        await assert.rejects(() => analyze(path.join(fixture, 'NotInProject.cs'), 'class NotInProject {}'), /프로젝트에 이 파일/);
        const recovered = await analyze(playerPath, player);
        assert.ok(recovered.tokens.length > 0);
    });
    test('keyword catalog matches the bundled Roslyn version', () => {
        const actual = JSON.parse(execFileSync('dotnet', [path.join(root, 'analyzer-bin/ColoringElements.Analysis.dll'), '--catalog'], { windowsHide: true }).toString());
        assert.deepStrictEqual(actual, tokenKinds);
    });
    test('keywords and true/false/null are classified without strings, comments or escaped identifiers', async () => {
        const file = path.join(fixture, 'Keywords.cs');
        const text = readFileSync(file, 'utf8');
        const { tokens } = await analyze(file, text);
        for (const token of tokens) { assert.doesNotThrow(() => advancedSelector(token.type, token.modifiers), `${token.type}: ${token.modifiers.join(',')}`); }
        for (const word of ['public', 'private', 'protected', 'readonly', 'class', 'struct', 'get', 'init', 'var', 'dynamic', 'nint', 'return']) {
            assert.ok(tokens.some(token => token.type === 'keyword' && token.modifiers.includes('text_' + word)), `missing keyword: ${word}`);
        }
        for (const [word, count] of [['true', 2], ['false', 1], ['null', 1]] as const) {
            assert.strictEqual(named(tokens, text, word).filter(token => token.type === 'literal' && token.modifiers.includes('text_' + word)).length, count);
        }
        assert.strictEqual(named(tokens, text, 'var').filter(token => token.type === 'keyword').length, 1);
        assert.ok(named(tokens, text, '@class').every(token => token.type === 'field'));
        assert.ok(named(tokens, text, '@readonly').every(token => token.type === 'field'));
        const comment = text.split(/\r?\n/).findIndex(line => line.trim().startsWith('//'));
        assert.ok(!tokens.some(token => token.line === comment));
        const stringLine = text.split(/\r?\n/).findIndex(line => line.includes('public string Text'));
        assert.ok(!tokens.some(token => token.line === stringLine && token.character > text.split(/\r?\n/)[stringLine].indexOf('"')));
    });
    test('extension service detects the selected symbol and applies a real editor decoration', async function () {
        this.timeout(120_000);
        const document = await vscode.workspace.openTextDocument(playerPath);
        const editor = await vscode.window.showTextDocument(document);
        const config = vscode.workspace.getConfiguration('coloringElements', document.uri);
        const original = config.inspect('rules')?.workspaceFolderValue;
        const context = { extensionUri: vscode.Uri.file(root), workspaceState: {
            get: () => path.join(fixture, 'Fixture.csproj'), update: () => Promise.resolve()
        } } as unknown as vscode.ExtensionContext;
        const statuses: string[] = [];
        const service = new RoslynColoring(context, message => statuses.push(message));
        try {
            await config.update('rules', { 'field.private.readonly:csharp': '#808080' }, vscode.ConfigurationTarget.WorkspaceFolder);
            const line = player.split(/\r?\n/).findIndex(line => line.includes('readonly int id'));
            const character = document.lineAt(line).text.indexOf(' id') + 1;
            editor.selection = new vscode.Selection(line, character, line, character);
            const detected = await service.detect(editor);
            assert.strictEqual(detected.type, 'field');
            assert.ok(detected.modifiers.includes('readonly'));
            assert.strictEqual(detected.winner, 'field.private.readonly:csharp');
            await service.refresh();
            assert.ok(statuses.some(status => status.includes('정밀 색상 적용됨')));
            await config.update('rules', { 'keyword.text_public:csharp': '#ABCDEF', 'literal.text_true:csharp': '#112233' }, vscode.ConfigurationTarget.WorkspaceFolder);
            const keywordDocument = await vscode.workspace.openTextDocument(path.join(fixture, 'Keywords.cs'));
            const keywordEditor = await vscode.window.showTextDocument(keywordDocument);
            const lines = keywordDocument.getText().split(/\r?\n/);
            const publicLine = lines.findIndex(line => line.includes('public class Keywords'));
            const publicCharacter = lines[publicLine].indexOf('public');
            keywordEditor.selection = new vscode.Selection(publicLine, publicCharacter, publicLine, publicCharacter);
            assert.strictEqual((await service.detect(keywordEditor)).winner, 'keyword.text_public:csharp');
            const literalLine = lines.findIndex(line => line.includes('flag = true'));
            const literalCharacter = lines[literalLine].indexOf('true');
            keywordEditor.selection = new vscode.Selection(literalLine, literalCharacter, literalLine, literalCharacter);
            assert.strictEqual((await service.detect(keywordEditor)).winner, 'literal.text_true:csharp');
            await service.refresh();
        } finally {
            service.dispose();
            await config.update('rules', original, vscode.ConfigurationTarget.WorkspaceFolder);
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
    });
});
