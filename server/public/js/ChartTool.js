
const STATUS_NORMAL = 0;
const STATUS_ADDCHART_SW = 1;
const STATUS_ADDCHART_NE = 2;
const STATUS_REPOSITION = 3;
const STATUS_SCALE = 4;

const DEFAULT_ZOOM = 8;

let _map = null;
let _chart = null;
let _chartCode = null;
let _status = STATUS_NORMAL;
// width / height
let _chartRatio = 0;
// staging variables
let _stPoint = null;
let _stBounds = null;
let _mouseStart = null;

async function init() {
    const { Map } = await google.maps.importLibrary("maps");
    // set start point at ZSPD
    let startPoint = new google.maps.LatLng(31.143333, 121.805278);
    _map = new Map(document.getElementById("map"), {
        center: startPoint,
        zoom: DEFAULT_ZOOM,
        streetViewControl: false,
        mapTypeId: google.maps.MapTypeId.HYBRID
    });
    _map.addListener('click', onClick);
    _map.addListener('mouseup', onMouseUp);
    _map.addListener('mousedown', onMouseDown);
    _map.addListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    message('Press `l` to load chart.\n' +
        'Press `r` for re-position mode.\n' +
        'Press `s` for scale mode.\n' +
        'Press `v` for normal mode.\n' +
        'Press `a` to adjust aspect ratio (to conform to image).\n' +
        'Press `p` to print bounds.');
}

function onClick(e) {
    let p = latLng2Literal(e.latLng);
    if (_status === STATUS_ADDCHART_SW) {
        _stPoint = p;
        _status++;
        message('Now click on the northeast point on map');
    } else if (_status === STATUS_ADDCHART_NE) {
        _status = STATUS_NORMAL;
        addChartByWgs(_stPoint, p);
        _stPoint = null;
        message('Normal Mode');
    }
}

function onMouseDown(e) {
    if (_status === STATUS_REPOSITION || _status === STATUS_SCALE) {
        _mouseStart = latLng2Literal(e.latLng);
        _stBounds = _chart.getBounds();
    }
}

function onMouseUp(e) {
    if (_status === STATUS_REPOSITION || _status === STATUS_SCALE) {
        _mouseStart = null;
    }
}

function onMouseMove(e) {
    if (!_mouseStart) {
        return;
    }
    let p = latLng2Literal(e.latLng);
    let offset = {lng: p.lng - _mouseStart.lng, lat: p.lat - _mouseStart.lat};
    if (_status === STATUS_REPOSITION && _chart) {
        let sw = _stBounds.getSouthWest();
        sw = {lng: sw.lng() + offset.lng, lat: sw.lat() + offset.lat};
        let ne = _stBounds.getNorthEast();
        ne = {lng: ne.lng() + offset.lng, lat: ne.lat() + offset.lat};
        setChartBounds(sw, ne);
    } else if (_status === STATUS_SCALE && _chart) {
        let sw = _stBounds.getSouthWest();
        let ne = _stBounds.getNorthEast();
        let scale = 1 + offset.lat / (ne.lat() - sw.lat());
        let nsw = {lng: _mouseStart.lng + (sw.lng() - _mouseStart.lng) * scale, lat: _mouseStart.lat + (sw.lat() - _mouseStart.lat) * scale};
        let nne = {lng: _mouseStart.lng + (ne.lng() - _mouseStart.lng) * scale, lat: _mouseStart.lat + (ne.lat() - _mouseStart.lat) * scale};
        setChartBounds(nsw, nne);
    }
}

function onKeyDown(event) {
    let key = event.key;
    if (key === 'l') {
        let code = window.prompt('Airport ICAO code:', '');
        if (code.match(/^[A-Z]{4}$/)) {
            loadChart(code);
            _map.setOptions({gestureHandling: 'auto'});
        } else {
            window.alert('Invalid ICAO code!');
        }
    }
    if (key === 'r') {
        if (_chart) {
            _status = STATUS_REPOSITION;
            _stPoint = null;
            _map.setOptions({gestureHandling: 'none'});
            message('Re-position Mode');
        }
    }
    if (key === 's') {
        if (_chart) {
            _status = STATUS_SCALE;
            _stPoint = null;
            _map.setOptions({gestureHandling: 'none'});
            message('Scale Mode\nMove map vertically to scale.');
        }
    }
    if (key === 'v') {
        _status = STATUS_NORMAL;
        _stPoint = null;
        _map.setOptions({gestureHandling: 'auto'});
        message('Normal Mode');
    }
    if (key === 'a') {
        if (_chart) {
            let bounds = _chart.getBounds();
            let sw = latLng2Literal(bounds.getSouthWest());
            let ne = latLng2Literal(bounds.getNorthEast());
            adjustRatio(sw, ne);
            setChartBounds(sw, ne);
        }
    }
    if (key === 'p' && _chart) {
        let bounds = _chart.getBounds();
        let sw = bounds.getSouthWest();
        let ne = bounds.getNorthEast();
        let json = {
            sw: [sw.lng(), sw.lat()],
            ne: [ne.lng(), ne.lat()]
        }
        message('Chart config:\n' +
            JSON.stringify(json, null, 4));
    }
}

function loadChart(aptCode) {
    if (_status !== STATUS_NORMAL) {
        window.alert('Invalid status for loading a new chart');
        return;
    }
    if (_chart) {
        _chart.setMap(null);
        _chart = null;
    }

    _chartCode = aptCode;

    const img = new Image();
    img.onload = function() {
        _chartRatio = this.width / this.height;
        // try loading existing data
        $.getJSON('charts/' + aptCode + '.json', (data) => {
            if (data && data.sw) {
                // adjust ratio
                let p1 = {lng: data.sw[0], lat: data.sw[1]};
                let p2 = {lng: data.ne[0], lat: data.ne[1]};
                addChartByWgs(p1, p2);
                _map.fitBounds(_chart.getBounds());
            } else {
                window.alert('Something wrong loading chart configuration.');
            }
        }).fail(()=>{
            // add manually
            _status = STATUS_ADDCHART_SW;
            message('Now click on the southwest point on map');
        });
    }
    img.src = 'charts/' + aptCode + '.png';

}

function setChartBounds(sw, ne) {
    if (_chart) {
        _chart.setMap(null);
    }
    let bounds = new google.maps.LatLngBounds(sw, ne);
    _chart = new google.maps.GroundOverlay('charts/' + _chartCode + '.png', bounds, {opacity: 0.5, clickable: false});
    _chart.setMap(_map);
}

function addChartByWgs(p1, p2) {
    adjustRatio(p1, p2);
    setChartBounds(p1, p2);
}

// The mapping between latitude, longitude and pixels is defined by the web
// mercator projection.
// output is within the range of [0, 1]
function project(p) {
    let siny = Math.sin((p.lat * Math.PI) / 180);

    // Truncating to 0.9999 effectively limits latitude to 89.189. This is
    // about a third of a tile past the edge of the world tile.
    siny = Math.min(Math.max(siny, -0.9999), 0.9999);
    let projected = {lng: 0.5 + p.lng / 360,
        lat: 0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI)};
    console.log(p, projected);
    return projected;
}

function projectedAr(sw, ne) {
    let psw = project(sw);
    let pne = project(ne);
    return (pne.lng - psw.lng) / (psw.lat - pne.lat);
}

/**
 * p2 will be modified to conform to _chartRatio
 * @param p1 LatLngLiteral
 * @param p2 LatLngLiteral
 */
function adjustRatio(p1, p2) {
    let width = p2.lng - p1.lng;
    let height = p2.lat - p1.lat;
    if (width / height > _chartRatio) {
        width = _chartRatio * height;
    } else {
        height = width / _chartRatio;
    }
    p2.lng = p1.lng + width;
    p2.lat = p1.lat + height;

    // adjust again to fix distortion
    let par = projectedAr(p1, p2);
    let fix = _chartRatio / par;
    console.log(_chartRatio, par, fix);
    width = fix * width;
    p2.lng = p1.lng + width;
}

function message(msg) {
    msg = msg.replaceAll('\n', '<br/>');
    $('#msg').html(msg);
}
