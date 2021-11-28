﻿using System;
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
            FSMonitor monitor = new FSMonitor();
            monitor.Start();

            while (true)
            {
                monitor.Dispatch();
                Thread.Sleep(100);
            }
        }
    }

}
