public sealed class PriceCalculator
{
    private readonly decimal _taxRate;

    public PriceCalculator(decimal taxRate)
    {
        if (taxRate < 0m) throw new ArgumentOutOfRangeException(nameof(taxRate));
        _taxRate = taxRate;
    }

    public decimal WithTax(decimal net) => decimal.Round(net * (1 + _taxRate), 2, MidpointRounding.AwayFromZero);
}
