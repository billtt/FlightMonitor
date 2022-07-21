
const STATUS_NORMAL = 0;
const STATUS_ADDCHART_SW = 1;
const STATUS_ADDCHART_NE = 2;
const STATUS_REPOSITION = 3;
const STATUS_SCALE = 4;

let _map = null;
let _chart = null;
let _chartCode = null;
let _status = STATUS_NORMAL;
// width / height
let _chartRatio = 0;
// staging variables
let _stPoint = null;
let _stBounds = null;

function init() {
    let startPoint = new BMap.Point(121.805278, 31.143333);
    _map = new BMap.Map("map");
    _map.enableScrollWheelZoom();
    _map.centerAndZoom(startPoint, 8);
    _map.addEventListener('click', onClick);
    _map.addEventListener('dragstart', onDragStart);
    _map.addEventListener('dragging', onDragging);
    window.addEventListener('keydown', onKeyDown);
    message('Press `l` to load chart.\n' +
        'Press `r` for re-position mode.\n' +
        'Press `s` for scale mode.\n' +
        'Press `v` for normal mode.\n' +
        'Press `p` to print bounds.');
}

function onClick(event) {
    let p = event.point;
    if (_status === STATUS_ADDCHART_SW) {
        _stPoint = p;
        _status++;
        message('Now click on the northeast point on map');
    } else if (_status === STATUS_ADDCHART_NE) {
        _status = STATUS_NORMAL;
        addChart(_stPoint, p);
    }
}

function onKeyDown(event) {
    let key = event.key;
    if (key === 'l') {
        let code = window.prompt('Airport ICAO code:', '');
        if (code.match(/^[A-Z]{4}$/)) {
            loadChart(code);
        } else {
            window.alert('Invalid ICAO code!');
        }
    }
    if (key === 'r') {
        if (_chart) {
            _status = STATUS_REPOSITION;
            message('Re-position Mode');
        }
    }
    if (key === 's') {
        if (_chart) {
            _status = STATUS_SCALE;
            message('Scale Mode\nMove map vertically to scale.');
        }
    }
    if (key === 'v') {
        _status = STATUS_NORMAL;
        message('Normal Mode');
    }
    if (key === 'p' && _chart) {
        let sw = _chart.getBounds().getSouthWest();
        let ne = _chart.getBounds().getNorthEast();
        message('Chart bounds:\n' +
            `(${sw.lng}, ${sw.lat}), (${ne.lng}, ${ne.lat})`)
    }
}

function onDragStart(event) {
    if ((_status === STATUS_REPOSITION || _status === STATUS_SCALE) && _chart) {
        _stPoint = _map.getCenter();
        _stBounds = _chart.getBounds();
    }
}

function onDragging(event) {
    let offset = _map.getCenter();
    if (_stPoint) {
        offset.lng -= _stPoint.lng;
        offset.lat -= _stPoint.lat;
    }
    if (_status === STATUS_REPOSITION && _chart) {
        let sw = new BMap.Point(_stBounds.getSouthWest().lng + offset.lng, _stBounds.getSouthWest().lat + offset.lat);
        let ne = new BMap.Point(_stBounds.getNorthEast().lng + offset.lng, _stBounds.getNorthEast().lat + offset.lat);
        _chart.setBounds(new BMap.Bounds(sw, ne));
    } else if (_status === STATUS_SCALE && _chart) {
        let sw = _stBounds.getSouthWest();
        let ne = _stBounds.getNorthEast();
        let scale = 1 - offset.lat / (ne.lat - sw.lat);
        let nne = new BMap.Point(sw.lng + (ne.lng - sw.lng) * scale, sw.lat + (ne.lat - sw.lat) * scale);
        _chart.setBounds(new BMap.Bounds(sw, nne));
    }
}

function loadChart(aptCode) {
    if (_status !== STATUS_NORMAL) {
        window.alert('Invalid status for loading a new chart');
        return;
    }
    if (_chart) {
        _map.removeOverlay(_chart);
        _chart = null;
    }

    _chartCode = aptCode;

    const img = new Image();
    img.onload = function() {
        _chartRatio = this.width / this.height;
    }
    img.src = 'charts/' + aptCode + '.png';

    // try loading existing data
    $.getJSON('charts/' + aptCode + '.json', (data) => {
        if (!data || !data.sw) {
            // add manually
            _status = STATUS_ADDCHART_SW;
            message('Now click on the southwest point on map');
        } else {
            addChart(new BMap.Point(data.sw[0], data.sw[1]), new BMap.Point(data.ne[0], data.ne[1]));
        }
    });
}

function addChart(p1, p2) {
    adjustRatio(p1, p2);
    let bounds = new BMap.Bounds(p1, p2);
    _chart = new BMap.GroundOverlay(bounds, {
        imageURL: 'charts/' + _chartCode + '.png',
        opacity: 0.4
    });
    _map.setCenter(bounds.getCenter());
    _map.setZoom(15);
    _map.addOverlay(_chart);
}

/**
 * p2 will be modified to conform to _chartRatio
 * @param p1
 * @param p2
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
}

function message(msg) {
    msg = msg.replaceAll('\n', '<br/>');
    $('#msg').html(msg);
}
