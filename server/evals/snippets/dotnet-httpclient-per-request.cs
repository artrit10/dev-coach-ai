public class WeatherClient
{
    public async Task<string> GetForecastAsync(string city)
    {
        var client = new HttpClient();
        var response = await client.GetAsync($"https://weather.example.com/{city}");
        return await response.Content.ReadAsStringAsync();
    }
}
