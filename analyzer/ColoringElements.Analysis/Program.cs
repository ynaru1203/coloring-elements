using ColoringElements.Analysis;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.Build.Locator;
using System.Text.Json;

if (args is ["--catalog"])
{
    Console.WriteLine(JsonSerializer.Serialize(new
    {
        keyword = SyntaxFacts.GetReservedKeywordKinds().Concat(SyntaxFacts.GetContextualKeywordKinds())
            .Select(SyntaxFacts.GetText).Concat(["_", "var", "dynamic", "nint", "nuint", "notnull", "value"])
            .Where(word => !string.IsNullOrEmpty(word) && word is not ("true" or "false" or "null"))
            .Distinct().OrderBy(word => word, StringComparer.Ordinal).ToArray(),
        literal = new[] { "true", "false", "null" }
    }));
    return 0;
}

if (args is ["--server"])
{
    MSBuildLocator.RegisterDefaults();
    await AnalysisServer.RunAsync();
    return 0;
}

if (args is not ["--self-test"])
{
    Console.Error.WriteLine("Use --server or --self-test.");
    return 2;
}

var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "Properties.cs"));
var tree = CSharpSyntaxTree.ParseText(source);
var compilation = CSharpCompilation.Create("Fixture", [tree],
    [MetadataReference.CreateFromFile(typeof(object).Assembly.Location)],
    new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
var errors = compilation.GetDiagnostics().Where(d => d.Severity == DiagnosticSeverity.Error).ToArray();
Check(errors.Length == 0, string.Join(Environment.NewLine, errors.Select(error => error.ToString())));
var model = compilation.GetSemanticModel(tree);
var declarations = new Dictionary<string, (ISymbol Symbol, SymbolFacts Facts)>();
foreach (var node in tree.GetRoot().DescendantNodes())
{
    if (node is not (VariableDeclaratorSyntax or PropertyDeclarationSyntax or IndexerDeclarationSyntax)) { continue; }
    var symbol = model.GetDeclaredSymbol(node);
    if (symbol is null || SymbolClassifier.Classify(symbol) is not { } facts) { continue; }
    declarations.Add(symbol.Name, (symbol, facts));
}

var checks = 0;
void Expect(string name, Func<SymbolFacts, bool> predicate)
{
    Check(predicate(declarations[name].Facts), $"Unexpected classification: {name}: {declarations[name].Facts}");
    checks++;
}
Expect("id", facts => facts.Kind == "field" && facts.IsReadOnlyField && facts.Accessibility == Accessibility.Private);
Expect("count", facts => !facts.IsReadOnlyField && !facts.IsConst);
Expect("Health", facts => facts.GetterAccessibility == Accessibility.Public && facts.SetterAccessibility == Accessibility.Public);
Expect("MaxHealth", facts => facts.SetterAccessibility == Accessibility.Private && !facts.IsGetOnly && !facts.IsReadOnlyField);
Expect("Level", facts => facts.IsGetOnly && facts.SetterAccessibility is null && !facts.IsReadOnlyField);
Expect("Initial", facts => facts.IsInitOnly && !facts.IsGetOnly && facts.Accessibility == Accessibility.Internal);
Expect("Limit", facts => facts.IsConst && facts.IsStatic && !facts.IsReadOnlyField);
Expect("Shared", facts => facts.IsStatic && facts.IsReadOnlyField);
Expect("Mixed", facts => facts.Accessibility == Accessibility.ProtectedOrInternal && facts.SetterAccessibility == Accessibility.ProtectedAndInternal);
Expect("Protected", facts => facts.Accessibility == Accessibility.Protected);
Expect("Private", facts => facts.Accessibility == Accessibility.Private);
Expect("Sink", facts => facts.GetterAccessibility is null && !facts.IsGetOnly);
var indexer = declarations.Values.Single(entry => entry.Symbol is IPropertySymbol { IsIndexer: true });
Check(indexer.Facts.SetterAccessibility == Accessibility.Private, "Indexer setter accessibility");
checks++;

var references = 0;
foreach (var name in tree.GetRoot().DescendantNodes().OfType<IdentifierNameSyntax>())
{
    var symbol = model.GetSymbolInfo(name).Symbol;
    if (symbol is null) { continue; }
    if (symbol is IParameterSymbol { Name: "id" })
    {
        Check(SymbolClassifier.Classify(symbol) is { Kind: "parameter", IsReadOnlyField: false }, "Shadowing parameter must not be classified as readonly field");
        checks++;
    }
    if (symbol is not (IFieldSymbol or IPropertySymbol) || !declarations.TryGetValue(symbol.Name, out var declaration)) { continue; }
    Check(SymbolEqualityComparer.Default.Equals(symbol, declaration.Symbol), $"Reference binding: {name}");
    Check(SymbolClassifier.Classify(symbol) == declaration.Facts, $"Declaration/reference mismatch: {name}");
    references++;
}
Check(references >= 12, $"Missing reference coverage: {references}");
Console.WriteLine($"PASS: {checks} classification/shadowing checks; {references} declaration/reference matches.");
return 0;

static void Check(bool condition, string message)
{
    if (!condition) { throw new InvalidOperationException(message); }
}
