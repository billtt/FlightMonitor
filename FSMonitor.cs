using System;
using Microsoft.FlightSimulator.SimConnect;
using System.Runtime.InteropServices;

namespace FlightMonitor
{
    public class FSMonitor
    {
        private SimConnect connect = null;

        public void Start()
        {
        }

        private bool Connect()
        {
            try
            {
                Console.WriteLine("Connecting to Flight Simulator...");
                connect = new SimConnect("Test", IntPtr.Zero, 0, null, 0);
            }
            catch (COMException e)
            {
                Console.WriteLine("Error:\n" + e.Message);
                return false;
            }
            return true;
        }

        private void Disconnect()
        {
            if (connect != null)
            {
                connect.Dispose();
                connect = null;
            }
        }
    }
}
