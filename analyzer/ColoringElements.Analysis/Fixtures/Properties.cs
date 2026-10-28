namespace Fixture;

public class Sample
{
    private readonly int id;
    private int count;
    public int Health { get; set; }
    public int MaxHealth { get; private set; }
    public int Level { get; }
    internal int Initial { get; init; }
    public const int Limit = 10;
    public static readonly int Shared;
    protected internal int Mixed { get; private protected set; }
    protected int Protected { get; set; }
    private int Private { get; set; }
    public int Sink { set { count = value; } }
    public int this[int index] { get => id; private set { count = value; } }

    public int Read(int id)
    {
        count += id;
        return this.id + MaxHealth + Level + Health + Initial + Limit + Shared + Mixed + Protected + Private + this[0];
    }
}
