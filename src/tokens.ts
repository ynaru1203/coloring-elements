import * as vscode from 'vscode';

export async function tokenAt(document: vscode.TextDocument, position: vscode.Position) {
    const version = document.version;
    const range = document.lineAt(position.line).range;
    let legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend>('vscode.provideDocumentRangeSemanticTokensLegend', document.uri, range);
    let tokens = legend ? await vscode.commands.executeCommand<vscode.SemanticTokens>('vscode.provideDocumentRangeSemanticTokens', document.uri, range) : undefined;
    if (!legend || !tokens) {
        legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend>('vscode.provideDocumentSemanticTokensLegend', document.uri);
        tokens = legend ? await vscode.commands.executeCommand<vscode.SemanticTokens>('vscode.provideDocumentSemanticTokens', document.uri) : undefined;
    }
    if (version !== document.version) { throw new Error('문서가 변경되었습니다. 다시 감지해 주세요.'); }
    if (!legend || !tokens) { throw new Error('Semantic Token이 없습니다. C# 언어 서버 준비 후 다시 시도해 주세요.'); }
    let line = 0, start = 0;
    for (let i = 0; i < tokens.data.length; i += 5) {
        const [delta, offset, length, type, bits] = tokens.data.subarray(i, i + 5);
        line += delta; start = delta ? offset : start + offset;
        if (line === position.line && start <= position.character && position.character < start + length) {
            return { type: legend.tokenTypes[type], modifiers: legend.tokenModifiers.filter((_, bit) => (bits & (1 << bit)) !== 0),
                types: legend.tokenTypes, availableModifiers: legend.tokenModifiers };
        }
    }
    throw new Error('커서 위치에 Semantic Token이 없습니다. 식별자 내부를 선택해 주세요.');
}
