public class PaymentProcessor
{
    public void Charge(decimal amount)
    {
        try
        {
            Gateway.Send(amount);
        }
        catch (Exception ex)
        {
            Logger.Log(ex.Message);
            throw ex;
        }
    }
}
