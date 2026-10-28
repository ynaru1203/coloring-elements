using Microsoft.CodeAnalysis;

namespace ColoringElements.Analysis;

public sealed record SymbolFacts(
    string Kind,
    Accessibility Accessibility,
    bool IsStatic,
    bool IsReadOnlyField,
    bool IsConst,
    bool IsGetOnly,
    Accessibility? GetterAccessibility,
    Accessibility? SetterAccessibility,
    bool IsInitOnly);

public static class SymbolClassifier
{
    public static SymbolFacts? Classify(ISymbol symbol) => symbol switch
    {
        IFieldSymbol field => new("field", field.DeclaredAccessibility, field.IsStatic,
            field.IsReadOnly, field.IsConst, false, null, null, false),
        IPropertySymbol property => new("property", property.DeclaredAccessibility, property.IsStatic,
            false, false, property.GetMethod is not null && property.SetMethod is null,
            property.GetMethod?.DeclaredAccessibility, property.SetMethod?.DeclaredAccessibility,
            property.SetMethod?.IsInitOnly ?? false),
        INamedTypeSymbol { TypeKind: not TypeKind.Error } type => new(type.TypeKind switch
        {
            TypeKind.Struct => "struct", TypeKind.Interface => "interface", TypeKind.Enum => "enum",
            TypeKind.Delegate => "delegate", _ => "class"
        }, type.DeclaredAccessibility, type.IsStatic, false, false, false, null, null, false),
        IMethodSymbol method => new(method.MethodKind is MethodKind.Constructor or MethodKind.StaticConstructor ? "constructor" : "method",
            method.DeclaredAccessibility, method.IsStatic, false, false, false, null, null, false),
        IEventSymbol @event => new("event", @event.DeclaredAccessibility, @event.IsStatic, false, false, false, null, null, false),
        INamespaceSymbol => new("namespace", Accessibility.NotApplicable, false, false, false, false, null, null, false),
        ITypeParameterSymbol => new("typeParameter", Accessibility.NotApplicable, false, false, false, false, null, null, false),
        IParameterSymbol => new("parameter", Accessibility.NotApplicable, false, false, false, false, null, null, false),
        ILocalSymbol local => new("variable", Accessibility.NotApplicable, false, false, local.IsConst, false, null, null, false),
        _ => null
    };

    public static string[] Modifiers(SymbolFacts facts)
    {
        var modifiers = new List<string>();
        var accessibility = Access(facts.Accessibility);
        if (accessibility is not null) { modifiers.Add(accessibility); }
        if (facts.IsStatic) { modifiers.Add("static"); }
        if (facts.IsReadOnlyField) { modifiers.Add("readonly"); }
        if (facts.IsConst) { modifiers.Add("const"); }
        if (facts.IsGetOnly) { modifiers.Add("getOnly"); }
        if (facts.IsInitOnly) { modifiers.Add("initOnly"); }
        if (facts.GetterAccessibility is { } getter)
        {
            modifiers.Add("hasGetter"); if (Access(getter) is not null) { modifiers.Add("getter" + AccessSuffix(getter)); }
        }
        if (facts.SetterAccessibility is { } setter)
        {
            modifiers.Add("hasSetter"); if (Access(setter) is not null) { modifiers.Add("setter" + AccessSuffix(setter)); }
        }
        return modifiers.ToArray();
    }

    private static string AccessSuffix(Accessibility value)
    {
        var access = Access(value) ?? "unknown";
        return char.ToUpperInvariant(access[0]) + access[1..];
    }
    private static string? Access(Accessibility value) => value switch
    {
        Accessibility.Public => "public", Accessibility.Private => "private", Accessibility.Protected => "protected",
        Accessibility.Internal => "internal", Accessibility.ProtectedOrInternal => "protectedInternal",
        Accessibility.ProtectedAndInternal => "privateProtected", _ => null
    };
}
