namespace ColoringFixture;

public class Player
{
    private readonly int id = 1;
    public int Health { get; set; }
    public int MaxHealth { get; private set; }
    public int Level { get; }
    internal int Initial { get; init; }
    public int Read(int id) => this.id + id + Health + MaxHealth + Level;
}
