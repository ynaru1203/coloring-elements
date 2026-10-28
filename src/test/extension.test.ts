import * as assert from 'assert';
import * as vscode from 'vscode';
import { updateRule, Customizations } from '../rules';
import { tokenAt } from '../tokens';
suite('VS Code integration', () => {
    for (const mode of ['range', 'full']) {
        test(`detects declaration and reference tokens with a ${mode} provider`, async () => {
            const document = await vscode.workspace.openTextDocument({ language: 'csharp', content: '// 😀\nValue Value\nValue' });
            const legend = new vscode.SemanticTokensLegend(['property'], ['readonly', 'declaration']);
            const build = () => {
                const builder = new vscode.SemanticTokensBuilder(legend);
                builder.push(new vscode.Range(1, 0, 1, 5), 'property', ['readonly', 'declaration']);
                builder.push(new vscode.Range(1, 6, 1, 11), 'property', ['readonly']);
                builder.push(new vscode.Range(2, 0, 2, 5), 'property', ['readonly']);
                return builder.build();
            };
            const selection = { language: 'csharp', scheme: 'untitled' };
            const provider = mode === 'range'
                ? vscode.languages.registerDocumentRangeSemanticTokensProvider(selection, { provideDocumentRangeSemanticTokens: build }, legend)
                : vscode.languages.registerDocumentSemanticTokensProvider(selection, { provideDocumentSemanticTokens: build }, legend);
            try {
                assert.deepStrictEqual((await tokenAt(document, new vscode.Position(1, 1))).modifiers, ['readonly', 'declaration']);
                assert.deepStrictEqual((await tokenAt(document, new vscode.Position(1, 7))).modifiers, ['readonly']);
                assert.strictEqual((await tokenAt(document, new vscode.Position(2, 1))).type, 'property');
                await assert.rejects(() => tokenAt(document, new vscode.Position(1, 5)), /커서 위치/);
            } finally { provider.dispose(); }
        });
    }
    test('extension activates and opens its GUI command', async () => {
        const extension = vscode.extensions.getExtension('coloring-elements-local.coloring-elements');
        assert.ok(extension);
        await extension.activate();
        assert.ok((await vscode.commands.getCommands()).includes('coloring-elements.open'));
        await vscode.commands.executeCommand('coloring-elements.open');
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
    test('real workspace configuration merges colors without touching other rules', async () => {
        assert.ok(vscode.workspace.workspaceFolders?.length, 'test requires an isolated workspace');
        const config = vscode.workspace.getConfiguration('editor');
        const original = config.inspect<Customizations>('semanticTokenColorCustomizations')?.workspaceValue;
        try {
            const initial = { rules: { 'class:javascript': '#123456', 'property:csharp': { bold: true } } };
            await config.update('semanticTokenColorCustomizations', initial, vscode.ConfigurationTarget.Workspace);
            await config.update('semanticTokenColorCustomizations', updateRule(initial, 'property:csharp', '#abcdef'), vscode.ConfigurationTarget.Workspace);
            const actual = config.inspect<Customizations>('semanticTokenColorCustomizations')?.workspaceValue;
            assert.deepStrictEqual(actual?.rules?.['property:csharp'], { bold: true, foreground: '#ABCDEF' });
            assert.strictEqual(actual?.rules?.['class:javascript'], '#123456');
        } finally {
            await config.update('semanticTokenColorCustomizations', original, vscode.ConfigurationTarget.Workspace);
        }
    });
});
