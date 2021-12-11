using System;
using Microsoft.FlightSimulator.SimConnect;
using System.Runtime.InteropServices;
using System.Threading;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Json;
using System.Net;
using System.Net.Http;
using System.Text;

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

        public string Name { get; set; }
        public bool IsString = false;
        public double NumValue = 0.0;
        public string StrValue = "";
        public string Units;

        public bool Pending = true;

        public string ShortName;

        private static int _req = 0;
        private static int _def = 0;

        public SimvarRequest(String name, String shortName, String units)
        {
            this.Name = name;
            this.ShortName = shortName;
            this.Units = units;
            this.Request = (REQUEST)(_req++);
            this.Def = (DEFINITION)(_def++);
        }
    };

    public class FSMonitor
    {
        private SimConnect _simConnect = null;
        private Timer _timer;

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
        }

        public void Start()
        {
            InitRequests();
            Connect();
        }

        public void Dispatch()
        {
            _simConnect?.ReceiveMessage();
        }

        private void InitRequests()
        {
            _simvarRequests = new List<SimvarRequest>
            {
                new SimvarRequest("FUEL TOTAL QUANTITY WEIGHT", "fuelWeight", "Pounds"),
                new SimvarRequest("GROUND VELOCITY", "GS", "Knots"),
                new SimvarRequest("AIRSPEED TRUE", "TAS", "Knots"),
                new SimvarRequest("AIRSPEED INDICATED", "IAS", "Knots"),
                new SimvarRequest("GPS FLIGHTPLAN TOTAL DISTANCE", "totalDistance", "Meters"),
                new SimvarRequest("GPS ETE", "ETE", "Seconds"),
                new SimvarRequest("PRESSURE ALTITUDE", "altitude", "Feet")
            };
        }

        private void Connect()
        {
            while (_simConnect == null)
            {
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
                    if (_simConnect != null)
                    {
                        _simConnect.Dispose();
                        _simConnect = null;
                    }
                }
                Thread.Sleep(60 * 1000);
            }
        }

        private void Disconnect()
        {
            if (_timer != null)
            {
                _timer.Dispose();
                _timer = null;
            }
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

            _timer = new Timer(OnTick, null, 3000, 3000);
        }

        /// The case where the user closes game
        private void OnRecvQuit(SimConnect sender, SIMCONNECT_RECV data)
        {
            Console.WriteLine("Simulator quit.");

            Disconnect();

            // retry connecting
            Thread.Sleep(60 * 1000);
            Connect();
        }

        private void OnRecvException(SimConnect sender, SIMCONNECT_RECV_EXCEPTION data)
        {
            SIMCONNECT_EXCEPTION exception = (SIMCONNECT_EXCEPTION)data.dwException;
            Console.WriteLine("SimConnect_OnRecvException: " + exception.ToString());
        }

        private void OnRecvSimobjectDataBytype(SimConnect sender, SIMCONNECT_RECV_SIMOBJECT_DATA_BYTYPE data)
        {
            uint requestId = data.dwRequestID;
            uint objectId = data.dwObjectID;

            //Console.WriteLine("SimConnect_OnRecvSimobjectDataBytype ID=" + requestId);

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

        private void OnTick(object _)
        {
            //Console.WriteLine("OnTick: Requesting vars");

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

        double _lastFuel = 0;
        DateTime _lastTime;
        private void SendResult()
        {
            JsonObject json = new JsonObject();
            DateTime now = DateTime.Now;
            json["timestamp"] = now.ToString();
            foreach (SimvarRequest request in _simvarRequests)
            {
                if (request.IsString)
                {
                    json[request.ShortName] = request.StrValue;
                } else
                {
                    json[request.ShortName] = request.NumValue;
                }
            }

            // calculate remaining distance
            double distance = json["GS"] * json["ETE"] / 3600.0;
            json["distance"] = distance;

            // calculate fuel per hour
            double fuelRate = 0;
            double fuel = json["fuelWeight"];
            if (_lastFuel > 0)
            {
                TimeSpan timeSpan = now - _lastTime;
                fuelRate = (_lastFuel - fuel) * 3600 / timeSpan.TotalSeconds;
            }
            json["fuelPerHour"] = fuelRate;
            _lastFuel = fuel;
            _lastTime = now;

            PostData(json.ToString());
        }

        private void PostData(string data)
        {
            var postData = new StringContent(data, Encoding.UTF8, "application/json");
            const string url = "https://fm.bill.tt/";
            HttpClient client = new HttpClient();
            client.PostAsync(url, postData);
        }
    }
}
