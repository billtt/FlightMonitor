/**
 * Created by billtt on 2021/11/30.
 */

function getStatus() {
    $.getJSON('/status', (data) => {
        showData(data);
    });
}

function showData(data) {
    let html = '';
    let timestamp = new Date(data.timestamp);
    let seconds = ((Date.now() - timestamp.getTime()) / 1000).toFixed(0);
    html += `<p><b>Updated</b>: ${seconds}s (${data.timestamp})</p>`;
    html += `<p><b>GS</b>: ${data.GS.toFixed(1)} Knots / <b>TAS</b>: ${data.TAS.toFixed(1)} Knots</p>`;

    html += `<p><b>Fuel</b>: ${(0.453592 * data.fuelWeight).toFixed(1)} kg / <b>Consumption</b>: ${(data.fuelPerHour * 0.453592).toFixed(1)} kg/h</p>`;

    let percent = 100 - (data.distance / data.totalDistance * 1852 * 100).toFixed(1);
    html += `<p><b>Distance</b>: ${data.distance} nm (${percent}%)</p>`;

    $('#status').html(html);
}

setInterval(getStatus, 3000);