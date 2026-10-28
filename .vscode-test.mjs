import { defineConfig } from '@vscode/test-cli';
import { mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const runRoot = resolve('.vscode-test/runs', String(Date.now()));
const workspaceFolder = resolve(runRoot, 'workspace');
mkdirSync(workspaceFolder, { recursive: true });
for (const file of ['Fixture.csproj', 'Player.cs', 'References.cs', 'Keywords.cs']) {
    copyFileSync(`analyzer/Fixtures/Project/${file}`, resolve(workspaceFolder, file));
}
execFileSync('dotnet', ['restore', resolve(workspaceFolder, 'Fixture.csproj'), '--ignore-failed-sources', '-p:NuGetAudit=false'], { windowsHide: true });

export default defineConfig({
	files: 'out/test/**/*.test.js',
	workspaceFolder,
	mocha: { ui: 'tdd', timeout: 20000 },
	launchArgs: [`--user-data-dir=${resolve(runRoot, 'profile')}`, '--disable-extensions', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust'],
	...(process.env.VSCODE_EXECUTABLE_PATH ? { useInstallation: { fromPath: process.env.VSCODE_EXECUTABLE_PATH } } : {}),
});
