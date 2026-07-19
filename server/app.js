const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();

const config = require('config');
const axios = require('axios').default;
const xml2js = require('xml2js');
const https = require('https');

let _status = {};
const metarCache = {};
const atisCache = {};

const WEATHER_CACHE_MS = 10 * 60 * 1000;
const ATIS_CACHE_MS = 5 * 60 * 1000;
const ATIS_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const atisHttpsAgent = new https.Agent({family: 4});

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
    let debug = config.get('debug');
    if (debug == null) {
        debug = false;
    }
    res.locals.debug = debug;
    res.locals.gmapsApiKey = config.get('gmapsApiKey');
    res.render('index');
});

app.get('/chart-tool', (req, res) => {
    res.locals.gmapsApiKey = config.get('gmapsApiKey');
    res.render('ChartTool');
});

app.get('/status', (req, res) => {
    res.json(_status);
});

app.get('/plan', (req, res) => {
    let sbId = config.get('simbriefId');
    const agent = new https.Agent({
        // skip checking the certificate from simbrief server
        rejectUnauthorized: false
    });
    axios.get(`https://www.simbrief.com/api/xml.fetcher.php?userid=${sbId}`,
        {headers: {
                'Accept-Encoding': 'gzip'
            }, httpsAgent: agent}).then((resp) => {
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
    if (cache && (Date.now() - cache.queryTime.getTime() <= WEATHER_CACHE_MS)) {
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
                        return getFallbackWeather(req, res, icao);
                    }
                    let metar = getMetar(json);
                    metarCache[icao] = metar;
                    return res.json(metar);
                });
            } else {
                return getFallbackWeather(req, res, icao);
            }
        })
        .catch((err) => {
            console.log(err);
            getFallbackWeather(req, res, icao);
        });
});

app.get('/atis', (req, res) => {
    let icao = req.query.icao;
    if (!icao || !/^[a-zA-Z]{4}$/.test(icao)) {
        return res.json({code: 1, err: 'Invalid ICAO code'});
    }
    icao = icao.toUpperCase();
    const cache = atisCache[icao];
    if (cache && Date.now() - cache.queryTime.getTime() <= ATIS_CACHE_MS) {
        return res.json(cache);
    }

    getAtisGuruPage(icao).then((resp) => {
        const atis = parseAtisGuru(resp.data, icao);
        atisCache[icao] = atis;
        res.json(atis);
    }).catch((err) => {
        console.log(`ATIS.guru request failed for ${icao}: ${err.code || err.message}`);
        res.json({code: 2, source: 'atis.guru', icao: icao});
    });
});

function getAtisGuruPage(icao, attempts = 2) {
    return axios.get(`https://atis.guru/atis/${icao}`, {
        timeout: 15000,
        httpsAgent: atisHttpsAgent,
        headers: {'User-Agent': 'FlightMonitor/1.0'}
    }).catch((err) => {
        if (attempts > 1 && ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(err.code)) {
            return getAtisGuruPage(icao, attempts - 1);
        }
        throw err;
    });
}

function getFallbackWeather(req, res, icao) {
    const lat = Number(req.query.lat);
    const long = Number(req.query.long);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
        !Number.isFinite(long) || long < -180 || long > 180) {
        return res.json({code: 3, err: 'METAR unavailable and airport coordinates are invalid'});
    }
    const params = {
        latitude: lat,
        longitude: long,
        current: 'temperature_2m,wind_speed_10m,wind_direction_10m,pressure_msl',
        wind_speed_unit: 'kn',
        timezone: 'UTC'
    };
    axios.get('https://api.open-meteo.com/v1/forecast', {params: params, timeout: 10000})
        .then((resp) => {
            const current = resp.data && resp.data.current;
            if (!current || !Number.isFinite(current.temperature_2m) ||
                !Number.isFinite(current.wind_speed_10m) ||
                !Number.isFinite(current.wind_direction_10m) ||
                !Number.isFinite(current.pressure_msl)) {
                return res.json({code: 4, err: 'Invalid weather response'});
            }
            const weather = {
                code: 0,
                source: 'open-meteo',
                estimated: true,
                queryTime: new Date(),
                icao: icao,
                time: current.time + 'Z',
                temp: current.temperature_2m,
                windDir: current.wind_direction_10m,
                windSpeed: current.wind_speed_10m,
                altimInhg: current.pressure_msl * 0.0295299830714,
                pressureMslHpa: current.pressure_msl
            };
            metarCache[icao] = weather;
            res.json(weather);
        }).catch((err) => {
            console.log(err);
            res.json({code: 4, err: err.toString()});
        });
}

function decodeHtml(value) {
    const named = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '};
    return value.replace(/&#x([0-9a-f]+);|&#(\d+);|&([a-z]+);/gi, (match, hex, decimal, name) => {
        if (hex) {
            return String.fromCodePoint(parseInt(hex, 16));
        }
        if (decimal) {
            return String.fromCodePoint(parseInt(decimal, 10));
        }
        return named[name.toLowerCase()] || match;
    });
}

function extractRunways(text, type) {
    const runways = new Set();
    const patterns = type === 'arrival' ? [
        /(?:LDG|LANDING|ARR(?:IVAL)?)\s+(?:RWY|RUNWAY)\s+([^\n.]+)/gi,
        /RWY\s*:?\s*([^\n.]+?)\s+FOR\s+ARR/gi,
        /EXP(?:ECT)?\s+[^\n]*?\s+RWY\s+([0-9]{2}[LCR]?)/gi
    ] : [
        /(?:DEP(?:ARTURE)?|TKOF|TAKEOFF)\s+(?:RWY|RUNWAY)\s+([^\n.]+)/gi,
        /(?:RWY|RUNWAY)\s*:?\s*([^\n.]+?)\s+FOR\s+DEP(?:ARTURE)?/gi
    ];
    for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
            for (const runway of match[1].match(/\b(?:0[1-9]|[12][0-9]|3[0-6])[LCR]?\b/gi) || []) {
                runways.add(runway.toUpperCase());
            }
        }
    }
    return Array.from(runways);
}

function parseAtisGuru(html, icao) {
    const result = {
        code: 0,
        source: 'atis.guru',
        icao: icao,
        queryTime: new Date(),
        arrivalRunways: [],
        departureRunways: []
    };
    const cardPattern = /<h5[^>]*>\s*(Arrival|Departure) ATIS\s*<\/h5>[\s\S]*?<h6[^>]*>([\s\S]*?)<\/h6>[\s\S]*?<div class="atis">([\s\S]*?)<\/div>/gi;
    for (const match of html.matchAll(cardPattern)) {
        const type = match[1].toLowerCase();
        const time = decodeHtml(match[2].replace(/<[^>]+>/g, '')).trim();
        const text = decodeHtml(match[3].replace(/<[^>]+>/g, '')).trim();
        result[type] = {time: time, text: text};
        const timestamp = Date.parse(time.replace(/ UTC$/, 'Z'));
        if (Number.isFinite(timestamp) && Date.now() - timestamp <= ATIS_MAX_AGE_MS) {
            result[type + 'Runways'] = extractRunways(text, type);
        }
    }
    if (!result.arrival && !result.departure) {
        result.code = 2;
    }
    return result;
}

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
    let port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`Listening at port ${port}`);
    });
}

start();
