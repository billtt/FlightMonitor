const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();

const config = require('config');
const axios = require('axios').default;
const xml2js = require('xml2js');

let _status = {};
const metarCache = {};

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

app.post('/', (req, res) => {
    let status = req.body;
    if (!_status.timestamp || Date.parse(status.timestamp) > Date.parse(_status.timestamp)) {
        _status = status;
    }
    res.end();
});

app.get('/', (req, res) => {
    res.locals.ak = config.get('ak');
    let debug = config.get('debug');
    if (debug == null) {
        debug = false;
    }
    res.locals.debug = debug;
    res.render('index');
});

app.get('/chart-tool', (req, res) => {
    res.locals.ak = config.get('ak');
    res.render('ChartTool');
});

app.get('/status', (req, res) => {
    res.json(_status);
});

app.get('/plan', (req, res) => {
    let sbId = config.get('simbriefId');
    axios.get(`https://www.simbrief.com/api/xml.fetcher.php?userid=${sbId}`,
        {headers: {
                'Accept-Encoding': 'gzip'
            }}).then((resp) => {
            if (resp.status === 200 && resp.data.startsWith('<?xml')) {
                xml2js.parseString(resp.data, (err, json) => {
                    if (err) {
                        return res.json({code: 3, err: err.toString()});
                    }
                    return res.json(getFlightPlan(json));
                });
            } else {
                console.log(resp);
                return res.json({code: 2});
            }
        })
        .catch((err) => {
            console.log(err);
            res.json({code: 1, err: err.toString()});
        });
});

app.get('/metar', (req, res) => {
    let icao = req.query.icao;
    if (!icao || icao.length!==4) {
        return res.json({code: 1, err: 'Invalid ICAO code'});
    }
    icao = icao.toUpperCase();
    let cache = metarCache[icao];
    if (cache && (Date.now() - cache.queryTime.getTime() <= 600 * 1000)) {
        return res.json(cache);
    }
    axios.get(`https://aviationweather.gov/api/data/metar?ids=${icao}&format=xml&taf=false&hours=3`)
        .then((resp) => {
            if (resp.status === 200 && resp.data.startsWith('<?xml')) {
                xml2js.parseString(resp.data, (err, json) => {
                    if (err) {
                        return res.json({code: 3, err: err.toString()});
                    }
                    if (!json.response || !json.response.data || !json.response.data[0].METAR) {
                        return res.json({code: 3, err: 'Invalid response from METAR service'});
                    }
                    let metar = getMetar(json);
                    metarCache[icao] = metar;
                    return res.json(metar);
                });
            } else {
                return res.json({code: 2});
            }
        })
        .catch((err) => {
            console.log(err);
            res.json({code: 4, err: err.toString()});
        });
});

function getFlightPlan(raw) {
    function parseF(numObj) {
        return parseFloat(numObj[0]);
    }

    raw = raw.OFP;
    const origin = raw.origin[0];
    const destination = raw.destination[0];
    let plan = {
        code: 0,
        airline: raw.general[0].icao_airline[0],
        flightNumber: raw.general[0].flight_number[0],
        routeDistance: parseF(raw.general[0].route_distance),
        origin: {
            icaoCode: origin.icao_code[0],
            iataCode: origin.iata_code[0],
            elevation: parseF(origin.elevation),
            lat: parseF(origin.pos_lat),
            long: parseF(origin.pos_long),
            name: origin.name[0],
            runway: origin.plan_rwy[0]
        },
        destination: {
            icaoCode: destination.icao_code[0],
            iataCode: destination.iata_code[0],
            elevation: parseF(destination.elevation),
            lat: parseF(destination.pos_lat),
            long: parseF(destination.pos_long),
            name: destination.name[0],
            runway: destination.plan_rwy[0]
        },
        fixes: []
    };
    let fixes = plan.fixes;
    fixes.push({
        lat: plan.origin.lat,
        long: plan.origin.long,
        id: plan.origin.icaoCode,
        name: plan.origin.name
    });
    for (const fix of raw.navlog[0].fix) {
        if (fix.type[0] !== 'wpt' && fix.type[0] !== 'vor' && fix.type[0] !== 'ndb') {
            continue;
        }
        fixes.push({
            lat: parseF(fix.pos_lat),
            long: parseF(fix.pos_long),
            id: fix.ident[0],
            name: fix.name[0],
            sidStar: fix.is_sid_star[0] === '1'
        });
    }
    fixes.push({
        lat: plan.destination.lat,
        long: plan.destination.long,
        id: plan.destination.icaoCode,
        name: plan.destination.name
    });
    return plan;
}

function getMetar(raw) {
    function parseF(numObj) {
        return parseFloat(numObj[0]);
    }
    raw = raw.response.data[0].METAR[0];
    let metar = {
        code: 0,
        queryTime: new Date(),
        icao: raw.station_id[0],
        time: raw.observation_time[0],
        temp: parseF(raw.temp_c),
        dew: parseF(raw.dewpoint_c),
        windDir: parseF(raw.wind_dir_degrees),
        windSpeed: parseF(raw.wind_speed_kt),
        visibilityMi: parseF(raw.visibility_statute_mi),
        altimInhg: parseF(raw.altim_in_hg),
        flightCat: raw.flight_category[0],
        raw: raw.raw_text[0]
    };
    if (raw.wx_string) {
        metar.weather = raw.wx_string[0];
    }
    return metar;
}

function start() {
    // check port argument
    const argv = process.argv;
    let port = 3000;
    if (argv.length < 3 || isNaN(parseInt(argv[2]))) {
        console.log('Port number not specified, using default (3000).');
    } else {
        port = parseInt(argv[2]);
    }
    app.listen(port, () => {
        console.log(`Listening at port ${port}`);
    });
}

start();