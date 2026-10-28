import * as assert from 'assert';
import * as vscode from 'vscode';
import { colorPreview, semanticColor } from '../preview';

suite('Inherited color preview', () => {
    test('matches inherited modifiers, language and wildcard rules', () => {
        const rules = { 'property': '#112233', 'property.readonly:csharp': '#ABCDEF',
            'property.readonly:javascript': '#FF0000', '*.static:csharp': '#445566' };
        assert.strictEqual(semanticColor(rules, 'property', ['readonly']), '#ABCDEF');
        assert.strictEqual(semanticColor(rules, 'property', []), '#112233');
        assert.strictEqual(semanticColor(rules, 'variable', ['static']), '#445566');
    });
    test('reset returns an inherited user color and then Dark Modern theme color', async () => {
        const config = vscode.workspace.getConfiguration('editor');
        const workbench = vscode.workspace.getConfiguration('workbench');
        const original = config.inspect('semanticTokenColorCustomizations')?.workspaceValue;
        const originalTheme = workbench.inspect('colorTheme')?.workspaceValue;
        try {
            const darkModern = vscode.extensions.all.flatMap(extension =>
                (extension.packageJSON.contributes?.themes ?? []) as { id?: string; label?: string }[])
                .find(theme => /Dark Modern/.test(theme.id ?? theme.label ?? ''));
            assert.ok(darkModern, 'Built-in Dark Modern theme must be available');
            await workbench.update('colorTheme', darkModern.id ?? darkModern.label, vscode.ConfigurationTarget.Workspace);
            await config.update('semanticTokenColorCustomizations', { rules: { 'property:csharp': '#123456' } }, vscode.ConfigurationTarget.Workspace);
            assert.strictEqual((await colorPreview('property', [])).color, '#123456');
            await config.update('semanticTokenColorCustomizations', {}, vscode.ConfigurationTarget.Workspace);
            const preview = await colorPreview('property', []);
            assert.strictEqual(preview.color, '#9CDCFE');
            assert.ok(preview.approximate);
        } finally {
            await config.update('semanticTokenColorCustomizations', original, vscode.ConfigurationTarget.Workspace);
            await workbench.update('colorTheme', originalTheme, vscode.ConfigurationTarget.Workspace);
        }
    });
});
