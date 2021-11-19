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

        public void OnPropertyChanged([CallerMemberName] string _sPropertyName = null)
        {
            PropertyChangedEventHandler hEventHandler = this.PropertyChanged;
            if (hEventHandler != null && !string.IsNullOrEmpty(_sPropertyName))
            {
                hEventHandler(this, new PropertyChangedEventArgs(_sPropertyName));
            }
        }

        protected bool SetProperty<T>(ref T _tField, T _tValue, [CallerMemberName] string _sPropertyName = null)
        {
            return this.SetProperty(ref _tField, _tValue, out T tPreviousValue, _sPropertyName);
        }

        protected bool SetProperty<T>(ref T _tField, T _tValue, out T _tPreviousValue, [CallerMemberName] string _sPropertyName = null)
        {
            if (!object.Equals(_tField, _tValue))
            {
                _tPreviousValue = _tField;
                _tField = _tValue;
                this.OnPropertyChanged(_sPropertyName);
                return true;
            }

            _tPreviousValue = default(T);
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
        public String sValue;

        // other definitions can be added to this struct
        // ...
    };

    public class SimvarRequest : ObservableObject
    {
        public DEFINITION eDef = DEFINITION.Dummy;
        public REQUEST eRequest = REQUEST.Dummy;

        public string sName { get; set; }
        public bool bIsString { get; set; }
        public double dValue
        {
            get { return m_dValue; }
            set { this.SetProperty(ref m_dValue, value); }
        }
        private double m_dValue = 0.0;
        public string sValue
        {
            get { return m_sValue; }
            set { this.SetProperty(ref m_sValue, value); }
        }
        private string m_sValue = null;

        public string sUnits { get; set; }
    };

    public class FSMonitor
    {
        private SimConnect simConnect = null;
        private DispatcherTimer timer = new DispatcherTimer();

        public bool connected
        {
            get {return _connected;}
        }
        private bool _connected;

        /// User-defined win32 event
        public const int WM_USER_SIMCONNECT = 0x0402;

        public ObservableCollection<SimvarRequest> simvarRequests = new ObservableCollection<SimvarRequest>();

        public FSMonitor()
        {
            _connected = false;
            timer.Interval = new TimeSpan(0, 0, 0, 10, 0);
        }

        public void Start()
        {
            Connect();
        }

        public void ReceiveSimConnectMessage()
        {
            simConnect?.ReceiveMessage();
        }

        private bool Connect()
        {
            Console.WriteLine("Connecting to Flight Simulator...");
            try
            {
                simConnect = new SimConnect("FSMonitor", IntPtr.Zero, WM_USER_SIMCONNECT, null, 0);
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
            timer.Stop();
            if (simConnect != null)
            {
                simConnect.Dispose();
                simConnect = null;
            }
            _connected = false;
            Console.WriteLine("Disconnected.");
        }

        private bool RegisterToSimConnect(SimvarRequest request)
        {
            if (simConnect != null)
            {
                if (request.bIsString)
                {
                    /// Define a data structure containing string value
                    simConnect.AddToDataDefinition(request.eDef, request.sName, "", SIMCONNECT_DATATYPE.STRING256, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                    /// IMPORTANT: Register it with the simconnect managed wrapper marshaller
                    /// If you skip this step, you will only receive a uint in the .dwData field.
                    simConnect.RegisterDataDefineStruct<Struct1>(request.eDef);
                }
                else
                {
                    /// Define a data structure containing numerical value
                    simConnect.AddToDataDefinition(request.eDef, request.sName, request.sUnits, SIMCONNECT_DATATYPE.FLOAT64, 0.0f, SimConnect.SIMCONNECT_UNUSED);
                    /// IMPORTANT: Register it with the simconnect managed wrapper marshaller
                    /// If you skip this step, you will only receive a uint in the .dwData field.
                    simConnect.RegisterDataDefineStruct<double>(request.eDef);
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
            foreach (SimvarRequest request in simvarRequests)
            {
                if (!RegisterToSimConnect(request))
                {
                    Console.WriteLine("Request register failed: " + request.sName);
                }
            }

            timer.Start();
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

            uint iRequest = data.dwRequestID;
            uint iObject = data.dwObjectID;
        }
    }
}
