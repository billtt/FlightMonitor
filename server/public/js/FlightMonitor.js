/**
 * Created by billtt on 2021/11/30.
 */

let _status = null;
let _map = null;
let _plane = null;
let _plan = null;
let _chart = null;
let _metarInterval = null;
let _rawConvertor = null;
let _wholeZoom = 8;
let _remainingDist = 0;
let _completedDist = 0;
let _debug = false;
let _lastDragTime = 0;
let _unavailableCharts = [];

// fix of remaining distance
let _distanceFix = 0;

// workaround of not knowing if a zoom change is triggered by user
let _autoZooming = false;

const NM2KM = 1.852;
const FT2M = 0.3048;
const DEFAULT_ZOOM = 8;
const MIN_WHOLEZOOM = 7;
const CHART_DISTANCE = 5;
const CHART_ZOOM = 16;

function getStatus() {
    $.getJSON('/status', (data) => {
        if (data && data.timestamp) {
            if (_status == null) {
                setInterval(updateStatus, 1000);
            }
            // If not in simulation, keep plane at previous position
            if (data.TAS > 0 || Math.abs(data.latitude) > 1 || Math.abs(data.longitude) > 1) {
                let updated = !_status || (_status.timestamp !== data.timestamp);
                _status = data;
                updateStatus(updated);
            }
        }
    });
}

function update(prop, value) {
    if ($.isNumeric(value)) {
        value = value.toLocaleString('en-US', {maximumFractionDigits: 1});
    }
    $('#' + prop).text(value);
}

function updateHtml(prop, html) {
    $('#' + prop).html(html);
}

function hide(id) {
    let element = $('#' + id);
    if (!element.hasClass('noDisplay')) {
        element.addClass('noDisplay');
    }
}

function unhide(id) {
    let element = $('#' + id);
    if (element.hasClass('noDisplay')) {
        element.removeClass('noDisplay');
    }
}

function updateTimeColor(seconds) {
    let color = 'red';
    if (seconds < 10) {
        color = 'green';
    } else if (seconds < 30) {
        color = 'orange';
    }
    $('#spdIndicator').css('border-left-color', color);
}

function updateStatus(dataChanged) {
    if (!_status) {
        return;
    }
    let timestamp = new Date(_status.timestamp);
    let seconds = ((Date.now() - timestamp.getTime()) / 1000).toFixed(0);
    updateTimeColor(seconds);

    if (dataChanged) {
        update('valGS', _status.GS);

        let ete = _status.ETE;
        _remainingDist = _status.distance;
        // converting from M to NM
        let totalDist = _status.totalDistance / 1000 / NM2KM;
        // use plan's route distance for total distance (more accurate)
        if (_plan) {
            totalDist = getTotalDistFromPlan();
            _remainingDist = getRemainingDistFromPlan();
        }
        totalDist += _distanceFix;
        _remainingDist += _distanceFix;
        if (_plan) {
            ete = _remainingDist / _status.GS * 3600;
        }

        // make sure distance is not less than direct distance to destination
        if (_plan) {
            _remainingDist = Math.max(_remainingDist, distance(_status.latitude, _status.longitude, _plan.destination.lat, _plan.destination.long));
        }

        _completedDist = Math.max(0, totalDist - _remainingDist);
        update('valDistance', _completedDist);
        update('valRemainingDist', _remainingDist);

        update('valAltitude', _status.altitude);

        let percent = 100 - (_remainingDist / totalDist * 100);
        $('#pgbPercent').css('width', percent + '%');

        // calculate descent information
        if (ete == 0 || totalDist == 0 || _remainingDist < 10 || _status.GS < 100) {
            hide('descentRef');
        } else {
            unhide('descentRef');
            let altitude = _status.altitude;
            if (_plan) {
                altitude -= _plan.destination.elevation;
            }
            // quick calculation
            let todDistance = _remainingDist - altitude / 300;
            // consider deacceleration
            todDistance -= (Math.max(0, _status.IAS) - 140) / 20;
            todEteSeconds = todDistance / _status.GS * 3600;
            $('#valTodDistance').text(todDistance.toFixed(1));
            $('#valTodEte').html(getDisplayTimeSpan(todEteSeconds));

            let angle = Math.atan2(altitude / 6076.12, _remainingDist) * 180 / Math.PI;
            let desV = Math.round(altitude / ete * 60);
            update('valDesAngle', angle);
            update('valDesVelocity', desV);
        }

        // update map
        updatePosition(_status.longitude, _status.latitude, _status.headingTrue);

        // check and load chart
        let aptCode = null;
        if (_plan) {
            [_plan.origin, _plan.destination].forEach((apt)=>{
                let dist = distance(_status.latitude, _status.longitude, apt.lat, apt.long);
                if (dist <= CHART_DISTANCE) {
                    aptCode = apt.icaoCode;
                }
            });
            if (aptCode) {
                if ((!_chart || _chart.code !== aptCode) && !_unavailableCharts.includes(aptCode)) {
                    loadChart(aptCode);
                }
            } else {
                if (_chart) {
                    removeChart();
                }
            }
        }
    }
}

function init() {
    _rawConvertor = new BMap.Convertor();

    // set start point at ZSPD
    let startPoint = new BMap.Point(121.805278, 31.143333);
    _map = new BMap.Map("map");
    _map.enableScrollWheelZoom();
    _map.centerAndZoom(startPoint, DEFAULT_ZOOM);
    _map.addEventListener('dragend', onMapDragged);
    _map.addEventListener('zoomstart', onZoomStart);
    _map.addEventListener('zoomend', onZoomEnd);

    if (_debug) {
        _map.addEventListener('click', (params)=>{
            let p = params.point;
            if (_status) {
                _status.longitude = p.lng;
                _status.latitude = p.lat;
                updateStatus(true);
            }
        });
    }

    let nav = new BMap.NavigationControl({type: BMAP_NAVIGATION_CONTROL_ZOOM, anchor: BMAP_ANCHOR_BOTTOM_RIGHT});
    _map.addControl(nav);

    let icon = new BMap.Icon('img/plane.png', new BMap.Size(40, 40), {anchor: new BMap.Size(20, 20)});
    _plane = new BMap.Marker(startPoint, {icon: icon, enableMassClear: false});
    _plane.setTop(true);
    _map.addOverlay(_plane);

    $('#chkAutoCenter').change(() => {
        if (isAutoCenter()) {
            _map.setCenter(_plane.getPosition());
        }
    });

    $('#chkAutoZoom').change(() => {
        if (isAutoZoom() && isAutoCenter()) {
            autoZoom();
        }
    });

    const btPlan = $('#btPlan');
    $('#btPlan').click(() => {
        if (btPlan.text() === 'Load') {
            loadPlan();
        } else if (btPlan.text() === 'Unload') {
            unloadPlan();
        }
    });

    $('#btFixDistance').click(() => {
        fix = parseFloat(window.prompt('Remaining distance fix value', '' + _distanceFix));
        if (!isNaN(fix)) {
            _distanceFix = fix;
            updateStatus(true);
        }
    });

    setInterval(getStatus, 3000);
}

function initWholeZoom() {
    if (!_plan || !_map) {
        _wholeZoom = DEFAULT_ZOOM;
        return;
    }
    let view = [];
    let fixes = _plan.fixes;
    for (let i=0; i<fixes.length; i++) {
        view.push(fixToBMapPoint(fixes[i]));
    }
    _wholeZoom = Math.max(MIN_WHOLEZOOM, _map.getViewport(view).zoom);
}

/**
 * Return array of remaining points on route as BMap.Point
 */
function getRemainingPoints() {
    if (!_plan) {
        return [];
    }
    let points = [];
    let fixes = _plan.fixes;
    if (!_plan.currentFixIndex) {
        points.push(fixToBMapPoint(fixes[fixes.length-1]));
    } else {
        for (let i=_plan.currentFixIndex; i<fixes.length; i++) {
            points.push(fixToBMapPoint(fixes[i]));
        }
    }
    return points;
}

function autoZoom() {
    if (!_plan || !_map || !_plane) {
        return;
    }
    const maxZoom = 15;
    const startSegment = 50;
    const endSegment = 200;
    let zoom = 0;
    if (_remainingDist < endSegment) {
        // let destApt = _plan.fixes[_plan.fixes.length - 1];
        // let destPoint = new BMap.Point(destApt.long, destApt.lat);
        let planePoint = new BMap.Point(_status.longitude, _status.latitude);
        // let oppPoint = new BMap.Point(2 * planePoint.lng - destPoint.lng, 2 * planePoint.lat - destPoint.lat);
        // let view = [destPoint, planePoint, oppPoint];
        // zoom = _map.getViewport(view, {margins: [20, 20, 20, 20]}).zoom;
        let view = getRemainingPoints();
        view.push(planePoint);
        zoom = _map.getViewport(view, {zoomFactor: -1}).zoom;
        zoom = Math.min(zoom, Math.round(maxZoom + (_wholeZoom - maxZoom) * _remainingDist / endSegment));
    } else if (_completedDist < startSegment) {
        zoom = Math.round(maxZoom + (_wholeZoom - maxZoom) * _completedDist / startSegment);
    } else {
        zoom = _wholeZoom;
    }
    zoom = Math.min(zoom, maxZoom);

    // set zoom for chart
    if (_chart) {
        zoom = CHART_ZOOM;
    }

    _autoZooming = true;
    _map.setZoom(zoom);
    _autoZooming = false;
    if (_debug) {
        console.log('Auto zoom: ' + zoom);
    }
}

function updatePosition(longitude, latitude, heading) {
    let pos = new BMap.Point(longitude, latitude);
    _rawConvertor.translate([pos], 1, 5, (data) => {
        if (data.status === 0) {
            let tPoint = data.points[0];
            _plane.setPosition(tPoint);
            _plane.setRotation(heading);
            if (isAutoCenter() && !isJustDragged()) {
                _map.setCenter(tPoint, {noAnimation: true});
                if (isAutoZoom()) {
                    autoZoom();
                }
            }
        }
    });
}

function onZoomEnd() {
    if (_debug) {
        console.log(`Zoom changed: ${_map.getZoom()}`);
    }
}

function onZoomStart() {
    if (_debug) {
        console.log(`Zoom start, auto: ${_autoZooming}`);
    }
    if (!_autoZooming) {
        _lastDragTime = Date.now();
    }
}

function onMapDragged() {
    _lastDragTime = Date.now();
}

function isJustDragged() {
    return Date.now() - _lastDragTime < 10000;
}

function isAutoCenter() {
    return $('#chkAutoCenter').prop('checked');
}

function isAutoZoom() {
    return $('#chkAutoZoom').prop('checked');
}

function setAutoCenter(auto) {
    $('#chkAutoCenter').prop('checked', auto);
    $('#chkAutoCenter').bootstrapToggle(auto ? 'on' : 'off');
}

function loadPlan() {
    const btPlan = $('#btPlan');
    btPlan.prop('disabled', true);
    btPlan.text('Loading...');
    $.getJSON('/plan', (data) => {
        btPlan.prop('disabled', false);
        if (!data || data.code !== 0) {
            alert('Error loading plan!');
            btPlan.text('Load');
            return;
        }
        _plan = data;
        _distanceFix = 0;
        drawFlightPlan();
        btPlan.text('Unload');

        _metarInterval = setInterval(loadMetar, 60 * 1000);
        loadMetars();
        initWholeZoom();
    });
}

function drawFlightPlan() {
    const fixes = _plan.fixes;
    let routeType = 0; // 0 - sid, 1 - normal, 2 - star
    let routes = [[], [], []];
    const wptIcon = new BMap.Icon('img/wpt.png', new BMap.Size(20, 20), {anchor: new BMap.Size(10, 10)});

    // convert coordinates
    let points = [];
    for (let i=0; i<fixes.length; i++) {
        points.push(fixToBMapPoint(fixes[i]));
    }
    new MapConvertor(_rawConvertor, points, (data) => {
        if (data.status === 0 && data.points.length === fixes.length) {
            for (let i=0; i<data.points.length; i++) {
                let point = data.points[i];
                let fix = fixes[i];
                // add points to routes
                routes[routeType].push(point);
                if (i > 0 && i < fixes.length-1) {
                    if (!fix.sidStar && routeType === 0) {
                        routes[1].push(point);
                        routeType = 1;
                    }
                    if (fix.sidStar && routeType === 1) {
                        // remote last point from Normal route
                        routes[1].pop();
                        // add last point from Normal route
                        routes[2].push(routes[1][routes[1].length-1]);
                        routes[2].push(point);
                        routeType = 2;
                    }
                }

                // add markers and skip airports, SID and STAR for waypoints
                if (i > 0 && i < fixes.length-1 && !fix.sidStar) {
                    let name = (fix.id === fix.name ? fix.name : (`(${fix.id}) ${fix.name}`));
                    let wpt = new BMap.Marker(point, {icon: wptIcon, title: name});
                    _map.addOverlay(wpt);
                }
            }

            // draw routes
            const options = [
                {color: 'orange', style: 'dashed', opacity: 0.5}, // SID
                {color: 'red', style: 'solid', opacity: 0.3}, // Normal
                {color: 'orange', style: 'dashed', opacity: 0.5} // STAR
            ];
            for (let i=0; i<3; i++) {
                if (routes[i].length > 1) {
                    _map.addOverlay(new BMap.Polyline(routes[i], {
                        strokeColor: options[i].color,
                        strokeStyle: options[i].style,
                        strokeOpacity: options[i].opacity,
                        strokeWeight: 8
                    }));
                }
            }

        } else {
            alert('Error converting coordinates for plan!');
            return;
        }
    }).convert();
}

function unloadPlan() {
    _plan = null;
    removeChart();
    _map.clearOverlays();
    _distanceFix = 0;
    const btPlan = $('#btPlan');
    btPlan.text('Load');

    closeMetar();
    initWholeZoom();
}

function loadMetars() {
    if (!_plan) {
        closeMetar();
        return;
    }
    loadMetar('Origin');
    loadMetar('Dest');
    unhide('metar');
}

/**
 * @param domId 'Origin' or 'Dest'
 */
function loadMetar(domId) {
    let end = _plan[(domId === 'Origin' ? 'origin' : 'destination')];
    let icao = end.icaoCode;
    $('#valIcao' + domId).text(icao);
    $('#valRunway' + domId).text(end.runway);
    $('#valElevation' + domId).text(end.elevation);
    $.getJSON(`/metar?icao=${icao}`, (json)=> {
        updateMetar(domId, json);
    });
}

function updateMetar(domId, metar) {
    let valid = metar && (metar.code === 0);
    $('#valMetarTime' + domId).text(valid ? moment(metar.time).format('MM/DD HH:mm') : '-');
    $('#fcatIndicator' + domId).removeClass('IFR LIFR VFR MVFR');
    if (valid) {
        let raw = metar.raw.substring(13);
        $('#valMetar' + domId).text(raw);
        $('#fcatIndicator' + domId).addClass(metar.flightCat);
    } else {
        $('#valMetar' + domId).text('');
    }
}

function closeMetar() {
    if (_metarInterval) {
        clearInterval(_metarInterval);
        _metarInterval = null;
    }
    hide('metar');
}

/**
 * Convert fix to BMap.Point
 */
function fixToBMapPoint(fix) {
    return new BMap.Point(fix.long, fix.lat);
}

function getTotalDistFromPlan() {
    let dist = 0;
    let fixes = _plan.fixes;
    for (let i=0; i<fixes.length-1; i++) {
        dist += distance(fixes[i].lat, fixes[i].long, fixes[i+1].lat, fixes[i+1].long);
    }
    return dist;
}

function getRemainingDistFromPlan() {
    let lat = _status.latitude;
    let lng = _status.longitude;
    let fixes = _plan.fixes;
    let minDist = -1;
    let dist = 0;
    for (let i=0; i<fixes.length-1; i++) {
        let dist2Arc = crossarc(fixes[i].lat, fixes[i].long, fixes[i+1].lat, fixes[i+1].long, lat, lng);
        let dist2Wpt = distance(lat, lng, fixes[i+1].lat, fixes[i+1].long);
        let arcLen = distance(fixes[i].lat, fixes[i].long, fixes[i+1].lat, fixes[i+1].long);
        if (dist2Arc < minDist || minDist < 0) {
            minDist = dist2Arc;
            dist = dist2Wpt;
            _plan.currentFixIndex = i+1;
        } else if (minDist >= 0) {
            dist += arcLen;
        }
    }
    return dist;
}

function removeChart() {
    if (_chart) {
        _map.removeOverlay(_chart);
        _chart = null;
    }
}

function loadChart(aptCode) {
    if (_chart) {
        removeChart();
    }
    $.getJSON('charts/' + aptCode + '.json', (data) => {
        if (!data || !data.sw) {
            _unavailableCharts.push(aptCode);
            return;
        }
        let bounds = new BMap.Bounds(
            new BMap.Point(data.sw[0], data.sw[1]),
            new BMap.Point(data.ne[0], data.ne[1])
        );
        _chart = new BMap.GroundOverlay(bounds, {
            imageURL: 'charts/' + aptCode + '.png',
            opacity: 0.5
        });
        _chart.code = aptCode;
        _map.addOverlay(_chart);
    }).fail(()=>{
        _unavailableCharts.push(aptCode);
    });
}
