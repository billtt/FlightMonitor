const EARTH_RADIUS_NM = 3440.065;

function deg2rad(deg) {
    return deg * Math.PI / 180.0;
}

// distance calculation
// return value in nm
function distance(lat1, lon1, lat2, lon2) {
    // The math module contains a function
    // named toRadians which converts from
    // degrees to radians.
    lon1 = deg2rad(lon1);
    lon2 = deg2rad(lon2);
    lat1 = deg2rad(lat1);
    lat2 = deg2rad(lat2);

    // Haversine formula
    let dlon = lon2 - lon1;
    let dlat = lat2 - lat1;
    let a = Math.pow(Math.sin(dlat / 2), 2)
        + Math.cos(lat1) * Math.cos(lat2)
        * Math.pow(Math.sin(dlon / 2),2);

    let c = 2 * Math.asin(Math.sqrt(a));

    // calculate the result
    return(c * EARTH_RADIUS_NM);
}

// BEAR Finds the bearing from one lat/lon point to another.
// coordinate arguments are in radians
// Reference:
// https://stackoverflow.com/questions/32771458/distance-from-lat-lng-point-to-minor-arc-segment
function bear(latA, lonA, latB, lonB) {
    return Math.atan2(Math.sin(lonB-lonA) * Math.cos(latB), Math.cos(latA) * Math.sin(latB) - Math.sin(latA) * Math.cos(latB) * Math.cos(lonB - lonA));
}

// crossarc Calculates the shortest distance in nautical miles
// between an arc (defined by p1 and p2) and a third point, p3.
// Input lat1,lon1,lat2,lon2,lat3,lon3 in degrees.
// Reference:
// https://stackoverflow.com/questions/32771458/distance-from-lat-lng-point-to-minor-arc-segment
function crossarc(lat1, lon1, lat2, lon2, lat3, lon3) {
    let dxa = 0;
    lat1=deg2rad(lat1); lat2=deg2rad(lat2); lat3=deg2rad(lat3);
    lon1=deg2rad(lon1); lon2=deg2rad(lon2); lon3=deg2rad(lon3);

    // Prerequisites for the formulas
    bear12 = bear(lat1,lon1,lat2,lon2);
    bear13 = bear(lat1,lon1,lat3,lon3);
    dis13 = distance(lat1,lon1,lat3,lon3);

    diff = Math.abs(bear13-bear12);
    if (diff > Math.PI) {
        diff = 2 * Math.PI - diff;
    }

    // Is relative bearing obtuse?
    if (diff > (Math.PI / 2)) {
        dxa = dis13;
    } else {
        // Find the cross-track distance.
        let dxt = Math.asin(Math.sin(dis13/EARTH_RADIUS_NM)* Math.sin(bear13 - bear12) ) * EARTH_RADIUS_NM;
        // Is p4 beyond the arc?
        dis12 = distance(lat1, lon1, lat2, lon2);
        dis14 = Math.acos(Math.cos(dis13/EARTH_RADIUS_NM) / Math.cos(dxt/EARTH_RADIUS_NM) ) * EARTH_RADIUS_NM;
        if (dis14 > dis12) {
            dxa = distance(lat2,lon2,lat3,lon3);
        } else {
            dxa=Math.abs(dxt);
        }
    }
    return dxa;
}

function getDisplayTimeSpan(seconds) {
    let dispSpan = '';
    if (seconds < 0) {
        dispSpan = '-';
        seconds = -seconds;
    }
    let hours = Math.floor(seconds / 3600);
    let mins = seconds / 60 % 60;
    if (hours > 0) {
        dispSpan += hours + '<sup>h</sup>';
    }
    if (hours === 0 || mins > 0) {
        dispSpan += (hours > 0 ? ' ' : '') + mins.toFixed(0) + '<sup>min</sup>';
    }
    return dispSpan;
}
