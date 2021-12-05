/**
 * Created by billtt on 2021/11/30.
 */

let _data = null;

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
        value = value.toFixed(1);
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
    update('valTAS', _data.TAS);
    update('valFuel', _data.fuelWeight * 0.453592);
    update('valFuelRate', _data.fuelPerHour * 0.453592);
    update('valFuelTime', _data.fuelWeight / _data.fuelPerHour);
    update('valDistance', _data.distance);
    let percent = 100 - (_data.distance / _data.totalDistance * 1852 * 100);
    update('valDistPercent', percent);
    let ete = _data.ETE;
    update('valETE', getDisplayTimeSpan(ete));
    update('valETA', moment().add(ete, 's').format('MM/DD HH:mm'));
}

setInterval(getStatus, 3000);
