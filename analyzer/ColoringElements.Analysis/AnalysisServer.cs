using System.Text;
using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.MSBuild;
using Microsoft.CodeAnalysis.Text;
using Microsoft.CodeAnalysis.Classification;

namespace ColoringElements.Analysis;

public sealed record Overlay(string FilePath, string Text);
public sealed record Request(int Id, string Kind, string? ProjectPath, string? Uri, int Version, string? Text, Overlay[]? Overlays, string? FilePath);
public sealed record ClassifiedToken(int Line, int Character, int Length, string Type, string[] Modifiers);

public static class AnalysisServer
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true };

    public static async Task RunAsync()
    {
        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = new UTF8Encoding(false);
        using var workspace = MSBuildWorkspace.Create();
        workspace.SkipUnrecognizedProjects = true;
        Solution? solution = null;
        Compilation? checkedCompilation = null;
        var pathComparer = OperatingSystem.IsWindows() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal;
        var documentPaths = new Dictionary<string, DocumentId[]>(pathComparer);
        var overlayPaths = new HashSet<string>(pathComparer);
        while (await Console.In.ReadLineAsync() is { } line)
        {
            Request? request = null;
            try
            {
                request = JsonSerializer.Deserialize<Request>(line, Json) ?? throw new InvalidOperationException("Empty request");
                if (request.Kind == "open")
                {
                    solution = null; checkedCompilation = null; overlayPaths.Clear(); workspace.CloseSolution();
                    var path = Path.GetFullPath(request.ProjectPath ?? throw new InvalidOperationException("Project path required"));
                    if (!File.Exists(path)) { throw new FileNotFoundException("프로젝트 파일을 찾을 수 없습니다.", path); }
                    if (Path.GetExtension(path) is ".sln" or ".slnx") { await workspace.OpenSolutionAsync(path); }
                    else if (Path.GetExtension(path) == ".csproj") { await workspace.OpenProjectAsync(path); }
                    else { throw new InvalidOperationException("C# 프로젝트 또는 솔루션을 선택해 주세요."); }
                    var failures = workspace.Diagnostics.Where(d => d.Kind == WorkspaceDiagnosticKind.Failure).Select(d => d.Message).ToArray();
                    if (failures.Length > 0) { throw new InvalidOperationException(string.Join("\n", failures)); }
                    solution = workspace.CurrentSolution;
                    documentPaths = solution.Projects.SelectMany(project => project.Documents).Where(document => document.FilePath is not null)
                        .GroupBy(document => Path.GetFullPath(document.FilePath!), pathComparer)
                        .ToDictionary(group => group.Key, group => group.Select(document => document.Id).ToArray(), pathComparer);
                    if (documentPaths.Count == 0) { solution = null; throw new InvalidOperationException("프로젝트에서 C# 파일을 불러오지 못했습니다. SDK·참조와 프로젝트 복원 상태를 확인해 주세요."); }
                    await Reply(new { request.Id, projects = solution.Projects.Select(project => project.Name).ToArray(), documents = documentPaths.Count });
                }
                else if (request.Kind == "analyze")
                {
                    if (solution is null) { throw new InvalidOperationException("프로젝트를 먼저 선택해 주세요."); }
                    var uri = new Uri(request.Uri ?? throw new InvalidOperationException("Document URI required"));
                    if (!uri.IsFile || request.Text is null || request.FilePath is null || !Path.IsPathFullyQualified(request.FilePath)) { throw new InvalidOperationException("저장된 C# 파일만 분석할 수 있습니다."); }
                    var filePath = Path.GetFullPath(request.FilePath);
                    var current = solution;
                    var overlays = (request.Overlays ?? []).Append(new Overlay(filePath, request.Text)).ToArray();
                    var nextPaths = overlays.Where(overlay => Path.IsPathFullyQualified(overlay.FilePath))
                        .Select(overlay => Path.GetFullPath(overlay.FilePath)).Where(documentPaths.ContainsKey).ToHashSet(pathComparer);
                    // Closed documents must lose unsaved overlays without reloading the entire project.
                    foreach (var closedPath in overlayPaths.Except(nextPaths, pathComparer))
                    {
                        var diskText = SourceText.From(await File.ReadAllTextAsync(closedPath));
                        foreach (var id in documentPaths.GetValueOrDefault(closedPath) ?? [])
                        {
                            if (!(await current.GetDocument(id)!.GetTextAsync()).ContentEquals(diskText)) { current = current.WithDocumentText(id, diskText); }
                        }
                    }
                    foreach (var overlay in overlays)
                    {
                        if (!Path.IsPathFullyQualified(overlay.FilePath)) { continue; }
                        foreach (var id in documentPaths.GetValueOrDefault(Path.GetFullPath(overlay.FilePath)) ?? [])
                        {
                            var changed = SourceText.From(overlay.Text);
                            if (!(await current.GetDocument(id)!.GetTextAsync()).ContentEquals(changed)) { current = current.WithDocumentText(id, changed); }
                        }
                    }
                    overlayPaths = nextPaths;
                    // External disk changes reload the workspace; retain compilations across tab switches.
                    solution = current;
                    var documents = documentPaths.GetValueOrDefault(filePath) ?? [];
                    if (documents.Length == 0) { throw new InvalidOperationException("선택한 프로젝트에 이 파일이 없습니다. 프로젝트를 다시 선택해 주세요."); }
                    if (documents.Length > 1) { throw new InvalidOperationException("여러 프로젝트에 포함된 파일입니다. 솔루션 대신 해당 csproj를 선택해 주세요."); }
                    var document = current.GetDocument(documents[0])!;
                    var model = await document.GetSemanticModelAsync() ?? throw new InvalidOperationException("의미 분석을 시작할 수 없습니다.");
                    var root = await document.GetSyntaxRootAsync() ?? throw new InvalidOperationException("구문 트리를 읽을 수 없습니다.");
                    var text = await document.GetTextAsync();
                    // Missing references and syntax errors can change binding; keep the original editor colors instead of guessing.
                    if (!ReferenceEquals(checkedCompilation, model.Compilation))
                    {
                        var diagnostics = model.Compilation.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error).ToArray();
                        if (diagnostics.Length > 0) { throw new InvalidOperationException("프로젝트 컴파일 오류로 정밀 색상 적용을 보류합니다: " + string.Join("\n", diagnostics.Take(5).Select(d => d.ToString()))); }
                        checkedCompilation = model.Compilation;
                    }
                    var tokens = new List<ClassifiedToken>();
                    var keywordSpans = new HashSet<TextSpan>();
                    foreach (var classified in await Classifier.GetClassifiedSpansAsync(document, new TextSpan(0, text.Length)))
                    {
                        if (classified.ClassificationType is not (ClassificationTypeNames.Keyword or ClassificationTypeNames.ControlKeyword)) { continue; }
                        var syntaxToken = root.FindToken(classified.TextSpan.Start);
                        if (syntaxToken.Span != classified.TextSpan) { continue; }
                        var word = text.ToString(classified.TextSpan);
                        var kind = word is "true" or "false" or "null" ? "literal" : "keyword";
                        if (kind == "literal" && syntaxToken.Parent is not LiteralExpressionSyntax) { continue; }
                        keywordSpans.Add(classified.TextSpan);
                        var position = text.Lines.GetLinePosition(classified.TextSpan.Start);
                        tokens.Add(new(position.Line, position.Character, classified.TextSpan.Length, kind, ["text_" + word]));
                    }
                    foreach (var token in root.DescendantTokens().Where(token => token.IsKind(SyntaxKind.IdentifierToken)))
                    {
                        if (keywordSpans.Contains(token.Span)) { continue; }
                        var parent = token.Parent;
                        ISymbol? symbol = parent switch
                        {
                            VariableDeclaratorSyntax or BaseTypeDeclarationSyntax or DelegateDeclarationSyntax or
                            MethodDeclarationSyntax or ConstructorDeclarationSyntax or PropertyDeclarationSyntax or EventDeclarationSyntax or
                            EnumMemberDeclarationSyntax or ParameterSyntax or TypeParameterSyntax or SingleVariableDesignationSyntax or
                            LocalFunctionStatementSyntax => model.GetDeclaredSymbol(parent),
                            IdentifierNameSyntax or GenericNameSyntax => model.GetSymbolInfo(parent).Symbol,
                            _ => null
                        };
                        if (symbol is null || SymbolClassifier.Classify(symbol) is not { } facts) { continue; }
                        var position = text.Lines.GetLinePosition(token.SpanStart);
                        var kind = symbol is IFieldSymbol { ContainingType.TypeKind: TypeKind.Enum } ? "enumMember" : facts.Kind;
                        tokens.Add(new(position.Line, position.Character, token.Span.Length, kind, SymbolClassifier.Modifiers(facts)));
                    }
                    await Reply(new { request.Id, request.Uri, request.Version, tokens });
                }
                else { throw new InvalidOperationException("Unknown request kind"); }
            }
            catch (Exception error)
            {
                await Reply(new { id = request?.Id ?? 0, error = error.Message });
            }
        }
    }

    private static async Task Reply(object value)
    {
        await Console.Out.WriteLineAsync(JsonSerializer.Serialize(value, Json));
        await Console.Out.FlushAsync();
    }
}
