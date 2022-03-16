/**
 * Created by billtt on 2021/11/30.
 */

let _data = null;
let _map = null;
let _plane = null;
let _plan = null;
const NM2KM = 1.852;
const FT2M = 0.3048;

function getStatus() {
    $.getJSON('/status', (data) => {
        if (data && data.timestamp) {
            if (_data == null) {
                setInterval(updateAll, 1000);
            }
            _data = data;
            updateAll(true);
        }
    });
}

function update(prop, value) {
    if ($.isNumeric(value)) {
        value = value.toLocaleString('en-US', {maximumFractionDigits: 1});
    }
    $('#' + prop).text(value);
}

function updateTimeColor(seconds) {
    let color = 'red';
    if (seconds < 10) {
        color = 'green';
    } else if (seconds < 30) {
        color = 'orange';
    }
    $('#valUpdateTime').css('color', color);
}

function getDisplayTimeSpan(seconds) {
    let hours = Math.floor(seconds / 3600);
    let mins = seconds / 60 % 60;
    let dispSpan = '';
    if (hours > 0) {
        dispSpan = hours + 'h';
    }
    if (hours === 0 || mins > 0) {
        dispSpan += (hours > 0 ? ' ' : '') + mins.toFixed(0) + 'm';
    }
    return dispSpan;
}

function updateAll(dataChanged) {
    let timestamp = new Date(_data.timestamp);
    let seconds = ((Date.now() - timestamp.getTime()) / 1000).toFixed(0);
    updateTimeColor(seconds);
    update('valUpdateTime', `${_data.timestamp} (${seconds}s)`);

    if (dataChanged) {
        update('valGS', _data.GS);
        update('valGSKm', _data.GS * NM2KM);
        update('valTAS', _data.TAS);

        update('valFuel', _data.fuelWeight * 0.453592);
        update('valFuelRate', _data.fuelPerHour * 0.453592);
        update('valFuelTime', _data.fuelWeight / _data.fuelPerHour);

        let remainingDist = _data.distance;
        // converting from M to NM
        let totalDist = _data.totalDistance / 1000 / NM2KM;
        let completedDist = Math.max(0, totalDist - remainingDist);
        update('valDistance', remainingDist);
        update('valDistanceKm', remainingDist * NM2KM);
        update('valTotalDist', totalDist);
        update('valTotalDistKm', totalDist * NM2KM);
        update('valCompletedDist', completedDist);
        update('valCompletedDistKm', completedDist * NM2KM);

        update('valAltitude', _data.altitude);
        update('valAltitudeM', _data.altitude * FT2M);

        let percent = 100 - (_data.distance / _data.totalDistance * 1852 * 100);
        $('#pgbPercent').css('width', percent + '%');
        let ete = _data.ETE;
        update('valETE', getDisplayTimeSpan(ete));
        update('valETA', moment().add(ete - seconds, 's').format('MM/DD HH:mm'));

        // calculate descent information
        let angle = Math.atan2(_data.altitude / 6076.12, _data.distance) * 180 / Math.PI;
        let desV = Math.round(_data.altitude / ete * 60);
        update('valDesAngle', angle);
        update('valDesVelocity', desV);

        // update map
        updatePosition(_data.longitude, _data.latitude, _data.headingMagnetic);
    }
}

// map
function init() {
    var startPoint = new BMap.Point(121.805278, 31.143333);
    _map = new BMap.Map("map");
    _map.enableScrollWheelZoom();
    _map.centerAndZoom(startPoint, 8);
    _map.addEventListener('dragend', onMapDragged);

    var icon = new BMap.Icon('img/plane.png', new BMap.Size(40, 40), {anchor: new BMap.Size(20, 20)});
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
    _plane.setPosition(pos);
    _plane.setRotation(heading);
    if (isAutoCenter()) { // 10s after dragging the map
        _map.panTo(pos);
    }
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
    });
}

function drawFlightPlan() {
    const fixes = _plan.fixes;
    let routeType = 0; // 0 - sid, 1 - normal, 2 - star
    let routes = [[], [], []];
    const wptIcon = new BMap.Icon('img/wpt.png', new BMap.Size(20, 20), {anchor: new BMap.Size(10, 10)});
    for (let i=0; i<fixes.length; i++) {
        let fix = fixes[i];
        let point = new BMap.Point(fix.long, fix.lat);

        // add points to routes
        routes[routeType].push(point);
        if (i > 0 && i < fixes.length-1) {
            if (!fix.sidStar && routeType === 0) {
                routeType++;
                routes[routeType].push(point);
            }
            if (fix.sidStar && routeType === 1) {
                routeType++;
                routes[routeType].push(point);
            }
        }

        // skip origin and destination for waypoints
        if (i > 0 && i < fixes.length-1) {
            let name = (fix.id === fix.name ? fix.name : (`(${fix.id}) ${fix.name}`));
            let wpt = new BMap.Marker(point, {icon: wptIcon, title: name});
            _map.addOverlay(wpt);
        }
    }
    // draw routes
    const options = [
        {color: 'green', style: 'dashed'}, // SID
        {color: 'blue', style: 'solid'}, // Normal
        {color: 'green', style: 'dashed'} // STAR
    ];
    // SID route
    for (let i=0; i<3; i++) {
        if (routes[i].length > 1) {
            _map.addOverlay(new BMap.Polyline(routes[i], {
                strokeColor: options[i].color,
                strokeStyle: options[i].style,
                strokeWeight:8,
                strokeOpacity:0.3
            }));
        }
    }
}

function unloadPlan() {
    _plan = null;
    _map.clearOverlays();
    const btPlan = $('#btPlan');
    btPlan.text('Load');
}

setInterval(getStatus, 3000);
