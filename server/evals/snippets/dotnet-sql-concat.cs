using System.Data.SqlClient;

public class UserRepository
{
    private readonly string _connectionString;

    public UserRepository(string connectionString) => _connectionString = connectionString;

    public string GetEmail(string name)
    {
        using var connection = new SqlConnection(_connectionString);
        connection.Open();
        var command = new SqlCommand("SELECT Email FROM Users WHERE Name = '" + name + "'", connection);
        return (string)command.ExecuteScalar();
    }
}
