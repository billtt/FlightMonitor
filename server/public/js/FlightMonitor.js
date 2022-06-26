/**
 * Created by billtt on 2021/11/30.
 */

let _status = null;
let _map = null;
let _plane = null;
let _plan = null;
let _metarInterval = null;
let _rawConvertor = null;
const NM2KM = 1.852;
const FT2M = 0.3048;

function getStatus() {
    $.getJSON('/status', (data) => {
        if (data && data.timestamp) {
            if (_status == null) {
                setInterval(updateStatus, 1000);
            }
            // If not in simulation, keep plane at previous position
            if (data.TAS > 0 || Math.abs(data.latitude) > 1 || Math.abs(data.longitude) > 1) {
                _status = data;
                updateStatus(true);
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

function updateTimeColor(seconds) {
    let color = 'red';
    if (seconds < 10) {
        color = 'green';
    } else if (seconds < 30) {
        color = 'orange';
    }
    $('#spdIndicator').css('border-left-color', color);
}

function getDisplayTimeSpan(seconds) {
    let hours = Math.floor(seconds / 3600);
    let mins = seconds / 60 % 60;
    let dispSpan = '';
    if (hours > 0) {
        dispSpan = hours + '<sup>h</sup>';
    }
    if (hours === 0 || mins > 0) {
        dispSpan += (hours > 0 ? ' ' : '') + mins.toFixed(0) + '<sup>min</sup>';
    }
    return dispSpan;
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
        let remainingDist = _status.distance;
        // converting from M to NM
        let totalDist = _status.totalDistance / 1000 / NM2KM;
        // use plan's route distance for total distance (more accurate)
        if (_plan) {
            totalDist = getTotalDistFromPlan();
            remainingDist = getRemainingDistFromPlan();
            ete = remainingDist / _status.GS * 3600;
        }
        let completedDist = Math.max(0, totalDist - remainingDist);
        update('valDistance', remainingDist);
        update('valTotalDist', totalDist);

        update('valAltitude', _status.altitude);

        let percent = 100 - (remainingDist / totalDist * 100);
        $('#pgbPercent').css('width', percent + '%');
        updateHtml('valETE', getDisplayTimeSpan(ete));
        update('valETA', moment().add(ete - seconds, 's').format('MM/DD HH:mm'));

        // calculate descent information
        let altitude = _status.altitude;
        if (_plan) {
            altitude -= _plan.destination.elevation;
        }
        let angle = Math.atan2(altitude / 6076.12, remainingDist) * 180 / Math.PI;
        let desV = Math.round(altitude / ete * 60);
        update('valDesAngle', angle);
        update('valDesVelocity', desV);

        // update map
        updatePosition(_status.longitude, _status.latitude, _status.headingMagnetic);
    }
}

// map
function init() {
    _rawConvertor = new BMap.Convertor();

    // set start point at ZSPD
    let startPoint = new BMap.Point(121.805278, 31.143333);
    _map = new BMap.Map("map");
    _map.enableScrollWheelZoom();
    _map.centerAndZoom(startPoint, 8);
    _map.addEventListener('dragend', onMapDragged);

    let nav = new BMap.NavigationControl({type: BMAP_NAVIGATION_CONTROL_ZOOM, anchor: BMAP_ANCHOR_BOTTOM_RIGHT});
    _map.addControl(nav);

    let icon = new BMap.Icon('img/plane.png', new BMap.Size(40, 40), {anchor: new BMap.Size(20, 20)});
    _plane = new BMap.Marker(startPoint, {icon: icon, enableMassClear: false});
    _plane.setTop(true);
    _map.addOverlay(_plane);

    $('#chkAutoCenter').change(() => {
        if (isAutoCenter()) {
            _map.panTo(_plane.getPosition());
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
}

function updatePosition(longitude, latitude, heading) {
    let pos = new BMap.Point(longitude, latitude);
    _rawConvertor.translate([pos], 1, 5, (data) => {
        if (data.status === 0) {
            let tPoint = data.points[0];
            _plane.setPosition(tPoint);
            _plane.setRotation(heading);
            if (isAutoCenter()) { // 10s after dragging the map
                _map.panTo(tPoint);
            }
        }
    });
}

function onMapDragged() {
    if (isAutoCenter()) {
        setAutoCenter(false);
    }
}

function isAutoCenter() {
    return $('#chkAutoCenter').prop('checked');
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
        drawFlightPlan();
        btPlan.text('Unload');

        _metarInterval = setInterval(loadMetar, 60 * 1000);
        loadMetar();
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
        points.push(new BMap.Point(fixes[i].long, fixes[i].lat));
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
    _map.clearOverlays();
    const btPlan = $('#btPlan');
    btPlan.text('Load');

    closeMetar();
}

function loadMetar() {
    if (!_plan) {
        closeMetar();
        return;
    }
    let end = _plan[(_status && _status.GS>=50) ? 'destination' : 'origin'];
    let icao = end.icaoCode;
    $('#valIcao').text(icao);
    $('#valRunway').text(end.runway);
    $('#valElevation').text(end.elevation);
    $.getJSON(`/metar?icao=${icao}`, updateMetar);
}

function updateMetar(metar) {
    let valid = metar && (metar.code === 0);
    $('#valMetarTime').text(valid ? moment(metar.time).format('MM/DD HH:mm') : '-');
    $('#fcatIndicator').removeClass('IFR LIFR VFR MVFR');
    if (valid) {
        $('#valMetar').text(metar.raw);
        $('#fcatIndicator').addClass(metar.flightCat);
        $('#ulMetarInfo').removeClass('noDisplay');
    } else {
        $('#ulMetarInfo').addClass('noDisplay');
    }
    $('#metar').removeClass('hidden');
}

function closeMetar() {
    if (_metarInterval) {
        clearInterval(_metarInterval);
        _metarInterval = null;
    }
    $('#metar').addClass('hidden');
}

// distance calculation
// return value in nm
function distance(lat1, lat2, lon1, lon2) {
    // The math module contains a function
    // named toRadians which converts from
    // degrees to radians.
    lon1 =  lon1 * Math.PI / 180;
    lon2 = lon2 * Math.PI / 180;
    lat1 = lat1 * Math.PI / 180;
    lat2 = lat2 * Math.PI / 180;

    // Haversine formula
    let dlon = lon2 - lon1;
    let dlat = lat2 - lat1;
    let a = Math.pow(Math.sin(dlat / 2), 2)
        + Math.cos(lat1) * Math.cos(lat2)
        * Math.pow(Math.sin(dlon / 2),2);

    let c = 2 * Math.asin(Math.sqrt(a));

    // Radius of earth in nm.
    let r = 3440.065;

    // calculate the result
    return(c * r);
}

function getTotalDistFromPlan() {
    let dist = 0;
    let fixes = _plan.fixes;
    for (let i=0; i<fixes.length-1; i++) {
        dist += distance(fixes[i].lat, fixes[i+1].lat, fixes[i].long, fixes[i+1].long);
    }
    return dist;
}

function getRemainingDistFromPlan() {
    let lat = _status.latitude;
    let lng = _status.longitude;
    let fixes = _plan.fixes;
    let leastRat = -1;
    let dist = 0;
    for (let i=0; i<fixes.length-1; i++) {
        let dist1 = distance(lat, fixes[i].lat, lng, fixes[i].long) + distance(lat, fixes[i+1].lat, lng, fixes[i+1].long);
        let dist2 = distance(fixes[i].lat, fixes[i+1].lat, fixes[i].long, fixes[i+1].long);
        let rat = (dist1 - dist2) / dist2;
        if (rat < leastRat || leastRat < 0) {
            leastRat = rat;
            dist = distance(lat, fixes[i+1].lat, lng, fixes[i+1].long);
        } else if (leastRat >= 0) {
            dist += dist2;
        }
    }
    return dist;
}

setInterval(getStatus, 3000);
