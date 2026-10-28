#nullable enable
namespace ColoringFixture;

public class Keywords
{
    public Keywords() { }
    private readonly bool flag = true;
    public bool False => false;
    protected object? Empty => null;
    public int @class = 1;
    public int var = 2;
    public int @readonly = 3;
    public string Text => "public class readonly true false null var";
    // public class readonly true false null var
    public dynamic Dynamic => new object();
    public int Initial { get; private init; }

    public int Read()
    {
        var inferred = true;
        nint native = 0;
        _ = inferred;
        _ = native;
        _ = var;
        _ = @readonly;
        _ = flag;
        return @class;
    }
}

public readonly struct Tag { }
