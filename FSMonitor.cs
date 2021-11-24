using System;
using Microsoft.FlightSimulator.SimConnect;
using System.Runtime.InteropServices;
using System.Windows.Threading;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace FlightMonitor
{
    public class ObservableObject : INotifyPropertyChanged
    {
        public event PropertyChangedEventHandler PropertyChanged;

        public void OnPropertyChanged([CallerMemberName] string propertyName = null)
        {
            PropertyChangedEventHandler eventHandler = this.PropertyChanged;
            if (eventHandler != null && !string.IsNullOrEmpty(propertyName))
            {
                eventHandler(this, new PropertyChangedEventArgs(propertyName));
            }
        }

        protected bool SetProperty<T>(ref T field, T value, [CallerMemberName] string propertyName = null)
        {
            return this.SetProperty(ref field, value, out T previousValue, propertyName);
        }

        protected bool SetProperty<T>(ref T field, T value, out T previousValue, [CallerMemberName] string propertyName = null)
        {
            if (!object.Equals(field, value))
            {
                previousValue = field;
                field = value;
                this.OnPropertyChanged(propertyName);
                return true;
            }

            previousValue = default(T);
            return false;
        }
    }

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

    public class SimvarRequest : ObservableObject
    {
        public DEFINITION Def = DEFINITION.Dummy;
        public REQUEST Request = REQUEST.Dummy;

        public string Name { get; set; }
        public bool IsString { get; set; }
        public double NumValue
        {
            get { return _numValue; }
            set { this.SetProperty(ref this._numValue, value); }
        }
        private double _numValue = 0.0;
        public string StrValue
        {
            get { return _strValue; }
            set { this.SetProperty(ref _strValue, value); }
        }
        private string _strValue = null;

        public string Units { get; set; }
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

        private ObservableCollection<SimvarRequest> _simvarRequests = new ObservableCollection<SimvarRequest>();

        public FSMonitor()
        {
            _connected = false;
            _timer.Interval = new TimeSpan(0, 0, 0, 10, 0);
        }

        public void Start()
        {
            Connect();
        }

        public void ReceiveSimConnectMessage()
        {
            _simConnect?.ReceiveMessage();
        }

        private bool Connect()
        {
            Console.WriteLine("Connecting to Flight Simulator...");
            try
            {
                _simConnect = new SimConnect("FSMonitor", IntPtr.Zero, WM_USER_SIMCONNECT, null, 0);
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
            SIMCONNECT_EXCEPTION eException = (SIMCONNECT_EXCEPTION)data.dwException;
            Console.WriteLine("SimConnect_OnRecvException: " + eException.ToString());
        }

        private void OnRecvSimobjectDataBytype(SimConnect sender, SIMCONNECT_RECV_SIMOBJECT_DATA_BYTYPE data)
        {
            Console.WriteLine("SimConnect_OnRecvSimobjectDataBytype");

            uint requestId = data.dwRequestID;
            uint objectId = data.dwObjectID;

        }
    }
}
