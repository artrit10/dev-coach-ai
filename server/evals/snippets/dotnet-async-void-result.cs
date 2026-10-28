public class ReportService
{
    private readonly HttpClient _client = new HttpClient();

    public async void GenerateReport(int id)
    {
        var data = _client.GetStringAsync($"https://api.example.com/reports/{id}").Result;
        await SaveAsync(data);
    }

    private Task SaveAsync(string data) => Task.CompletedTask;
}
