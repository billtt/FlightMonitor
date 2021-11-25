using System;
using Microsoft.FlightSimulator.SimConnect;
using System.Runtime.InteropServices;
using System.Windows.Threading;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Json;

namespace FlightMonitor
{
    public enum DEFINITION
    {
        Dummy = 0
    };

    public enum REQUEST
    {
        Dummy = 0,
        Struct1
    };

    // String properties must be packed inside of a struct
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 1)]
    struct Struct1
    {
        // this is how you declare a fixed size string
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public String value;

        // other definitions can be added to this struct
        // ...
    };

    public class SimvarRequest
    {
        public DEFINITION Def = DEFINITION.Dummy;
        public REQUEST Request = REQUEST.Dummy;

        public string Name;
        public bool IsString = false;
        public double NumValue = 0.0;
        public string StrValue = "";
        public string Units = "";

        public bool Pending = true;

        public SimvarRequest(String name)
        {
            this.Name = name;
        }
    };

    public class FSMonitor
    {
        private SimConnect _simConnect = null;
        private DispatcherTimer _timer = new DispatcherTimer();

        public bool Connected
        {
            get {return _connected;}
        }
        private bool _connected;

        /// User-defined win32 event
        public const int WM_USER_SIMCONNECT = 0x0402;

        private List<SimvarRequest> _simvarRequests;

        public FSMonitor()
        {
            _connected = false;
            _timer.Interval = new TimeSpan(0, 0, 0, 3, 0);
            _timer.Tick += new EventHandler(OnTick);
        }

        public void Start()
        {
            InitRequests();
            Connect();
        }

        private void InitRequests()
        {
            _simvarRequests = new List<SimvarRequest>
            {
                new SimvarRequest("FUEL TOTAL QUANTITY WEIGHT"),
                new SimvarRequest("ENG FUEL FLOW PPH:1"),
                new SimvarRequest("ENG FUEL FLOW PPH:2"),
                new SimvarRequest("GROUND VELOCITY"),
                new SimvarRequest("AIRSPEED TRUE"),
                new SimvarRequest("AIRSPEED INDICATED"),
                new SimvarRequest("GPS FLIGHTPLAN TOTAL DISTANCE"),
                new SimvarRequest("GPS TARGET DISTANCE")
            };
        }

        private bool Connect()
        {
            Console.WriteLine("Connecting to Flight Simulator...");
            try
            {
                _simConnect = new SimConnect("FSMonitor", IntPtr.Zero, WM_USER_SIMCONNECT, null, 0);
                _simConnect.OnRecvOpen += new SimConnect.RecvOpenEventHandler(OnRecvOpen);
                _simConnect.OnRecvQuit += new SimConnect.RecvQuitEventHandler(OnRecvQuit);
                _simConnect.OnRecvException += new SimConnect.RecvExceptionEventHandler(OnRecvException);
                _simConnect.OnRecvSimobjectDataBytype += new SimConnect.RecvSimobjectDataBytypeEventHandler(OnRecvSimobjectDataBytype);
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
            _timer.Stop();
            if (_simConnect != null)
            {
                _simConnect.Dispose();
                _simConnect = null;
            }
            _connected = false;
            Console.WriteLine("Disconnected.");
        }

        private bool RegisterToSimConnect(SimvarRequest request)
        {
            if (_simConnect != null)
            {
                if (request.IsString)
                {
                    /// Define a data structure containing string value
                    _simConnect.AddToDataDefinition(request.Def, request.Name, "", SIMCONNECT_DATATYPE.STRING256, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                    /// IMPORTANT: Register it with the simconnect managed wrapper marshaller
                    /// If you skip this step, you will only receive a uint in the .dwData field.
                    _simConnect.RegisterDataDefineStruct<Struct1>(request.Def);
                }
                else
                {
                    /// Define a data structure containing numerical value
                    _simConnect.AddToDataDefinition(request.Def, request.Name, request.Units, SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                    /// IMPORTANT: Register it with the simconnect managed wrapper marshaller
                    /// If you skip this step, you will only receive a uint in the .dwData field.
                    _simConnect.RegisterDataDefineStruct<double>(request.Def);
                }

                return true;
            }
            else
            {
                return false;
            }
        }

        private void OnRecvOpen(SimConnect sender, SIMCONNECT_RECV_OPEN data)
        {
            Console.WriteLine("Connected.");
            _connected = true;

            // Register pending requests
            foreach (SimvarRequest request in _simvarRequests)
            {
                if (!RegisterToSimConnect(request))
                {
                    Console.WriteLine("Request register failed: " + request.Name);
                }
            }

            _timer.Start();
        }

        /// The case where the user closes game
        private void OnRecvQuit(SimConnect sender, SIMCONNECT_RECV data)
        {
            Console.WriteLine("SimConnect_OnRecvQuit");
            Console.WriteLine("KH has exited");

            Disconnect();
        }

        private void OnRecvException(SimConnect sender, SIMCONNECT_RECV_EXCEPTION data)
        {
            SIMCONNECT_EXCEPTION exception = (SIMCONNECT_EXCEPTION)data.dwException;
            Console.WriteLine("SimConnect_OnRecvException: " + exception.ToString());
        }

        private void OnRecvSimobjectDataBytype(SimConnect sender, SIMCONNECT_RECV_SIMOBJECT_DATA_BYTYPE data)
        {
            Console.WriteLine("SimConnect_OnRecvSimobjectDataBytype");

            uint requestId = data.dwRequestID;
            uint objectId = data.dwObjectID;

            foreach (SimvarRequest request in _simvarRequests)
            {
                if (requestId == (uint)request.Request)
                {
                    if (request.IsString)
                    {
                        Struct1 result = (Struct1)data.dwData[0];
                        request.NumValue = 0;
                        request.StrValue = result.value;
                    }
                    else
                    {
                        double value = (double)data.dwData[0];
                        request.NumValue = value;
                        request.StrValue = value.ToString("F9");
                    }
                    request.Pending = false;
                }
            }

            if (AllReceived())
            {
                SendResult();
            }
        }

        private void OnTick(object sender, EventArgs e)
        {
            Console.WriteLine("OnTick: Requesting vars");

            foreach (SimvarRequest request in _simvarRequests)
            {
                _simConnect?.RequestDataOnSimObjectType(request.Request, request.Def, 0, SIMCONNECT_SIMOBJECT_TYPE.USER);
                request.Pending = true;
            }
        }

        private bool AllReceived()
        {
            foreach (SimvarRequest request in _simvarRequests)
            {
                if (request.Pending)
                {
                    return false;
                }
            }
            return true;
        }

        private void SendResult()
        {
            JsonObject json = new JsonObject();
            json["timestamp"] = DateTime.UtcNow;
            foreach (SimvarRequest request in _simvarRequests)
            {
                if (request.IsString)
                {
                    json[request.Name] = request.StrValue;
                } else
                {
                    json[request.Name] = request.NumValue;
                }
            }
            Console.WriteLine("Sending result:\n" + json.ToString());
        }
    }
}
