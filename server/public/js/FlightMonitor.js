/**
 * Created by billtt on 2021/11/30.
 */

let _data = null;
const NM2KM = 1.852;
const FT2M = 0.3048;

function getStatus() {
    $.getJSON('/status', (data) => {
        if (data && data.timestamp) {
            if (_data == null) {
                setInterval(updateAll, 1000);
            }
            _data = data;
            updateAll();
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

function updateAll() {
    let timestamp = new Date(_data.timestamp);
    let seconds = ((Date.now() - timestamp.getTime()) / 1000).toFixed(0);
    updateTimeColor(seconds);
    update('valUpdateTime', `${_data.timestamp} (${seconds}s)`);

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
}

setInterval(getStatus, 3000);
