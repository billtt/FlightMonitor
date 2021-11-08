using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.FlightSimulator.SimConnect;
using System.Runtime.InteropServices;

namespace FlightMonitor
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.ReadLine();
        }
    }

    class Monitor
    {
        private SimConnect connect = null;

        public void Start()
        {
        }

        private bool Connect()
        {
            try
            {
                Console.WriteLine("Trying to connect to Flight Simulator...");
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
