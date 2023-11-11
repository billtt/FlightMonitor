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
let _routes = [];

// fix of remaining distance
let _distanceFix = 0;

// workaround of not knowing if a zoom change is triggered by user
let _autoZooming = false;

const NM2KM = 1.852;
const FT2M = 0.3048;
const DEFAULT_ZOOM = 12;
const MAX_ZOOM = 15;
const MIN_WHOLEZOOM = 6;
const CHART_DISTANCE = 5;
const CHART_ZOOM = 16;
const PLANE_ICON_ROTATION = -90;
const PLANE_ICON = {
    path: 'M186.62,464H160a16,16,0,0,1-14.57-22.6l64.46-142.25L113.1,297,77.8,339.77C71.07,348.23,65.7,352,52,352H34.08a17.66,17.66,0,0,1-14.7-7.06c-2.38-3.21-4.72-8.65-2.44-16.41l19.82-71c.15-.53.33-1.06.53-1.58a.38.38,0,0,0,0-.15,14.82,14.82,0,0,1-.53-1.59L16.92,182.76c-2.15-7.61.2-12.93,2.56-16.06a16.83,16.83,0,0,1,13.6-6.7H52c10.23,0,20.16,4.59,26,12l34.57,42.05,97.32-1.44-64.44-142A16,16,0,0,1,160,48h26.91a25,25,0,0,1,19.35,9.8l125.05,152,57.77-1.52c4.23-.23,15.95-.31,18.66-.31C463,208,496,225.94,496,256c0,9.46-3.78,27-29.07,38.16-14.93,6.6-34.85,9.94-59.21,9.94-2.68,0-14.37-.08-18.66-.31l-57.76-1.54-125.36,152A25,25,0,0,1,186.62,464Z',
    anchor: {x: 256, y: 256},
    scale: 0.08,
    fillColor: "#ff9d00",
    fillOpacity: 0.8,
    strokeColor: "#ffd48f",
    strokeWeight: 1,
    rotation: PLANE_ICON_ROTATION
};
const WPT_ICON = {
    path: 'M 8, 8 m -8, 0 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0',
    anchor: {x: 8, y: 8},
    scale: 1.0,
    fillColor: "red",
    fillOpacity: 0.6,
    strokeWeight: 0
};

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

async function init() {

    const { Map } = await google.maps.importLibrary("maps");

    // set start point at ZSPD
    let startPoint = new google.maps.LatLng(31.143333, 121.805278);
    _map = new Map(document.getElementById("map"), {
        center: startPoint,
        zoom: 12,
    });

    if (_debug) {
        _map.addListener('click', (e)=>{
            if (e.latLng) {
                if (!_status) {
                    _status = {
                        headingTrue: 0,
                        GS: 400,
                        IAS: 290,
                        altitude: 30000,
                        ETE: 0,
                        timestamp: Date.now()
                    };
                }
                _status.longitude = e.latLng.lng();
                _status.latitude = e.latLng.lat();
                updateStatus(true);
            }
        });
    }

    let planeUrl = 'img/plane.png';
    _plane = new google.maps.Marker({
        position: startPoint,
        icon: PLANE_ICON,
        map: _map
    });

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
    let fixes = _plan.fixes;
    let bounds = new google.maps.LatLngBounds();
    for (let i=0; i<fixes.length; i++) {
        bounds.extend(fixToLatLng(fixes[i]));
    }
    let boundsListener = _map.addListener('bounds_changed', () => {
        _wholeZoom = Math.max(MIN_WHOLEZOOM, _map.getZoom());
        google.maps.event.removeListener(boundsListener);
    });
    let originalPos = _map.getCenter();
    _map.fitBounds(bounds);
    _map.setCenter(originalPos);
}

/**
 * Return array of remaining points on route as LatLng object
 */
function getRemainingPoints() {
    if (!_plan) {
        return [];
    }
    let points = [];
    let fixes = _plan.fixes;
    if (!_plan.currentFixIndex) {
        points.push(fixToLatLng(fixes[fixes.length-1]));
    } else {
        for (let i=_plan.currentFixIndex; i<fixes.length; i++) {
            points.push(fixToLatLng(fixes[i]));
        }
    }
    return points;
}

function autoZoom() {
    if (!_plan || !_map || !_plane) {
        return;
    }
    const startSegment = 50;
    const endSegment = 200;
    let zoom = _map.getZoom();
    if (_remainingDist < endSegment) {
        zoom = Math.round(MAX_ZOOM + (_wholeZoom - MAX_ZOOM) * _remainingDist / endSegment);
    } else if (_completedDist < startSegment) {
        zoom = Math.round(MAX_ZOOM + (_wholeZoom - MAX_ZOOM) * _completedDist / startSegment);
    } else {
        zoom = _wholeZoom;
    }
    zoom = Math.min(zoom, MAX_ZOOM);

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
    let pos = new google.maps.LatLng(latitude, longitude);
    _plane.setPosition(pos);
    _plane.getIcon().rotation = heading + PLANE_ICON_ROTATION;
    if (isAutoCenter() && !isJustDragged()) {
        _map.setCenter(pos);
        if (isAutoZoom()) {
            autoZoom();
        }
    }
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
        drawFlightRoutes();
        btPlan.text('Unload');

        _metarInterval = setInterval(loadMetars, 5 * 60 * 1000);
        loadMetars();
        initWholeZoom();
    });
}

function drawFlightRoutes() {
    const fixes = _plan.fixes;
    let routeType = 0; // 0 - sid, 1 - normal, 2 - star
    let routes = [[], [], []];

    let points = [];
    for (let i=0; i<fixes.length; i++) {
        points.push(fixToLatLng(fixes[i]));
    }
    for (let i=0; i<points.length; i++) {
        let point = points[i];
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
            // let name = (fix.id === fix.name ? fix.name : (`(${fix.id}) ${fix.name}`));
            let wpt = new google.maps.Marker({
                position: fixToLatLng(fix),
                icon: WPT_ICON,
                map: _map
            });
            _routes.push(wpt);
        }
    }

    // draw routes
    const options = [
        {color: 'orange', opacity: 0.5}, // SID
        {color: 'red', opacity: 0.3}, // Normal
        {color: 'orange', opacity: 0.5} // STAR
    ];
    for (let i=0; i<3; i++) {
        if (routes[i].length > 1) {
            let path = new google.maps.Polyline({
                path: routes[i],
                geodesic: true,
                strokeColor: options[i].color,
                strokeOpacity: options[i].opacity,
                strokeWeight: 8,
            });
            path.setMap(_map);
            _routes.push(path);
        }
    }
}

function cleanRoutes() {
    for (let i=0; i<_routes.length; i++) {
        _routes[i].setMap(null);
    }
}

function unloadPlan() {
    _plan = null;
    removeChart();
    cleanRoutes();
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
    $('#valMetarTime' + domId).text(valid ? moment(metar.time).format('HH:mm') : '-');
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
 * Convert fix to LatLng obj
 */
function fixToLatLng(fix) {
    return {lng: fix.long, lat: fix.lat};
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
        _chart.setMap(null);
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
        let bounds = {
            north: data.ne[1],
            south: data.sw[1],
            west: data.sw[0],
            east: data.ne[0]
        };
        _chart = new google.maps.GroundOverlay('charts/' + aptCode + '.png', bounds);
        _chart.code = aptCode;
        _chart.setMap(_map);
    }).fail(()=>{
        _unavailableCharts.push(aptCode);
    });
}
